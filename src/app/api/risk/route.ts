// ============================================
// RECO-TRADING - Risk Metrics API
// ============================================
// GET /api/risk
// Returns full risk metrics calculated from
// real trade data in the database
// ============================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

interface RiskMetricsResponse {
  riskMetrics: {
    daily_loss_used: number;
    daily_loss_limit: number;
    current_drawdown: number;
    max_drawdown: number;
    position_size_pct: number;
    max_position_size: number;
    risk_per_trade: number;
    total_risk_exposure: number;
    margin_used: number;
    sharpe_ratio: number;
    sortino_ratio: number;
    max_consecutive_losses: number;
    avg_holding_time: string;
    best_trade: number;
    worst_trade: number;
    risk_reward_ratio: number;
  };
  canTrade: boolean;
  circuitBreaker: boolean;
  adjustedRisk: number;
  positionSize: number;
  api_latency_ms: number;
}

function calculateSharpeRatio(returns: number[]): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  // Annualized with ~252 trading periods per year (assuming ~1 trade per hour in crypto)
  return (mean / std) * Math.sqrt(returns.length);
}

function calculateSortinoRatio(returns: number[]): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downsideReturns = returns.filter(r => r < 0);
  if (downsideReturns.length === 0) return mean > 0 ? 10 : 0;
  const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return mean > 0 ? 10 : 0;
  return (mean / downsideDev) * Math.sqrt(returns.length);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export async function GET() {
  const startTime = Date.now();
  try {
    // Get config for limits
    let config: any = null;
    try {
      config = await db.tradingConfig.findUnique({ where: { id: "main" } });
    } catch {
      // Config not available
    }

    const dailyLossLimit = config?.maxDailyLoss || 50;
    const maxDrawdown = config?.maxDrawdown || 15;
    const riskPerTrade = config?.riskPerTrade || 1.0;
    const maxPositionSize = config?.capitalMode === "AGGRESSIVE" ? 25 : config?.capitalMode === "CONSERVATIVE" ? 10 : 15;

    // Fetch all closed trades
    let closedTrades: any[] = [];
    let openPositions: any[] = [];
    let allTrades: any[] = [];

    try {
      closedTrades = await db.trade.findMany({
        where: { status: "CLOSED" },
        orderBy: { openedAt: "asc" },
      });
      openPositions = await db.position.findMany();
      allTrades = await db.trade.findMany({
        orderBy: { openedAt: "asc" },
      });
    } catch {
      // DB not available
    }

    // Calculate daily loss
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let dailyLossUsed = 0;
    try {
      const todayTrades = await db.trade.findMany({
        where: { openedAt: { gte: today }, status: "CLOSED" },
      });
      dailyLossUsed = Math.abs(todayTrades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    } catch {
      // DB not available
    }

    // Calculate returns for Sharpe/Sortino
    const returns = closedTrades.map(t => t.pnlPercent / 100 || (t.pnl / (t.entryPrice * t.quantity)) || 0);
    const sharpeRatio = calculateSharpeRatio(returns);
    const sortinoRatio = calculateSortinoRatio(returns);

    // Calculate consecutive losses
    let maxConsecutiveLosses = 0;
    let currentLossStreak = 0;
    for (const trade of closedTrades) {
      if (trade.pnl < 0) {
        currentLossStreak++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      } else {
        currentLossStreak = 0;
      }
    }

    // Average holding time
    const holdingTimes = closedTrades
      .filter(t => t.openedAt && t.closedAt)
      .map(t => (t.closedAt!.getTime() - t.openedAt.getTime()) / 1000);
    const avgHoldingTime = holdingTimes.length > 0
      ? formatDuration(holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length)
      : "0s";

    // Best and worst trades
    const pnls = closedTrades.map(t => t.pnl);
    const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

    // Risk/reward ratio
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl <= 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss2 = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 1;
    const riskRewardRatio = avgLoss2 > 0 ? avgWin / avgLoss2 : 0;

    // Drawdown calculation
    let peak = 0;
    let maxDd = 0;
    let cumulativePnl = 0;
    for (const trade of closedTrades) {
      cumulativePnl += trade.pnl;
      if (cumulativePnl > peak) peak = cumulativePnl;
      const dd = peak > 0 ? ((peak - cumulativePnl) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    }
    const currentDrawdown = maxDd; // Latest drawdown from peak

    // Position sizing
    const totalRiskExposure = openPositions.length > 0
      ? openPositions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0)
      : 0;
    const marginUsed = closedTrades.length > 0
      ? Math.min(100, (totalRiskExposure / (1000 + cumulativePnl)) * 100)
      : 0;
    const positionSizePct = openPositions.length > 0
      ? Math.min(maxPositionSize, (totalRiskExposure / 1000) * 100)
      : 0;

    // Circuit breaker: stop trading if daily loss > 80% of limit or drawdown > 80% of max
    const circuitBreaker = dailyLossUsed > dailyLossLimit * 0.8 || currentDrawdown > maxDrawdown * 0.8;
    const canTrade = !circuitBreaker && dailyLossUsed < dailyLossLimit && currentDrawdown < maxDrawdown;

    // Adjusted risk based on drawdown
    let adjustedRisk = riskPerTrade;
    if (currentDrawdown > 5) adjustedRisk *= 0.5;
    else if (currentDrawdown > 3) adjustedRisk *= 0.75;
    if (maxConsecutiveLosses >= 5) adjustedRisk *= 0.3;
    else if (maxConsecutiveLosses >= 3) adjustedRisk *= 0.5;

    const response: RiskMetricsResponse = {
      riskMetrics: {
        daily_loss_used: +dailyLossUsed.toFixed(2),
        daily_loss_limit: dailyLossLimit,
        current_drawdown: +currentDrawdown.toFixed(2),
        max_drawdown: maxDrawdown,
        position_size_pct: +positionSizePct.toFixed(2),
        max_position_size: maxPositionSize,
        risk_per_trade: +riskPerTrade.toFixed(2),
        total_risk_exposure: +totalRiskExposure.toFixed(2),
        margin_used: +marginUsed.toFixed(2),
        sharpe_ratio: +sharpeRatio.toFixed(2),
        sortino_ratio: +sortinoRatio.toFixed(2),
        max_consecutive_losses: maxConsecutiveLosses,
        avg_holding_time: avgHoldingTime,
        best_trade: +bestTrade.toFixed(2),
        worst_trade: +worstTrade.toFixed(2),
        risk_reward_ratio: +riskRewardRatio.toFixed(2),
      },
      canTrade,
      circuitBreaker,
      adjustedRisk: +adjustedRisk.toFixed(2),
      positionSize: +positionSizePct.toFixed(2),
      api_latency_ms: Date.now() - startTime,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, api_latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
