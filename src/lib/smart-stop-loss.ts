// ============================================
// SMART STOP LOSS - Professional Stop Management
// ============================================
// Multi-phase trailing stops, break-even activation,
// profit locks, S/R aware placement, time-based exits,
// momentum-reversal detection, and dynamic adaptation.
// ============================================

import type { Position } from './execution-engine';
import type { FullAnalysis } from './analysis-engine';
import { db } from './db';
import { loadSmartStopLossConfig, saveSmartStopLossConfig } from './config-persistence';

// ---- Configuration Interfaces ----

export interface SmartStopConfig {
  // Trailing stop phases (profit-based)
  phase1: { profitPct: number; trailATR: number };
  phase2: { profitPct: number; trailATR: number };
  phase3: { profitPct: number; trailATR: number };
  phase4: { profitPct: number; trailATR: number };

  // Break-even
  breakEvenTriggerPct: number;
  breakEvenBuffer: number;

  // Profit locks (partial close levels)
  profitLocks: Array<{
    profitPct: number;
    closePct: number;
    moveSLToPct: number;
  }>;

  // Time-based stop
  maxHoldingMinutes: number;
  timeStopCheckInterval: number;
  unprofitableTimeLimit: number;

  // Momentum-reversal stop
  enableMomentumStop: boolean;
  momentumStopMinProfit: number;

  // S/R awareness
  slBufferFromSR: number;
  useResistanceAsTP: boolean;
  useSupportAsSL: boolean;

  // ATR adaptation
  atrPeriod: number;
  atrMultiplierBase: number;
  atrMultiplierVolatility: number;
  volatilityATRPctThreshold: number;

  // Re-entry prevention
  cooldownAfterStop: number;
}

export interface StopAction {
  type: 'NO_ACTION' | 'TRAILING_UPDATE' | 'BREAK_EVEN' | 'PROFIT_LOCK' | 'CLOSE_FULL' | 'CLOSE_PARTIAL' | 'TIME_STOP' | 'MOMENTUM_STOP' | 'SAR_STOP';
  message: string;
  newSL?: number;
  newTP?: number;
  closePct?: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  phase?: number;
}

// ---- Default Configuration ----

export const DEFAULT_SMART_STOP_CONFIG: SmartStopConfig = {
  phase1: { profitPct: 0.5, trailATR: 2.5 },
  phase2: { profitPct: 1.5, trailATR: 1.8 },
  phase3: { profitPct: 3.0, trailATR: 1.2 },
  phase4: { profitPct: 5.0, trailATR: 0.6 },
  breakEvenTriggerPct: 0.8,
  breakEvenBuffer: 0.001,
  profitLocks: [
    { profitPct: 2.0, closePct: 0, moveSLToPct: 1.2 },
    { profitPct: 3.5, closePct: 0, moveSLToPct: 2.5 },
    { profitPct: 5.0, closePct: 0, moveSLToPct: 4.0 },
  ],
  maxHoldingMinutes: 360,
  timeStopCheckInterval: 30,
  unprofitableTimeLimit: 60,
  enableMomentumStop: true,
  momentumStopMinProfit: 0.3,
  slBufferFromSR: 0.002,
  useResistanceAsTP: true,
  useSupportAsSL: true,
  atrPeriod: 14,
  atrMultiplierBase: 2,
  atrMultiplierVolatility: 3,
  volatilityATRPctThreshold: 2.0,
  cooldownAfterStop: 2,
};

// ============================================
// SMART STOP LOSS CLASS
// ============================================

export class SmartStopLoss {
  config: SmartStopConfig;
  private lastStopUpdate = 0;
  private stopUpdateCount = 0;
  private cooldownUntil = 0;

  /** Track the highest profit lock level already triggered for this position */
  private highestTriggeredProfitLock = -1;

  constructor(config?: Partial<SmartStopConfig>) {
    this.config = { ...DEFAULT_SMART_STOP_CONFIG, ...config };
    console.log(`[SMART-SL] Initialized. Phases: 4, ProfitLocks: ${this.config.profitLocks.length}, Cooldown: ${this.config.cooldownAfterStop}min`);
  }

  /** Initialize configuration from database (call separately, not in constructor) */
  async initFromDB(): Promise<void> {
    try {
      const saved = await loadSmartStopLossConfig();
      if (saved) {
        this.config = { ...this.config, ...saved };
        console.log(`[SMART-SL] Config loaded from DB. Phases: 4, ProfitLocks: ${this.config.profitLocks.length}`);
      }
    } catch (err) {
      console.error('[SMART-SL] Failed to load config from DB:', err);
    }
  }

  /** Save current configuration to database */
  async saveToDB(): Promise<void> {
    try {
      await saveSmartStopLossConfig(this.config);
    } catch (err) {
      console.error('[SMART-SL] Failed to save config to DB:', err);
    }
  }

  // ---- Public API ----

  /**
   * Main evaluation - call on every tick.
   * Returns the highest-priority action to take.
   * Priority: CLOSE_FULL > TIME_STOP > MOMENTUM_STOP > PROFIT_LOCK > BREAK_EVEN > TRAILING_UPDATE
   */
  evaluate(position: Position, analysis: FullAnalysis): StopAction {
    const now = Date.now();

    // Cooldown check — don't update SL too frequently to avoid noise
    if (now < this.cooldownUntil) {
      return { type: 'NO_ACTION', message: 'Cooldown active', urgency: 'LOW' };
    }

    const profitPct = this.calculateProfitPct(position);
    const timeOpenMin = this.getTimeOpenMinutes(position);

    // ---- 1. Time-based stop (highest urgency for stale positions) ----
    const timeAction = this.checkTimeStop(position, analysis);
    if (timeAction) return timeAction;

    // ---- 2. Momentum-reversal stop ----
    if (this.config.enableMomentumStop) {
      const momentumAction = this.checkMomentumStop(position, analysis);
      if (momentumAction) return momentumAction;
    }

    // ---- 3. Profit lock levels ----
    const profitLockAction = this.checkProfitLocks(position, analysis);
    if (profitLockAction) return profitLockAction;

    // ---- 4. Break-even activation ----
    const breakEvenAction = this.checkBreakEven(position, analysis);
    if (breakEvenAction) return breakEvenAction;

    // ---- 5. S/R based TP adjustment ----
    const srAction = this.checkSRAdjustment(position, analysis);
    if (srAction) return srAction;

    // ---- 6. Multi-phase trailing stop ----
    if (profitPct >= this.config.phase1.profitPct) {
      const phase = this.getCurrentPhase(profitPct);
      const newTrailingSL = this.calculateTrailingStop(position, analysis, phase);

      if (newTrailingSL !== null && this.shouldUpdateSL(position, newTrailingSL)) {
        const previousSL = position.stopLoss;
        this.lastStopUpdate = now;
        this.stopUpdateCount++;
        this.throttleUpdates(position, newTrailingSL);

        void this.logStopEvent(position, 'TRAILING', previousSL, newTrailingSL,
          `Phase ${phase} trailing update (${this.getPhaseName(phase)}), ATR mult: ${this.getPhaseATRMultiplier(phase).toFixed(1)}x`);

        return {
          type: 'TRAILING_UPDATE',
          message: `Phase ${phase} (${this.getPhaseName(phase)}): SL ${previousSL.toFixed(2)} -> ${newTrailingSL.toFixed(2)}`,
          newSL: +newTrailingSL.toFixed(2),
          urgency: 'MEDIUM',
          phase,
        };
      }
    }

    return { type: 'NO_ACTION', message: 'No stop update needed', urgency: 'LOW' };
  }

  /**
   * Calculate initial SL when opening a trade.
   * Uses ATR, support/resistance, and volatility.
   */
  calculateInitialSL(entryPrice: number, side: 'LONG' | 'SHORT', analysis: FullAnalysis): number {
    const atr = analysis.atr;
    const multiplier = this.getAdaptiveATRMultiplier(analysis);
    let slDistance = atr * multiplier;

    // Ensure minimum distance of 0.1% to avoid micro-stops
    const minDistance = entryPrice * 0.001;
    slDistance = Math.max(slDistance, minDistance);

    let rawSL: number;

    if (side === 'LONG') {
      rawSL = entryPrice - slDistance;

      // If support-based SL is configured and support is below entry but not too far
      if (this.config.useSupportAsSL && analysis.support > 0 && analysis.support < entryPrice) {
        const supportDistance = entryPrice - analysis.support;
        // Use support if it's within 2x ATR (not unreasonable)
        if (supportDistance <= slDistance * 2) {
          rawSL = analysis.support - (entryPrice * this.config.slBufferFromSR);
        }
      }
    } else {
      rawSL = entryPrice + slDistance;

      // If resistance-based SL is configured and resistance is above entry but not too far
      if (this.config.useSupportAsSL && analysis.resistance > 0 && analysis.resistance > entryPrice) {
        const resistanceDistance = analysis.resistance - entryPrice;
        if (resistanceDistance <= slDistance * 2) {
          rawSL = analysis.resistance + (entryPrice * this.config.slBufferFromSR);
        }
      }
    }

    // Make S/R aware — nudge away from nearby levels
    rawSL = this.makeSRAwareSL(rawSL, side, analysis);

    return +rawSL.toFixed(2);
  }

  /**
   * Calculate initial TP when opening a trade.
   * Uses R:R ratio, nearest resistance (for longs), ATR.
   */
  calculateInitialTP(entryPrice: number, side: 'LONG' | 'SHORT', analysis: FullAnalysis, sl: number): number {
    const atr = analysis.atr;
    const riskDistance = Math.abs(entryPrice - sl);
    const minRR = 1.5; // minimum risk:reward
    let tpDistance = riskDistance * minRR;

    // Extend TP using ATR targets (at least 2 ATRs of reward)
    const atrTPDistance = atr * 2;
    tpDistance = Math.max(tpDistance, atrTPDistance);

    let rawTP: number;

    if (side === 'LONG') {
      rawTP = entryPrice + tpDistance;

      // If resistance-based TP is configured
      if (this.config.useResistanceAsTP && analysis.resistance > 0 && analysis.resistance > entryPrice) {
        const resistanceDistance = analysis.resistance - entryPrice;
        // Use resistance if it provides at least 1:1 RR
        if (resistanceDistance >= riskDistance) {
          // Place TP just below resistance for better fill
          rawTP = analysis.resistance - (entryPrice * this.config.slBufferFromSR * 0.5);
        }
      }

      // Also consider pivot point R2 as extended target
      if (analysis.pivotPoints.r2 > rawTP && analysis.confluenceScore > 0.6) {
        rawTP = analysis.pivotPoints.r2 - (entryPrice * this.config.slBufferFromSR);
      }
    } else {
      rawTP = entryPrice - tpDistance;

      // If support-based TP is configured
      if (this.config.useResistanceAsTP && analysis.support > 0 && analysis.support < entryPrice) {
        const supportDistance = entryPrice - analysis.support;
        if (supportDistance >= riskDistance) {
          rawTP = analysis.support + (entryPrice * this.config.slBufferFromSR * 0.5);
        }
      }

      // Consider pivot point S2 as extended target
      if (analysis.pivotPoints.s2 < rawTP && analysis.confluenceScore > 0.6) {
        rawTP = analysis.pivotPoints.s2 + (entryPrice * this.config.slBufferFromSR);
      }
    }

    return +rawTP.toFixed(2);
  }

  /**
   * Get current phase name for display
   */
  getPhaseName(phase: number): string {
    const names: Record<number, string> = {
      0: 'No Trailing',
      1: 'Conservative (Wide)',
      2: 'Moderate',
      3: 'Tight',
      4: 'Maximum Lock',
    };
    return names[phase] || `Phase ${phase}`;
  }

  /**
   * Get full status report for UI display
   */
  getStatus(position: Position, analysis: FullAnalysis): {
    currentPhase: number;
    phaseName: string;
    profitPct: number;
    currentSL: number;
    initialSL: number;
    trailingActive: boolean;
    breakEvenActive: boolean;
    timeOpen: number;
    timeStopAt: number;
    nextProfitLock: { profitPct: number; closePct: number } | null;
  } {
    const profitPct = this.calculateProfitPct(position);
    const phase = this.getCurrentPhase(profitPct);
    const timeOpenMin = this.getTimeOpenMinutes(position);

    // Find next untriggered profit lock
    const nextLock = this.config.profitLocks.find(lock => lock.profitPct > profitPct) || null;

    return {
      currentPhase: phase,
      phaseName: this.getPhaseName(phase),
      profitPct: +profitPct.toFixed(3),
      currentSL: position.stopLoss,
      initialSL: position.stopLoss, // best approximation since original SL isn't stored
      trailingActive: profitPct >= this.config.phase1.profitPct,
      breakEvenActive: profitPct >= this.config.breakEvenTriggerPct,
      timeOpen: +timeOpenMin.toFixed(1),
      timeStopAt: this.config.maxHoldingMinutes,
      nextProfitLock: nextLock ? { profitPct: nextLock.profitPct, closePct: nextLock.closePct } : null,
    };
  }

  /**
   * Reset internal state for a new position
   */
  reset(): void {
    this.lastStopUpdate = 0;
    this.stopUpdateCount = 0;
    this.highestTriggeredProfitLock = -1;
    this.cooldownUntil = 0;
  }

  // ---- Private Methods ----

  /**
   * Calculate profit percentage for the position
   */
  private calculateProfitPct(position: Position): number {
    if (position.entryPrice <= 0) return 0;

    if (position.side === 'LONG') {
      return ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
    } else {
      return ((position.entryPrice - position.currentPrice) / position.entryPrice) * 100;
    }
  }

  /**
   * Get time open in minutes
   */
  private getTimeOpenMinutes(position: Position): number {
    const openedAt = position.openedAt instanceof Date
      ? position.openedAt.getTime()
      : new Date(position.openedAt).getTime();
    return (Date.now() - openedAt) / 60000;
  }

  /**
   * Determine current trailing phase based on profit percentage.
   * Returns 0 if trailing hasn't started yet.
   */
  private getCurrentPhase(profitPct: number): number {
    if (profitPct >= this.config.phase4.profitPct) return 4;
    if (profitPct >= this.config.phase3.profitPct) return 3;
    if (profitPct >= this.config.phase2.profitPct) return 2;
    if (profitPct >= this.config.phase1.profitPct) return 1;
    return 0;
  }

  /**
   * Get the ATR multiplier for a given trailing phase
   */
  private getPhaseATRMultiplier(phase: number): number {
    switch (phase) {
      case 1: return this.config.phase1.trailATR;
      case 2: return this.config.phase2.trailATR;
      case 3: return this.config.phase3.trailATR;
      case 4: return this.config.phase4.trailATR;
      default: return this.config.phase1.trailATR;
    }
  }

  /**
   * Calculate trailing stop based on current phase.
   * Returns null if trailing shouldn't be active or calculation fails.
   * 
   * For LONG: SL = highestPrice - (ATR * phaseMultiplier)
   * For SHORT: SL = lowestPrice + (ATR * phaseMultiplier)
   */
  private calculateTrailingStop(position: Position, analysis: FullAnalysis, phase: number): number | null {
    const atr = analysis.atr;
    if (atr <= 0) return null;

    const multiplier = this.getPhaseATRMultiplier(phase);
    const trailDistance = atr * multiplier;

    if (position.side === 'LONG') {
      const highest = position.highestPrice || position.currentPrice;
      const newSL = highest - trailDistance;

      // SL must be above entry once break-even is active
      if (this.calculateProfitPct(position) >= this.config.breakEvenTriggerPct) {
        const breakEvenSL = position.entryPrice * (1 + this.config.breakEvenBuffer);
        return Math.max(newSL, breakEvenSL);
      }

      // Don't trail below initial stop
      if (newSL <= position.stopLoss) return null;

      return newSL;
    } else {
      const lowest = position.lowestPrice || position.currentPrice;
      const newSL = lowest + trailDistance;

      if (this.calculateProfitPct(position) >= this.config.breakEvenTriggerPct) {
        const breakEvenSL = position.entryPrice * (1 - this.config.breakEvenBuffer);
        return Math.min(newSL, breakEvenSL);
      }

      // For shorts, SL should be below current (i.e., lower value triggers first)
      // Don't trail above initial stop
      if (newSL >= position.stopLoss) return null;

      return newSL;
    }
  }

  /**
   * Check if break-even should be activated.
   * Triggers once profit exceeds breakEvenTriggerPct and current SL is worse than break-even.
   */
  private checkBreakEven(position: Position, analysis: FullAnalysis): StopAction | null {
    const profitPct = this.calculateProfitPct(position);

    if (profitPct < this.config.breakEvenTriggerPct) return null;

    let breakEvenSL: number;

    if (position.side === 'LONG') {
      // Break-even for longs: SL = entry + buffer (above entry)
      breakEvenSL = position.entryPrice * (1 + this.config.breakEvenBuffer);

      // Only activate if current SL is below break-even
      if (position.stopLoss >= breakEvenSL) return null;

      // Don't worsen the SL
      breakEvenSL = Math.max(breakEvenSL, position.stopLoss);

      if (breakEvenSL <= position.stopLoss) return null;
    } else {
      // Break-even for shorts: SL = entry - buffer (below entry)
      breakEvenSL = position.entryPrice * (1 - this.config.breakEvenBuffer);

      // Only activate if current SL is above break-even
      if (position.stopLoss <= breakEvenSL) return null;

      breakEvenSL = Math.min(breakEvenSL, position.stopLoss);

      if (breakEvenSL >= position.stopLoss) return null;
    }

    breakEvenSL = this.makeSRAwareSL(breakEvenSL, position.side as 'LONG' | 'SHORT', analysis);

    void this.logStopEvent(position, 'BREAK_EVEN', position.stopLoss, breakEvenSL,
      `Break-even activated at ${profitPct.toFixed(2)}% profit`);

    this.lastStopUpdate = Date.now();
    this.stopUpdateCount++;

    return {
      type: 'BREAK_EVEN',
      message: `Break-even activated: SL ${position.stopLoss.toFixed(2)} -> ${breakEvenSL.toFixed(2)} (entry: ${position.entryPrice.toFixed(2)})`,
      newSL: +breakEvenSL.toFixed(2),
      urgency: 'HIGH',
    };
  }

  /**
   * Check profit lock levels.
   * At each profit lock level, tighten the SL to lock in a guaranteed profit.
   */
  private checkProfitLocks(position: Position, analysis: FullAnalysis): StopAction | null {
    const profitPct = this.calculateProfitPct(position);

    for (let i = 0; i < this.config.profitLocks.length; i++) {
      const lock = this.config.profitLocks[i];

      // Skip if already triggered
      if (i <= this.highestTriggeredProfitLock) continue;

      // Check if profit threshold is reached
      if (profitPct < lock.profitPct) continue;

      // Calculate the lock SL: lock in `moveSLToPct` percent profit
      let lockSL: number;

      if (position.side === 'LONG') {
        lockSL = position.entryPrice * (1 + lock.moveSLToPct / 100);
      } else {
        lockSL = position.entryPrice * (1 - lock.moveSLToPct / 100);
      }

      // Only upgrade SL if it's better than current
      if (position.side === 'LONG' && lockSL <= position.stopLoss) continue;
      if (position.side === 'SHORT' && lockSL >= position.stopLoss) continue;

      // Make S/R aware
      lockSL = this.makeSRAwareSL(lockSL, position.side as 'LONG' | 'SHORT', analysis);

      this.highestTriggeredProfitLock = i;
      this.lastStopUpdate = Date.now();
      this.stopUpdateCount++;

      void this.logStopEvent(position, 'PROFIT_LOCK', position.stopLoss, lockSL,
        `Profit lock at ${lock.profitPct}% profit, locking ${lock.moveSLToPct}% gain`);

      const action: StopAction = {
        type: 'PROFIT_LOCK',
        message: `Profit lock: ${lock.profitPct}% reached, SL -> ${lockSL.toFixed(2)} (locking ${lock.moveSLToPct}% profit)`,
        newSL: +lockSL.toFixed(2),
        urgency: lock.closePct > 0 ? 'CRITICAL' : 'HIGH',
      };

      // If partial close is configured
      if (lock.closePct > 0) {
        action.closePct = lock.closePct;
        action.type = 'CLOSE_PARTIAL';
        action.message = `Profit lock: closing ${lock.closePct * 100}% of position, SL -> ${lockSL.toFixed(2)}`;
      }

      return action;
    }

    return null;
  }

  /**
   * Check time-based stop conditions.
   * - Max holding time exceeded -> close full
   * - Unprofitable for too long -> close full
   */
  private checkTimeStop(position: Position, analysis: FullAnalysis): StopAction | null {
    const timeOpenMin = this.getTimeOpenMinutes(position);
    const profitPct = this.calculateProfitPct(position);

    // Only check at configured intervals to avoid noise
    if (timeOpenMin % this.config.timeStopCheckInterval > 1) {
      // Allow some slack
      const slack = timeOpenMin > this.config.maxHoldingMinutes * 0.9;
      if (!slack) return null;
    }

    // 1. Max holding time exceeded
    if (timeOpenMin >= this.config.maxHoldingMinutes) {
      void this.logStopEvent(position, 'TIME_STOP', position.stopLoss, position.currentPrice,
        `Max holding time ${this.config.maxHoldingMinutes}min exceeded`);

      return {
        type: 'CLOSE_FULL',
        message: `Time stop: held for ${timeOpenMin.toFixed(0)}min (max: ${this.config.maxHoldingMinutes}min). Profit: ${profitPct.toFixed(2)}%.`,
        urgency: 'HIGH',
      };
    }

    // 2. Not profitable after unprofitableTimeLimit
    if (profitPct <= 0 && timeOpenMin >= this.config.unprofitableTimeLimit) {
      // Exception: if the position is very close to profitability, give more time
      if (profitPct > -0.2) return null;

      void this.logStopEvent(position, 'TIME_STOP', position.stopLoss, position.currentPrice,
        `Unprofitable after ${this.config.unprofitableTimeLimit}min`);

      return {
        type: 'CLOSE_FULL',
        message: `Unprofitable time stop: ${timeOpenMin.toFixed(0)}min open with ${profitPct.toFixed(2)}% profit. Market stalled.`,
        urgency: 'MEDIUM',
      };
    }

    return null;
  }

  /**
   * Check momentum-reversal conditions.
   * Exit when the trend that supported the trade has reversed.
   * Only triggers if already profitable by at least `momentumStopMinProfit`.
   */
  private checkMomentumStop(position: Position, analysis: FullAnalysis): StopAction | null {
    const profitPct = this.calculateProfitPct(position);

    // Only trigger if profitable enough to protect gains
    if (profitPct < this.config.momentumStopMinProfit) return null;

    let reversalDetected = false;
    const reasons: string[] = [];

    if (position.side === 'LONG') {
      // Check for bearish reversal signals on a LONG position
      // 1. RSI: was bullish, now crossing below 50 or into oversold territory
      if (analysis.rsi < 35 && analysis.rsiZone === 'OVERSOLD') {
        reversalDetected = true;
        reasons.push(`RSI oversold (${analysis.rsi.toFixed(1)})`);
      }

      // 2. MACD: bearish crossover
      if (analysis.macd.crossover === 'BEARISH') {
        reversalDetected = true;
        reasons.push('MACD bearish crossover');
      }

      // 3. Trend reversal
      if (analysis.trend === 'STRONG_DOWN' || analysis.trend === 'DOWN') {
        reversalDetected = true;
        reasons.push(`Trend reversed to ${analysis.trend}`);
      }

      // 4. SuperTrend flipped
      if (analysis.supertrend.direction === 'DOWN') {
        reversalDetected = true;
        reasons.push('SuperTrend flipped DOWN');
      }

      // 5. Bearish patterns
      if (analysis.patterns.includes('BEARISH_ENGULFING') || analysis.patterns.includes('EVENING_STAR') || analysis.patterns.includes('SHOOTING_STAR')) {
        reversalDetected = true;
        reasons.push(`Bearish pattern: ${analysis.patterns.filter(p => ['BEARISH_ENGULFING', 'EVENING_STAR', 'SHOOTING_STAR', 'THREE_BLACK_CROWS'].includes(p)).join(', ')}`);
      }

      // 6. Stochastic overbought and turning down
      if (analysis.stochastic.k > 80 && analysis.stochastic.d > 80 && analysis.stochastic.zone === 'OVERBOUGHT') {
        reversalDetected = true;
        reasons.push(`Stochastic overbought (K:${analysis.stochastic.k.toFixed(1)}, D:${analysis.stochastic.d.toFixed(1)})`);
      }

      // 7. Strong sell pressure
      if (analysis.orderFlow === 'STRONG_SELL' && analysis.sellPressure > 70) {
        reversalDetected = true;
        reasons.push(`Strong sell pressure (${analysis.sellPressure}%)`);
      }

      // 8. Price broke below support
      if (analysis.support > 0 && position.currentPrice < analysis.support) {
        reversalDetected = true;
        reasons.push('Price broke below support');
      }
    } else {
      // Check for bullish reversal signals on a SHORT position
      // 1. RSI: was bearish, now crossing above 50 or into overbought
      if (analysis.rsi > 65 && analysis.rsiZone === 'OVERBOUGHT') {
        reversalDetected = true;
        reasons.push(`RSI overbought (${analysis.rsi.toFixed(1)})`);
      }

      // 2. MACD: bullish crossover
      if (analysis.macd.crossover === 'BULLISH') {
        reversalDetected = true;
        reasons.push('MACD bullish crossover');
      }

      // 3. Trend reversal
      if (analysis.trend === 'STRONG_UP' || analysis.trend === 'UP') {
        reversalDetected = true;
        reasons.push(`Trend reversed to ${analysis.trend}`);
      }

      // 4. SuperTrend flipped
      if (analysis.supertrend.direction === 'UP') {
        reversalDetected = true;
        reasons.push('SuperTrend flipped UP');
      }

      // 5. Bullish patterns
      if (analysis.patterns.includes('BULLISH_ENGULFING') || analysis.patterns.includes('MORNING_STAR') || analysis.patterns.includes('HAMMER')) {
        reversalDetected = true;
        reasons.push(`Bullish pattern: ${analysis.patterns.filter(p => ['BULLISH_ENGULFING', 'MORNING_STAR', 'HAMMER', 'THREE_WHITE_SOLDIERS'].includes(p)).join(', ')}`);
      }

      // 6. Stochastic oversold and turning up
      if (analysis.stochastic.k < 20 && analysis.stochastic.d < 20 && analysis.stochastic.zone === 'OVERSOLD') {
        reversalDetected = true;
        reasons.push(`Stochastic oversold (K:${analysis.stochastic.k.toFixed(1)}, D:${analysis.stochastic.d.toFixed(1)})`);
      }

      // 7. Strong buy pressure
      if (analysis.orderFlow === 'STRONG_BUY' && analysis.buyPressure > 70) {
        reversalDetected = true;
        reasons.push(`Strong buy pressure (${analysis.buyPressure}%)`);
      }

      // 8. Price broke above resistance
      if (analysis.resistance > 0 && position.currentPrice > analysis.resistance) {
        reversalDetected = true;
        reasons.push('Price broke above resistance');
      }
    }

    if (!reversalDetected) return null;

    // Require confluence: at least 2 reversal signals
    if (reasons.length < 2) return null;

    void this.logStopEvent(position, 'MOMENTUM_STOP', position.stopLoss, position.currentPrice,
      `Momentum reversal: ${reasons.join('; ')}`);

    return {
      type: 'MOMENTUM_STOP',
      message: `Momentum reversal detected (${reasons.length} signals): ${reasons.join(', ')}. Protecting ${profitPct.toFixed(2)}% profit.`,
      urgency: 'HIGH',
    };
  }

  /**
   * Check S/R based TP adjustment.
   * Dynamically adjust TP when price approaches a key level.
   */
  private checkSRAdjustment(position: Position, analysis: FullAnalysis): StopAction | null {
    if (!this.config.useResistanceAsTP && !this.config.useSupportAsSL) return null;

    let newTP: number | null = null;

    if (position.side === 'LONG') {
      // Check if resistance has moved closer and we should tighten TP
      if (this.config.useResistanceAsTP && analysis.resistance > 0) {
        const currentTP = position.takeProfit;
        const adjustedTP = analysis.resistance - (position.currentPrice * this.config.slBufferFromSR * 0.5);

        // Only adjust if the new TP is lower than current but still above current price and provides decent R:R
        const currentRR = position.entryPrice > 0
          ? (currentTP - position.entryPrice) / (position.entryPrice - position.stopLoss)
          : 0;

        if (adjustedTP < currentTP && adjustedTP > position.currentPrice && currentRR > 1.2) {
          newTP = adjustedTP;
        }
      }
    } else {
      // For shorts, check if support has moved and tighten TP
      if (this.config.useSupportAsSL && analysis.support > 0) {
        const currentTP = position.takeProfit;
        const adjustedTP = analysis.support + (position.currentPrice * this.config.slBufferFromSR * 0.5);

        const currentRR = position.entryPrice > 0
          ? (position.entryPrice - currentTP) / (position.stopLoss - position.entryPrice)
          : 0;

        if (adjustedTP > currentTP && adjustedTP < position.currentPrice && currentRR > 1.2) {
          newTP = adjustedTP;
        }
      }
    }

    if (newTP === null) return null;

    void this.logStopEvent(position, 'SR_ADJUSTMENT', position.takeProfit, newTP,
      'TP adjusted for S/R proximity');

    return {
      type: 'SAR_STOP',
      message: `S/R aware TP adjustment: ${position.takeProfit.toFixed(2)} -> ${newTP.toFixed(2)}`,
      newTP: +newTP.toFixed(2),
      urgency: 'LOW',
    };
  }

  /**
   * Adjust SL to be S/R aware (don't place right at key levels).
   * Places SL just beyond the nearest support/resistance level for extra safety.
   */
  private makeSRAwareSL(rawSL: number, side: 'LONG' | 'SHORT', analysis: FullAnalysis): number {
    const buffer = rawSL * this.config.slBufferFromSR;
    const { support, resistance, pivotPoints } = analysis;
    const allLevels = [
      support, resistance,
      pivotPoints.s1, pivotPoints.s2, pivotPoints.s3,
      pivotPoints.r1, pivotPoints.r2, pivotPoints.r3,
    ].filter(level => level > 0);

    // Find the nearest key level to our raw SL
    let nearestLevel = 0;
    let nearestDistance = Infinity;

    for (const level of allLevels) {
      const distance = Math.abs(rawSL - level);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLevel = level;
      }
    }

    // If raw SL is within 0.5% of a key level, push it beyond that level
    const proximityThreshold = rawSL * 0.005;

    if (nearestDistance < proximityThreshold && nearestLevel > 0) {
      if (side === 'LONG') {
        // For longs, SL should be below. If nearest level is below raw SL, push below it.
        if (nearestLevel < rawSL) {
          return +(nearestLevel - buffer).toFixed(2);
        }
        // If nearest level is above raw SL, push below that level
        return +(nearestLevel - buffer).toFixed(2);
      } else {
        // For shorts, SL should be above. If nearest level is above raw SL, push above it.
        if (nearestLevel > rawSL) {
          return +(nearestLevel + buffer).toFixed(2);
        }
        return +(nearestLevel + buffer).toFixed(2);
      }
    }

    return +rawSL.toFixed(2);
  }

  /**
   * Get ATR multiplier adjusted for current volatility.
   * In volatile markets, use wider multiplier; in calm markets, use tighter.
   */
  private getAdaptiveATRMultiplier(analysis: FullAnalysis): number {
    const { atrMultiplierBase, atrMultiplierVolatility, volatilityATRPctThreshold } = this.config;

    if (analysis.atrPct >= volatilityATRPctThreshold) {
      // Volatile market: blend between base and volatility multiplier
      const excess = (analysis.atrPct - volatilityATRPctThreshold) / volatilityATRPctThreshold;
      const blendFactor = Math.min(1, excess); // 0 to 1
      return atrMultiplierBase + (atrMultiplierVolatility - atrMultiplierBase) * blendFactor;
    }

    // Calm market: use base multiplier (or slightly tighter)
    if (analysis.atrPct < volatilityATRPctThreshold * 0.5) {
      return atrMultiplierBase * 0.85; // 15% tighter in very calm markets
    }

    return atrMultiplierBase;
  }

  /**
   * Determine if a new SL should replace the current one.
   * For LONG: new SL must be higher than current SL.
   * For SHORT: new SL must be lower than current SL.
   * SL can only ratchet in the favorable direction.
   */
  private shouldUpdateSL(position: Position, newSL: number): boolean {
    if (position.side === 'LONG') {
      return newSL > position.stopLoss;
    } else {
      return newSL < position.stopLoss;
    }
  }

  /**
   * Throttle stop updates to avoid excessive database writes.
   * Sets a cooldown period based on the current phase (tighter phases update less often).
   */
  private throttleUpdates(position: Position, newSL: number): void {
    const profitPct = this.calculateProfitPct(position);
    const phase = this.getCurrentPhase(profitPct);

    // Cooldown intervals per phase (ms) — tighter phases need less frequent updates
    const cooldowns: Record<number, number> = {
      0: 0,
      1: 15000,   // 15s in phase 1
      2: 20000,   // 20s in phase 2
      3: 30000,   // 30s in phase 3
      4: 45000,   // 45s in phase 4
    };

    const cooldownMs = cooldowns[phase] || 15000;
    this.cooldownUntil = Date.now() + cooldownMs;
  }

  /**
   * Log stop event to the SmartStopEvent table in the database.
   * Async fire-and-forget — errors are caught and logged but don't propagate.
   */
  private async logStopEvent(
    position: Position,
    stopType: string,
    previousStop: number,
    newStop: number,
    reason: string
  ): Promise<void> {
    try {
      await db.smartStopEvent.create({
        data: {
          tradeId: position.tradeId,
          pair: position.pair,
          stopType,
          previousStop: +previousStop.toFixed(2),
          newStop: +newStop.toFixed(2),
          triggerPrice: +position.currentPrice.toFixed(2),
          reason,
        },
      });
    } catch (err) {
      // Log but don't throw — stop management is more important than logging
      console.error(`[SMART-SL] Failed to log stop event: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
