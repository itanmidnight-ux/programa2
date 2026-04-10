// ============================================
// RECO-TRADING - Smart Stop Loss API
// ============================================
// GET  /api/stop-loss  - Get Smart Stop Loss status
// POST /api/stop-loss  - Manual stop control
// ============================================

import { NextResponse } from "next/server";
import { SmartStopLoss, type SmartStopConfig, DEFAULT_SMART_STOP_CONFIG } from "@/lib/smart-stop-loss";
import { db } from "@/lib/db";

// ---- Global singleton (survives hot-reloads) ----
const globalSSL = globalThis as unknown as { smartStopLoss: SmartStopLoss | undefined };
const smartStopLoss: SmartStopLoss = globalSSL.smartStopLoss ?? new SmartStopLoss();
if (process.env.NODE_ENV !== "production") globalSSL.smartStopLoss = smartStopLoss;

// ---- Helpers: DB Config <-> SmartStopConfig conversion ----
function dbConfigToSmartStopConfig(dbCfg: any): SmartStopConfig {
  return {
    phase1: { profitPct: dbCfg.phase1ProfitPct, trailATR: dbCfg.phase1TrailATR },
    phase2: { profitPct: dbCfg.phase2ProfitPct, trailATR: dbCfg.phase2TrailATR },
    phase3: { profitPct: dbCfg.phase3ProfitPct, trailATR: dbCfg.phase3TrailATR },
    phase4: { profitPct: dbCfg.phase4ProfitPct, trailATR: dbCfg.phase4TrailATR },
    breakEvenTriggerPct: dbCfg.breakEvenTriggerPct,
    breakEvenBuffer: dbCfg.breakEvenBuffer,
    profitLocks: JSON.parse(dbCfg.profitLocks || "[]"),
    maxHoldingMinutes: dbCfg.maxHoldingMinutes,
    timeStopCheckInterval: dbCfg.timeStopCheckInterval,
    unprofitableTimeLimit: dbCfg.unprofitableTimeLimit,
    enableMomentumStop: dbCfg.enableMomentumStop,
    momentumStopMinProfit: dbCfg.momentumStopMinProfit,
    slBufferFromSR: dbCfg.slBufferFromSR,
    useResistanceAsTP: dbCfg.useResistanceAsTP,
    useSupportAsSL: dbCfg.useSupportAsSL,
    atrPeriod: dbCfg.atrPeriod,
    atrMultiplierBase: dbCfg.atrMultiplierBase,
    atrMultiplierVolatility: dbCfg.atrMultiplierVolatility,
    volatilityATRPctThreshold: dbCfg.volatilityATRPctThreshold,
    cooldownAfterStop: dbCfg.cooldownAfterStop,
  };
}

function smartStopConfigToDbData(cfg: SmartStopConfig) {
  return {
    phase1ProfitPct: cfg.phase1.profitPct,
    phase1TrailATR: cfg.phase1.trailATR,
    phase2ProfitPct: cfg.phase2.profitPct,
    phase2TrailATR: cfg.phase2.trailATR,
    phase3ProfitPct: cfg.phase3.profitPct,
    phase3TrailATR: cfg.phase3.trailATR,
    phase4ProfitPct: cfg.phase4.profitPct,
    phase4TrailATR: cfg.phase4.trailATR,
    breakEvenTriggerPct: cfg.breakEvenTriggerPct,
    breakEvenBuffer: cfg.breakEvenBuffer,
    profitLocks: JSON.stringify(cfg.profitLocks),
    maxHoldingMinutes: cfg.maxHoldingMinutes,
    timeStopCheckInterval: cfg.timeStopCheckInterval,
    unprofitableTimeLimit: cfg.unprofitableTimeLimit,
    enableMomentumStop: cfg.enableMomentumStop,
    momentumStopMinProfit: cfg.momentumStopMinProfit,
    slBufferFromSR: cfg.slBufferFromSR,
    useResistanceAsTP: cfg.useResistanceAsTP,
    useSupportAsSL: cfg.useSupportAsSL,
    atrPeriod: cfg.atrPeriod,
    atrMultiplierBase: cfg.atrMultiplierBase,
    atrMultiplierVolatility: cfg.atrMultiplierVolatility,
    volatilityATRPctThreshold: cfg.volatilityATRPctThreshold,
    cooldownAfterStop: cfg.cooldownAfterStop,
  };
}

// ---- Load persisted config on first access ----
let configLoaded = false;
async function ensureConfigLoaded() {
  if (configLoaded) return;
  try {
    const persisted = await db.smartStopLossConfig.findUnique({ where: { id: "main" } });
    if (persisted) {
      smartStopLoss.config = dbConfigToSmartStopConfig(persisted);
    }
  } catch { /* use defaults */ }
  configLoaded = true;
}

// ---- Minimal position shape needed for getStatus ----
interface MinimalPosition {
  entryPrice: number;
  currentPrice: number;
  side: string;
  stopLoss: number;
  takeProfit: number;
  highestPrice?: number;
  lowestPrice?: number;
  openedAt: Date | string;
  pair?: string;
  tradeId?: number;
}

// ---- Minimal analysis shape needed for getStatus ----
interface MinimalAnalysis {
  price: number;
  atr: number;
  atrPct: number;
  rsi: number;
  support: number;
  resistance: number;
  pivotPoints: { s1: number; s2: number; s3: number; r1: number; r2: number; r3: number };
  confluenceScore: number;
}

export async function GET() {
  const startTime = Date.now();
  try {
    // Ensure persisted config is loaded
    await ensureConfigLoaded();

    // Also return persisted config metadata
    let persistedConfig: { updatedAt: Date } | null = null;
    try {
      const pc = await db.smartStopLossConfig.findUnique({ where: { id: "main" } });
      if (pc) persistedConfig = { updatedAt: pc.updatedAt };
    } catch { /* ignore */ }

    // Load current position from DB if any
    let position: MinimalPosition | null = null;
    let analysis: MinimalAnalysis | null = null;

    try {
      const openPos = await db.position.findFirst({
        include: { trade: true },
      });

      if (openPos) {
        // Get current price
        const pair = openPos.pair || process.env.TRADING_PAIR || "BTCUSDT";

        let currentPrice = openPos.currentPrice;
        try {
          const { getTickerPrice, isTestnetMode } = await import("@/lib/binance");
          const price = await getTickerPrice(pair, isTestnetMode());
          if (price > 0) currentPrice = price;
        } catch { /* use DB price */ }

        position = {
          entryPrice: openPos.entryPrice,
          currentPrice,
          side: openPos.side,
          stopLoss: openPos.stopLoss,
          takeProfit: openPos.takeProfit,
          highestPrice: openPos.highestPrice ?? openPos.entryPrice,
          lowestPrice: openPos.lowestPrice ?? openPos.entryPrice,
          openedAt: openPos.openedAt,
          pair: openPos.pair,
          tradeId: openPos.tradeId,
        };

        // Run a quick analysis for proper status computation
        try {
          const { getKlines, isTestnetMode } = await import("@/lib/binance");
          const { analyzeMarket } = await import("@/lib/analysis-engine");
          const klines = await getKlines(pair, "5m", 50, isTestnetMode());
          const fullAnalysis = analyzeMarket(klines, [], [], []);
          analysis = {
            price: fullAnalysis.price,
            atr: fullAnalysis.atr,
            atrPct: fullAnalysis.atrPct,
            rsi: fullAnalysis.rsi,
            support: fullAnalysis.support,
            resistance: fullAnalysis.resistance,
            pivotPoints: fullAnalysis.pivotPoints,
            confluenceScore: fullAnalysis.confluenceScore,
          };
        } catch { /* analysis not available */ }
      }
    } catch { /* no position */ }

    // Build status response
    if (position && analysis) {
      const status = smartStopLoss.getStatus(
        position as any,
        analysis as any,
      );

      return NextResponse.json({
        phase: status.currentPhase,
        phaseName: status.phaseName,
        profitPct: status.profitPct,
        currentSL: status.currentSL,
        initialSL: status.initialSL,
        trailingActive: status.trailingActive,
        breakEvenActive: status.breakEvenActive,
        timeOpen: status.timeOpen,
        timeStopAt: status.timeStopAt,
        nextProfitLock: status.nextProfitLock,
        hasPosition: true,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        config: {
          phase1: smartStopLoss.config.phase1,
          phase2: smartStopLoss.config.phase2,
          phase3: smartStopLoss.config.phase3,
          phase4: smartStopLoss.config.phase4,
          breakEvenTriggerPct: smartStopLoss.config.breakEvenTriggerPct,
          profitLocks: smartStopLoss.config.profitLocks,
          maxHoldingMinutes: smartStopLoss.config.maxHoldingMinutes,
        },
        persistedConfig: persistedConfig,
        api_latency_ms: Date.now() - startTime,
      });
    }

    // No open position — return config + idle state
    return NextResponse.json({
      phase: 0,
      phaseName: "No Trailing",
      profitPct: 0,
      currentSL: 0,
      initialSL: 0,
      trailingActive: false,
      breakEvenActive: false,
      timeOpen: 0,
      timeStopAt: smartStopLoss.config.maxHoldingMinutes,
      nextProfitLock: null,
      hasPosition: false,
      entryPrice: 0,
      currentPrice: 0,
      config: {
        phase1: smartStopLoss.config.phase1,
        phase2: smartStopLoss.config.phase2,
        phase3: smartStopLoss.config.phase3,
        phase4: smartStopLoss.config.phase4,
        breakEvenTriggerPct: smartStopLoss.config.breakEvenTriggerPct,
        profitLocks: smartStopLoss.config.profitLocks,
        maxHoldingMinutes: smartStopLoss.config.maxHoldingMinutes,
      },
      persistedConfig: persistedConfig,
      api_latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, phase: 0, trailingActive: false, breakEvenActive: false, api_latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const { action, config } = body;

    if (!action || !["reset", "update_config"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "Invalid action. Use: reset, update_config" },
        { status: 400 }
      );
    }

    let result: { success: boolean; message: string };

    switch (action) {
      case "reset":
        smartStopLoss.reset();
        result = { success: true, message: "Smart Stop Loss reset successfully" };
        break;
      case "update_config":
        if (config && typeof config === "object") {
          smartStopLoss.config = { ...smartStopLoss.config, ...config };
          // Persist config to database
          try {
            const dbData = smartStopConfigToDbData(smartStopLoss.config);
            await db.smartStopLossConfig.upsert({
              where: { id: "main" },
              update: dbData,
              create: { id: "main", ...dbData },
            });
          } catch (persistErr) {
            console.error("[SMART-SL] Failed to persist config:", persistErr);
          }
          result = { success: true, message: "Smart Stop Loss config updated and persisted" };
        } else {
          return NextResponse.json(
            { success: false, message: "Config object required for update_config" },
            { status: 400 }
          );
        }
        break;
      default:
        return NextResponse.json(
          { success: false, message: "Unknown action" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      ...result,
      config: smartStopLoss.config,
      api_latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message, api_latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
