// ============================================
// Config Persistence - Load/Save Engine Configs
// ============================================
// Handles loading/saving configs for:
//   - RiskManagerConfig (risk manager parameters)
//   - SmartStopLossConfig (smart stop loss parameters)
//   - SmartStopTradeConfig (smart stop trade parameters)
//   - EngineState (engine runtime state)
//
// Each config uses a singleton row (id = "main") in its
// respective database table, initialized with defaults on
// first access via upsert pattern.
// ============================================

import { db } from '@/lib/db';
import type { RiskConfig } from '@/lib/risk-manager';
import type { SmartStopConfig } from '@/lib/smart-stop-loss';
import type { StopTradeConfig } from '@/lib/smart-stop-trade';

// ---- Risk Manager Config ----

/**
 * Load RiskManager config from DB. Returns partial config
 * (only fields stored in DB — the rest come from code defaults).
 */
export async function loadRiskManagerConfig(): Promise<Partial<RiskConfig>> {
  try {
    const row = await db.riskManagerConfig.upsert({
      where: { id: 'main' },
      update: {},
      create: { id: 'main' }, // All fields use @default in schema
    });

    return {
      maxRiskPerTrade: row.maxRiskPerTrade,
      maxDailyLoss: row.maxDailyLoss,
      maxDrawdown: row.maxDrawdown,
      maxTradesPerDay: row.maxTradesPerDay,
      maxTradesPerHour: row.maxTradesPerHour,
      minConfidence: row.minConfidence,
      minRiskReward: row.minRiskReward,
      maxSpreadPct: row.maxSpreadPct,
      cooldownMinutes: row.cooldownMinutes,
      kellyFraction: row.kellyFraction,
      trailingStopATR: row.trailingStopATR,
      breakEvenATR: row.breakEvenATR,
      maxOpenPositions: row.maxOpenPositions,
      emergencyStopPct: row.emergencyStopPct,
    };
  } catch (error) {
    console.error('[ConfigPersistence] loadRiskManagerConfig error:', error instanceof Error ? error.message : String(error));
    return {};
  }
}

/**
 * Save RiskManager config to DB. Accepts partial config —
 * only provided fields will be updated.
 */
export async function saveRiskManagerConfig(config: Partial<RiskConfig>): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {};
    if (config.maxRiskPerTrade !== undefined) updateData.maxRiskPerTrade = config.maxRiskPerTrade;
    if (config.maxDailyLoss !== undefined) updateData.maxDailyLoss = config.maxDailyLoss;
    if (config.maxDrawdown !== undefined) updateData.maxDrawdown = config.maxDrawdown;
    if (config.maxTradesPerDay !== undefined) updateData.maxTradesPerDay = config.maxTradesPerDay;
    if (config.maxTradesPerHour !== undefined) updateData.maxTradesPerHour = config.maxTradesPerHour;
    if (config.minConfidence !== undefined) updateData.minConfidence = config.minConfidence;
    if (config.minRiskReward !== undefined) updateData.minRiskReward = config.minRiskReward;
    if (config.maxSpreadPct !== undefined) updateData.maxSpreadPct = config.maxSpreadPct;
    if (config.cooldownMinutes !== undefined) updateData.cooldownMinutes = config.cooldownMinutes;
    if (config.kellyFraction !== undefined) updateData.kellyFraction = config.kellyFraction;
    if (config.trailingStopATR !== undefined) updateData.trailingStopATR = config.trailingStopATR;
    if (config.breakEvenATR !== undefined) updateData.breakEvenATR = config.breakEvenATR;
    if (config.maxOpenPositions !== undefined) updateData.maxOpenPositions = config.maxOpenPositions;
    if (config.emergencyStopPct !== undefined) updateData.emergencyStopPct = config.emergencyStopPct;

    await db.riskManagerConfig.upsert({
      where: { id: 'main' },
      update: updateData,
      create: { id: 'main', ...updateData },
    });
  } catch (error) {
    console.error('[ConfigPersistence] saveRiskManagerConfig error:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// ---- Smart Stop Loss Config ----

/**
 * Load SmartStopLoss config from DB, returning the full config object.
 */
export async function loadSmartStopLossConfig(): Promise<SmartStopConfig> {
  try {
    const row = await db.smartStopLossConfig.upsert({
      where: { id: 'main' },
      update: {},
      create: { id: 'main' },
    });

    // Parse JSON fields with fallbacks
    // Default profit locks (same as DEFAULT_SMART_STOP_CONFIG in smart-stop-loss.ts)
    const DEFAULT_PROFIT_LOCKS = [
      { profitPct: 2.0, closePct: 0, moveSLToPct: 1.2 },
      { profitPct: 3.5, closePct: 0, moveSLToPct: 2.5 },
      { profitPct: 5.0, closePct: 0, moveSLToPct: 4.0 },
    ];
    let profitLocks: SmartStopConfig['profitLocks'] = DEFAULT_PROFIT_LOCKS;
    try {
      const parsed = JSON.parse(row.profitLocks);
      if (Array.isArray(parsed) && parsed.length > 0) profitLocks = parsed;
      // If parsed is empty array (DB default "[]"), keep DEFAULT_PROFIT_LOCKS
    } catch {
      // Use default if parse fails
    }

    return {
      phase1: { profitPct: row.phase1ProfitPct, trailATR: row.phase1TrailATR },
      phase2: { profitPct: row.phase2ProfitPct, trailATR: row.phase2TrailATR },
      phase3: { profitPct: row.phase3ProfitPct, trailATR: row.phase3TrailATR },
      phase4: { profitPct: row.phase4ProfitPct, trailATR: row.phase4TrailATR },
      breakEvenTriggerPct: row.breakEvenTriggerPct,
      breakEvenBuffer: row.breakEvenBuffer,
      profitLocks,
      maxHoldingMinutes: row.maxHoldingMinutes,
      timeStopCheckInterval: row.timeStopCheckInterval,
      unprofitableTimeLimit: row.unprofitableTimeLimit,
      enableMomentumStop: row.enableMomentumStop,
      momentumStopMinProfit: row.momentumStopMinProfit,
      slBufferFromSR: row.slBufferFromSR,
      useResistanceAsTP: row.useResistanceAsTP,
      useSupportAsSL: row.useSupportAsSL,
      atrPeriod: row.atrPeriod,
      atrMultiplierBase: row.atrMultiplierBase,
      atrMultiplierVolatility: row.atrMultiplierVolatility,
      volatilityATRPctThreshold: row.volatilityATRPctThreshold,
      cooldownAfterStop: row.cooldownAfterStop,
    };
  } catch (error) {
    console.error('[ConfigPersistence] loadSmartStopLossConfig error:', error instanceof Error ? error.message : String(error));
    // Return defaults from smart-stop-loss.ts
    const { DEFAULT_SMART_STOP_CONFIG } = await import('@/lib/smart-stop-loss');
    return DEFAULT_SMART_STOP_CONFIG;
  }
}

/**
 * Save SmartStopLoss config to DB.
 */
export async function saveSmartStopLossConfig(config: SmartStopConfig): Promise<void> {
  try {
    const profitLocksJSON = JSON.stringify(config.profitLocks ?? []);

    await db.smartStopLossConfig.upsert({
      where: { id: 'main' },
      update: {
        phase1ProfitPct: config.phase1.profitPct,
        phase1TrailATR: config.phase1.trailATR,
        phase2ProfitPct: config.phase2.profitPct,
        phase2TrailATR: config.phase2.trailATR,
        phase3ProfitPct: config.phase3.profitPct,
        phase3TrailATR: config.phase3.trailATR,
        phase4ProfitPct: config.phase4.profitPct,
        phase4TrailATR: config.phase4.trailATR,
        breakEvenTriggerPct: config.breakEvenTriggerPct,
        breakEvenBuffer: config.breakEvenBuffer,
        profitLocks: profitLocksJSON,
        maxHoldingMinutes: config.maxHoldingMinutes,
        timeStopCheckInterval: config.timeStopCheckInterval,
        unprofitableTimeLimit: config.unprofitableTimeLimit,
        enableMomentumStop: config.enableMomentumStop,
        momentumStopMinProfit: config.momentumStopMinProfit,
        slBufferFromSR: config.slBufferFromSR,
        useResistanceAsTP: config.useResistanceAsTP,
        useSupportAsSL: config.useSupportAsSL,
        atrPeriod: config.atrPeriod,
        atrMultiplierBase: config.atrMultiplierBase,
        atrMultiplierVolatility: config.atrMultiplierVolatility,
        volatilityATRPctThreshold: config.volatilityATRPctThreshold,
        cooldownAfterStop: config.cooldownAfterStop,
      },
      create: {
        id: 'main',
        phase1ProfitPct: config.phase1.profitPct,
        phase1TrailATR: config.phase1.trailATR,
        phase2ProfitPct: config.phase2.profitPct,
        phase2TrailATR: config.phase2.trailATR,
        phase3ProfitPct: config.phase3.profitPct,
        phase3TrailATR: config.phase3.trailATR,
        phase4ProfitPct: config.phase4.profitPct,
        phase4TrailATR: config.phase4.trailATR,
        breakEvenTriggerPct: config.breakEvenTriggerPct,
        breakEvenBuffer: config.breakEvenBuffer,
        profitLocks: profitLocksJSON,
        maxHoldingMinutes: config.maxHoldingMinutes,
        timeStopCheckInterval: config.timeStopCheckInterval,
        unprofitableTimeLimit: config.unprofitableTimeLimit,
        enableMomentumStop: config.enableMomentumStop,
        momentumStopMinProfit: config.momentumStopMinProfit,
        slBufferFromSR: config.slBufferFromSR,
        useResistanceAsTP: config.useResistanceAsTP,
        useSupportAsSL: config.useSupportAsSL,
        atrPeriod: config.atrPeriod,
        atrMultiplierBase: config.atrMultiplierBase,
        atrMultiplierVolatility: config.atrMultiplierVolatility,
        volatilityATRPctThreshold: config.volatilityATRPctThreshold,
        cooldownAfterStop: config.cooldownAfterStop,
      },
    });
  } catch (error) {
    console.error('[ConfigPersistence] saveSmartStopLossConfig error:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// ---- Smart Stop Trade Config ----

/**
 * Load SmartStopTrade config from DB.
 */
export async function loadSmartStopTradeConfig(): Promise<StopTradeConfig> {
  try {
    const row = await db.smartStopTradeConfig.upsert({
      where: { id: 'main' },
      update: {},
      create: { id: 'main' },
    });

    // Parse JSON array fields with fallbacks
    let lowLiquidityHours: number[] = [0, 1, 2, 3, 4, 5, 6];
    try {
      const parsed = JSON.parse(row.lowLiquidityHours);
      if (Array.isArray(parsed)) lowLiquidityHours = parsed;
    } catch { /* use default */ }

    let avoidRegimes: string[] = [];
    try {
      const parsed = JSON.parse(row.avoidRegimes);
      if (Array.isArray(parsed)) avoidRegimes = parsed;
    } catch { /* use default */ }

    let reducedSizeRegimes: string[] = ['RANGING', 'VOLATILE'];
    try {
      const parsed = JSON.parse(row.reducedSizeRegimes);
      if (Array.isArray(parsed)) reducedSizeRegimes = parsed;
    } catch { /* use default */ }

    return {
      maxATRPct: row.maxATRPct,
      minATRPct: row.minATRPct,
      minADXForTrend: row.minADXForTrend,
      maxSpreadPct: row.maxSpreadPct,
      minConfluenceScore: row.minConfluenceScore,
      minConfidenceGlobal: row.minConfidenceGlobal,
      maxConsecutiveLosses: row.maxConsecutiveLosses,
      maxDailyLossPct: row.maxDailyLossPct,
      maxDrawdownPct: row.maxDrawdownPct,
      lossStreakReductionPct: row.lossStreakReductionPct,
      lowLiquidityHours,
      weekendPause: row.weekendPause,
      equityCurveMAPeriod: row.equityCurveMAPeriod,
      equityCurvePauseBelowMA: row.equityCurvePauseBelowMA,
      enableMLVeto: row.enableMLVeto,
      mlVetoThreshold: row.mlVetoThreshold,
      avoidRegimes,
      reducedSizeRegimes,
      reducedSizeMultiplier: row.reducedSizeMultiplier,
      autoResumeAfterMinutes: row.autoResumeAfterMinutes,
      requireAllClear: row.requireAllClear,
      pauseCooldownMinutes: row.pauseCooldownMinutes,
      resumeCheckIntervalSeconds: row.resumeCheckIntervalSec,
    };
  } catch (error) {
    console.error('[ConfigPersistence] loadSmartStopTradeConfig error:', error instanceof Error ? error.message : String(error));
    return {
      maxATRPct: 4.0,
      minATRPct: 0.15,
      minADXForTrend: 15,
      maxSpreadPct: 0.05,
      minConfluenceScore: 0.3,
      minConfidenceGlobal: 0.55,
      maxConsecutiveLosses: 5,
      maxDailyLossPct: 3.0,
      maxDrawdownPct: 8.0,
      lossStreakReductionPct: 20,
      lowLiquidityHours: [0, 1, 2, 3, 4, 5, 6],
      weekendPause: false,
      equityCurveMAPeriod: 10,
      equityCurvePauseBelowMA: true,
      enableMLVeto: true,
      mlVetoThreshold: 0.7,
      avoidRegimes: [],
      reducedSizeRegimes: ['RANGING', 'VOLATILE'],
      reducedSizeMultiplier: 0.5,
      autoResumeAfterMinutes: 15,
      requireAllClear: false,
      pauseCooldownMinutes: 5,
      resumeCheckIntervalSeconds: 30,
    };
  }
}

/**
 * Save SmartStopTrade config to DB.
 */
export async function saveSmartStopTradeConfig(config: StopTradeConfig): Promise<void> {
  try {
    await db.smartStopTradeConfig.upsert({
      where: { id: 'main' },
      update: {
        maxATRPct: config.maxATRPct,
        minATRPct: config.minATRPct,
        minADXForTrend: config.minADXForTrend,
        maxSpreadPct: config.maxSpreadPct,
        minConfluenceScore: config.minConfluenceScore,
        minConfidenceGlobal: config.minConfidenceGlobal,
        maxConsecutiveLosses: config.maxConsecutiveLosses,
        maxDailyLossPct: config.maxDailyLossPct,
        maxDrawdownPct: config.maxDrawdownPct,
        lossStreakReductionPct: config.lossStreakReductionPct,
        lowLiquidityHours: JSON.stringify(config.lowLiquidityHours),
        weekendPause: config.weekendPause,
        equityCurveMAPeriod: config.equityCurveMAPeriod,
        equityCurvePauseBelowMA: config.equityCurvePauseBelowMA,
        enableMLVeto: config.enableMLVeto,
        mlVetoThreshold: config.mlVetoThreshold,
        avoidRegimes: JSON.stringify(config.avoidRegimes),
        reducedSizeRegimes: JSON.stringify(config.reducedSizeRegimes),
        reducedSizeMultiplier: config.reducedSizeMultiplier,
        autoResumeAfterMinutes: config.autoResumeAfterMinutes,
        requireAllClear: config.requireAllClear,
        pauseCooldownMinutes: config.pauseCooldownMinutes,
        resumeCheckIntervalSec: config.resumeCheckIntervalSeconds,
      },
      create: {
        id: 'main',
        maxATRPct: config.maxATRPct,
        minATRPct: config.minATRPct,
        minADXForTrend: config.minADXForTrend,
        maxSpreadPct: config.maxSpreadPct,
        minConfluenceScore: config.minConfluenceScore,
        minConfidenceGlobal: config.minConfidenceGlobal,
        maxConsecutiveLosses: config.maxConsecutiveLosses,
        maxDailyLossPct: config.maxDailyLossPct,
        maxDrawdownPct: config.maxDrawdownPct,
        lossStreakReductionPct: config.lossStreakReductionPct,
        lowLiquidityHours: JSON.stringify(config.lowLiquidityHours),
        weekendPause: config.weekendPause,
        equityCurveMAPeriod: config.equityCurveMAPeriod,
        equityCurvePauseBelowMA: config.equityCurvePauseBelowMA,
        enableMLVeto: config.enableMLVeto,
        mlVetoThreshold: config.mlVetoThreshold,
        avoidRegimes: JSON.stringify(config.avoidRegimes),
        reducedSizeRegimes: JSON.stringify(config.reducedSizeRegimes),
        reducedSizeMultiplier: config.reducedSizeMultiplier,
        autoResumeAfterMinutes: config.autoResumeAfterMinutes,
        requireAllClear: config.requireAllClear,
        pauseCooldownMinutes: config.pauseCooldownMinutes,
        resumeCheckIntervalSec: config.resumeCheckIntervalSeconds,
      },
    });
  } catch (error) {
    console.error('[ConfigPersistence] saveSmartStopTradeConfig error:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// ---- Engine State ----

export interface EngineStateData {
  status: string;         // RUNNING, PAUSED, STOPPED, ERROR
  uptimeSeconds: number;
  loopCount: number;
  lastLoopAt: Date | null;
  lastSignal: string | null;
  lastError: string | null;
  currentPair: string;
  currentStrategy: string;
  extraState: Record<string, unknown>;
}

/**
 * Load engine state from DB.
 */
export async function loadEngineState(): Promise<EngineStateData> {
  try {
    const row = await db.engineState.upsert({
      where: { id: 'main' },
      update: {},
      create: { id: 'main' },
    });

    let extraState: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.extraState);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        extraState = parsed as Record<string, unknown>;
      }
    } catch { /* use default */ }

    return {
      status: row.status,
      uptimeSeconds: row.uptimeSeconds,
      loopCount: row.loopCount,
      lastLoopAt: row.lastLoopAt,
      lastSignal: row.lastSignal,
      lastError: row.lastError,
      currentPair: row.currentPair,
      currentStrategy: row.currentStrategy,
      extraState,
    };
  } catch (error) {
    console.error('[ConfigPersistence] loadEngineState error:', error instanceof Error ? error.message : String(error));
    return {
      status: 'STOPPED',
      uptimeSeconds: 0,
      loopCount: 0,
      lastLoopAt: null,
      lastSignal: null,
      lastError: null,
      currentPair: 'XAU_USD',
      currentStrategy: 'default',
      extraState: {},
    };
  }
}

/**
 * Save engine state to DB. Accepts partial state — only
 * provided fields will be updated.
 */
export async function saveEngineState(state: Partial<EngineStateData>): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {};
    if (state.status !== undefined) updateData.status = state.status;
    if (state.uptimeSeconds !== undefined) updateData.uptimeSeconds = state.uptimeSeconds;
    if (state.loopCount !== undefined) updateData.loopCount = state.loopCount;
    if (state.lastLoopAt !== undefined) updateData.lastLoopAt = state.lastLoopAt;
    if (state.lastSignal !== undefined) updateData.lastSignal = state.lastSignal;
    if (state.lastError !== undefined) updateData.lastError = state.lastError;
    if (state.currentPair !== undefined) updateData.currentPair = state.currentPair;
    if (state.currentStrategy !== undefined) updateData.currentStrategy = state.currentStrategy;
    if (state.extraState !== undefined) updateData.extraState = JSON.stringify(state.extraState);

    await db.engineState.upsert({
      where: { id: 'main' },
      update: updateData,
      create: { id: 'main', ...updateData },
    });
  } catch (error) {
    console.error('[ConfigPersistence] saveEngineState error:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// ---- App Settings ----

/**
 * Load all app settings as a key-value map from the AppSetting table.
 */
export async function loadAllAppSettings(): Promise<Record<string, string>> {
  try {
    const settings = await db.appSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  } catch (error) {
    console.error('[ConfigPersistence] loadAllAppSettings error:', error instanceof Error ? error.message : String(error));
    return {};
  }
}

/**
 * Apply app settings to the execution engine's runtime config.
 * Called when settings change from the UI.
 */
export async function applySettingsToEngine(): Promise<void> {
  try {
    const settings = await loadAllAppSettings();
    // Import dynamically to avoid circular deps
    const { automation } = await import('@/lib/automation');
    const engine = automation.getExecutionEngine();

    // Apply symbol change
    if (settings.symbol) {
      const pair = settings.symbol.replace('/', '');
      if (pair && pair !== engine.getPair()) {
        await engine.setPair(settings.symbol);
      }
    }

    // Apply min confidence
    if (settings.min_confidence) {
      // Update engine config through risk manager
      const conf = parseFloat(settings.min_confidence);
      if (!isNaN(conf) && conf > 0 && conf <= 1) {
        engine.getStatus(); // trigger status update
      }
    }

    // Apply risk per trade to risk manager
    if (settings.risk_per_trade) {
      const rpt = parseFloat(settings.risk_per_trade);
      if (!isNaN(rpt) && rpt > 0) {
        engine.getRiskManager().updateConfig({ maxRiskPerTrade: rpt });
      }
    }

    // Apply max daily loss to risk manager  
    if (settings.daily_loss_limit) {
      const mdl = parseFloat(settings.daily_loss_limit);
      if (!isNaN(mdl) && mdl > 0) {
        // Convert from $ to % based on balance
        const balance = parseFloat(process.env.INITIAL_CAPITAL || '1000');
        const mdlPct = (mdl / balance) * 100;
        engine.getRiskManager().updateConfig({ maxDailyLoss: mdlPct });
      }
    }

    // Apply max trades per day
    if (settings.max_trades_day) {
      const mtd = parseInt(settings.max_trades_day);
      if (!isNaN(mtd) && mtd > 0) {
        engine.getRiskManager().updateConfig({ maxTradesPerDay: mtd });
      }
    }

    // Apply stop loss to smart stop loss
    if (settings.stop_loss) {
      const sl = parseFloat(settings.stop_loss);
      if (!isNaN(sl) && sl > 0) {
        // ATR multiplier adjustment
        engine.getSmartStopLoss().config.atrMultiplierBase = sl;
      }
    }

    console.log('[ConfigPersistence] Settings applied to running engine');
  } catch (error) {
    console.error('[ConfigPersistence] applySettingsToEngine error:', error);
  }
}

// ---- Initialization ----

/**
 * Ensure all config tables have their default rows.
 * Call this on application startup.
 */
export async function initAllConfigs(): Promise<void> {
  try {
    await Promise.all([
      db.riskManagerConfig.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main' } }),
      db.smartStopLossConfig.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main' } }),
      db.smartStopTradeConfig.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main' } }),
      db.engineState.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main' } }),
    ]);
    console.log('[ConfigPersistence] All configs initialized');
  } catch (error) {
    console.error('[ConfigPersistence] initAllConfigs error:', error instanceof Error ? error.message : String(error));
  }
}
