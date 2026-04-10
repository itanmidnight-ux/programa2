import type { FullAnalysis } from './analysis-engine';
import type { Trade } from './risk-manager';
import { loadSmartStopTradeConfig, saveSmartStopTradeConfig } from './config-persistence';

// ============================================
// SMART STOP TRADE - Intelligent Trading Pause
// ============================================
// Evaluates market conditions and trading performance
// to determine if trading should be paused.
// Prevents losses during unfavorable conditions.
// ============================================

export interface StopTradeConfig {
  // Market condition filters
  maxATRPct: number;                 // don't trade if ATR% > this (too volatile)
  minATRPct: number;                 // don't trade if ATR% < this (too quiet/no movement)
  minADXForTrend: number;            // don't trade trend strategies if ADX < this
  maxSpreadPct: number;              // don't trade if spread > this % of price

  // Signal quality filters
  minConfluenceScore: number;        // minimum confluence to allow trading
  minConfidenceGlobal: number;       // global minimum confidence override

  // Performance-based pause
  maxConsecutiveLosses: number;      // pause after N consecutive losses
  maxDailyLossPct: number;           // pause daily trading if loss > X% of balance
  maxDrawdownPct: number;            // pause if drawdown > X%
  lossStreakReductionPct: number;    // reduce position size by X% per loss in streak

  // Time-based filters
  lowLiquidityHours: number[];       // hours (UTC) to avoid (e.g. [0, 1, 2, 3, 4, 5, 6])
  weekendPause: boolean;             // pause on weekends (crypto doesn't really have weekends, but volume drops)

  // Equity curve filter
  equityCurveMAPeriod: number;       // moving average period for equity curve
  equityCurvePauseBelowMA: boolean;  // pause if equity below its own MA

  // ML disagreement filter
  enableMLVeto: boolean;             // if ML strongly disagrees, don't trade
  mlVetoThreshold: number;           // ML confidence threshold for veto (e.g. 0.7)

  // Regime-based filters
  avoidRegimes: string[];            // regimes to avoid (e.g. ['VOLATILE', 'REVERSAL'])
  reducedSizeRegimes: string[];      // regimes where we reduce size (e.g. ['RANGING'])
  reducedSizeMultiplier: number;     // position size multiplier for reduced regimes

  // Recovery
  autoResumeAfterMinutes: number;    // auto-resume after X minutes of being paused
  requireAllClear: boolean;          // require ALL conditions to be good (true) or just most (false)

  // Cooldowns
  pauseCooldownMinutes: number;      // minimum time to stay paused
  resumeCheckIntervalSeconds: number;// how often to check if conditions improved
}

export type PauseReason =
  | 'VOLATILITY_TOO_HIGH'
  | 'VOLATILITY_TOO_LOW'
  | 'SPREAD_TOO_WIDE'
  | 'LOW_CONFLUENCE'
  | 'CONSECUTIVE_LOSSES'
  | 'DAILY_LOSS_LIMIT'
  | 'DRAWDOWN_LIMIT'
  | 'LOW_LIQUIDITY_TIME'
  | 'ML_VETO'
  | 'UNFAVORABLE_REGIME'
  | 'EQUITY_CURVE_DECLINE'
  | 'TREND_TOO_WEAK'
  | 'MANUAL_PAUSE'
  | 'COOLDOWN_ACTIVE';

export interface StopTradeResult {
  allowed: boolean;
  reason?: PauseReason;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  positionSizeMultiplier: number;  // 1.0 = normal, 0.5 = half size, 0 = no trade
  estimatedResumeTime: number;     // timestamp when conditions might improve
  metrics: StopTradeMetrics;
}

export interface StopTradeMetrics {
  volatilityScore: number;        // 0-100, higher = more volatile
  signalQualityScore: number;     // 0-100, higher = better signal
  performanceScore: number;       // 0-100, higher = better performance
  timingScore: number;            // 0-100, higher = better timing
  regimeScore: number;            // 0-100, higher = more favorable regime
  overallScore: number;           // 0-100, higher = safer to trade
  consecutiveLosses: number;
  dailyPnlPct: number;
  currentDrawdownPct: number;
  timeSinceLastPause: number;
  isPaused: boolean;
  pauseReason: PauseReason | null;
  pauseSince: number;
}

/** Ideal ATR% range for crypto trading (sweet spot for profit opportunity vs risk). */
const IDEAL_ATR_LOW = 0.5;
const IDEAL_ATR_HIGH = 1.5;

const DEFAULT_CONFIG: StopTradeConfig = {
  maxATRPct: 5.0,
  minATRPct: 0.10,
  minADXForTrend: 10,
  maxSpreadPct: 0.08,
  minConfluenceScore: 0.15,
  minConfidenceGlobal: 0.25,
  maxConsecutiveLosses: 8,
  maxDailyLossPct: 5.0,
  maxDrawdownPct: 12.0,
  lossStreakReductionPct: 15,
  lowLiquidityHours: [],
  weekendPause: false,
  equityCurveMAPeriod: 10,
  equityCurvePauseBelowMA: false,
  enableMLVeto: false,
  mlVetoThreshold: 0.7,
  avoidRegimes: [],
  reducedSizeRegimes: ['VOLATILE'],
  reducedSizeMultiplier: 0.65,
  autoResumeAfterMinutes: 10,
  requireAllClear: false,
  pauseCooldownMinutes: 3,
  resumeCheckIntervalSeconds: 20,
};

// ============================================
// HELPER: Clamp a number between min and max
// ============================================
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================
// HELPER: Calculate time until next hour boundary
// for estimated resume time
// ============================================
function timeUntilNextGoodHour(lowLiquidityHours: number[]): number {
  const now = new Date();
  const currentHour = now.getUTCHours();
  let hoursUntil = 1;
  for (let offset = 1; offset <= 24; offset++) {
    const checkHour = (currentHour + offset) % 24;
    if (!lowLiquidityHours.includes(checkHour)) {
      hoursUntil = offset;
      break;
    }
  }
  return hoursUntil * 60 * 60 * 1000; // ms until next good hour
}

// ============================================
// SMART STOP TRADE CLASS
// ============================================
export class SmartStopTrade {
  config: StopTradeConfig;

  private isPaused = false;
  private pauseReason: PauseReason | null = null;
  private pauseSince = 0;
  private pauseCount = 0;
  private totalPausedTime = 0;
  private consecutiveLosses = 0;
  private dailyPnl = 0;
  private peakBalance = 0;
  private equityHistory: number[] = [];
  private lastResumeCheck = 0;
  private lastTradeTime = 0;

  constructor(config?: Partial<StopTradeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Initialize configuration from database */
  async initFromDB(): Promise<void> {
    try {
      const saved = await loadSmartStopTradeConfig();
      if (saved) {
        this.config = { ...this.config, ...saved };
        console.log('[STOP-TRADE] Configuration loaded from database');
      }
    } catch (err) {
      console.error('[STOP-TRADE] Failed to load config from DB:', err);
    }
  }

  /** Save current configuration to database */
  async saveToDB(): Promise<void> {
    try {
      await saveSmartStopTradeConfig(this.config);
    } catch (err) {
      console.error('[STOP-TRADE] Failed to save config to DB:', err);
    }
  }

  // ==========================================
  // MAIN EVALUATION
  // Should we trade right now?
  // ==========================================
  evaluate(
    analysis: FullAnalysis | null,
    trades: Trade[],
    balance: number,
    mlDirection?: string,
    mlConfidence?: number
  ): StopTradeResult {
    const now = Date.now();

    // If already paused, check if we should auto-resume
    if (this.isPaused) {
      if (this.checkAutoResume()) {
        // Conditions improved — attempt to resume by re-evaluating
        // Fall through to the full evaluation below
      } else {
        // Still in cooldown or conditions haven't improved
        const remainingCooldown = this.getRemainingCooldownMs();
        return {
          allowed: false,
          reason: this.pauseReason ?? 'COOLDOWN_ACTIVE',
          message: this.getCooldownMessage(),
          severity: 'WARNING',
          positionSizeMultiplier: 0,
          estimatedResumeTime: now + remainingCooldown,
          metrics: this.getMetrics(analysis, trades, balance),
        };
      }
    }

    // Run all individual checks
    const volCheck = analysis ? this.checkVolatility(analysis) : { allowed: true, score: 50, message: 'No analysis data' };
    const signalCheck = analysis ? this.checkSignalQuality(analysis) : { allowed: true, score: 50, message: 'No analysis data' };
    const perfCheck = this.checkPerformance(trades, balance);
    const timingCheck = this.checkTiming();
    const mlCheck = analysis ? this.checkMLAgreement(analysis, mlDirection, mlConfidence) : { allowed: true, score: 100, message: 'No ML data' };
    const regimeCheck = analysis ? this.checkRegime(analysis) : { allowed: true, score: 70, multiplier: 1.0, message: 'No regime data' };
    const equityCheck = this.checkEquityCurve(balance);

    // Collect all failures
    const failures: { check: string; reason?: PauseReason; severity: 'INFO' | 'WARNING' | 'CRITICAL'; message: string }[] = [];

    if (!volCheck.allowed) {
      failures.push({
        check: 'volatility',
        reason: volCheck.reason,
        severity: volCheck.score < 20 ? 'CRITICAL' : 'WARNING',
        message: volCheck.message,
      });
    }
    if (!signalCheck.allowed) {
      failures.push({
        check: 'signal',
        reason: signalCheck.reason,
        severity: signalCheck.score < 30 ? 'CRITICAL' : 'WARNING',
        message: signalCheck.message,
      });
    }
    if (!perfCheck.allowed) {
      failures.push({
        check: 'performance',
        reason: perfCheck.reason,
        severity: perfCheck.score < 20 ? 'CRITICAL' : 'WARNING',
        message: perfCheck.message,
      });
    }
    if (!timingCheck.allowed) {
      failures.push({
        check: 'timing',
        reason: timingCheck.reason,
        severity: 'INFO',
        message: timingCheck.message,
      });
    }
    if (!mlCheck.allowed) {
      failures.push({
        check: 'ml',
        reason: mlCheck.reason,
        severity: 'WARNING',
        message: mlCheck.message,
      });
    }
    if (!regimeCheck.allowed) {
      failures.push({
        check: 'regime',
        reason: regimeCheck.reason,
        severity: 'WARNING',
        message: regimeCheck.message,
      });
    }
    if (!equityCheck.allowed) {
      failures.push({
        check: 'equity',
        reason: equityCheck.reason,
        severity: 'WARNING',
        message: equityCheck.message,
      });
    }

    // Determine if we should trade
    // CRITICAL failures always block
    const criticalFailures = failures.filter(f => f.severity === 'CRITICAL');
    const warningFailures = failures.filter(f => f.severity === 'WARNING');
    const infoFailures = failures.filter(f => f.severity === 'INFO');

    const shouldPause =
      this.config.requireAllClear
        ? failures.length > 0
        : criticalFailures.length > 0;

    // Calculate position size multiplier based on regime and streak
    let positionSizeMultiplier = regimeCheck.multiplier ?? 1.0;

    // Reduce size based on consecutive losses
    if (this.consecutiveLosses > 0) {
      const streakReduction = 1 - (this.consecutiveLosses * this.config.lossStreakReductionPct / 100);
      positionSizeMultiplier = Math.min(positionSizeMultiplier, Math.max(0.1, streakReduction));
    }

    // Reduce size for suboptimal but not failing conditions
    if (infoFailures.length > 0) {
      positionSizeMultiplier = Math.min(positionSizeMultiplier, 0.75);
    }

    // Estimate resume time
    let estimatedResumeTime = now + this.config.pauseCooldownMinutes * 60 * 1000;
    if (failures.some(f => f.reason === 'LOW_LIQUIDITY_TIME')) {
      estimatedResumeTime = now + timeUntilNextGoodHour(this.config.lowLiquidityHours);
    }
    if (failures.some(f => f.reason === 'CONSECUTIVE_LOSSES')) {
      estimatedResumeTime = now + this.config.autoResumeAfterMinutes * 60 * 1000;
    }

    if (shouldPause) {
      // Pick the most severe failure as the primary reason
      const primaryFailure = criticalFailures[0] ?? warningFailures[0] ?? infoFailures[0];
      this.pause(primaryFailure.reason as PauseReason);
      positionSizeMultiplier = 0;

      return {
        allowed: false,
        reason: primaryFailure.reason as PauseReason,
        message: primaryFailure.message,
        severity: primaryFailure.severity,
        positionSizeMultiplier: 0,
        estimatedResumeTime,
        metrics: this.getMetrics(analysis, trades, balance),
      };
    }

    // All clear — calculate overall quality score for position sizing
    const metrics = this.getMetrics(analysis, trades, balance);

    // If overall score is moderate, still allow but reduce size
    if (metrics.overallScore < 50 && positionSizeMultiplier >= 1.0) {
      positionSizeMultiplier = 0.7;
    }

    return {
      allowed: true,
      message: 'Conditions favorable for trading',
      severity: 'INFO',
      positionSizeMultiplier,
      estimatedResumeTime: now,
      metrics,
    };
  }

  // ==========================================
  // VOLATILITY CHECK
  // ==========================================
  private checkVolatility(
    analysis: FullAnalysis
  ): { allowed: boolean; reason?: PauseReason; score: number; message: string } {
    const atrPct = analysis.atrPct;

    // Too volatile — dangerous
    if (atrPct > this.config.maxATRPct) {
      const overshoot = ((atrPct - this.config.maxATRPct) / this.config.maxATRPct) * 100;
      return {
        allowed: false,
        reason: 'VOLATILITY_TOO_HIGH',
        score: clamp(100 - overshoot, 0, 100),
        message: `ATR at ${atrPct.toFixed(2)}% exceeds max ${this.config.maxATRPct}% (too volatile)`,
      };
    }

    // Too quiet — no profit opportunity
    if (atrPct < this.config.minATRPct) {
      const undershoot = (1 - atrPct / this.config.minATRPct) * 100;
      return {
        allowed: false,
        reason: 'VOLATILITY_TOO_LOW',
        score: clamp(100 - undershoot, 0, 100),
        message: `ATR at ${atrPct.toFixed(2)}% below min ${this.config.minATRPct}% (too quiet)`,
      };
    }

    // Score based on proximity to ideal range (0.5% - 1.5%)
    let score: number;
    if (atrPct >= IDEAL_ATR_LOW && atrPct <= IDEAL_ATR_HIGH) {
      // Perfect zone — score 80-100
      const idealMidpoint = (IDEAL_ATR_LOW + IDEAL_ATR_HIGH) / 2;
      const idealHalfRange = (IDEAL_ATR_HIGH - IDEAL_ATR_LOW) / 2;
      const deviation = Math.abs(atrPct - idealMidpoint) / idealHalfRange;
      score = 100 - (deviation * 20); // 80-100 in ideal zone
    } else if (atrPct < IDEAL_ATR_LOW) {
      // Below ideal but above minimum — score 40-80
      const normalized = (atrPct - this.config.minATRPct) / (IDEAL_ATR_LOW - this.config.minATRPct);
      score = 40 + (normalized * 40);
    } else {
      // Above ideal but below maximum — score 40-80
      const normalized = (this.config.maxATRPct - atrPct) / (this.config.maxATRPct - IDEAL_ATR_HIGH);
      score = 40 + (normalized * 40);
    }

    return {
      allowed: true,
      score: clamp(Math.round(score), 0, 100),
      message: `ATR at ${atrPct.toFixed(2)}% — within acceptable range`,
    };
  }

  // ==========================================
  // SIGNAL QUALITY CHECK
  // ==========================================
  private checkSignalQuality(
    analysis: FullAnalysis
  ): { allowed: boolean; reason?: PauseReason; score: number; message: string } {
    const { confluenceScore, confidence, signal, trend } = analysis;

    // Check confluence score
    if (confluenceScore < this.config.minConfluenceScore) {
      return {
        allowed: false,
        reason: 'LOW_CONFLUENCE',
        score: Math.round(confluenceScore * 100),
        message: `Confluence score ${confluenceScore.toFixed(2)} below minimum ${this.config.minConfluenceScore}`,
      };
    }

    // Check global minimum confidence
    if (confidence < this.config.minConfidenceGlobal) {
      return {
        allowed: false,
        reason: 'LOW_CONFLUENCE',
        score: Math.round(confidence * 100),
        message: `Confidence ${confidence.toFixed(2)} below global minimum ${this.config.minConfidenceGlobal}`,
      };
    }

    // Check for conflicting signals — detect if multiple indicators disagree
    let conflictingIndicators = 0;

    // RSI vs trend disagreement
    if (
      (analysis.rsiZone === 'OVERSOLD' && (trend === 'STRONG_DOWN' || trend === 'DOWN')) ||
      (analysis.rsiZone === 'OVERBOUGHT' && (trend === 'STRONG_UP' || trend === 'UP'))
    ) {
      conflictingIndicators++;
    }

    // MACD vs trend disagreement
    if (analysis.macd) {
      const macdBullish = analysis.macd.histogram > 0;
      const trendBullish = trend === 'UP' || trend === 'STRONG_UP';
      if (macdBullish !== trendBullish) {
        conflictingIndicators++;
      }
    }

    // OBV vs trend disagreement
    const obvBullish = analysis.obvTrend === 'RISING';
    const trendBullish2 = trend === 'UP' || trend === 'STRONG_UP';
    if (obvBullish !== trendBullish2) {
      conflictingIndicators++;
    }

    // Stochastic vs signal disagreement
    if (analysis.stochastic) {
      const stochOverbought = analysis.stochastic.zone === 'OVERBOUGHT';
      const stochOversold = analysis.stochastic.zone === 'OVERSOLD';
      const signalBuy = signal === 'STRONG_BUY' || signal === 'BUY';
      const signalSell = signal === 'STRONG_SELL' || signal === 'SELL';

      if ((stochOverbought && signalBuy) || (stochOversold && signalSell)) {
        conflictingIndicators++;
      }
    }

    // Calculate score: base on confluence + confidence, penalize conflicts
    let score = (confluenceScore * 0.6 + confidence * 0.4) * 100;
    score -= conflictingIndicators * 10;

    // Bonus for strong confluence
    if (confluenceScore >= 0.7) score += 10;

    // If HOLD signal, significantly reduce score
    if (signal === 'HOLD') {
      score *= 0.5;
    }

    return {
      allowed: true,
      score: clamp(Math.round(score), 0, 100),
      message: conflictingIndicators > 0
        ? `${conflictingIndicators} conflicting indicator(s) detected (confluence: ${confluenceScore.toFixed(2)})`
        : `Signal quality good (confluence: ${confluenceScore.toFixed(2)}, confidence: ${confidence.toFixed(2)})`,
    };
  }

  // ==========================================
  // PERFORMANCE CHECK
  // ==========================================
  private checkPerformance(
    trades: Trade[],
    balance: number
  ): { allowed: boolean; reason?: PauseReason; score: number; message: string } {
    // Check consecutive losses
    if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      return {
        allowed: false,
        reason: 'CONSECUTIVE_LOSSES',
        score: 0,
        message: `${this.consecutiveLosses} consecutive losses — exceeds max of ${this.config.maxConsecutiveLosses}`,
      };
    }

    // Check daily loss percentage
    if (this.peakBalance > 0) {
      const dailyPnlPct = (this.dailyPnl / this.peakBalance) * 100;
      if (Math.abs(dailyPnlPct) > this.config.maxDailyLossPct && this.dailyPnl < 0) {
        return {
          allowed: false,
          reason: 'DAILY_LOSS_LIMIT',
          score: clamp(100 - (Math.abs(dailyPnlPct) / this.config.maxDailyLossPct) * 100, 0, 100),
          message: `Daily loss ${Math.abs(dailyPnlPct).toFixed(2)}% exceeds limit ${this.config.maxDailyLossPct}%`,
        };
      }
    }

    // Check drawdown
    if (this.peakBalance > 0) {
      const drawdownPct = ((this.peakBalance - balance) / this.peakBalance) * 100;
      if (drawdownPct > this.config.maxDrawdownPct) {
        return {
          allowed: false,
          reason: 'DRAWDOWN_LIMIT',
          score: clamp(100 - (drawdownPct / this.config.maxDrawdownPct) * 100, 0, 100),
          message: `Drawdown ${drawdownPct.toFixed(2)}% exceeds limit ${this.config.maxDrawdownPct}%`,
        };
      }
    }

    // Score based on recent performance
    let score = 100;

    // Penalty for consecutive losses (not yet at max)
    if (this.consecutiveLosses > 0) {
      const lossRatio = this.consecutiveLosses / this.config.maxConsecutiveLosses;
      score -= lossRatio * 40; // Up to 40 point penalty approaching max
    }

    // Penalty for daily losses
    if (this.peakBalance > 0 && this.dailyPnl < 0) {
      const dailyPnlPct = Math.abs((this.dailyPnl / this.peakBalance) * 100);
      const lossRatio = dailyPnlPct / this.config.maxDailyLossPct;
      score -= lossRatio * 30; // Up to 30 point penalty approaching daily limit
    }

    // Penalty for drawdown
    if (this.peakBalance > 0) {
      const drawdownPct = ((this.peakBalance - balance) / this.peakBalance) * 100;
      if (drawdownPct > 0) {
        const ddRatio = drawdownPct / this.config.maxDrawdownPct;
        score -= ddRatio * 30; // Up to 30 point penalty approaching drawdown limit
      }
    }

    // Bonus for winning streaks
    const recentClosedTrades = trades
      .filter(t => t.status === 'CLOSED' && t.closedAt)
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime())
      .slice(0, 5);

    const recentWins = recentClosedTrades.filter(t => t.pnl > 0).length;
    if (recentWins >= 4) score += 10;
    else if (recentWins >= 3) score += 5;

    return {
      allowed: true,
      score: clamp(Math.round(score), 0, 100),
      message: this.consecutiveLosses > 0
        ? `Performance: ${this.consecutiveLosses} consecutive loss(es) — caution advised`
        : 'Performance metrics within acceptable range',
    };
  }

  // ==========================================
  // TIMING CHECK
  // ==========================================
  private checkTiming(): { allowed: boolean; reason?: PauseReason; score: number; message: string } {
    const now = new Date();
    const currentHourUTC = now.getUTCHours();

    // Check low liquidity hours
    if (this.config.lowLiquidityHours.includes(currentHourUTC)) {
      return {
        allowed: false,
        reason: 'LOW_LIQUIDITY_TIME',
        score: 30,
        message: `Current hour ${currentHourUTC} UTC is a low-liquidity period`,
      };
    }

    // Weekend check (Saturday = 6, Sunday = 0)
    if (this.config.weekendPause) {
      const dayOfWeek = now.getUTCDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return {
          allowed: false,
          reason: 'LOW_LIQUIDITY_TIME',
          score: 20,
          message: `Weekend trading paused (volume typically lower)`,
        };
      }
    }

    // Score based on time — best hours for crypto are typically 8-16 UTC
    let score = 60;
    if (currentHourUTC >= 8 && currentHourUTC <= 16) {
      score = 100; // Prime trading hours
    } else if (currentHourUTC >= 7 && currentHourUTC <= 20) {
      score = 85; // Good trading hours
    } else if (currentHourUTC >= 21 || currentHourUTC <= 2) {
      score = 45; // Reduced activity
    }

    return {
      allowed: true,
      score,
      message: `Current hour ${currentHourUTC} UTC — liquidity conditions adequate`,
    };
  }

  // ==========================================
  // ML AGREEMENT CHECK
  // ==========================================
  private checkMLAgreement(
    analysis: FullAnalysis,
    mlDirection?: string,
    mlConfidence?: number
  ): { allowed: boolean; reason?: PauseReason; score: number; message: string } {
    // If ML veto is disabled or no ML data, allow
    if (!this.config.enableMLVeto || mlDirection === undefined || mlConfidence === undefined) {
      return {
        allowed: true,
        score: 80,
        message: 'ML veto disabled or no ML data available',
      };
    }

    // If ML confidence is too low, don't veto (ML isn't sure either way)
    if (mlConfidence < this.config.mlVetoThreshold) {
      return {
        allowed: true,
        score: 70,
        message: `ML confidence ${mlConfidence.toFixed(2)} below veto threshold ${this.config.mlVetoThreshold}`,
      };
    }

    // Determine trade direction from signal
    const signalDirection = this.signalToDirection(analysis.signal);
    const mlDir = mlDirection.toLowerCase();

    // Check for strong disagreement
    const mlIsLong = mlDir === 'long' || mlDir === 'buy' || mlDir === 'up';
    const signalIsLong = signalDirection === 'LONG';

    if (mlIsLong !== signalIsLong) {
      // ML strongly disagrees with signal
      const disagreementScore = 100 - (mlConfidence * 100);
      return {
        allowed: false,
        reason: 'ML_VETO',
        score: clamp(Math.round(disagreementScore), 0, 100),
        message: `ML veto: ML says ${mlDirection} (confidence: ${mlConfidence.toFixed(2)}) but signal is ${analysis.signal}`,
      };
    }

    // ML agrees — bonus score
    return {
      allowed: true,
      score: clamp(Math.round(80 + mlConfidence * 20), 0, 100),
      message: `ML agrees with signal (${mlDirection}, confidence: ${mlConfidence.toFixed(2)})`,
    };
  }

  // ==========================================
  // REGIME CHECK
  // ==========================================
  private checkRegime(
    analysis: FullAnalysis
  ): { allowed: boolean; reason?: PauseReason; score: number; multiplier: number; message: string } {
    const { marketRegime, adx, adxTrend } = analysis;

    // Check if we should avoid this regime entirely
    if (this.config.avoidRegimes.includes(marketRegime)) {
      return {
        allowed: false,
        reason: 'UNFAVORABLE_REGIME',
        score: 10,
        multiplier: 0,
        message: `Market regime "${marketRegime}" is in the avoid list`,
      };
    }

    // Check ADX for trend-following strategies
    if (adxTrend === 'RANGING' && adx < this.config.minADXForTrend) {
      return {
        allowed: false,
        reason: 'TREND_TOO_WEAK',
        score: Math.round((adx / this.config.minADXForTrend) * 40),
        multiplier: 0.3,
        message: `ADX at ${adx.toFixed(1)} below minimum ${this.config.minADXForTrend} — trend too weak`,
      };
    }

    // Check for reduced size regimes
    let multiplier = 1.0;
    if (this.config.reducedSizeRegimes.includes(marketRegime)) {
      multiplier = this.config.reducedSizeMultiplier;
    }

    // Score based on regime favorability
    let score: number;
    switch (marketRegime) {
      case 'TRENDING_UP':
        score = 95;
        break;
      case 'TRENDING_DOWN':
        score = 85; // Good for shorting
        break;
      case 'BREAKOUT':
        score = 80;
        break;
      case 'RANGING':
        score = 50; // Mean reversion only
        break;
      case 'VOLATILE':
        score = 35; // Risky
        break;
      case 'REVERSAL':
        score = 40; // Unpredictable
        break;
      default:
        score = 60;
    }

    // ADX bonus for trending markets
    if (adx > 25) score = Math.min(100, score + 5);
    if (adx > 40) score = Math.min(100, score + 5);

    return {
      allowed: true,
      score: clamp(Math.round(score), 0, 100),
      multiplier,
      message: `Regime: ${marketRegime}${multiplier < 1.0 ? ` (reduced size ${multiplier}x)` : ''}`,
    };
  }

  // ==========================================
  // EQUITY CURVE CHECK
  // ==========================================
  private checkEquityCurve(
    balance: number
  ): { allowed: boolean; reason?: PauseReason; score: number; message: string } {
    // Update equity history
    this.equityHistory.push(balance);

    // Keep history manageable
    const maxHistory = this.config.equityCurveMAPeriod * 3;
    if (this.equityHistory.length > maxHistory) {
      this.equityHistory = this.equityHistory.slice(-maxHistory);
    }

    // Need enough data for meaningful MA
    if (this.equityHistory.length < this.config.equityCurveMAPeriod) {
      return {
        allowed: true,
        score: 70,
        message: `Gathering equity curve data (${this.equityHistory.length}/${this.config.equityCurveMAPeriod})`,
      };
    }

    // Calculate simple moving average of equity
    const recentEquity = this.equityHistory.slice(-this.config.equityCurveMAPeriod);
    const equityMA = recentEquity.reduce((sum, val) => sum + val, 0) / recentEquity.length;

    // Check if equity is below its own MA
    if (this.config.equityCurvePauseBelowMA) {
      if (balance < equityMA) {
        const belowPct = ((equityMA - balance) / equityMA) * 100;
        const score = clamp(100 - belowPct * 5, 0, 100);

        // Only pause if significantly below MA (more than 0.5%)
        if (belowPct > 0.5) {
          return {
            allowed: false,
            reason: 'EQUITY_CURVE_DECLINE',
            score: Math.round(score),
            message: `Equity ${balance.toFixed(2)} is ${belowPct.toFixed(2)}% below its MA ${equityMA.toFixed(2)} — strategy underperforming`,
          };
        }

        // Slightly below MA but not critical
        return {
          allowed: true,
          score: Math.round(score),
          message: `Equity slightly below MA (${belowPct.toFixed(2)}% below)`,
        };
      }
    }

    // Equity is above MA — good sign
    const abovePct = ((balance - equityMA) / equityMA) * 100;
    return {
      allowed: true,
      score: clamp(Math.round(75 + abovePct * 3), 75, 100),
      message: `Equity curve healthy (${abovePct >= 0 ? '+' : ''}${abovePct.toFixed(2)}% above MA)`,
    };
  }

  // ==========================================
  // MANUAL PAUSE / RESUME
  // ==========================================
  pause(reason: PauseReason): void {
    if (this.isPaused) return; // Already paused

    this.isPaused = true;
    this.pauseReason = reason;
    this.pauseSince = Date.now();
    this.pauseCount++;
    this.lastResumeCheck = Date.now();
  }

  resume(): void {
    if (!this.isPaused) return;

    // Track total paused time before resuming
    this.totalPausedTime += Date.now() - this.pauseSince;
    this.isPaused = false;
    this.pauseReason = null;
    this.pauseSince = 0;
  }

  // ==========================================
  // RECORD TRADE RESULT
  // ==========================================
  recordTradeResult(trade: Trade): void {
    // Update daily PnL
    this.dailyPnl += trade.pnl;

    // Update peak balance
    // We track this relative to initial balance using pnl
    const impliedBalance = this.peakBalance + this.dailyPnl;
    if (impliedBalance > this.peakBalance && this.peakBalance > 0) {
      // Update peak for next cycle
    }

    // Track consecutive losses
    if (trade.pnl < 0) {
      this.consecutiveLosses++;
    } else if (trade.pnl > 0) {
      // Win resets the streak
      this.consecutiveLosses = 0;
    }
    // pnl === 0 (breakeven) doesn't reset or increment

    this.lastTradeTime = Date.now();
  }

  /**
   * Set the peak balance explicitly (call at start of day or after reset)
   */
  setPeakBalance(balance: number): void {
    if (balance > this.peakBalance) {
      this.peakBalance = balance;
    }
  }

  /**
   * Set daily PnL directly (useful for syncing with external systems)
   */
  setDailyPnl(pnl: number): void {
    this.dailyPnl = pnl;
  }

  // ==========================================
  // AUTO-RESUME CHECK
  // ==========================================
  private checkAutoResume(): boolean {
    if (!this.isPaused) return true;

    const now = Date.now();
    const pausedDuration = now - this.pauseSince;
    const minCooldown = this.config.pauseCooldownMinutes * 60 * 1000;
    const autoResumeTime = this.config.autoResumeAfterMinutes * 60 * 1000;

    // Must wait at least the cooldown period
    if (pausedDuration < minCooldown) {
      return false;
    }

    // Check if enough time has passed for auto-resume check
    const timeSinceLastCheck = now - this.lastResumeCheck;
    if (timeSinceLastCheck < this.config.resumeCheckIntervalSeconds * 1000) {
      return false;
    }

    this.lastResumeCheck = now;

    // For MANUAL_PAUSE, never auto-resume
    if (this.pauseReason === 'MANUAL_PAUSE') {
      return false;
    }

    // Auto-resume if enough time has passed (auto-resume is a safety net)
    if (pausedDuration >= autoResumeTime) {
      this.resume();
      return true;
    }

    return false;
  }

  // ==========================================
  // POSITION SIZE MULTIPLIER
  // ==========================================
  getPositionSizeMultiplier(
    analysis: FullAnalysis | null,
    trades: Trade[],
    balance: number
  ): number {
    // If paused, no trades
    if (this.isPaused) return 0;

    // Run a lightweight evaluation to get the multiplier
    const result = this.evaluate(analysis, trades, balance);
    return result.positionSizeMultiplier;
  }

  // ==========================================
  // GET COMPREHENSIVE METRICS
  // ==========================================
  getMetrics(
    analysis: FullAnalysis | null,
    trades: Trade[],
    balance: number
  ): StopTradeMetrics {
    const volScore = analysis ? this.checkVolatility(analysis).score : 50;
    const signalScore = analysis ? this.checkSignalQuality(analysis).score : 50;
    const perfScore = this.checkPerformance(trades, balance).score;
    const timingScore = this.checkTiming().score;
    const regimeScore = analysis ? this.checkRegime(analysis).score : 60;

    // Calculate overall score with weights
    // Volatility, signal, and performance are most important
    const overallScore = Math.round(
      volScore * 0.2 +
      signalScore * 0.25 +
      perfScore * 0.25 +
      timingScore * 0.1 +
      regimeScore * 0.2
    );

    // Calculate current drawdown
    const currentDrawdownPct = this.peakBalance > 0
      ? ((this.peakBalance - balance) / this.peakBalance) * 100
      : 0;

    // Calculate daily PnL %
    const dailyPnlPct = this.peakBalance > 0
      ? (this.dailyPnl / this.peakBalance) * 100
      : 0;

    // Time since last pause
    const timeSinceLastPause = this.pauseSince > 0
      ? Date.now() - this.pauseSince
      : 0;

    return {
      volatilityScore: volScore,
      signalQualityScore: signalScore,
      performanceScore: perfScore,
      timingScore,
      regimeScore,
      overallScore: clamp(overallScore, 0, 100),
      consecutiveLosses: this.consecutiveLosses,
      dailyPnlPct,
      currentDrawdownPct: Math.max(0, currentDrawdownPct),
      timeSinceLastPause,
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      pauseSince: this.pauseSince,
    };
  }

  // ==========================================
  // GET FULL STATUS REPORT
  // ==========================================
  getStatus(): {
    isPaused: boolean;
    pauseReason: PauseReason | null;
    pauseSince: number;
    pauseCount: number;
    totalPausedTime: number;
    consecutiveLosses: number;
    dailyPnl: number;
    peakBalance: number;
  } {
    const totalPaused = this.isPaused
      ? this.totalPausedTime + (Date.now() - this.pauseSince)
      : this.totalPausedTime;

    return {
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      pauseSince: this.pauseSince,
      pauseCount: this.pauseCount,
      totalPausedTime: totalPaused,
      consecutiveLosses: this.consecutiveLosses,
      dailyPnl: this.dailyPnl,
      peakBalance: this.peakBalance,
    };
  }

  // ==========================================
  // RESET DAILY COUNTERS
  // ==========================================
  resetDaily(): void {
    this.consecutiveLosses = 0;
    this.dailyPnl = 0;

    // If we're paused due to daily limit, reset allows recovery
    if (
      this.isPaused &&
      (this.pauseReason === 'DAILY_LOSS_LIMIT' || this.pauseReason === 'CONSECUTIVE_LOSSES')
    ) {
      this.resume();
    }
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  /** Get remaining cooldown time in ms */
  private getRemainingCooldownMs(): number {
    if (!this.isPaused) return 0;

    const pausedDuration = Date.now() - this.pauseSince;
    const minCooldown = this.config.pauseCooldownMinutes * 60 * 1000;
    const autoResumeTime = this.config.autoResumeAfterMinutes * 60 * 1000;
    const resumeTime = Math.max(minCooldown, autoResumeTime);

    return Math.max(0, resumeTime - pausedDuration);
  }

  /** Get human-readable cooldown message */
  private getCooldownMessage(): string {
    if (!this.isPaused || !this.pauseReason) return 'Trading paused';

    const remainingMs = this.getRemainingCooldownMs();
    const remainingMin = Math.ceil(remainingMs / 60000);

    const reasonMessages: Record<PauseReason, string> = {
      VOLATILITY_TOO_HIGH: `Volatility too high — paused (resume in ~${remainingMin} min)`,
      VOLATILITY_TOO_LOW: `Market too quiet — paused (resume in ~${remainingMin} min)`,
      SPREAD_TOO_WIDE: `Spread too wide — paused (resume in ~${remainingMin} min)`,
      LOW_CONFLUENCE: `Low signal confluence — paused (resume in ~${remainingMin} min)`,
      CONSECUTIVE_LOSSES: `${this.consecutiveLosses} consecutive losses — paused (resume in ~${remainingMin} min)`,
      DAILY_LOSS_LIMIT: `Daily loss limit reached — paused (resume in ~${remainingMin} min)`,
      DRAWDOWN_LIMIT: `Max drawdown reached — paused (resume in ~${remainingMin} min)`,
      LOW_LIQUIDITY_TIME: `Low liquidity hours — paused (resume in ~${remainingMin} min)`,
      ML_VETO: `ML veto active — paused (resume in ~${remainingMin} min)`,
      UNFAVORABLE_REGIME: `Unfavorable market regime — paused (resume in ~${remainingMin} min)`,
      EQUITY_CURVE_DECLINE: `Equity curve declining — paused (resume in ~${remainingMin} min)`,
      TREND_TOO_WEAK: `Trend too weak — paused (resume in ~${remainingMin} min)`,
      MANUAL_PAUSE: `Manually paused`,
      COOLDOWN_ACTIVE: `Cooldown active — resume in ~${remainingMin} min`,
    };

    return reasonMessages[this.pauseReason] || `Trading paused (${remainingMin} min remaining)`;
  }

  /** Convert signal to LONG/SHORT direction */
  private signalToDirection(signal: string): 'LONG' | 'SHORT' | 'NEUTRAL' {
    switch (signal) {
      case 'STRONG_BUY':
      case 'BUY':
        return 'LONG';
      case 'STRONG_SELL':
      case 'SELL':
        return 'SHORT';
      default:
        return 'NEUTRAL';
    }
  }

  /**
   * Update config values (useful for dynamic adjustment)
   */
  updateConfig(updates: Partial<StopTradeConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveToDB().catch(() => {});
  }

  /** Set peak balance and consecutive losses from trade history */
  syncFromTradeHistory(trades: { pnl: number; closedAt?: Date | string }[]): void {
    let cumulativePnl = 0;
    let maxBalance = 0;
    for (const trade of trades) {
      cumulativePnl += trade.pnl;
      if (cumulativePnl > maxBalance) maxBalance = cumulativePnl;
    }
    if (maxBalance > 0) this.peakBalance = maxBalance;

    // Sync consecutive losses
    let streak = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].pnl < 0) streak++;
      else break;
    }
    this.consecutiveLosses = streak;

    // Sync dailyPnl from today's trades
    const today = new Date().toISOString().slice(0, 10);
    this.dailyPnl = trades
      .filter(t => t.closedAt && String(t.closedAt).slice(0, 10) === today)
      .reduce((sum, t) => sum + t.pnl, 0);
  }

  /**
   * Get a summary string for logging
   */
  getSummary(analysis: FullAnalysis | null, trades: Trade[], balance: number): string {
    const status = this.getStatus();
    const metrics = this.getMetrics(analysis, trades, balance);

    const lines: string[] = [
      '═══ Smart Stop Trade Status ═══',
      `Paused: ${status.isPaused ? `YES (${status.pauseReason})` : 'NO'}`,
      `Overall Score: ${metrics.overallScore}/100`,
      `Volatility: ${metrics.volatilityScore}/100`,
      `Signal Quality: ${metrics.signalQualityScore}/100`,
      `Performance: ${metrics.performanceScore}/100`,
      `Timing: ${metrics.timingScore}/100`,
      `Regime: ${metrics.regimeScore}/100`,
      `Consecutive Losses: ${metrics.consecutiveLosses}/${this.config.maxConsecutiveLosses}`,
      `Daily PnL: ${metrics.dailyPnlPct.toFixed(2)}%`,
      `Drawdown: ${metrics.currentDrawdownPct.toFixed(2)}%`,
      `Total Pauses: ${status.pauseCount}`,
      `Total Paused Time: ${Math.round(status.totalPausedTime / 60000)} min`,
    ];

    return lines.join('\n');
  }
}
