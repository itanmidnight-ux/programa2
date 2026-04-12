// ============================================
// RECO-TRADING - Broker Manager
// ============================================
// Central manager that handles all broker operations.
// Currently supports OANDA as primary broker.
// All market data and trading operations go through here.
// ============================================

import type { Candle } from '@/lib/analysis-engine';
import type { IBroker, SymbolSpec, OrderResult, PositionData, AccountData, OrderBookData } from '@/lib/broker-interface';
import { getOandaBroker, OandaAdapter } from '@/lib/oanda-adapter';
import { getCTraderBroker, cTraderAdapter } from '@/lib/ctrader-adapter';

// ============================================
// Manager State
// ============================================

interface BrokerManagerState {
  activeBroker: 'oanda' | 'ctrader' | 'binance' | null;
  broker: IBroker | null;
  activeSymbol: string;
  connected: boolean;
}

const state: BrokerManagerState = {
  activeBroker: null,
  broker: null,
  activeSymbol: 'XAU_USD',
  connected: false,
};

// ============================================
// Initialization
// ============================================

/**
 * Initialize the broker manager with OANDA credentials.
 * Call this once at server startup.
 */
export async function initializeBroker(
  accountId: string,
  apiToken: string,
  isDemo: boolean = true,
  symbol: string = 'XAU_USD'
): Promise<{ success: boolean; message: string }> {
  try {
    const broker = getOandaBroker();
    broker.setCredentials(accountId, apiToken, isDemo);

    // Validate connection
    const result = await broker.validateCredentials();
    if (!result.valid) {
      return { success: false, message: result.message };
    }

    state.activeBroker = 'oanda';
    state.broker = broker;
    state.activeSymbol = symbol;
    state.connected = true;

    const accountData = await broker.getAccountData();
    console.log(`[BROKER] Initialized: OANDA (${isDemo ? 'Demo' : 'Live'}) | Symbol: ${symbol} | Balance: $${accountData.balance.toFixed(2)}`);

    return { success: true, message: result.message };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to initialize broker',
    };
  }
}

/**
 * Initialize the broker manager with cTrader Open API credentials.
 * Simpler setup - just App ID, App Secret, and cTrader ID.
 */
export async function initializeCTraderBroker(
  appId: string,
  appSecret: string,
  ctraderId: string,
  isDemo: boolean = true,
  symbol: string = 'EURUSD'
): Promise<{ success: boolean; message: string }> {
  try {
    const broker = getCTraderBroker();
    broker.setCredentials(`${appId}:${ctraderId}`, appSecret, isDemo);

    // Validate connection
    const result = await broker.validateCredentials();
    if (!result.valid) {
      return { success: false, message: result.message };
    }

    state.activeBroker = 'ctrader';
    state.broker = broker;
    state.activeSymbol = symbol;
    state.connected = true;

    const accountData = await broker.getAccountData();
    console.log(`[BROKER] Initialized: cTrader (${isDemo ? 'Demo' : 'Live'}) | Symbol: ${symbol} | Balance: ${accountData.balance} ${accountData.currency}`);

    return { success: true, message: result.message };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to initialize cTrader broker',
    };
  }
}

// ============================================
// Market Data (Unified Interface)
// ============================================

/** Get current price for active symbol */
export async function getTickerPrice(symbol?: string): Promise<number> {
  if (!state.broker) {
    console.error('[BROKER] No broker initialized');
    return 0;
  }
  try {
    return await state.broker.getPrice(symbol || state.activeSymbol);
  } catch (err) {
    console.error('[BROKER] Price fetch error:', err);
    return 0;
  }
}

/** Get kline/candlestick data */
export async function getKlines(symbol: string | undefined, timeframe: string, limit: number): Promise<Candle[]> {
  if (!state.broker) return [];
  try {
    return await state.broker.getKlines(symbol || state.activeSymbol, timeframe, limit);
  } catch (err) {
    console.error('[BROKER] Klines fetch error:', err);
    return [];
  }
}

/** Get order book data */
export async function getOrderBook(symbol: string | undefined, depth: number = 10): Promise<any> {
  if (!state.broker) return null;
  try {
    const ob = await state.broker.getOrderBook(symbol || state.activeSymbol, depth);
    return {
      bid: ob.bids[0]?.price || 0,
      ask: ob.asks[0]?.price || 0,
      spread: ob.spread,
      bidVolume: ob.bids[0]?.quantity || 0,
      askVolume: ob.asks[0]?.quantity || 0,
    };
  } catch (err) {
    console.error('[BROKER] Order book error:', err);
    return null;
  }
}

// ============================================
// Trading Operations
// ============================================

/** Place market order */
export async function placeMarketOrder(symbol: string | undefined, side: 'BUY' | 'SELL', quantity: number): Promise<OrderResult> {
  if (!state.broker) {
    return { success: false, symbol: symbol || '', side, type: 'MARKET', quantity, error: 'Broker not initialized' };
  }
  return state.broker.placeMarketOrder(symbol || state.activeSymbol, side, quantity);
}

/** Place limit order */
export async function placeLimitOrder(symbol: string | undefined, side: 'BUY' | 'SELL', quantity: number, price: number): Promise<OrderResult> {
  if (!state.broker) {
    return { success: false, symbol: symbol || '', side, type: 'LIMIT', quantity, price, error: 'Broker not initialized' };
  }
  return state.broker.placeLimitOrder(symbol || state.activeSymbol, side, quantity, price);
}

/** Place stop order */
export async function placeStopOrder(symbol: string | undefined, side: 'BUY' | 'SELL', quantity: number, stopPrice: number): Promise<OrderResult> {
  if (!state.broker) {
    return { success: false, symbol: symbol || '', side, type: 'STOP', quantity, price: stopPrice, error: 'Broker not initialized' };
  }
  return state.broker.placeStopOrder(symbol || state.activeSymbol, side, quantity, stopPrice);
}

/** Close position */
export async function closePosition(symbol: string | undefined, quantity: number): Promise<OrderResult> {
  if (!state.broker) {
    return { success: false, symbol: symbol || '', side: 'SELL', type: 'MARKET', quantity, error: 'Broker not initialized' };
  }
  return state.broker.closePosition(symbol || state.activeSymbol, quantity);
}

// ============================================
// Account Operations
// ============================================

/** Get account balance */
export async function getAccountBalance(): Promise<AccountData> {
  if (!state.broker) {
    return { balance: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0, currency: 'USD' };
  }
  return state.broker.getAccountData();
}

/** Get open positions */
export async function getOpenPositions(): Promise<PositionData[]> {
  if (!state.broker) return [];
  return state.broker.getOpenPositions();
}

// ============================================
// Utility Functions
// ============================================

/** Get active symbol */
export function getActiveSymbol(): string {
  return state.activeSymbol;
}

/** Get symbol specifications */
export async function getSymbolSpec(symbol?: string): Promise<SymbolSpec> {
  if (!state.broker) {
    return {
      symbol: symbol || 'XAU_USD', displayName: symbol || 'XAU/USD', category: 'metal',
      pipSize: 0.01, pipValue: 1, minLotSize: 0.01, maxLotSize: 100,
      lotStep: 0.01, contractSize: 1, tradingHours: '24/5',
      spreadTypical: 0.30, makerFee: 0, takerFee: 0,
    };
  }
  return state.broker.getSymbolSpec(symbol || state.activeSymbol);
}

/** Check if market is open for symbol */
export function isMarketOpen(symbol?: string): boolean {
  if (!state.broker) return true; // Assume open if no broker
  return state.broker.isMarketOpen(symbol || state.activeSymbol);
}

/** Check if broker is connected */
export function isBrokerConnected(): boolean {
  return state.connected && state.broker !== null;
}

/** Get broker name */
export function getBrokerName(): string {
  return state.activeBroker || 'none';
}

/** Get active broker instance (for advanced usage) */
export function getBroker(): IBroker | null {
  return state.broker;
}
