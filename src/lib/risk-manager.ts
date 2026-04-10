// ============================================
// RECO-TRADING - Risk Management System
// ============================================
// Comprehensive risk controls including:
// - Kelly Criterion position sizing
// - Fixed Fractional sizing
// - Circuit breakers
// - Dynamic risk adjustment
// - Sharpe/Sortino ratio calculation
// - Drawdown management
// ============================================

import type { FullAnalysis } from '@/lib/analysis-engine';
import { loadRiskManagerConfig, saveRiskManagerConfig } from './config-persistence';

// ---- Types ----

export interface RiskConfig {
  maxRiskPerTrade: number;       // % of balance per trade (default 1%)
  maxDailyLoss: number;          // % max daily loss (default 3%)
  maxDrawdown: number;           // % max drawdown (default 10%)
  maxTradesPerDay: number;       // maximum trades per day (default 120)
  maxTradesPerHour: number;      // maximum trades per hour (default 20)
  minConfidence: number;         // minimum confidence to trade (default 0.55)
  minRiskReward: number;         // minimum risk/reward ratio (default 1.5)
  maxSpreadPct: number;          // maximum allowed spread % (default 0.1)
  cooldownMinutes: number;       // cooldown between trades (default 1)
  kellyFraction: number;         // fraction of Kelly to use (default 0.25)
  trailingStopATR: number;       // ATR multiplier for trailing stop (default 2)
  breakEvenATR: number;          // ATR multiplier for break-even trigger (default 1)
  maxOpenPositions: number;      // maximum simultaneous positions (default 1)
  emergencyStopPct: number;      // emergency stop if daily loss exceeds this (default 5%)
}

export interface Trade {
  id: number;
  pair: string;
  side: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  confidence: number;
  stopLoss?: number;
  takeProfit?: number;
  status: string;
  signal: string;
  strategy: string;
  openedAt: Date;
  closedAt?: Date;
  commission: number;
}

export interface RiskMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentDrawdown: number;
  currentDrawdownPct: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  totalTrades: number;
  wins: number;
  losses: number;
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  avgHoldingTime: number;        // seconds
  dailyPnl: number;
  riskOfRuin: number;            // estimated probability of ruin
  calmarRatio: number;           // return / max drawdown
}

export interface CanTradeResult {
  allowed: boolean;
  reason?: string;
}

export interface PositionSizeResult {
  quantity: number;
  riskAmount: number;
  riskPct: number;
  method: string;
}

// ============================================
// RISK MANAGER CLASS
// ============================================

export class RiskManager {
  config: RiskConfig;
  private dailyTradeCount = 0;
  private hourlyTradeCount = 0;
  private lastTradeTime = 0;
  private peakBalance = 0;
  private dailyPnl = 0;
  private hourlyResetTime = Date.now();

  constructor(config?: Partial<RiskConfig>) {
    this.config = {
      maxRiskPerTrade: 1.5,
      maxDailyLoss: 5.0,
      maxDrawdown: 15.0,
      maxTradesPerDay: 50,
      maxTradesPerHour: 15,
      minConfidence: 0.45,
      minRiskReward: 0.5,
      maxSpreadPct: 0.15,
      cooldownMinutes: 0.5,
      kellyFraction: 0.25,
      trailingStopATR: 2,
      breakEvenATR: 1,
      maxOpenPositions: 1,
      emergencyStopPct: 8.0,
      ...config,
    };
  }

  /** Initialize configuration from database */
  async initFromDB(): Promise<void> {
    try {
      const saved = await loadRiskManagerConfig();
      if (saved) {
        this.config = { ...this.config, ...saved };
        console.log('[RISK] Configuration loaded from database');
      }
    } catch (err) {
      console.error('[RISK] Failed to load config from DB:', err);
    }
  }

  /** Save current configuration to database */
  async saveToDB(): Promise<void> {
    try {
      await saveRiskManagerConfig(this.config);
    } catch (err) {
      console.error('[RISK] Failed to save config to DB:', err);
    }
  }

  /** Static factory: create instance and initialize from DB */
  static async createWithPersistence(config?: Partial<RiskConfig>): Promise<RiskManager> {
    const instance = new RiskManager(config);
    await instance.initFromDB();
    return instance;
  }

  /** Update configuration */
  updateConfig(config: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveToDB().catch(() => {});
  }

  /** Reset daily counters (call at start of each day) */
  resetDaily(): void {
    this.dailyTradeCount = 0;
    this.dailyPnl = 0;
  }

  /** Check hourly trade limits and reset if needed */
  private checkHourlyReset(): void {
    const now = Date.now();
    if (now - this.hourlyResetTime > 3600000) {
      this.hourlyTradeCount = 0;
      this.hourlyResetTime = now;
    }
  }

  /** Record a trade for counter management */
  recordTrade(trade: Trade): void {
    this.dailyTradeCount++;
    this.hourlyTradeCount++;
    this.lastTradeTime = Date.now();
    this.dailyPnl += trade.pnl;

    if (trade.pnl > 0) {
      // Could update peak balance here if tracking equity
    }

    this.checkHourlyReset();
  }

  /** Check if trading is allowed based on all risk conditions */
  canTrade(trades: Trade[], balance: number): CanTradeResult {
    this.checkHourlyReset();

    // Check daily trade limit
    if (this.dailyTradeCount >= this.config.maxTradesPerDay) {
      return { allowed: false, reason: `Daily trade limit reached (${this.dailyTradeCount}/${this.config.maxTradesPerDay})` };
    }

    // Check hourly trade limit
    if (this.hourlyTradeCount >= this.config.maxTradesPerHour) {
      return { allowed: false, reason: `Hourly trade limit reached (${this.hourlyTradeCount}/${this.config.maxTradesPerHour})` };
    }

    // Check cooldown
    if (this.lastTradeTime > 0) {
      const elapsed = (Date.now() - this.lastTradeTime) / 60000;
      if (elapsed < this.config.cooldownMinutes) {
        const remaining = this.config.cooldownMinutes - elapsed;
        return { allowed: false, reason: `Cooldown active (${remaining.toFixed(1)}min remaining)` };
      }
    }

    // Check daily loss limit
    if (this.dailyPnl < 0) {
      const dailyLossPct = (Math.abs(this.dailyPnl) / balance) * 100;
      if (dailyLossPct >= this.config.maxDailyLoss) {
        return { allowed: false, reason: `Daily loss limit reached (${dailyLossPct.toFixed(2)}%/${this.config.maxDailyLoss}%)` };
      }
    }

    // Check drawdown
    if (balance > 0 && this.peakBalance > 0) {
      const drawdownPct = ((this.peakBalance - balance) / this.peakBalance) * 100;
      if (drawdownPct >= this.config.maxDrawdown) {
        return { allowed: false, reason: `Max drawdown reached (${drawdownPct.toFixed(2)}%/${this.config.maxDrawdown}%)` };
      }
    }

    // Check open positions
    const openPositions = trades.filter(t => t.status === 'OPEN');
    if (openPositions.length >= this.config.maxOpenPositions) {
      return { allowed: false, reason: `Max open positions (${openPositions.length}/${this.config.maxOpenPositions})` };
    }

    // Check emergency stop
    if (this.dailyPnl < 0 && balance > 0) {
      const emergencyPct = (Math.abs(this.dailyPnl) / balance) * 100;
      if (emergencyPct >= this.config.emergencyStopPct) {
        return { allowed: false, reason: `EMERGENCY STOP triggered (${emergencyPct.toFixed(2)}% daily loss)` };
      }
    }

    return { allowed: true };
  }

  /** Calculate position size using Kelly Criterion */
  calculateKellySize(
    winRate: number,
    avgWin: number,
    avgLoss: number,
    balance: number,
    entryPrice: number,
    sl: number
  ): PositionSizeResult {
    if (winRate <= 0 || avgLoss <= 0 || balance <= 0 || entryPrice <= 0 || sl <= 0) {
      return { quantity: 0, riskAmount: 0, riskPct: 0, method: 'kelly' };
    }

    const winLossRatio = avgWin / avgLoss;
    const kelly = winRate - ((1 - winRate) / winLossRatio);

    // Apply fractional Kelly
    const adjustedKelly = Math.max(0, kelly * this.config.kellyFraction);

    // Calculate risk amount
    const riskAmount = balance * adjustedKelly;
    const priceRisk = Math.abs(entryPrice - sl);

    if (priceRisk <= 0) {
      return { quantity: 0, riskAmount: 0, riskPct: 0, method: 'kelly' };
    }

    const quantity = riskAmount / priceRisk;
    const riskPct = (riskAmount / balance) * 100;

    return {
      quantity: Math.max(0, +quantity.toFixed(6)),
      riskAmount: +riskAmount.toFixed(2),
      riskPct: +riskPct.toFixed(2),
      method: 'kelly',
    };
  }

  /** Calculate position size using Fixed Fractional method */
  calculateFixedSize(
    riskPct: number,
    balance: number,
    entryPrice: number,
    sl: number
  ): PositionSizeResult {
    if (balance <= 0 || entryPrice <= 0 || sl <= 0) {
      return { quantity: 0, riskAmount: 0, riskPct: 0, method: 'fixed' };
    }

    const riskAmount = balance * (riskPct / 100);
    const priceRisk = Math.abs(entryPrice - sl);

    if (priceRisk <= 0) {
      return { quantity: 0, riskAmount: 0, riskPct: 0, method: 'fixed' };
    }

    const quantity = riskAmount / priceRisk;

    return {
      quantity: Math.max(0, +quantity.toFixed(6)),
      riskAmount: +riskAmount.toFixed(2),
      riskPct: +riskPct.toFixed(2),
      method: 'fixed',
    };
  }

  /** Calculate optimal stop-loss and take-profit levels */
  calculateStops(
    entryPrice: number,
    side: 'LONG' | 'SHORT',
    atr: number,
    analysis: FullAnalysis
  ): { sl: number; tp: number } {
    if (atr <= 0) {
      return {
        sl: side === 'LONG' ? entryPrice * 0.99 : entryPrice * 1.01,
        tp: side === 'LONG' ? entryPrice * 1.015 : entryPrice * 0.985,
      };
    }

    const slDistance = atr * this.config.trailingStopATR;
    const minTPDistance = slDistance * this.config.minRiskReward;

    let sl: number;
    let tp: number;

    if (side === 'LONG') {
      sl = entryPrice - slDistance;
      tp = entryPrice + Math.max(minTPDistance, atr * 3);

      // Don't place SL below support
      if (analysis.support > 0 && analysis.support < sl) {
        // Keep SL above support with a small buffer
        sl = analysis.support * 0.999;
      }
      // Don't place TP above resistance
      if (analysis.resistance > 0 && analysis.resistance < tp) {
        tp = analysis.resistance * 0.999;
      }
    } else {
      sl = entryPrice + slDistance;
      tp = entryPrice - Math.max(minTPDistance, atr * 3);

      // Don't place SL below resistance
      if (analysis.resistance > 0 && analysis.resistance > sl) {
        sl = analysis.resistance * 1.001;
      }
      // Don't place TP below support
      if (analysis.support > 0 && analysis.support > tp) {
        tp = analysis.support * 1.001;
      }
    }

    return {
      sl: +sl.toFixed(2),
      tp: +tp.toFixed(2),
    };
  }

  /** Check circuit breaker conditions */
  checkCircuitBreaker(trades: Trade[], balance: number, drawdown: number): boolean {
    // Emergency circuit breaker conditions

    // 1. Consecutive losses
    const recentTrades = trades.slice(-10);
    const consecutiveLosses = this.countConsecutiveLosses(recentTrades);
    if (consecutiveLosses >= 5) {
      console.log(`[RISK] Circuit breaker: ${consecutiveLosses} consecutive losses`);
      return true;
    }

    // 2. Drawdown exceeds max
    if (drawdown >= this.config.maxDrawdown) {
      console.log(`[RISK] Circuit breaker: drawdown ${drawdown.toFixed(2)}% exceeds max ${this.config.maxDrawdown}%`);
      return true;
    }

    // 3. Daily loss exceeds emergency stop
    if (balance > 0) {
      const dailyLossPct = (Math.abs(this.dailyPnl) / balance) * 100;
      if (this.dailyPnl < 0 && dailyLossPct >= this.config.emergencyStopPct) {
        console.log(`[RISK] Circuit breaker: emergency stop (${dailyLossPct.toFixed(2)}%)`);
        return true;
      }
    }

    // 4. Rapid consecutive losses in short time
    const lastHourTrades = trades.filter(t => {
      if (!t.openedAt) return false;
      return Date.now() - new Date(t.openedAt).getTime() < 3600000;
    });
    const hourLosses = lastHourTrades.filter(t => t.pnl < 0).length;
    if (hourLosses >= 8) {
      console.log(`[RISK] Circuit breaker: ${hourLosses} losses in last hour`);
      return true;
    }

    return false;
  }

  /** Count consecutive losses from the end of trade list */
  private countConsecutiveLosses(trades: Trade[]): number {
    let count = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].pnl < 0) count++;
      else break;
    }
    return count;
  }

  /** Get comprehensive risk metrics */
  getRiskMetrics(trades: Trade[], balance: number, equity: number): RiskMetrics {
    const closedTrades = trades.filter(t => t.status === 'CLOSED' && t.pnl !== 0);

    if (closedTrades.length === 0) {
      return {
        sharpeRatio: 0, sortinoRatio: 0,
        maxDrawdown: 0, maxDrawdownPct: 0,
        currentDrawdown: 0, currentDrawdownPct: 0,
        winRate: 0, profitFactor: 0,
        avgWin: 0, avgLoss: 0, expectancy: 0,
        totalTrades: 0, wins: 0, losses: 0,
        bestTrade: 0, worstTrade: 0,
        consecutiveWins: 0, consecutiveLosses: 0,
        avgHoldingTime: 0, dailyPnl: this.dailyPnl,
        riskOfRuin: 1.0, calmarRatio: 0,
      };
    }

    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl < 0);
    const totalTrades = closedTrades.length;
    const winRate = wins.length / totalTrades;

    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;

    const totalProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0);
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

    const expectancy = totalTrades > 0
      ? (winRate * avgWin) - ((1 - winRate) * avgLoss)
      : 0;

    const bestTrade = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
    const worstTrade = losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0;

    // Consecutive wins/losses
    let consecutiveWins = 0, consecutiveLosses = 0;
    let tempWins = 0, tempLosses = 0;
    for (const trade of closedTrades) {
      if (trade.pnl > 0) {
        tempWins++;
        tempLosses = 0;
        consecutiveWins = Math.max(consecutiveWins, tempWins);
      } else if (trade.pnl < 0) {
        tempLosses++;
        tempWins = 0;
        consecutiveLosses = Math.max(consecutiveLosses, tempLosses);
      }
    }

    // Average holding time
    const holdingTimes = closedTrades.filter(t => t.openedAt && t.closedAt).map(t => {
      return (new Date(t.closedAt!).getTime() - new Date(t.openedAt).getTime()) / 1000;
    });
    const avgHoldingTime = holdingTimes.length > 0
      ? holdingTimes.reduce((s, t) => s + t, 0) / holdingTimes.length
      : 0;

    // Calculate drawdown from trade history
    let peak = balance;
    let maxDrawdown = 0;
    let runningBalance = balance;

    for (const trade of closedTrades) {
      runningBalance += trade.pnl;
      if (runningBalance > peak) peak = runningBalance;
      const dd = peak - runningBalance;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
    const currentDrawdown = peak > 0 ? peak - equity : 0;
    const currentDrawdownPct = peak > 0 ? (currentDrawdown / peak) * 100 : 0;

    // Sharpe and Sortino ratios
    const returns = closedTrades.map(t => t.pnlPercent || (t.pnl / (t.entryPrice || balance) * 100));
    const sharpeRatio = this.calculateSharpe(closedTrades.map(t => t.pnl));
    const sortinoRatio = this.calculateSortino(closedTrades.map(t => t.pnl));

    // Risk of ruin (simplified formula)
    const riskOfRuin = this.calculateRiskOfRuin(winRate, avgWin, avgLoss, balance);

    // Calmar ratio
    const totalReturn = equity - balance;
    const calmarRatio = maxDrawdown > 0 ? totalReturn / maxDrawdown : 0;

    return {
      sharpeRatio: +sharpeRatio.toFixed(3),
      sortinoRatio: +sortinoRatio.toFixed(3),
      maxDrawdown: +maxDrawdown.toFixed(2),
      maxDrawdownPct: +maxDrawdownPct.toFixed(2),
      currentDrawdown: +currentDrawdown.toFixed(2),
      currentDrawdownPct: +currentDrawdownPct.toFixed(2),
      winRate: +winRate.toFixed(3),
      profitFactor: +profitFactor.toFixed(3),
      avgWin: +avgWin.toFixed(2),
      avgLoss: +avgLoss.toFixed(2),
      expectancy: +expectancy.toFixed(2),
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      bestTrade: +bestTrade.toFixed(2),
      worstTrade: +worstTrade.toFixed(2),
      consecutiveWins,
      consecutiveLosses,
      avgHoldingTime: +avgHoldingTime.toFixed(0),
      dailyPnl: +this.dailyPnl.toFixed(2),
      riskOfRuin: +riskOfRuin.toFixed(4),
      calmarRatio: +calmarRatio.toFixed(3),
    };
  }

  /** Calculate Sharpe ratio (annualized) */
  calculateSharpe(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Assuming ~288 5-minute periods per day, 365 days
    const annualizationFactor = Math.sqrt(288 * 365);
    return (mean / stdDev) * annualizationFactor / Math.sqrt(returns.length);
  }

  /** Calculate Sortino ratio (downside deviation only) */
  calculateSortino(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < 0);
    const downsideVariance = downsideReturns.length > 0
      ? downsideReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / downsideReturns.length
      : 0;
    const downsideDev = Math.sqrt(downsideVariance);

    if (downsideDev === 0) return mean > 0 ? 10 : 0;

    return (mean / downsideDev) * Math.sqrt(288 * 365) / Math.sqrt(returns.length);
  }

  /** Calculate risk of ruin using simplified formula */
  private calculateRiskOfRuin(winRate: number, avgWin: number, avgLoss: number, balance: number): number {
    if (winRate <= 0 || avgLoss <= 0 || balance <= 0) return 1.0;

    const q = 1 - winRate; // loss probability
    const u = balance / avgLoss; // units of risk

    // Simplified risk of ruin formula
    const ratio = avgWin / avgLoss;
    if (ratio <= 0 || winRate <= 0) return 1.0;

    const exponent = (Math.log(u) - Math.log(ratio)) * (1 - 2 * winRate);
    const riskOfRuin = Math.exp(exponent);

    return Math.min(1.0, Math.max(0.0, +riskOfRuin.toFixed(4)));
  }

  /** Adjust risk based on current market conditions */
  getAdjustedRisk(analysis: FullAnalysis, currentRisk: number): number {
    let adjustedRisk = currentRisk;
    const factors: string[] = [];

    // Reduce risk in volatile markets
    if (analysis.marketRegime === 'VOLATILE') {
      adjustedRisk *= 0.6;
      factors.push('VOLATILE regime: risk x0.6');
    }

    // Reduce risk during reversals
    if (analysis.marketRegime === 'REVERSAL') {
      adjustedRisk *= 0.7;
      factors.push('REVERSAL regime: risk x0.7');
    }

    // Increase risk in clear trends
    if (analysis.marketRegime === 'TRENDING_UP' || analysis.marketRegime === 'TRENDING_DOWN') {
      adjustedRisk *= 1.1;
      factors.push('TRENDING regime: risk x1.1');
    }

    // Reduce risk if trend strength is low but we're supposed to be trending
    if (analysis.adxTrend === 'RANGING' && analysis.trendStrength < 40) {
      adjustedRisk *= 0.8;
      factors.push('Weak trend: risk x0.8');
    }

    // Reduce risk with wide spreads (low liquidity)
    if (analysis.atrPct > 3) {
      adjustedRisk *= 0.7;
      factors.push('High volatility (ATR): risk x0.7');
    }

    // Boost risk if confluence is strong
    if (analysis.confluenceScore > 0.7) {
      adjustedRisk *= 1.15;
      factors.push('Strong confluence: risk x1.15');
    }

    // Reduce risk if volume is low
    if (analysis.volumeRatio < 0.5) {
      adjustedRisk *= 0.7;
      factors.push('Low volume: risk x0.7');
    }

    // Clamp to safe range
    adjustedRisk = Math.max(0.1, Math.min(3.0, adjustedRisk));

    if (factors.length > 0) {
      console.log(`[RISK] Adjustments: ${factors.join(', ')} -> final risk: ${adjustedRisk.toFixed(3)}%`);
    }

    return +adjustedRisk.toFixed(3);
  }

  /** Get optimal position size using the best method available */
  getOptimalSize(
    trades: Trade[],
    balance: number,
    entryPrice: number,
    sl: number,
    analysis: FullAnalysis
  ): PositionSizeResult {
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    const winRate = closedTrades.length > 5
      ? closedTrades.filter(t => t.pnl > 0).length / closedTrades.length
      : 0.5;

    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl < 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;

    // Use Kelly if we have enough data
    if (closedTrades.length >= 20 && winRate > 0.3 && avgLoss > 0) {
      const kellyResult = this.calculateKellySize(winRate, avgWin, avgLoss, balance, entryPrice, sl);
      if (kellyResult.quantity > 0) {
        return kellyResult;
      }
    }

    // Fall back to fixed fractional with adjusted risk
    const adjustedRisk = this.getAdjustedRisk(analysis, this.config.maxRiskPerTrade);
    return this.calculateFixedSize(adjustedRisk, balance, entryPrice, sl);
  }

  /** Update peak balance tracking */
  updatePeakBalance(balance: number): void {
    if (balance > this.peakBalance) {
      this.peakBalance = balance;
    }
  }

  /** Get current drawdown percentage */
  getDrawdown(currentBalance: number): number {
    if (this.peakBalance <= 0 || currentBalance <= 0) return 0;
    return ((this.peakBalance - currentBalance) / this.peakBalance) * 100;
  }

  /** Initialize counters from trade history */
  syncFromTradeHistory(trades: Trade[], balance: number): void {
    // Set peak balance
    this.updatePeakBalance(balance);

    // Count today's trades
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = trades.filter(t => {
      const date = t.openedAt instanceof Date ? t.openedAt.toISOString().slice(0, 10) : String(t.openedAt).slice(0, 10);
      return date === today;
    });
    this.dailyTradeCount = todayTrades.length;

    // Calculate daily PnL
    this.dailyPnl = todayTrades.reduce((sum, t) => sum + t.pnl, 0);

    // Find peak balance
    let runningBalance = balance;
    for (const trade of trades) {
      runningBalance += trade.pnl;
      this.updatePeakBalance(runningBalance);
    }

    console.log(`[RISK] Synced from ${trades.length} trades. Peak: ${this.peakBalance.toFixed(2)}, Daily trades: ${this.dailyTradeCount}, Daily PnL: ${this.dailyPnl.toFixed(2)}`);
  }
}
