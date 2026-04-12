// ============================================
// RECO-TRADING - Burst Engine
// ============================================
// Executes multiple trades simultaneously when
// a strong signal is detected. Groups trades
// for cumulative profit tracking.
// ============================================

import { db } from '@/lib/db';
import { evaluateSignalStrength, type SignalStrengthResult } from './signal-strength';
import type { FullAnalysis } from './analysis-engine';
import type { EnsembleResult } from './strategies';
import type { MLPrediction } from './ml/predictor';
import type { MarketIntelligenceResult } from './market-intelligence';
import { placeMarketOrder, getAccountBalance } from '@/lib/broker-manager';

export interface BurstConfig {
  maxTradesPerBurst: number;
  delayBetweenTradesMs: number;
  maxTotalExposurePct: number;
  enableBurstMode: boolean;
  minSignalStrength: number;
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
  delayBetweenTradesMs: 200,
  maxTotalExposurePct: 15,
  enableBurstMode: true,
  minSignalStrength: 65,
};

export class BurstEngine {
  private config: BurstConfig;
  private activeBursts: Map<string, number> = new Map();
  private isExecuting = false;

  constructor(config?: Partial<BurstConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Evaluate if burst mode should activate */
  async evaluate(
    analysis: FullAnalysis,
    ensemble: EnsembleResult,
    mlPrediction: MLPrediction | null,
    marketIntel: MarketIntelligenceResult | null
  ): Promise<{ shouldBurst: boolean; signalStrength: SignalStrengthResult }> {
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

    const shouldBurst = this.config.enableBurstMode
      && signalStrength.shouldTriggerBurst
      && signalStrength.score >= this.config.minSignalStrength;

    return { shouldBurst, signalStrength };
  }

  /** Execute burst of trades */
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
    let tradeGroupId = 0;

    try {
      const numTrades = Math.min(
        signalStrength.recommendedTrades,
        this.config.maxTradesPerBurst
      );

      let balance = 1000; // fallback
      try {
        const accBalance = await getAccountBalance();
        balance = accBalance.balance;
      } catch {
        console.log('[BURST] Using fallback balance: 1000');
      }

      const maxTotalSize = (balance * signalStrength.totalExposurePct) / 100;
      const sizePerTrade = maxTotalSize / numTrades;

      console.log(
        `[BURST] 🚀 Signal ${signalStrength.level} (${signalStrength.score.toFixed(0)}) - ` +
        `Executing ${numTrades} trades of ${side} on ${symbol}`
      );

      // Create trade group in DB
      const tradeGroup = await db.tradeGroup.create({
        data: {
          pair: symbol,
          side,
          signalStrength: signalStrength.score,
          confidence: 0,
          confluenceScore: analysis.confluenceScore,
          triggerReason: `Signal ${signalStrength.level} - ${signalStrength.reasons.join(', ')}`,
          totalTrades: numTrades,
          totalSize: 0,
          avgEntryPrice: 0,
          status: 'ACTIVE',
        },
      });

      tradeGroupId = tradeGroup.id;

      // Execute each trade with small delay
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
            commission = orderResult.fills?.reduce((sum: number, f: any) =>
              sum + parseFloat(f.commission || '0'), 0
            ) || 0;

            // Delay between trades to avoid API rate limits
            if (i < numTrades - 1) {
              await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenTradesMs));
            }
          } else {
            orderId = `dry_burst_${tradeGroup.id}_${i}`;
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          // Save trade to DB
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

          // Create position
          await db.position.create({
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
            `[BURST] ✅ Trade #${i + 1}/${numTrades} executed - ` +
            `Entry: ${price}, Size: ${sizePerTrade}, SL: ${sl}, TP: ${tp}`
          );

        } catch (tradeError: any) {
          const msg = tradeError?.message || String(tradeError);
          errors.push(`Trade ${i + 1} error: ${msg}`);
          tradesFailed++;
          console.error(`[BURST] ❌ Trade ${i + 1} failed:`, msg);
        }
      }

      // Update group with actual results
      const avgEntryPrice = tradesExecuted > 0 ? totalEntryPrice / tradesExecuted : 0;

      await db.tradeGroup.update({
        where: { id: tradeGroupId },
        data: {
          totalTrades: tradesExecuted,
          totalSize,
          avgEntryPrice,
        },
      });

      this.activeBursts.set(symbol, tradeGroupId);

      console.log(
        `[BURST] 📊 Burst completed: ${tradesExecuted} executed, ` +
        `${tradesFailed} failed, Total size: ${totalSize.toFixed(4)}, ` +
        `Avg entry: ${avgEntryPrice.toFixed(2)}`
      );

      return {
        triggered: true,
        signalStrength,
        burstId: tradeGroupId,
        tradesExecuted,
        tradesFailed,
        totalSize,
        avgEntryPrice,
        burstTrades,
        errors,
      };

    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[BURST] ❌ Fatal error in burst:', msg);
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

  /** Close all trades in a burst */
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
      const openPositions = await db.position.findMany({
        where: {
          trade: {
            tradeGroupId: burstId,
            status: 'OPEN',
          },
        },
      });

      for (const position of openPositions) {
        try {
          await closePositionFn(position.id, closeReason);
          closed++;
        } catch (err: any) {
          const msg = err?.message || String(err);
          errors.push(`Failed to close position #${position.id}: ${msg}`);
        }
      }

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
        `[BURST] 🏁 Burst #${burstId} closed: ${closed} positions, ` +
        `Total PnL: ${totalPnl.toFixed(2)} (${totalPnlPct.toFixed(2)}%)`
      );

    } catch (err: any) {
      const msg = err?.message || String(err);
      errors.push(`Close burst error: ${msg}`);
    }

    return { closed, errors };
  }

  /** Get active bursts */
  getActiveBursts(): Map<string, number> {
    return new Map(this.activeBursts);
  }

  /** Update configuration */
  updateConfig(config: Partial<BurstConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[BURST] Config updated:', this.config);
  }
}
