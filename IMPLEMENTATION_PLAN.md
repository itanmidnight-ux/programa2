# 🚀 PLAN DE IMPLEMENTACIÓN: Multi-Trade Burst Engine

## Objetivo: Cuando el programa detecte una señal fuerte, ejecutar múltiples operaciones simultáneas para maximizar ganancias acumulativas.

---

## 📋 FASE 1: MODELO DE DATOS Y CORE (Prioridad ALTA)

### 1.1. Extender Schema de Prisma (`prisma/schema.prisma`)

**Agregar campos al modelo `Trade`:**
```prisma
signalStrength    Float?     // 0-100: calidad de la señal que generó el trade
entryQuality      Float?     // 0-100: score compuesto al momento de entrada
tradeGroupId      Int?       // ID del grupo de ráfaga (NULL si trade aislado)
waveNumber        Int?       // Número de orden dentro de la ráfaga (1, 2, 3...)
```

**Crear nuevo modelo `TradeGroup`:**
```prisma
model TradeGroup {
  id              Int      @id @default(autoincrement())
  createdAt       DateTime @default(now())
  pair            String
  side            String   // LONG o SHORT
  signalStrength  Float    // 0-100
  confidence      Float    // 0-1
  confluenceScore Float    // 0-100
  triggerReason   String   // Qué activó la ráfaga
  totalTrades     Int      // Cuántos trades se ejecutaron
  totalSize       Float    // Tamaño acumulado total
  avgEntryPrice   Float    // Precio promedio de entrada
  status          String   // ACTIVE, CLOSED, PARTIAL
  closeReason     String?
  closeTime       DateTime?
  totalPnl        Float    @default(0)
  totalPnlPct     Float    @default(0)
  maxDrawdown     Float    @default(0)
  bestTrade       Float    @default(0)
  worstTrade      Float    @default(0)
  duration        Int?     // minutos desde apertura hasta cierre total
  trades          Trade[]  @relation("TradeGroupTrades")
}
```

### 1.2. Crear tipo `SignalStrength` (`src/lib/signal-strength.ts`)

```typescript
export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG' | 'EXTREME';

export interface SignalStrengthResult {
  level: SignalStrength;
  score: number;           // 0-100
  recommendedTrades: number; // cuántos trades ejecutar
  totalExposurePct: number;  // % del balance a exponer
  riskPerTrade: number;      // % del balance por trade individual
  shouldTriggerBurst: boolean;
  reasons: string[];
}

export function evaluateSignalStrength(params: {
  ensembleConfidence: number;
  mlConfidence: number;
  confluenceScore: number;
  marketConfidence: number;
  adx: number;
  volumeRatio: number;
  atrPct: number;
  alignedTimeframes: number; // cuántos TFs coinciden
}): SignalStrengthResult {
  // Ponderación: ensemble 30%, ML 20%, confluence 20%, market 15%, 
  //              ADX 5%, volume 5%, ATR 3%, TF alignment 2%
  const score = Math.min(100, (
    params.ensembleConfidence * 30 +
    params.mlConfidence * 20 +
    params.confluenceScore * 0.20 +
    params.marketConfidence * 15 +
    Math.min(params.adx / 50, 1) * 5 +
    Math.min(params.volumeRatio / 3, 1) * 5 +
    (params.atrPct >= 0.3 && params.atrPct <= 3 ? 3 : 0) +
    (params.alignedTimeframes / 4) * 2
  ) * 100 / 100);

  let level: SignalStrength;
  let recommendedTrades: number;
  let totalExposurePct: number;
  let riskPerTrade: number;

  if (score >= 90) {
    level = 'EXTREME';
    recommendedTrades = 15;
    totalExposurePct = 15;  // 15% del balance total en riesgo
    riskPerTrade = 1.0;
  } else if (score >= 78) {
    level = 'VERY_STRONG';
    recommendedTrades = 10;
    totalExposurePct = 10;
    riskPerTrade = 1.0;
  } else if (score >= 65) {
    level = 'STRONG';
    recommendedTrades = 5;
    totalExposurePct = 6;
    riskPerTrade = 1.2;
  } else if (score >= 50) {
    level = 'MODERATE';
    recommendedTrades = 2;
    totalExposurePct = 3;
    riskPerTrade = 1.5;
  } else {
    level = 'WEAK';
    recommendedTrades = 1;
    totalExposurePct = 1.5;
    riskPerTrade = 1.5;
  }

  return {
    level,
    score,
    recommendedTrades,
    totalExposurePct,
    riskPerTrade,
    shouldTriggerBurst: score >= 65,
    reasons: [
      `Ensemble: ${(params.ensembleConfidence * 100).toFixed(0)}%`,
      `ML: ${(params.mlConfidence * 100).toFixed(0)}%`,
      `Confluence: params.confluenceScore.toFixed(1)`,
      `Market: ${(params.marketConfidence * 100).toFixed(0)}%`,
      `ADX: ${params.adx.toFixed(1)}`,
      `Volume: ${params.volumeRatio.toFixed(1)}x`,
    ],
  };
}
```

---

## 📋 FASE 2: MOTOR DE RÁFAGA (BURST ENGINE)

### 2.1. Crear `src/lib/burst-engine.ts`

```typescript
import { db } from '@/lib/db';
import { evaluateSignalStrength, type SignalStrengthResult } from './signal-strength';
import type { FullAnalysis } from './analysis-engine';
import type { EnsembleResult } from './strategies';
import type { MLPrediction } from './ml/predictor';
import type { MarketIntelligenceResult } from './market-intelligence';
import { placeMarketOrder, getAccountBalance } from '@/lib/broker-manager';

export interface BurstConfig {
  maxTradesPerBurst: number;     // máximo trades en una ráfaga
  delayBetweenTradesMs: number;  // delay entre cada trade (para no saturar API)
  maxTotalExposurePct: number;   // % máximo del balance a exponer
  enableBurstMode: boolean;
  minSignalStrength: number;     // score mínimo para activar ráfaga
}

export interface BurstTrade {
  tradeId: number;
  orderId: string;
  entryPrice: number;
  size: number;
  stopLoss: number;
  takeProfit: number;
  waveNumber: number;
}

export interface BurstResult {
  triggered: boolean;
  signalStrength: SignalStrengthResult;
  burstId: number | null;
  tradesExecuted: number;
  tradesFailed: number;
  totalSize: number;
  avgEntryPrice: number;
  burstTrades: BurstTrade[];
  errors: string[];
}

const DEFAULT_CONFIG: BurstConfig = {
  maxTradesPerBurst: 15,
  delayBetweenTradesMs: 200,     // 200ms entre cada trade
  maxTotalExposurePct: 15,
  enableBurstMode: true,
  minSignalStrength: 65,
};

export class BurstEngine {
  private config: BurstConfig;
  private activeBursts: Map<string, number> = new Map(); // pair -> burstId
  private isExecuting = false;

  constructor(config?: Partial<BurstConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Evaluar si se debe activar una ráfaga */
  async evaluate(
    analysis: FullAnalysis,
    ensemble: EnsembleResult,
    mlPrediction: MLPrediction | null,
    marketIntel: MarketIntelligenceResult | null
  ): Promise<{ shouldBurst: boolean; signalStrength: SignalStrengthResult }> {
    if (!this.config.enableBurstMode) {
      return {
        shouldBurst: false,
        signalStrength: evaluateSignalStrength({
          ensembleConfidence: ensemble.confidence,
          mlConfidence: mlPrediction?.confidence || 0,
          confluenceScore: analysis.confluenceScore,
          marketConfidence: marketIntel?.confidence.confidence || 0,
          adx: analysis.adx,
          volumeRatio: analysis.volumeRatio,
          atrPct: analysis.atrPct,
          alignedTimeframes: Object.values(analysis.timeframes)
            .filter(tf => tf.trend === ensemble.finalSignal).length,
        }),
      };
    }

    const signalStrength = evaluateSignalStrength({
      ensembleConfidence: ensemble.confidence,
      mlConfidence: mlPrediction?.confidence || 0,
      confluenceScore: analysis.confluenceScore,
      marketConfidence: marketIntel?.confidence.confidence || 0,
      adx: analysis.adx,
      volumeRatio: analysis.volumeRatio,
      atrPct: analysis.atrPct,
      alignedTimeframes: Object.values(analysis.timeframes)
        .filter(tf => tf.trend === ensemble.finalSignal).length,
    });

    const shouldBurst = signalStrength.shouldTriggerBurst 
      && signalStrength.score >= this.config.minSignalStrength;

    return { shouldBurst, signalStrength };
  }

  /** Ejecutar ráfaga de trades */
  async executeBurst(
    symbol: string,
    side: 'LONG' | 'SHORT',
    signalStrength: SignalStrengthResult,
    analysis: FullAnalysis,
    slCalculator: (price: number, side: string, analysis: FullAnalysis) => number,
    tpCalculator: (price: number, side: string, analysis: FullAnalysis, sl: number) => number,
    dryRun: boolean
  ): Promise<BurstResult> {
    if (this.isExecuting) {
      return {
        triggered: false,
        signalStrength,
        burstId: null,
        tradesExecuted: 0,
        tradesFailed: 0,
        totalSize: 0,
        avgEntryPrice: 0,
        burstTrades: [],
        errors: ['Burst already in progress'],
      };
    }

    this.isExecuting = true;
    const errors: string[] = [];
    const burstTrades: BurstTrade[] = [];
    let tradesExecuted = 0;
    let tradesFailed = 0;
    let totalSize = 0;
    let totalEntryPrice = 0;

    try {
      const numTrades = Math.min(
        signalStrength.recommendedTrades,
        this.config.maxTradesPerBurst
      );

      const balance = await getAccountBalance();
      const maxTotalSize = (balance.balance * signalStrength.totalExposurePct) / 100;
      const sizePerTrade = maxTotalSize / numTrades;

      console.log(
        `[BURST] 🚀 Señal ${signalStrength.level} (${signalStrength.score.toFixed(0)}) - ` +
        `Ejecutando ${numTrades} trades de ${side} en ${symbol}`
      );

      // Crear grupo de trades en la base de datos
      const tradeGroup = await db.tradeGroup.create({
        data: {
          pair: symbol,
          side,
          signalStrength: signalStrength.score,
          confidence: 0, // se actualizará después
          confluenceScore: analysis.confluenceScore,
          triggerReason: `Signal ${signalStrength.level} - ${signalStrength.reasons.join(', ')}`,
          totalTrades: numTrades,
          totalSize: 0,
          avgEntryPrice: 0,
          status: 'ACTIVE',
        },
      });

      // Ejecutar cada trade con pequeño delay
      for (let i = 0; i < numTrades; i++) {
        try {
          const price = analysis.price;
          const sl = slCalculator(price, side, analysis);
          const tp = tpCalculator(price, side, analysis, sl);

          let orderId = '';
          let commission = 0;

          if (!dryRun) {
            const orderSide = side === 'LONG' ? 'BUY' : 'SELL';
            const orderResult = await placeMarketOrder(symbol, orderSide, sizePerTrade);

            if (!orderResult.success) {
              errors.push(`Trade ${i + 1} failed: ${orderResult.error}`);
              tradesFailed++;
              continue;
            }

            orderId = String(orderResult.orderId);
            commission = orderResult.fills?.reduce((sum, f) => 
              sum + parseFloat(f.commission || '0'), 0
            ) || 0;

            // Delay entre trades para no saturar API
            if (i < numTrades - 1) {
              await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenTradesMs));
            }
          } else {
            orderId = `dry_burst_${tradeGroup.id}_${i}`;
            await new Promise(resolve => setTimeout(resolve, 50)); // delay mínimo en dry run
          }

          // Guardar trade en la base de datos
          const trade = await db.trade.create({
            data: {
              externalId: orderId,
              pair: symbol,
              side,
              entryPrice: price,
              quantity: sizePerTrade,
              confidence: 0,
              stopLoss: sl,
              takeProfit: tp,
              status: 'OPEN',
              signal: side === 'LONG' ? 'BUY' : 'SELL',
              strategy: 'BURST',
              leverage: 1,
              commission,
              signalStrength: signalStrength.score,
              entryQuality: signalStrength.score,
              tradeGroupId: tradeGroup.id,
              waveNumber: i + 1,
            },
          });

          // Crear posición
          const position = await db.position.create({
            data: {
              tradeId: trade.id,
              pair: symbol,
              side,
              entryPrice: price,
              currentPrice: price,
              quantity: sizePerTrade,
              unrealizedPnl: 0,
              stopLoss: sl,
              takeProfit: tp,
            },
          });

          burstTrades.push({
            tradeId: trade.id,
            orderId,
            entryPrice: price,
            size: sizePerTrade,
            stopLoss: sl,
            takeProfit: tp,
            waveNumber: i + 1,
          });

          totalSize += sizePerTrade;
          totalEntryPrice += price;
          tradesExecuted++;

          console.log(
            `[BURST] ✅ Trade #${i + 1}/${numTrades} ejecutado - ` +
            `Entry: ${price}, Size: ${sizePerTrade}, SL: ${sl}, TP: ${tp}`
          );

        } catch (tradeError) {
          const msg = tradeError instanceof Error ? tradeError.message : String(tradeError);
          errors.push(`Trade ${i + 1} error: ${msg}`);
          tradesFailed++;
          console.error(`[BURST] ❌ Trade ${i + 1} falló:`, msg);
        }
      }

      // Actualizar grupo con resultados reales
      const avgEntryPrice = tradesExecuted > 0 ? totalEntryPrice / tradesExecuted : 0;

      await db.tradeGroup.update({
        where: { id: tradeGroup.id },
        data: {
          totalTrades: tradesExecuted,
          totalSize,
          avgEntryPrice,
        },
      });

      // Registrar en burst tracking
      this.activeBursts.set(symbol, tradeGroup.id);

      console.log(
        `[BURST] 📊 Ráfaga completada: ${tradesExecuted} ejecutados, ` +
        `${tradesFailed} fallidos, Size total: ${totalSize.toFixed(4)}, ` +
        `Entry avg: ${avgEntryPrice.toFixed(2)}`
      );

      return {
        triggered: true,
        signalStrength,
        burstId: tradeGroup.id,
        tradesExecuted,
        tradesFailed,
        totalSize,
        avgEntryPrice,
        burstTrades,
        errors,
      };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[BURST] ❌ Error fatal en ráfaga:', msg);
      errors.push(`Fatal error: ${msg}`);

      return {
        triggered: false,
        signalStrength,
        burstId: null,
        tradesExecuted,
        tradesFailed,
        totalSize,
        avgEntryPrice: 0,
        burstTrades,
        errors,
      };
    } finally {
      this.isExecuting = false;
    }
  }

  /** Cerrar todos los trades de una ráfaga */
  async closeBurst(
    symbol: string,
    closeReason: string,
    closePositionFn: (positionId: number, reason: string) => Promise<any>
  ): Promise<{ closed: number; errors: string[] }> {
    const burstId = this.activeBursts.get(symbol);
    if (!burstId) {
      return { closed: 0, errors: ['No active burst for this pair'] };
    }

    const errors: string[] = [];
    let closed = 0;

    try {
      // Obtener todos los trades abiertos del grupo
      const openTrades = await db.position.findMany({
        where: {
          trade: {
            tradeGroupId: burstId,
            status: 'OPEN',
          },
        },
      });

      for (const position of openTrades) {
        try {
          await closePositionFn(position.id, closeReason);
          closed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to close position #${position.id}: ${msg}`);
        }
      }

      // Actualizar estado del grupo
      const allTrades = await db.trade.findMany({
        where: { tradeGroupId: burstId },
        orderBy: { id: 'asc' },
      });

      const totalPnl = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const totalPnlPct = allTrades.length > 0 
        ? (totalPnl / allTrades.reduce((sum, t) => sum + (t.entryPrice * t.quantity), 0)) * 100 
        : 0;

      await db.tradeGroup.update({
        where: { id: burstId },
        data: {
          status: 'CLOSED',
          closeReason,
          closeTime: new Date(),
          totalPnl,
          totalPnlPct,
          bestTrade: Math.max(...allTrades.map(t => t.pnl || 0)),
          worstTrade: Math.min(...allTrades.map(t => t.pnl || 0)),
          duration: allTrades.length > 0 
            ? Math.round((Date.now() - allTrades[0].openedAt.getTime()) / 60000)
            : 0,
        },
      });

      this.activeBursts.delete(symbol);

      console.log(
        `[BURST] 🏁 Ráfaga #${burstId} cerrada: ${closed} posiciones, ` +
        `PnL total: ${totalPnl.toFixed(2)} (${totalPnlPct.toFixed(2)}%)`
      );

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Close burst error: ${msg}`);
    }

    return { closed, errors };
  }

  /** Obtener ráfagas activas */
  getActiveBursts(): Map<string, number> {
    return new Map(this.activeBursts);
  }

  /** Actualizar configuración */
  updateConfig(config: Partial<BurstConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[BURST] Config actualizada:', this.config);
  }
}
```

---

## 📋 FASE 3: INTEGRACIÓN CON EXECUTION ENGINE

### 3.1. Modificar `src/lib/execution-engine.ts`

**Agregar import:**
```typescript
import { BurstEngine } from '@/lib/burst-engine';
import type { BurstResult } from '@/lib/burst-engine';
```

**Agregar al constructor:**
```typescript
private burstEngine: BurstEngine;

constructor(config?: Partial<ExecutionConfig>) {
  // ... código existente ...
  this.burstEngine = new BurstEngine();
}
```

**Modificar método `tick()` - reemplazar la sección de ejecución de trade:**

```typescript
// En el método tick(), donde actualmente dice:
// "Check for new entry signal"

// REEMPLAZAR con:

if (!this.currentPosition) {
  // Evaluar si es señal fuerte para ráfaga
  const burstEvaluation = await this.burstEngine.evaluate(
    analysis,
    ensemble,
    mlPrediction,
    marketIntel
  );

  if (burstEvaluation.shouldBurst && ensemble.finalSignal !== 'NEUTRAL') {
    // SEÑAL FUERTE DETECTADA → Ejecutar ráfaga
    console.log(
      `[ENGINE] 🚀 SEÑAL FUERTE detectada: ${burstEvaluation.signalStrength.level} ` +
      `(${burstEvaluation.signalStrength.score.toFixed(0)}) - Activando MODO RÁFAGA`
    );

    const burstResult = await this.burstEngine.executeBurst(
      this.config.symbol,
      ensemble.finalSignal as 'LONG' | 'SHORT',
      burstEvaluation.signalStrength,
      analysis,
      (price, side, analysis) => 
        this.smartStopLoss.calculateInitialSL(price, side, analysis),
      (price, side, analysis, sl) => 
        this.smartStopLoss.calculateInitialTP(price, side, analysis, sl),
      this.config.dryRun
    );

    if (burstResult.triggered) {
      action = `BURST_EXECUTED: ${burstResult.tradesExecuted} trades`;
      // Registrar posiciones abiertas para gestión posterior
      this.currentBurstPositions = burstResult.burstTrades.map(bt => bt.tradeId);
    }
    
  } else if (ensemble.finalSignal !== 'NEUTRAL') {
    // Señal normal (no fuerte) → ejecutar trade individual como antes
    const validation = this.validateEntry(
      {
        name: 'Ensemble',
        direction: ensemble.finalSignal,
        confidence: ensemble.confidence,
        reasons: ensemble.reasons,
        sl: ensemble.sl,
        tp: ensemble.tp,
        riskReward: analysis.riskRewardRatio,
      },
      analysis
    );

    if (validation.valid) {
      tradeResult = await this.executeTrade(
        {
          name: 'Ensemble',
          direction: ensemble.finalSignal,
          confidence: ensemble.confidence,
          reasons: ensemble.reasons,
          sl: ensemble.sl,
          tp: ensemble.tp,
          riskReward: analysis.riskRewardRatio,
        },
        analysis
      );
      action = tradeResult.success ? 'TRADE_OPENED' : 'TRADE_FAILED';
    } else {
      action = `BLOCKED: ${validation.reason}`;
    }
  }
}
```

**Agregar campo para tracking de ráfaga:**
```typescript
// Agregar como propiedad de la clase:
private currentBurstPositions: number[] = [];

// En managePosition(), verificar si la posición pertenece a una ráfaga:
// Si this.currentBurstPositions.length > 0, gestionar de forma diferente
```

---

## 📋 FASE 4: GESTIÓN DE POSICIONES MÚLTIPLES

### 4.1. Modificar `src/lib/execution-engine.ts` - managePosition()

**Crear método para gestionar todas las posiciones de la ráfaga:**

```typescript
private async manageBurstPositions(
  price: number,
  analysis: FullAnalysis
): Promise<PositionAction[]> {
  const actions: PositionAction[] = [];
  
  // Obtener todas las posiciones abiertas de la ráfaga actual
  const burstPositions = await db.position.findMany({
    where: {
      pair: this.config.symbol,
      status: 'OPEN',
      trade: {
        tradeGroupId: { not: null },
      },
    },
    include: {
      trade: true,
    },
  });

  for (const position of burstPositions) {
    // Actualizar precio actual
    position.currentPrice = price;
    position.unrealizedPnl = position.side === 'LONG'
      ? (price - position.entryPrice) * position.quantity
      : (position.entryPrice - price) * position.quantity;

    // Aplicar Smart Stop Loss individual
    const stopAction = this.smartStopLoss.check(
      {
        id: position.id,
        pair: position.pair,
        side: position.side as 'LONG' | 'SHORT',
        entryPrice: position.entryPrice,
        currentPrice: price,
        quantity: position.quantity,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        openedAt: position.openedAt,
      },
      analysis
    );

    if (stopAction.action !== 'HOLD') {
      // Ejecutar acción de stop
      await db.position.update({
        where: { id: position.id },
        data: {
          stopLoss: stopAction.newStopLoss ?? position.stopLoss,
          takeProfit: stopAction.newTakeProfit ?? position.takeProfit,
          unrealizedPnl: position.unrealizedPnl,
        },
      });

      if (stopAction.action === 'CLOSE') {
        // Cerrar esta posición individual
        await this.closeSinglePosition(position.id, stopAction.reason || 'Smart Stop');
        actions.push({
          type: 'CLOSE',
          message: `Burst position #${position.id} closed: ${stopAction.reason}`,
        });
      }
    }
  }

  // Verificar si todas las posiciones de la ráfaga se cerraron
  const remainingBurstPositions = await db.position.count({
    where: {
      pair: this.config.symbol,
      status: 'OPEN',
      trade: {
        tradeGroupId: { not: null },
      },
    },
  });

  if (remainingBurstPositions === 0 && this.currentBurstPositions.length > 0) {
    // Todas las posiciones de la ráfaga se cerraron
    await this.burstEngine.closeBurst(
      this.config.symbol,
      'All positions closed',
      () => Promise.resolve()
    );
    this.currentBurstPositions = [];
  }

  return actions;
}
```

---

## 📋 FASE 5: RISK MANAGER ACTUALIZADO

### 5.1. Modificar `src/lib/risk-manager.ts`

**Cambiar límite de posiciones:**
```typescript
// ANTES:
maxOpenPositions: 5,

// DESPUÉS:
maxOpenPositions: 25,  // Aumentado para soportar ráfagas
```

**Agregar verificación de exposición total:**
```typescript
// En canTrade(), agregar:
const totalExposure = trades
  .filter(t => t.status === 'OPEN')
  .reduce((sum, t) => sum + (t.entryPrice * t.quantity), 0);

const exposurePct = (totalExposure / balance) * 100;
if (exposurePct > this.config.maxTotalExposure) {
  return { 
    allowed: false, 
    reason: `Total exposure ${exposurePct.toFixed(1)}% exceeds max ${this.config.maxTotalExposure}%` 
  };
}
```

**Agregar configuración `maxTotalExposure`:**
```typescript
// En RiskManagerConfig interface:
maxTotalExposure: number;  // % máximo del balance en exposición total

// Default:
maxTotalExposure: 30,  // 30% del balance máximo en exposición
```

---

## 📋 FASE 6: FRONTEND - PANEL DE RÁFAGAS

### 6.1. Crear `src/components/dashboard/burst-panel.tsx`

```tsx
'use client';

import { useTradingStore } from '@/lib/trading-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  BarChart3,
  Clock,
} from 'lucide-react';

export function BurstPanel() {
  const snapshot = useTradingStore(s => s.snapshot);
  const trades = useTradingStore(s => s.trades);

  // Obtener trades que pertenecen a ráfagas
  const burstTrades = trades.filter(t => t.tradeGroupId != null);
  const activeBursts = burstTrades.filter(t => t.status === 'OPEN');
  const closedBursts = burstTrades.filter(t => t.status === 'CLOSED');

  // Agrupar por tradeGroupId
  const burstGroups = new Map<number, typeof burstTrades>();
  for (const trade of burstTrades) {
    if (trade.tradeGroupId) {
      if (!burstGroups.has(trade.tradeGroupId)) {
        burstGroups.set(trade.tradeGroupId, []);
      }
      burstGroups.get(trade.tradeGroupId)!.push(trade);
    }
  }

  // Calcular métricas por ráfaga
  const burstMetrics = Array.from(burstGroups.entries()).map(([id, trades]) => {
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgConfidence = trades.reduce((sum, t) => sum + (t.confidence || 0), 0) / trades.length;
    const wins = trades.filter(t => (t.pnl || 0) > 0).length;
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    return {
      id,
      totalTrades: trades.length,
      totalPnl,
      avgConfidence,
      winRate,
      side: trades[0]?.side || 'UNKNOWN',
      signalStrength: trades[0]?.signalStrength || 0,
      trades,
    };
  });

  return (
    <div className="space-y-4">
      {/* Resumen de Ráfagas */}
      <Card className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-400">
            <Zap className="w-5 h-5" />
            Burst Trading Mode
            <Badge variant={activeBursts.length > 0 ? 'destructive' : 'secondary'}>
              {activeBursts.length > 0 ? 'ACTIVE' : 'IDLE'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Ráfagas Activas</p>
              <p className="text-2xl font-bold text-purple-400">
                {new Set(activeBursts.map(t => t.tradeGroupId)).size}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Trades en Ráfaga</p>
              <p className="text-2xl font-bold">{burstTrades.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">PnL Total Ráfagas</p>
              <p className={`text-2xl font-bold ${
                burstTrades.reduce((s, t) => s + (t.pnl || 0), 0) >= 0 
                  ? 'text-green-400' 
                  : 'text-red-400'
              }`}>
                ${burstTrades.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold text-yellow-400">
                {burstTrades.filter(t => (t.pnl || 0) > 0).length} / {burstTrades.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ráfagas Activas */}
      {burstMetrics.filter(m => m.trades.some(t => t.status === 'OPEN')).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ráfagas en Progreso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {burstMetrics
              .filter(m => m.trades.some(t => t.status === 'OPEN'))
              .map(metric => (
                <motion.div
                  key={metric.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {metric.side === 'LONG' ? (
                        <TrendingUp className="w-4 h-4 text-green-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-400" />
                      )}
                      <span className="font-medium">Ráfaga #{metric.id}</span>
                      <Badge variant="outline">{metric.side}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        {metric.trades.filter(t => t.status === 'CLOSED').length}/{metric.totalTrades}
                      </span>
                    </div>
                  </div>
                  <Progress 
                    value={(metric.trades.filter(t => t.status === 'CLOSED').length / metric.totalTrades) * 100} 
                    className="h-2"
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>Señal: {metric.signalStrength.toFixed(0)}</span>
                    <span>PnL: ${metric.totalPnl.toFixed(2)}</span>
                    <span>Win Rate: {metric.winRate.toFixed(0)}%</span>
                  </div>
                </motion.div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Historial de Ráfagas */}
      {closedBursts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Historial de Ráfagas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {burstMetrics
                .filter(m => m.trades.every(t => t.status === 'CLOSED'))
                .slice(-10)
                .reverse()
                .map(metric => (
                  <div
                    key={metric.id}
                    className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      <span>Ráfaga #{metric.id}</span>
                      <Badge variant="outline" className="text-xs">
                        {metric.totalTrades} trades
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={metric.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                        ${metric.totalPnl.toFixed(2)}
                      </span>
                      <span>{metric.winRate.toFixed(0)}% WR</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### 6.2. Actualizar tipos en `src/lib/trading-store.ts`

```typescript
// Agregar a la interfaz Trade:
export interface Trade {
  // ... campos existentes ...
  signalStrength?: number;
  entryQuality?: number;
  tradeGroupId?: number | null;
  waveNumber?: number | null;
}
```

### 6.3. Agregar panel al dashboard (`src/app/page.tsx`)

```tsx
// Importar el nuevo panel:
import { BurstPanel } from '@/components/dashboard/burst-panel';

// Agregar en la navegación o como tab:
<TabsContent value="burst">
  <BurstPanel />
</TabsContent>
```

---

## 📋 FASE 7: API ROUTES PARA RÁFAGAS

### 7.1. Crear `src/app/api/burst/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getExecutionEngine } from '@/lib/automation';
import { db } from '@/lib/db';

// GET - Obtener estado de ráfagas
export async function GET() {
  try {
    const activeBursts = await db.tradeGroup.findMany({
      where: { status: 'ACTIVE' },
      include: {
        trades: {
          include: {
            positions: true,
          },
        },
      },
    });

    const closedBursts = await db.tradeGroup.findMany({
      where: { status: 'CLOSED' },
      orderBy: { closeTime: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      activeBursts,
      closedBursts,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// POST - Configurar modo ráfaga
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { enable, maxTradesPerBurst, minSignalStrength, delayBetweenTradesMs } = body;

    const engine = getExecutionEngine();
    if (!engine) {
      return NextResponse.json({
        success: false,
        error: 'Engine not running',
      }, { status: 400 });
    }

    // Acceder al burst engine (necesitará getter)
    // engine.burstEngine.updateConfig({ ... });

    return NextResponse.json({
      success: true,
      message: `Burst mode ${enable ? 'enabled' : 'disabled'}`,
      config: {
        enable,
        maxTradesPerBurst,
        minSignalStrength,
        delayBetweenTradesMs,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
```

---

## 📋 FASE 8: CONFIGURACIÓN Y AMBIENTE

### 8.1. Actualizar `.env.example`

```bash
# Burst Trading Configuration
BURST_MODE_ENABLED=true
BURST_MAX_TRADES_PER_BURST=15
BURST_MIN_SIGNAL_STRENGTH=65
BURST_DELAY_BETWEEN_TRADES_MS=200
BURST_MAX_TOTAL_EXPOSURE_PCT=15
```

### 8.2. Actualizar `src/lib/risk-manager.ts`

```typescript
// Agregar al interface RiskManagerConfig:
maxTotalExposure: number;  // Nuevo: % máximo del balance en exposición total

// Actualizar default:
maxTotalExposure: parseInt(process.env.BURST_MAX_TOTAL_EXPOSURE_PCT || '30'),
```

---

## 📋 FASE 9: MÉTRICAS Y REPORTES

### 9.1. Crear `src/lib/burst-analytics.ts`

```typescript
import { db } from '@/lib/db';

export interface BurstAnalytics {
  totalBursts: number;
  activeBursts: number;
  closedBursts: number;
  totalBurstTrades: number;
  totalBurstPnl: number;
  avgTradesPerBurst: number;
  avgWinRate: number;
  bestBurst: { id: number; pnl: number };
  worstBurst: { id: number; pnl: number };
  avgDuration: number; // minutos
  signalStrengthVsPnl: { strength: number; pnl: number }[];
}

export async function getBurstAnalytics(): Promise<BurstAnalytics> {
  const allBursts = await db.tradeGroup.findMany({
    include: {
      trades: true,
    },
  });

  const activeBursts = allBursts.filter(b => b.status === 'ACTIVE');
  const closedBursts = allBursts.filter(b => b.status === 'CLOSED');

  const totalBurstTrades = allBursts.reduce((sum, b) => sum + b.totalTrades, 0);
  const totalBurstPnl = allBursts.reduce((sum, b) => sum + b.totalPnl, 0);

  const avgTradesPerBurst = allBursts.length > 0 
    ? totalBurstTrades / allBursts.length 
    : 0;

  const winRates = closedBursts.map(b => {
    const wins = b.trades.filter(t => (t.pnl || 0) > 0).length;
    return b.trades.length > 0 ? (wins / b.trades.length) * 100 : 0;
  });

  const avgWinRate = winRates.length > 0 
    ? winRates.reduce((a, b) => a + b, 0) / winRates.length 
    : 0;

  const sortedByPnl = [...closedBursts].sort((a, b) => b.totalPnl - a.totalPnl);

  const signalStrengthVsPnl = allBursts.map(b => ({
    strength: b.signalStrength,
    pnl: b.totalPnl,
  }));

  return {
    totalBursts: allBursts.length,
    activeBursts: activeBursts.length,
    closedBursts: closedBursts.length,
    totalBurstTrades,
    totalBurstPnl,
    avgTradesPerBurst,
    avgWinRate,
    bestBurst: sortedByPnl[0] 
      ? { id: sortedByPnl[0].id, pnl: sortedByPnl[0].totalPnl } 
      : { id: 0, pnl: 0 },
    worstBurst: sortedByPnl[sortedByPnl.length - 1] 
      ? { id: sortedByPnl[sortedByPnl.length - 1].id, pnl: sortedByPnl[sortedByPnl.length - 1].totalPnl } 
      : { id: 0, pnl: 0 },
    avgDuration: closedBursts.filter(b => b.duration).reduce((sum, b) => 
      sum + (b.duration || 0), 0
    ) / (closedBursts.filter(b => b.duration).length || 1),
    signalStrengthVsPnl,
  };
}
```

---

## 📋 FASE 10: TESTING Y VALIDACIÓN

### 10.1. Crear `src/test-burst-engine.ts`

```typescript
// Script de prueba para validar el burst engine
import { BurstEngine } from './burst-engine';
import { evaluateSignalStrength } from './signal-strength';

console.log('🧪 Testing Burst Engine...\n');

// Test 1: Señal EXTREME
const extremeSignal = evaluateSignalStrength({
  ensembleConfidence: 0.95,
  mlConfidence: 0.92,
  confluenceScore: 92,
  marketConfidence: 0.88,
  adx: 45,
  volumeRatio: 2.8,
  atrPct: 1.2,
  alignedTimeframes: 4,
});

console.log('Test 1 - Señal EXTREME:');
console.log(`  Level: ${extremeSignal.level}`);
console.log(`  Score: ${extremeSignal.score.toFixed(0)}`);
console.log(`  Recommended Trades: ${extremeSignal.recommendedTrades}`);
console.log(`  Should Burst: ${extremeSignal.shouldTriggerBurst}`);
console.log('');

// Test 2: Señal WEAK
const weakSignal = evaluateSignalStrength({
  ensembleConfidence: 0.40,
  mlConfidence: 0.35,
  confluenceScore: 35,
  marketConfidence: 0.30,
  adx: 15,
  volumeRatio: 0.8,
  atrPct: 0.2,
  alignedTimeframes: 1,
});

console.log('Test 2 - Señal WEAK:');
console.log(`  Level: ${weakSignal.level}`);
console.log(`  Score: ${weakSignal.score.toFixed(0)}`);
console.log(`  Recommended Trades: ${weakSignal.recommendedTrades}`);
console.log(`  Should Burst: ${weakSignal.shouldTriggerBurst}`);
console.log('');

// Test 3: Señal STRONG (debería activar ráfaga)
const strongSignal = evaluateSignalStrength({
  ensembleConfidence: 0.82,
  mlConfidence: 0.78,
  confluenceScore: 75,
  marketConfidence: 0.72,
  adx: 35,
  volumeRatio: 1.9,
  atrPct: 1.0,
  alignedTimeframes: 3,
});

console.log('Test 3 - Señal STRONG:');
console.log(`  Level: ${strongSignal.level}`);
console.log(`  Score: ${strongSignal.score.toFixed(0)}`);
console.log(`  Recommended Trades: ${strongSignal.recommendedTrades}`);
console.log(`  Should Burst: ${strongSignal.shouldTriggerBurst}`);
console.log('');

console.log('✅ Tests completados');
```

---

## 🗓️ ORDEN DE IMPLEMENTACIÓN RECOMENDADO

1. **Día 1**: Fase 1 (Schema Prisma + signal-strength.ts)
2. **Día 2**: Fase 2 (burst-engine.ts completo)
3. **Día 3**: Fase 3 (Integración con execution-engine.ts)
4. **Día 4**: Fase 4 (Gestión de posiciones múltiples) + Fase 5 (Risk Manager)
5. **Día 5**: Fase 6 (Frontend Burst Panel) + Fase 7 (API routes)
6. **Día 6**: Fase 8 (Configuración) + Fase 9 (Analytics) + Fase 10 (Testing)
7. **Día 7**: Testing completo, debugging y optimización

---

## ⚠️ CONSIDERACIONES IMPORTANTES

### Riesgos a Controlar
- **Exposición total**: Nunca más del 15-30% del balance en una ráfaga
- **Comisiones**: Cada trade tiene comisión, calcular si el profit > comisión × N trades
- **Rate limiting de OANDA**: 500 requests/minuto, el delay de 200ms entre trades previene problemas
- **Slippage**: En ráfagas rápidas, el precio puede moverse entre cada trade
- **Correlación**: Todos los trades de una ráfaga van en el mismo par, si el mercado gira, todos pierden

### Ventajas de este Diseño
- ✅ **Ganancias acumulativas**: 10 trades con 0.3% profit cada uno = 3% acumulado
- ✅ **Riesgo controlado**: Cada trade individual tiene su propio SL
- ✅ **Métricas claras**: Se puede medir el rendimiento por ráfaga
- ✅ **Escalable**: Se puede ajustar el número de trades por señal
- ✅ **Persistente**: Todo queda registrado en la base de datos

---

# 📋 FASE 11: MEJORAS IDENTIFICADAS EN PROGRAMA2 (INTEGRADAS)

## 11.1. Smart Stop Trade - REACTIVAR SISTEMA DE PAUSAS
**Problema:** El `smart-stop-trade.ts` tiene 1212 líneas de lógica de protección pero está **completamente desactivado**. `evaluate()` siempre devuelve `allowed: true`.

**Solución:**
- Eliminar el override de `initFromDB()` que fuerza valores extremos
- Implementar configuración real desde DB con valores sensatos
- Integrar con BurstEngine: cuando SmartStopTrade bloquee, también se pausa la ráfaga
- Umbrales sensatos: `maxConsecutiveLosses: 5`, `maxDailyLossPct: 5`, `maxDrawdownPct: 10`
- Mantener el sistema de scoring (0-100) para decisiones de tamaño de ráfaga

## 11.2. Health Monitoring y Auto-Reconexión
**Problema:** El automation original no tiene health checks ni reconexión automática.

**Solución (tomado de programa2):**
- Agregar loop de health check que monitorea errores consecutivos, latencia y tasa de fallos
- Reconexión automática tras fallos de API
- Engine state persistence en DB para sobrevivir reinicios
- Daily reset tracking automático
- Stats logging cada 5 minutos

## 11.3. RSI CORREGIDO
**Problema:** El signal-engine calcula RSI con promedio simple (incorrecto). El correcto usa Wilder's smoothing (EMA).

**Solución:** Implementar Wilder's RSI correcto con smoothing exponencial.

## 11.4. ML Normalización de Features
**Problema:** Las 47 features tienen escalas radicalmente distintas (precio ~2000, RSI ~50, atr_pct ~0.02). Sin normalización, los modelos convergen mal.

**Solución:**
- Agregar normalización z-score o min-max antes de entrenar/predecir
- Mantener running mean/std para normalización online
- Aplicar la misma normalización en entrenamiento y predicción

## 11.5. Order Book Realista
**Problema:** El order book se construye con un solo bid/ask (mock).

**Solución:**
- Para OANDA, generar order book sintético basado en spread real
- Usar profundidad simulada con niveles basados en volatilidad
- Documentar claramente que es estimado, no datos reales de order book

## 11.6. Multi-Par con Precios Reales
**Problema:** Solo el par activo tiene precio real en el snapshot.

**Solución:**
- Implementar polling de precios para TODOS los pares configurados
- Cache de precios con TTL para reducir latencia
- Actualizar el store con precios reales de todos los pares

## 11.7. Seguridad - Credenciales Encriptadas
**Mejora de programa2:** Credenciales OANDA encriptadas con AES-256-GCM en DB.

**Solución:**
- Crear módulo `security.ts` con funciones `encrypt()` y `decrypt()`
- Usar clave derivada de `ENCRYPTION_KEY` en .env
- Encriptar al guardar en DB, desencriptar al leer

## 11.8. Umbrales de Estrategias Ajustados
**Problema:** Los minConfidence de estrategias son demasiado bajos (0.25-0.40), generando señales de baja calidad.

**Solución:**
- Momentum: 0.30 → 0.45
- MeanReversion: 0.35 → 0.50
- Breakout: 0.35 → 0.50
- TrendFollowing: 0.40 → 0.55
- Scalping: 0.25 → 0.40
- VolumeWeighted: 0.30 → 0.45

---

# 📋 FASE 12: CORRECCIÓN DE ERRORES CRÍTICOS

## 12.1. Fix: Trading Store Mock Data
**Problema:** `closeTrade` genera PnL aleatorio.
**Solución:** Reemplazar con lógica real de cierre que use datos del engine.

## 12.2. Fix: Type Safety en Snapshot
**Problema:** `[key: string]: any` en Snapshot elimina seguridad de tipos.
**Solución:** Definir todos los campos explícitamente con tipos correctos.

## 12.3. Fix: Validación de Respuestas OANDA
**Problema:** No hay validación de tipos en respuestas del broker.
**Solución:** Crear schemas Zod para validar respuestas de OANDA.

## 12.4. Fix: Dependencia Circular
**Problema:** Posible importación circular analysis-engine ↔ signal-engine.
**Solución:** Reorganizar imports, extraer tipos comunes.

## 12.5. Fix: Posición Mismatch Tras Caída
**Problema:** `loadOpenPosition()` solo carga de DB, no sincroniza con OANDA.
**Solución:** Verificar posiciones abiertas en OANDA al iniciar, priorizar OANDA como fuente de verdad.

---

## 🗓️ ORDEN DE IMPLEMENTACIÓN RECOMENDADO (ACTUALIZADO)

**Semana 1: Core Burst + Fixes Críticos**
- Día 1: Fase 1 (Schema Prisma + signal-strength.ts) + Fase 12.1-12.5 (Fixes críticos)
- Día 2: Fase 2 (burst-engine.ts completo)
- Día 3: Fase 3 (Integración con execution-engine.ts)
- Día 4: Fase 4 (Gestión de posiciones múltiples) + Fase 5 (Risk Manager)
- Día 5: Fase 11.1 (Smart Stop Trade reactivo) + 11.3 (RSI corregido)

**Semana 2: Mejoras de Programa2 + Frontend**
- Día 6: Fase 11.2 (Health monitoring) + 11.4 (ML normalización)
- Día 7: Fase 11.5 (Order book realista) + 11.6 (Multi-par precios reales)
- Día 8: Fase 11.7 (Seguridad credenciales) + 11.8 (Umbrales ajustados)
- Día 9: Fase 6 (Frontend Burst Panel) + Fase 7 (API routes)
- Día 10: Fase 8 (Configuración) + Fase 9 (Analytics) + Fase 10 (Testing)

---

## 🎯 RESULTADO FINAL ESPERADO

Cuando el programa detecte una señal con score >= 65:

1. **Evalúa** la fuerza de la señal (0-100)
2. **Clasifica**: WEAK (1 trade), MODERATE (2), STRONG (5), VERY_STRONG (10), EXTREME (15)
3. **Ejecuta** N trades en ráfaga con 200ms de delay entre cada uno
4. **Agrupa** todos los trades en un `TradeGroup` con métricas
5. **Gestiona** cada posición individualmente con Smart Stop Loss
6. **Cierra** cuando todas las posiciones individuales se cierren
7. **Registra** PnL total, win rate, duración de la ráfaga
8. **Muestra** en el dashboard el estado en tiempo real
