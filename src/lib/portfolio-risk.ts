// ============================================
// RECO-TRADING - Portfolio Risk Manager v1.0
// ============================================
// Análisis de riesgo a nivel de portfolio
// Incluye VaR, drawdown, correlación y límites de exposición
// ============================================

import { getAllPrices, POPULAR_PAIRS } from './binance';

export interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  side: 'LONG' | 'SHORT';
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

export interface PortfolioMetrics {
  totalValue: number;
  totalUnrealizedPnl: number;
  totalPnlPercent: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  openPositions: number;
  var95: number;  // Value at Risk 95%
  var99: number;  // Value at Risk 99%
}

export interface RiskLimits {
  maxExposurePerPair: number;    // Max % of portfolio per pair
  maxTotalExposure: number;       // Max % of portfolio in open positions
  maxDailyLoss: number;           // Max daily loss $ (trading halt)
  maxDrawdown: number;           // Max drawdown % (trading halt)
  maxPositions: number;           // Max concurrent positions
  minCashReserve: number;        // Min cash % to keep
}

export interface AllocationRecommendation {
  symbol: string;
  recommendedSize: number;
  riskScore: number;
  reason: string;
}

const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxExposurePerPair: 0.20,       // 20% max per pair
  maxTotalExposure: 0.60,         // 60% max total
  maxDailyLoss: 100,              // $100 max daily loss
  maxDrawdown: 10,                // 10% max drawdown
  maxPositions: 5,                // 5 max positions
  minCashReserve: 0.40,           // 40% cash reserve
};

let portfolioHistory: { timestamp: number; value: number }[] = [];
let dailyPnL = 0;
let dailyStartValue = 0;
let positions: Position[] = [];

export function setPositions(newPositions: Position[]): void {
  positions = newPositions;
}

export function getPositions(): Position[] {
  return [...positions];
}

export function resetDailyPnL(totalPortfolioValue: number): void {
  dailyPnL = 0;
  dailyStartValue = totalPortfolioValue;
  portfolioHistory = [];
}

export function recordPortfolioValue(value: number): void {
  const timestamp = Date.now();
  portfolioHistory.push({ timestamp, value });
  
  // Keep last 1000 records
  if (portfolioHistory.length > 1000) {
    portfolioHistory.shift();
  }
  
  // Calculate daily PnL
  if (dailyStartValue > 0) {
    dailyPnL = value - dailyStartValue;
  }
}

function calculateMaxDrawdown(): { absolute: number; percent: number } {
  if (portfolioHistory.length < 2) return { absolute: 0, percent: 0 };
  
  let maxValue = portfolioHistory[0].value;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  
  for (const point of portfolioHistory) {
    if (point.value > maxValue) {
      maxValue = point.value;
    }
    const drawdown = maxValue - point.value;
    const drawdownPercent = maxValue > 0 ? (drawdown / maxValue) * 100 : 0;
    
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
    }
  }
  
  return { absolute: maxDrawdown, percent: maxDrawdownPercent };
}

function calculateVaR(returns: number[], confidence: number): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  return sorted[index] || 0;
}

function calculateReturns(): number[] {
  if (portfolioHistory.length < 2) return [];
  
  const returns: number[] = [];
  for (let i = 1; i < portfolioHistory.length; i++) {
    const prev = portfolioHistory[i - 1].value;
    const curr = portfolioHistory[i].value;
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

function calculateSharpeRatio(returns: number[], riskFreeRate = 0.02): number {
  if (returns.length < 2) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualize (assuming 1-min data points ~ 525600 per year)
  const annualizedReturn = avgReturn * 525600;
  const annualizedStdDev = stdDev * Math.sqrt(525600);
  
  return (annualizedReturn - riskFreeRate) / annualizedStdDev;
}

export async function calculatePortfolioMetrics(
  totalValue: number,
  openPositions: Position[],
  totalTrades: number,
  wins: number
): Promise<PortfolioMetrics> {
  const allPositions = openPositions.length > 0 ? openPositions : positions;
  
  const totalUnrealized = allPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const dailyPnlValue = dailyStartValue > 0 ? totalValue - dailyStartValue : dailyPnL;
  const dailyPnlPct = dailyStartValue > 0 ? (dailyPnlValue / dailyStartValue) * 100 : 0;
  
  const { absolute: maxDrawdown, percent: maxDrawdownPercent } = calculateMaxDrawdown();
  const returns = calculateReturns();
  
  // Calculate VaR
  const var95 = calculateVaR(returns, 0.95) * totalValue;
  const var99 = calculateVaR(returns, 0.99) * totalValue;
  
  // Calculate Sharpe
  const sharpe = calculateSharpeRatio(returns);
  
  const totalPnlPct = totalValue > 0 ? (totalUnrealized / (totalValue - totalUnrealized)) * 100 : 0;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  
  return {
    totalValue,
    totalUnrealizedPnl: totalUnrealized,
    totalPnlPercent: totalPnlPct,
    dailyPnl: dailyPnlValue,
    dailyPnlPercent: dailyPnlPct,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio: sharpe,
    winRate,
    totalTrades,
    openPositions: allPositions.length,
    var95,
    var99,
  };
}

export function checkRiskLimits(
  metrics: PortfolioMetrics,
  limits: RiskLimits = DEFAULT_RISK_LIMITS
): { allowed: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check daily loss limit
  if (metrics.dailyPnl < -limits.maxDailyLoss) {
    violations.push(`Daily loss ${metrics.dailyPnl.toFixed(2)} exceeds limit -${limits.maxDailyLoss}`);
  }
  
  // Check max drawdown
  if (metrics.maxDrawdownPercent > limits.maxDrawdown) {
    violations.push(`Max drawdown ${metrics.maxDrawdownPercent.toFixed(1)}% exceeds limit ${limits.maxDrawdown}%`);
  }
  
  // Check max positions
  if (metrics.openPositions >= limits.maxPositions) {
    violations.push(`Open positions ${metrics.openPositions} at max limit ${limits.maxPositions}`);
  }
  
  // Check total exposure
  const totalExposure = metrics.totalValue > 0 
    ? (metrics.totalValue - metrics.totalUnrealizedPnl) / metrics.totalValue 
    : 0;
  
  if (totalExposure > limits.maxTotalExposure) {
    violations.push(`Total exposure ${((1 - totalExposure) * 100).toFixed(0)}% exceeds max ${limits.maxTotalExposure * 100}%`);
  }
  
  return {
    allowed: violations.length === 0,
    violations,
  };
}

export async function getAllocationRecommendations(
  portfolioValue: number,
  currentPositions: Position[],
  riskLevel: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
): Promise<AllocationRecommendation[]> {
  const prices = await getAllPrices(false);
  const recommendations: AllocationRecommendation[] = [];
  
  const maxPositions = riskLevel === 'conservative' ? 3 : riskLevel === 'moderate' ? 5 : 8;
  const maxPerPosition = riskLevel === 'conservative' ? 0.15 : riskLevel === 'moderate' ? 0.20 : 0.25;
  
  const currentSymbols = new Set(currentPositions.map(p => p.symbol));
  
  const scored: { symbol: string; price: number; score: number; change: number }[] = [];
  
  for (const [symbol, data] of Object.entries(prices)) {
    if (currentSymbols.has(symbol)) continue;
    
    const change24h = data.change24h || 0;
    const volatility = Math.abs(change24h);
    
    // Score based on: strong trend + moderate volatility
    let score = 0;
    if (change24h > 2 && change24h < 10) score += 3;
    else if (change24h > 0.5) score += 1;
    if (volatility > 1 && volatility < 8) score += 2;
    if (volatility > 0.5) score += 1;
    
    scored.push({ symbol, price: data.price, score, change: change24h });
  }
  
  scored.sort((a, b) => b.score - a.score);
  
  const availableSlots = maxPositions - currentPositions.length;
  
  for (let i = 0; i < Math.min(availableSlots, scored.length); i++) {
    const item = scored[i];
    const recommendedSize = portfolioValue * maxPerPosition;
    
    let reason = '';
    if (item.change > 2) reason = 'Strong momentum';
    else if (item.change > 0.5) reason = 'Positive trend';
    else reason = 'Moderate opportunity';
    
    recommendations.push({
      symbol: item.symbol,
      recommendedSize,
      riskScore: item.score / 10,
      reason,
    });
  }
  
  return recommendations;
}

export function calculatePositionSize(
  portfolioValue: number,
  entryPrice: number,
  stopLossPercent: number,
  riskPercent: number = 1.0
): number {
  const riskAmount = portfolioValue * (riskPercent / 100);
  const stopLossDistance = entryPrice * (stopLossPercent / 100);
  
  if (stopLossDistance === 0) return 0;
  
  return Math.floor(riskAmount / stopLossDistance);
}

export function getRiskLimits(): RiskLimits {
  return { ...DEFAULT_RISK_LIMITS };
}

export function updateRiskLimits(newLimits: Partial<RiskLimits>): void {
  Object.assign(DEFAULT_RISK_LIMITS, newLimits);
}

export function getPortfolioSummary(): {
  positions: number;
  dailyPnL: number;
  maxDrawdown: number;
  var95: number;
} {
  const { absolute: maxDD } = calculateMaxDrawdown();
  const returns = calculateReturns();
  const var95Val = calculateVaR(returns, 0.95) * (positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0) || 1000);
  
  return {
    positions: positions.length,
    dailyPnL,
    maxDrawdown: maxDD,
    var95: var95Val,
  };
}