// ============================================
// RECO-TRADING - Universal Broker Interface
// ============================================
// Abstract interface that all brokers must implement.
// Allows the trading engine to work with any broker
// (Binance, OANDA, etc.) without code changes.
// ============================================

import type { Candle } from '@/lib/analysis-engine';

// ============================================
// Universal Types
// ============================================

export interface SymbolSpec {
  symbol: string;
  displayName: string;
  category: 'crypto' | 'forex' | 'metal' | 'energy' | 'index';
  pipSize: number;
  pipValue: number;
  minLotSize: number;
  maxLotSize: number;
  lotStep: number;
  contractSize: number;
  tradingHours: '24/7' | '24/5' | 'market_hours';
  spreadTypical: number;
  makerFee: number;
  takerFee: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  quantity: number;
  price?: number;
  fillPrice?: number;
  status?: string;
  error?: string;
  fills?: Array<{ price: string; quantity: string; commission: string }>;
}

export interface PositionData {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  unrealizedPnl: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: Date;
}

export interface AccountData {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
}

export interface OrderBookData {
  symbol: string;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  spread: number;
}

// ============================================
// Broker Interface
// ============================================

export interface IBroker {
  // Identification
  getBrokerName(): string;
  getSupportedSymbols(): Promise<string[]>;
  getSymbolSpec(symbol: string): Promise<SymbolSpec>;

  // Market Data
  getPrice(symbol: string): Promise<number>;
  getBatchPrices(symbols: string[]): Promise<Record<string, number>>;
  getKlines(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBookData>;

  // Trading
  placeMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number): Promise<OrderResult>;
  placeLimitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number): Promise<OrderResult>;
  placeStopOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, stopPrice: number): Promise<OrderResult>;
  closePosition(symbol: string, quantity: number): Promise<OrderResult>;
  cancelOrder(symbol: string, orderId: string): Promise<boolean>;

  // Account
  getAccountData(): Promise<AccountData>;
  getOpenPositions(): Promise<PositionData[]>;
  getBalance(): Promise<number>;

  // Market Status
  isMarketOpen(symbol: string): boolean;
  isConnected(): boolean;

  // Credentials
  setCredentials(accountId: string, apiToken: string, isDemo: boolean): void;
  validateCredentials(): Promise<{ valid: boolean; message: string }>;
}
