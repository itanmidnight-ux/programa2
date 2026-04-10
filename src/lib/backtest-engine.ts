// ============================================
// RECO-TRADING - Backtesting Engine v1.0
// ============================================
// Backtesting completo con datos históricos de Binance
// Simula execution reales con delays, slippage y fees
// ============================================

import { getKlines } from './binance';
import { calculateRSI, calculateEMA, calculateATR, MarketRegime, detectMarketRegime, generateScalpingSignal, ScalpingSignal, predictProfitability } from './scalping-engine';

const DEFAULT_CONFIG = {
  MAKER_FEE: 0.0002,
  TAKER_FEE: 0.0004,
  SLIPPAGE: 0.0003,
};

export interface BacktestConfig {
  initialCapital: number;
  timeframe: string;
  startDate: string;
  endDate: string;
  pairs: string[];
  riskPerTrade: number;
  makerFee: number;
  takerFee: number;
  slippage: number;
  maxPositions: number;
}

export interface BacktestTrade {
  id: number;
  pair: string;
  side: 'LONG' | 'SHORT';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  slippage: number;
  duration: number;
  signal: ScalpingSignal;
}

export interface BacktestResult {
  config: BacktestConfig;
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnl: number;
    totalPnlPercent: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    avgTradeDuration: number;
    bestTrade: number;
    worstTrade: number;
  };
  equityCurve: { time: number; value: number }[];
  trades: BacktestTrade[];
  monthlyReturns: { month: string; return: number }[];
  pairPerformance: { pair: string; trades: number; pnl: number; winRate: number }[];
}

interface BacktestState {
  capital: number;
  position: { side: 'LONG' | 'SHORT'; entryPrice: number; quantity: number; entryTime: number } | null;
  trades: BacktestTrade[];
  equityCurve: { time: number; value: number }[];
  peakCapital: number;
  maxDrawdown: number;
}

function simulateSlippage(price: number, side: 'BUY' | 'SELL', slippagePercent: number): number {
  return side === 'BUY' ? price * (1 + slippagePercent) : price * (1 - slippagePercent);
}

function calculateFees(price: number, quantity: number, feeRate: number): number {
  return price * quantity * feeRate;
}

async function runBacktestForPair(
  pair: string,
  config: BacktestConfig,
  state: BacktestState
): Promise<void> {
  const candles = await getKlines(pair, config.timeframe, 500, false);
  
  if (candles.length < 100) {
    console.warn(`[BACKTEST] Insufficient data for ${pair}`);
    return;
  }
  
  let position: { side: 'LONG' | 'SHORT'; entryPrice: number; quantity: number; entryTime: number } | null = null;
  
  for (let i = 50; i < candles.length - 5; i++) {
    const slice = candles.slice(0, i + 1);
    const analysis = analyzeSlice(slice);
    
    const signal = generateScalpingSignalFromSlice(slice, analysis);
    
    // Entry logic
    if (!position && state.trades.length < 200) {
      if (signal.signal === 'BUY' && signal.mlProbability && signal.mlProbability > 0.55) {
        const entryPrice = simulateSlippage(slice[slice.length - 1].close, 'BUY', config.slippage);
        const riskAmount = state.capital * (config.riskPerTrade / 100);
        const quantity = riskAmount / (entryPrice * 0.02); // 2% stop loss
        
        position = {
          side: 'LONG',
          entryPrice,
          quantity,
          entryTime: candles[i].time * 1000,
        };
        
        state.capital -= calculateFees(entryPrice, quantity, config.takerFee);
      }
      else if (signal.signal === 'SELL' && signal.mlProbability && signal.mlProbability > 0.55) {
        const entryPrice = simulateSlippage(slice[slice.length - 1].close, 'SELL', config.slippage);
        const riskAmount = state.capital * (config.riskPerTrade / 100);
        const quantity = riskAmount / (entryPrice * 0.02);
        
        position = {
          side: 'SHORT',
          entryPrice,
          quantity,
          entryTime: candles[i].time * 1000,
        };
        
        state.capital -= calculateFees(entryPrice, quantity, config.takerFee);
      }
    }
    
    // Exit logic
    if (position) {
      const currentPrice = slice[slice.length - 1].close;
      const exitSignal = signal.signal === 'HOLD';
      
      const entryPct = Math.abs((currentPrice - position.entryPrice) / position.entryPrice);
      const tpHit = (position.side === 'LONG' && currentPrice > position.entryPrice * 1.008) ||
                    (position.side === 'SHORT' && currentPrice < position.entryPrice * 0.992);
      const slHit = (position.side === 'LONG' && currentPrice < position.entryPrice * 0.998) ||
                    (position.side === 'SHORT' && currentPrice > position.entryPrice * 1.002);
      
      if (tpHit || slHit || exitSignal || entryPct > 0.02) {
        const exitPrice = simulateSlippage(
          currentPrice,
          position.side === 'LONG' ? 'SELL' : 'BUY',
          config.slippage
        );
        
        const pnl = position.side === 'LONG'
          ? (exitPrice - position.entryPrice) * position.quantity
          : (position.entryPrice - exitPrice) * position.quantity;
        
        const fees = calculateFees(exitPrice, position.quantity, config.takerFee);
        const duration = (candles[i].time * 1000 - position.entryTime) / 1000 / 60;
        
        const trade: BacktestTrade = {
          id: state.trades.length + 1,
          pair,
          side: position.side,
          entryTime: position.entryTime,
          entryPrice: position.entryPrice,
          exitTime: candles[i].time * 1000,
          exitPrice,
          quantity: position.quantity,
          pnl: pnl - fees,
          pnlPercent: (pnl - fees) / (position.entryPrice * position.quantity) * 100,
          fees,
          slippage: Math.abs(exitPrice - currentPrice) * position.quantity,
          duration,
          signal,
        };
        
        state.trades.push(trade);
        state.capital += pnl - fees;
        state.capital -= fees;
        
        if (state.capital > state.peakCapital) {
          state.peakCapital = state.capital;
        }
        
        const drawdown = state.peakCapital - state.capital;
        if (drawdown > state.maxDrawdown) {
          state.maxDrawdown = drawdown;
        }
        
        position = null;
        
        state.equityCurve.push({
          time: candles[i].time * 1000,
          value: state.capital,
        });
      }
    }
  }
}

interface SliceAnalysis {
  rsi: number;
  atr: number;
  atrPct: number;
  volumeRatio: number;
  adx: number;
}

function analyzeSlice(candles: any[]): SliceAnalysis {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  const rsiValues = calculateRSI(closes, 14);
  const rsi = rsiValues[rsiValues.length - 1] || 50;
  
  const atrValues = calculateATR(candles, 14);
  const atr = atrValues[atrValues.length - 1] || 0;
  const currentPrice = closes[closes.length - 1];
  const atrPct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
  
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = volumes[volumes.length - 1] / avgVolume;
  
  // Simplified ADX (just trend strength)
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  let adx = 0;
  if (ema9.length > 1 && ema21.length > 1) {
    const emaDiff = Math.abs(ema9[ema9.length - 1] - ema21[ema21.length - 1]);
    adx = Math.min(50, emaDiff / currentPrice * 1000);
  }
  
  return { rsi, atr, atrPct, volumeRatio, adx };
}

function generateScalpingSignalFromSlice(candles: any[], analysis: SliceAnalysis): ScalpingSignal {
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  const regime = detectMarketRegime(candles, analysis.atrPct, analysis.adx);
  
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const rsiValues = calculateRSI(closes, 14);
  
  const ema9Val = ema9[ema9.length - 1];
  const ema21Val = ema21[ema21.length - 1];
  const rsiVal = rsiValues[rsiValues.length - 1];
  
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 0;
  const reasons: string[] = [];
  
  if (ema9Val > ema21Val && rsiVal > 30 && rsiVal < 55) {
    signal = 'BUY';
    confidence = 0.6;
    reasons.push('Bullish EMA cross');
  } else if (ema9Val < ema21Val && rsiVal > 45 && rsiVal < 70) {
    signal = 'SELL';
    confidence = 0.6;
    reasons.push('Bearish EMA cross');
  }
  
  const mlPred = predictProfitability(candles, analysis, regime);
  
  return {
    signal,
    confidence,
    reasons,
    ema9: ema9Val,
    ema21: ema21Val,
    rsi: rsiVal,
    tp: currentPrice * 1.005,
    sl: currentPrice * 0.998,
    riskReward: 1.5,
    regime,
    mlProbability: mlPred.probability,
    mlConfidence: mlPred.confidence,
    mlModelUsed: mlPred.modelUsed,
  };
}

export async function runBacktest(config: Partial<BacktestConfig> = {}): Promise<BacktestResult> {
  const fullConfig: BacktestConfig = {
    initialCapital: config.initialCapital || 1000,
    timeframe: config.timeframe || '5m',
    startDate: config.startDate || '',
    endDate: config.endDate || '',
    pairs: config.pairs || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    riskPerTrade: config.riskPerTrade || 1.0,
    makerFee: config.makerFee || 0.0002,
    takerFee: config.takerFee || 0.0004,
    slippage: config.slippage || 0.0003,
    maxPositions: config.maxPositions || 3,
  };
  
  console.log(`[BACKTEST] Starting backtest with capital: ${fullConfig.initialCapital}`);

  const DEFAULT_CONFIG = {
    MAKER_FEE: 0.0002,
    TAKER_FEE: 0.0004,
    SLIPPAGE: 0.0003,
  };

  const state: BacktestState = {
    capital: fullConfig.initialCapital,
    position: null,
    trades: [],
    equityCurve: [{ time: Date.now(), value: fullConfig.initialCapital }],
    peakCapital: fullConfig.initialCapital,
    maxDrawdown: 0,
  };
  
  for (const pair of fullConfig.pairs) {
    await runBacktestForPair(pair, fullConfig, state);
  }
  
  // Calculate summary statistics
  const winningTrades = state.trades.filter(t => t.pnl > 0);
  const losingTrades = state.trades.filter(t => t.pnl <= 0);
  const totalTrades = state.trades.length;
  const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0;
  
  const totalPnl = state.trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalPnlPercent = (totalPnl / fullConfig.initialCapital) * 100;
  
  const avgWin = winningTrades.length > 0 
    ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length 
    : 0;
  const avgLoss = losingTrades.length > 0 
    ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length 
    : 0;
  
  const profitFactor = Math.abs(avgLoss) > 0 
    ? (avgWin * winningTrades.length) / (Math.abs(avgLoss) * losingTrades.length) 
    : 0;
  
  const maxDrawdownPercent = (state.maxDrawdown / state.peakCapital) * 100;
  
  // Calculate Sharpe ratio
  const returns = state.equityCurve.slice(1).map((e, i) => 
    (e.value - state.equityCurve[i].value) / state.equityCurve[i].value
  );
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1 
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length 
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? (avgReturn * Math.sqrt(252) / stdDev) : 0;
  
  const avgDuration = totalTrades > 0 
    ? state.trades.reduce((sum, t) => sum + t.duration, 0) / totalTrades 
    : 0;
  
  const bestTrade = state.trades.length > 0 
    ? Math.max(...state.trades.map(t => t.pnl)) 
    : 0;
  const worstTrade = state.trades.length > 0 
    ? Math.min(...state.trades.map(t => t.pnl)) 
    : 0;
  
  // Monthly returns
  const monthlyMap = new Map<string, number>();
  for (const trade of state.trades) {
    const date = new Date(trade.exitTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + trade.pnl);
  }
  const monthlyReturns = Array.from(monthlyMap.entries())
    .map(([month, returnVal]) => ({ month, return: (returnVal / fullConfig.initialCapital) * 100 }))
    .sort((a, b) => a.month.localeCompare(b.month));
  
  // Pair performance
  const pairMap = new Map<string, { trades: number; pnl: number; wins: number }>();
  for (const trade of state.trades) {
    const existing = pairMap.get(trade.pair) || { trades: 0, pnl: 0, wins: 0 };
    existing.trades++;
    existing.pnl += trade.pnl;
    if (trade.pnl > 0) existing.wins++;
    pairMap.set(trade.pair, existing);
  }
  const pairPerformance = Array.from(pairMap.entries())
    .map(([pair, data]) => ({
      pair,
      trades: data.trades,
      pnl: data.pnl,
      winRate: data.trades > 0 ? data.wins / data.trades : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
  
  return {
    config: fullConfig,
    summary: {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnl,
      totalPnlPercent,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown: state.maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio: sharpe,
      avgTradeDuration: avgDuration,
      bestTrade,
      worstTrade,
    },
    equityCurve: state.equityCurve,
    trades: state.trades,
    monthlyReturns,
    pairPerformance,
  };
}

export function exportBacktestResults(result: BacktestResult): string {
  const lines: string[] = [];
  
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('RECO-TRADING BACKTEST RESULTS');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Initial Capital: $${result.config.initialCapital}`);
  lines.push(`Timeframe: ${result.config.timeframe}`);
  lines.push(`Pairs: ${result.config.pairs.join(', ')}`);
  lines.push('');
  lines.push('────────────────── SUMMARY ──────────────────');
  lines.push(`Total Trades: ${result.summary.totalTrades}`);
  lines.push(`Win Rate: ${(result.summary.winRate * 100).toFixed(1)}%`);
  lines.push(`Total PnL: $${result.summary.totalPnl.toFixed(2)} (${result.summary.totalPnlPercent.toFixed(2)}%)`);
  lines.push(`Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  lines.push(`Max Drawdown: $${result.summary.maxDrawdown.toFixed(2)} (${result.summary.maxDrawdownPercent.toFixed(2)}%)`);
  lines.push(`Sharpe Ratio: ${result.summary.sharpeRatio.toFixed(2)}`);
  lines.push('');
  lines.push('────────────────── TRADES ───────────────────');
  
  for (const trade of result.trades.slice(0, 20)) {
    const side = trade.side.padEnd(5);
    const pnlStr = trade.pnl >= 0 ? `+$${trade.pnl.toFixed(2)}` : `-$${Math.abs(trade.pnl).toFixed(2)}`;
    lines.push(`${side} ${trade.pair} ${pnlStr} (${trade.pnlPercent.toFixed(2)}%) | ${trade.duration.toFixed(1)}min`);
  }
  
  if (result.trades.length > 20) {
    lines.push(`... and ${result.trades.length - 20} more trades`);
  }
  
  return lines.join('\n');
}