// ============================================
// RECO-TRADING - Paper Trading Mode v1.0
// ============================================
// Simula trading sin dinero real
// Mantiene estado de portfolio virtual y ejecuta señales
// ============================================

import { getKlines, getTickerPrice, getOrderBook, get24hTicker } from './binance';
import { generateScalpingSignal, calculateRSI, calculateEMA, calculateATR, detectMarketRegime, MarketRegime } from './scalping-engine';

export interface PaperPosition {
  id: string;
  pair: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  entryTime: number;
  tp: number;
  sl: number;
  status: 'OPEN' | 'CLOSED';
  pnl: number;
  pnlPercent: number;
  closeReason: string;
  closeTime?: number;
  closePrice?: number;
}

export interface PaperOrder {
  id: string;
  pair: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  filledPrice?: number;
  filledTime?: number;
  createdAt: number;
}

export interface PaperAccount {
  balance: number;
  initialBalance: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  closedPositions: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  peakBalance: number;
  maxDrawdown: number;
}

export interface PaperTradingConfig {
  initialBalance: number;
  maxPositions: number;
  riskPerTrade: number;
  tpPercent: number;
  slPercent: number;
  makerFee: number;
  takerFee: number;
  slippage: number;
}

const DEFAULT_CONFIG: PaperTradingConfig = {
  initialBalance: 10000,
  maxPositions: 3,
  riskPerTrade: 1.0,
  tpPercent: 0.5,
  slPercent: 0.2,
  makerFee: 0.0002,
  takerFee: 0.0004,
  slippage: 0.0003,
};

let account: PaperAccount;
let positions: PaperPosition[] = [];
let orders: PaperOrder[] = [];
let config: PaperTradingConfig = { ...DEFAULT_CONFIG };
let isRunning = false;
let lastUpdateTime = 0;

export function initializePaperTrading(initialBalance?: number): void {
  config = { ...DEFAULT_CONFIG };
  if (initialBalance) config.initialBalance = initialBalance;
  
  account = {
    balance: config.initialBalance,
    initialBalance: config.initialBalance,
    totalPnl: 0,
    totalPnlPercent: 0,
    openPositions: 0,
    closedPositions: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    peakBalance: config.initialBalance,
    maxDrawdown: 0,
  };
  
  positions = [];
  orders = [];
  isRunning = false;
  
  console.log(`[PAPER] Initialized with balance: $${config.initialBalance}`);
}

export function updateConfig(newConfig: Partial<PaperTradingConfig>): void {
  config = { ...config, ...newConfig };
  console.log('[PAPER] Config updated:', config);
}

export function getAccount(): PaperAccount {
  return { ...account };
}

export function getOpenPositions(): PaperPosition[] {
  return positions.filter(p => p.status === 'OPEN');
}

export function getClosedPositions(): PaperPosition[] {
  return positions.filter(p => p.status === 'CLOSED');
}

export function getPendingOrders(): PaperOrder[] {
  return orders.filter(o => o.status === 'PENDING');
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function simulateMarketOrder(side: 'BUY' | 'SELL', price: number): number {
  const slippage = config.slippage;
  return side === 'BUY' ? price * (1 + slippage) : price * (1 - slippage);
}

export function placeMarketOrder(
  pair: string,
  side: 'BUY' | 'SELL',
  quantity: number
): { success: boolean; order?: PaperOrder; error?: string } {
  if (account.openPositions >= config.maxPositions) {
    return { success: false, error: 'Max positions reached' };
  }
  
  if (side === 'BUY' && quantity * getCurrentPriceSync(pair) > account.balance) {
    return { success: false, error: 'Insufficient balance' };
  }
  
  const order: PaperOrder = {
    id: generateId(),
    pair,
    side,
    type: 'MARKET',
    quantity,
    status: 'FILLED',
    filledPrice: simulateMarketOrder(side, getCurrentPriceSync(pair)),
    filledTime: Date.now(),
    createdAt: Date.now(),
  };
  
  orders.push(order);
  
  if (side === 'BUY') {
    const entryPrice = order.filledPrice!;
    const tp = entryPrice * (1 + config.tpPercent / 100);
    const sl = entryPrice * (1 - config.slPercent / 100);
    
    const position: PaperPosition = {
      id: generateId(),
      pair,
      side: 'LONG',
      quantity,
      entryPrice,
      entryTime: Date.now(),
      tp,
      sl,
      status: 'OPEN',
      pnl: 0,
      pnlPercent: 0,
      closeReason: '',
    };
    
    positions.push(position);
    account.openPositions++;
    account.balance -= entryPrice * quantity;
    account.balance -= entryPrice * quantity * config.takerFee;
  }
  
  return { success: true, order };
}

export function placeLimitOrder(
  pair: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number
): { success: boolean; order?: PaperOrder; error?: string } {
  if (account.openPositions >= config.maxPositions) {
    return { success: false, error: 'Max positions reached' };
  }
  
  const order: PaperOrder = {
    id: generateId(),
    pair,
    side,
    type: 'LIMIT',
    quantity,
    price,
    status: 'PENDING',
    createdAt: Date.now(),
  };
  
  orders.push(order);
  return { success: true, order };
}

export function cancelOrder(orderId: string): boolean {
  const order = orders.find(o => o.id === orderId && o.status === 'PENDING');
  if (order) {
    order.status = 'CANCELLED';
    return true;
  }
  return false;
}

const lastPrices: Record<string, number> = {};

function getCurrentPriceSync(pair: string): number {
  return lastPrices[pair] || 100;
}

export async function updateMarketPrices(pairs: string[]): Promise<void> {
  for (const pair of pairs) {
    try {
      const price = await getTickerPrice(pair, false);
      lastPrices[pair] = price;
    } catch {
      // Keep previous price on error
    }
  }
}

export function checkAndClosePositions(): { closed: number; pnl: number } {
  let closed = 0;
  let totalPnl = 0;
  
  for (const position of positions) {
    if (position.status !== 'OPEN') continue;
    
    const currentPrice = getCurrentPriceSync(position.pair);
    let closePosition = false;
    let closeReason = '';
    
    if (position.side === 'LONG') {
      if (currentPrice >= position.tp) {
        closePosition = true;
        closeReason = 'TP HIT';
      } else if (currentPrice <= position.sl) {
        closePosition = true;
        closeReason = 'SL HIT';
      }
    } else {
      if (currentPrice <= position.tp) {
        closePosition = true;
        closeReason = 'TP HIT';
      } else if (currentPrice >= position.sl) {
        closePosition = true;
        closeReason = 'SL HIT';
      }
    }
    
    if (closePosition) {
      const exitPrice = simulateMarketOrder(
        position.side === 'LONG' ? 'SELL' : 'BUY',
        currentPrice
      );
      
      const pnl = position.side === 'LONG'
        ? (exitPrice - position.entryPrice) * position.quantity
        : (position.entryPrice - exitPrice) * position.quantity;
      
      const fees = exitPrice * position.quantity * config.takerFee;
      const netPnl = pnl - fees;
      const pnlPercent = (netPnl / (position.entryPrice * position.quantity)) * 100;
      
      position.status = 'CLOSED';
      position.pnl = netPnl;
      position.pnlPercent = pnlPercent;
      position.closeReason = closeReason;
      position.closeTime = Date.now();
      position.closePrice = exitPrice;
      
      account.balance += position.entryPrice * position.quantity;
      account.balance += netPnl;
      account.balance -= fees;
      
      account.closedPositions++;
      account.totalTrades++;
      account.totalPnl += netPnl;
      
      if (netPnl > 0) {
        account.winningTrades++;
      } else {
        account.losingTrades++;
      }
      
      if (account.balance > account.peakBalance) {
        account.peakBalance = account.balance;
      }
      
      const drawdown = account.peakBalance - account.balance;
      if (drawdown > account.maxDrawdown) {
        account.maxDrawdown = drawdown;
      }
      
      totalPnl += netPnl;
      closed++;
    }
  }
  
  return { closed, pnl: totalPnl };
}

export async function tick(pairs: string[]): Promise<{
  account: PaperAccount;
  positions: PaperPosition[];
  signals: { pair: string; signal: string; price: number; mlProb: number }[];
}> {
  await updateMarketPrices(pairs);
  
  const results = checkAndClosePositions();
  if (results.closed > 0) {
    console.log(`[PAPER] Closed ${results.closed} positions, PnL: $${results.pnl.toFixed(2)}`);
  }
  
  const signals: { pair: string; signal: string; price: number; mlProb: number }[] = [];
  
  for (const pair of pairs) {
    if (account.openPositions >= config.maxPositions) break;
    
    try {
      const candles = await getKlines(pair, '5m', 50, false);
      if (candles.length < 30) continue;
      
      const analysis = analyzeForPaper(candles);
      const signal = generateScalpingSignal(candles, analysis);
      
      const currentPrice = getCurrentPriceSync(pair);
      
      signals.push({
        pair,
        signal: signal.signal,
        price: currentPrice,
        mlProb: signal.mlProbability || 0,
      });
      
      if (signal.signal !== 'HOLD' && signal.mlProbability && signal.mlProbability > 0.55) {
        const riskAmount = account.balance * (config.riskPerTrade / 100);
        const quantity = riskAmount / currentPrice;
        
        const result = placeMarketOrder(pair, 'BUY', quantity);
        if (result.success) {
          console.log(`[PAPER] Opened position: ${pair} ${signal.signal} @ $${currentPrice.toFixed(2)}`);
        }
      }
    } catch (e) {
      console.warn(`[PAPER] Error processing ${pair}:`, e);
    }
  }
  
  account.totalPnlPercent = ((account.balance - account.initialBalance) / account.initialBalance) * 100;
  account.winRate = account.totalTrades > 0 ? account.winningTrades / account.totalTrades : 0;
  
  return {
    account: { ...account },
    positions: getOpenPositions(),
    signals,
  };
}

function analyzeForPaper(candles: any[]): any {
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
  
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema9Val = ema9[ema9.length - 1] || currentPrice;
  const ema21Val = ema21[ema21.length - 1] || currentPrice;
  const adx = Math.min(50, Math.abs(ema9Val - ema21Val) / currentPrice * 1000);
  
  const regime = detectMarketRegime(candles, atrPct, adx);
  
  return { rsi, atr, atrPct, volumeRatio, adx, regime, price: currentPrice };
}

export function getPerformanceSummary(): string {
  const lines: string[] = [];
  
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('PAPER TRADING PERFORMANCE');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Balance: $${account.balance.toFixed(2)}`);
  lines.push(`Total PnL: $${account.totalPnl.toFixed(2)} (${account.totalPnlPercent.toFixed(2)}%)`);
  lines.push(`Win Rate: ${(account.winRate * 100).toFixed(1)}%`);
  lines.push(`Total Trades: ${account.totalTrades}`);
  lines.push(`Open Positions: ${account.openPositions}`);
  lines.push(`Peak Balance: $${account.peakBalance.toFixed(2)}`);
  lines.push(`Max Drawdown: $${account.maxDrawdown.toFixed(2)}`);
  lines.push('');
  lines.push('────────────── OPEN POSITIONS ──────────────');
  
  for (const pos of getOpenPositions()) {
    const currentPrice = getCurrentPriceSync(pos.pair);
    const unrealized = pos.side === 'LONG'
      ? (currentPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - currentPrice) * pos.quantity;
    
    lines.push(`${pos.pair} ${pos.side} @ $${pos.entryPrice.toFixed(2)} | Now: $${currentPrice.toFixed(2)} | PnL: $${unrealized.toFixed(2)}`);
  }
  
  return lines.join('\n');
}

export function startPaperTrading(pairs: string[], intervalMs: number = 30000): () => void {
  if (isRunning) {
    console.log('[PAPER] Already running');
    return () => {};
  }
  
  isRunning = true;
  lastUpdateTime = Date.now();
  
  console.log(`[PAPER] Started with pairs: ${pairs.join(', ')}`);
  
  const interval = setInterval(async () => {
    if (!isRunning) return;
    try {
      await tick(pairs);
    } catch (e) {
      console.error('[PAPER] Tick error:', e);
    }
  }, intervalMs);
  
  return () => {
    isRunning = false;
    clearInterval(interval);
    console.log('[PAPER] Stopped');
  };
}

export function isPaperTrading(): boolean {
  return isRunning;
}

export function resetPaperTrading(): void {
  initializePaperTrading(config.initialBalance);
  console.log('[PAPER] Reset complete');
}

export function exportTradesCSV(): string {
  const closed = getClosedPositions();
  
  let csv = 'ID,Pair,Side,EntryTime,EntryPrice,CloseTime,ClosePrice,Quantity,PnL,PnLPercent,Reason\n';
  
  for (const pos of closed) {
    csv += `${pos.id},${pos.pair},${pos.side},${pos.entryTime},${pos.entryPrice},${pos.closeTime},${pos.closePrice},${pos.quantity},${pos.pnl.toFixed(2)},${pos.pnlPercent.toFixed(2)},${pos.closeReason}\n`;
  }
  
  return csv;
}