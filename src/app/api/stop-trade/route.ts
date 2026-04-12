// ============================================
// RECO-TRADING - Smart Stop Trade API
// ============================================
// GET  /api/stop-trade  - Get Smart Stop Trade status
// POST /api/stop-trade  - Manual pause/resume
// ============================================

import { NextResponse } from "next/server";
import { SmartStopTrade, type StopTradeConfig, type PauseReason } from "@/lib/smart-stop-trade";
import { db } from "@/lib/db";

// ---- Global singleton (survives hot-reloads) ----
const globalSST = globalThis as unknown as { smartStopTrade: SmartStopTrade | undefined };
const smartStopTrade: SmartStopTrade = globalSST.smartStopTrade ?? new SmartStopTrade();
if (process.env.NODE_ENV !== "production") globalSST.smartStopTrade = smartStopTrade;

// ---- Helpers: DB Config <-> StopTradeConfig conversion ----
function dbConfigToStopTradeConfig(dbCfg: any): StopTradeConfig {
  return {
    maxATRPct: dbCfg.maxATRPct,
    minATRPct: dbCfg.minATRPct,
    minADXForTrend: dbCfg.minADXForTrend,
    maxSpreadPct: dbCfg.maxSpreadPct,
    minConfluenceScore: dbCfg.minConfluenceScore,
    minConfidenceGlobal: dbCfg.minConfidenceGlobal,
    maxConsecutiveLosses: dbCfg.maxConsecutiveLosses,
    maxDailyLossPct: dbCfg.maxDailyLossPct,
    maxDrawdownPct: dbCfg.maxDrawdownPct,
    lossStreakReductionPct: dbCfg.lossStreakReductionPct,
    lowLiquidityHours: JSON.parse(dbCfg.lowLiquidityHours || "[0,1,2,3,4,5,6]"),
    weekendPause: dbCfg.weekendPause,
    equityCurveMAPeriod: dbCfg.equityCurveMAPeriod,
    equityCurvePauseBelowMA: dbCfg.equityCurvePauseBelowMA,
    enableMLVeto: dbCfg.enableMLVeto,
    mlVetoThreshold: dbCfg.mlVetoThreshold,
    avoidRegimes: JSON.parse(dbCfg.avoidRegimes || "[]"),
    reducedSizeRegimes: JSON.parse(dbCfg.reducedSizeRegimes || "[]"),
    reducedSizeMultiplier: dbCfg.reducedSizeMultiplier,
    autoResumeAfterMinutes: dbCfg.autoResumeAfterMinutes,
    requireAllClear: dbCfg.requireAllClear,
    pauseCooldownMinutes: dbCfg.pauseCooldownMinutes,
    resumeCheckIntervalSeconds: dbCfg.resumeCheckIntervalSec,
  };
}

function stopTradeConfigToDbData(cfg: StopTradeConfig) {
  return {
    maxATRPct: cfg.maxATRPct,
    minATRPct: cfg.minATRPct,
    minADXForTrend: cfg.minADXForTrend,
    maxSpreadPct: cfg.maxSpreadPct,
    minConfluenceScore: cfg.minConfluenceScore,
    minConfidenceGlobal: cfg.minConfidenceGlobal,
    maxConsecutiveLosses: cfg.maxConsecutiveLosses,
    maxDailyLossPct: cfg.maxDailyLossPct,
    maxDrawdownPct: cfg.maxDrawdownPct,
    lossStreakReductionPct: cfg.lossStreakReductionPct,
    lowLiquidityHours: JSON.stringify(cfg.lowLiquidityHours),
    weekendPause: cfg.weekendPause,
    equityCurveMAPeriod: cfg.equityCurveMAPeriod,
    equityCurvePauseBelowMA: cfg.equityCurvePauseBelowMA,
    enableMLVeto: cfg.enableMLVeto,
    mlVetoThreshold: cfg.mlVetoThreshold,
    avoidRegimes: JSON.stringify(cfg.avoidRegimes),
    reducedSizeRegimes: JSON.stringify(cfg.reducedSizeRegimes),
    reducedSizeMultiplier: cfg.reducedSizeMultiplier,
    autoResumeAfterMinutes: cfg.autoResumeAfterMinutes,
    requireAllClear: cfg.requireAllClear,
    pauseCooldownMinutes: cfg.pauseCooldownMinutes,
    resumeCheckIntervalSec: cfg.resumeCheckIntervalSeconds,
  };
}

// ---- Load persisted config on first access ----
let sstConfigLoaded = false;
async function ensureSstConfigLoaded() {
  if (sstConfigLoaded) return;
  try {
    const persisted = await db.smartStopTradeConfig.findUnique({ where: { id: "main" } });
    if (persisted) {
      smartStopTrade.config = dbConfigToStopTradeConfig(persisted);
    }
  } catch { /* use defaults */ }
  sstConfigLoaded = true;
}

export async function GET() {
  const startTime = Date.now();
  try {
    // Ensure persisted config is loaded
    await ensureSstConfigLoaded();

    // Also return persisted config metadata
    let persistedConfig: { updatedAt: Date } | null = null;
    try {
      const pc = await db.smartStopTradeConfig.findUnique({ where: { id: "main" } });
      if (pc) persistedConfig = { updatedAt: pc.updatedAt };
    } catch { /* ignore */ }

    // Load trades and balance for metrics calculation
    let trades: { pnl: number; closedAt?: Date | null; status: string }[] = [];
    let balance = parseFloat(process.env.INITIAL_CAPITAL || "1000");

    try {
      const closedTrades = await db.trade.findMany({
        where: { status: "CLOSED" },
        orderBy: { openedAt: "desc" },
        take: 50,
      });
      trades = closedTrades.map(t => ({
        pnl: t.pnl,
        closedAt: t.closedAt,
        status: t.status,
      }));
    } catch { /* db not ready */ }

    // Get analysis data for market-condition-based metrics
    let analysis: any = null;
    try {
      const pair = process.env.TRADING_SYMBOL || "XAU_USD";
      const { getKlines } = await import("@/lib/broker-manager");
      const { analyzeMarket } = await import("@/lib/analysis-engine");
      const klines = await getKlines(pair, "5m", 100);
      analysis = analyzeMarket(klines, [], [], []);
    } catch { /* analysis not available */ }

    // Sync daily PnL from DB
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTrades = await db.trade.findMany({
        where: { openedAt: { gte: today }, status: "CLOSED" },
      });
      const dailyPnl = todayTrades.reduce((sum, t) => sum + t.pnl, 0);
      smartStopTrade.setDailyPnl(dailyPnl);

      // Sync consecutive losses
      const recentLosses = todayTrades
        .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
        .reduce((count, t) => {
          if (t.pnl < 0) return count + 1;
          return 0;
        }, 0);
      // Update consecutiveLosses indirectly via getStatus reset if needed
    } catch { /* sync not available */ }

    // Get comprehensive metrics
    const metrics = smartStopTrade.getMetrics(analysis, trades as any, balance);
    const status = smartStopTrade.getStatus();

    // Calculate auto-resume countdown
    let autoResumeCountdown = 0;
    if (status.isPaused && status.pauseSince > 0) {
      const pausedDuration = Date.now() - status.pauseSince;
      const autoResumeTime = smartStopTrade.config.autoResumeAfterMinutes * 60 * 1000;
      autoResumeCountdown = Math.max(0, Math.ceil((autoResumeTime - pausedDuration) / 60000));
    }

    return NextResponse.json({
      isPaused: metrics.isPaused,
      pauseReason: metrics.pauseReason,
      overallScore: metrics.overallScore,
      volatilityScore: metrics.volatilityScore,
      signalQualityScore: metrics.signalQualityScore,
      performanceScore: metrics.performanceScore,
      timingScore: metrics.timingScore,
      regimeScore: metrics.regimeScore,
      consecutiveLosses: metrics.consecutiveLosses,
      dailyPnlPct: +metrics.dailyPnlPct.toFixed(2),
      currentDrawdownPct: +metrics.currentDrawdownPct.toFixed(2),
      positionSizeMultiplier: 1, // Would come from evaluate(), approximate with 1
      pauseCount: status.pauseCount,
      totalPausedTime: Math.round(status.totalPausedTime / 60000),
      autoResumeCountdown,
      pauseSince: status.pauseSince,
      peakBalance: status.peakBalance,
      config: {
        maxConsecutiveLosses: smartStopTrade.config.maxConsecutiveLosses,
        maxDailyLossPct: smartStopTrade.config.maxDailyLossPct,
        maxDrawdownPct: smartStopTrade.config.maxDrawdownPct,
        autoResumeAfterMinutes: smartStopTrade.config.autoResumeAfterMinutes,
        pauseCooldownMinutes: smartStopTrade.config.pauseCooldownMinutes,
      },
      persistedConfig: persistedConfig,
      api_latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message,
        isPaused: false,
        pauseReason: null,
        overallScore: 50,
        volatilityScore: 50,
        signalQualityScore: 50,
        performanceScore: 50,
        timingScore: 50,
        regimeScore: 50,
        consecutiveLosses: 0,
        dailyPnlPct: 0,
        currentDrawdownPct: 0,
        positionSizeMultiplier: 1,
        autoResumeCountdown: 0,
        api_latency_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const { action, config } = body;

    if (!action || !["pause", "resume", "reset_daily", "update_config"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "Invalid action. Use: pause, resume, reset_daily, update_config" },
        { status: 400 }
      );
    }

    let result: { success: boolean; message: string };

    switch (action) {
      case "pause":
        smartStopTrade.pause("MANUAL_PAUSE");
        result = { success: true, message: "Trading paused manually" };
        break;
      case "resume":
        smartStopTrade.resume();
        result = { success: true, message: "Trading resumed" };
        break;
      case "reset_daily":
        smartStopTrade.resetDaily();
        result = { success: true, message: "Daily counters reset" };
        break;
      case "update_config":
        if (config && typeof config === "object") {
          smartStopTrade.config = { ...smartStopTrade.config, ...config };
          // Persist config to database
          try {
            const dbData = stopTradeConfigToDbData(smartStopTrade.config);
            await db.smartStopTradeConfig.upsert({
              where: { id: "main" },
              update: dbData,
              create: { id: "main", ...dbData },
            });
          } catch (persistErr) {
            console.error("[SMART-ST] Failed to persist config:", persistErr);
          }
          result = { success: true, message: "Smart Stop Trade config updated and persisted" };
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

    const status = smartStopTrade.getStatus();

    return NextResponse.json({
      ...result,
      status: {
        isPaused: status.isPaused,
        pauseReason: status.pauseReason,
        consecutiveLosses: status.consecutiveLosses,
        dailyPnl: status.dailyPnl,
      },
      api_latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message, api_latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
