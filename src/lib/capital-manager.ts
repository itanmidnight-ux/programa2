// ============================================
// RECO-TRADING - Capital Manager
// ============================================
// Dynamic position sizing and capital management
// Adjusts risk based on market conditions,
// performance, and drawdown state
// ============================================

export type CapitalMode = "CONSERVATIVE" | "MEDIUM" | "AGGRESSIVE";

interface ClosedTrade {
  pnl: number;
  openedAt: Date;
  closedAt: Date | null;
}

export interface CapitalParams {
  min_confidence: number;
  risk_per_trade: number;
  max_trades_per_day: number;
}

export interface CapitalState {
  capital_mode: CapitalMode;
  current_capital: number;
  initial_capital: number;
  peak_capital: number;
  current_drawdown_pct: number;
  win_streak: number;
  loss_streak: number;
  daily_trades: number;
  market_condition: string;
  effective_params: CapitalParams;
}

const MODE_PARAMS: Record<CapitalMode, CapitalParams> = {
  CONSERVATIVE: { min_confidence: 0.70, risk_per_trade: 0.005, max_trades_per_day: 30 },
  MEDIUM: { min_confidence: 0.62, risk_per_trade: 0.010, max_trades_per_day: 80 },
  AGGRESSIVE: { min_confidence: 0.55, risk_per_trade: 0.020, max_trades_per_day: 120 },
};

export function getEffectiveParams(
  mode: CapitalMode,
  drawdownPct: number,
  lossStreak: number,
  marketCondition: string
): CapitalParams {
  // Clone base params to avoid mutating the global MODE_PARAMS object
  const base = { ...MODE_PARAMS[mode] };

  // Scale down on high drawdown
  if (drawdownPct > 5) {
    base.risk_per_trade *= 0.5;
    base.min_confidence += 0.08;
  } else if (drawdownPct > 3) {
    base.risk_per_trade *= 0.75;
    base.min_confidence += 0.04;
  }

  // Scale down on consecutive losses
  if (lossStreak >= 5) {
    base.risk_per_trade *= 0.3;
    base.min_confidence += 0.1;
  } else if (lossStreak >= 3) {
    base.risk_per_trade *= 0.5;
    base.min_confidence += 0.06;
  }

  // Scale for market conditions
  if (marketCondition === "VOLATILE" || marketCondition === "HIGH_RISK") {
    base.risk_per_trade *= 0.7;
    base.min_confidence += 0.05;
  } else if (marketCondition === "TRENDING") {
    base.risk_per_trade *= 1.1; // slight increase in good trends
  }

  return {
    min_confidence: +Math.min(0.95, base.min_confidence).toFixed(3),
    risk_per_trade: +base.risk_per_trade.toFixed(4),
    max_trades_per_day: base.max_trades_per_day,
  };
}

export function computeCapitalState(
  trades: ClosedTrade[],
  currentBalance: number,
  initialCapital: number,
  mode: CapitalMode,
  marketCondition: string
): CapitalState {
  const peakCapital = trades.reduce((peak, t) => {
    return peak + (t.pnl > 0 ? t.pnl : 0);
  }, initialCapital);

  const actualPeak = Math.max(peakCapital, currentBalance);
  const drawdownPct = actualPeak > 0 ? ((actualPeak - currentBalance) / actualPeak) * 100 : 0;

  // Calculate win/loss streaks from recent trades
  let winStreak = 0;
  let lossStreak = 0;
  let currentStreakType: "win" | "loss" | null = null;

  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].pnl > 0) {
      if (currentStreakType === "win" || currentStreakType === null) {
        winStreak++;
        currentStreakType = "win";
      } else break;
    } else if (trades[i].pnl < 0) {
      if (currentStreakType === "loss" || currentStreakType === null) {
        lossStreak++;
        currentStreakType = "loss";
      } else break;
    }
  }

  // Count trades today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyTrades = trades.filter(t => t.openedAt >= today).length;

  const effectiveParams = getEffectiveParams(mode, drawdownPct, lossStreak, marketCondition);

  return {
    capital_mode: mode,
    current_capital: +currentBalance.toFixed(2),
    initial_capital: initialCapital,
    peak_capital: +actualPeak.toFixed(2),
    current_drawdown_pct: +drawdownPct.toFixed(2),
    win_streak: winStreak,
    loss_streak: lossStreak,
    daily_trades: dailyTrades,
    market_condition: marketCondition,
    effective_params: effectiveParams,
  };
}
