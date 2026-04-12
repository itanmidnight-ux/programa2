// ============================================
// RECO-TRADING - Market Bridge (Binance-compatible signatures)
// ============================================
// Provides compatibility wrappers for modules that still call
// old Binance-shaped functions while executing through broker-manager.
// ============================================

import {
  getKlines as bmGetKlines,
  getOrderBook as bmGetOrderBook,
  getTickerPrice as bmGetTickerPrice,
  placeLimitOrder as bmPlaceLimitOrder,
} from '@/lib/broker-manager';
import { getOandaCredentials } from '@/lib/oanda-credentials';

function normalizeSymbol(symbol: string): string {
  return (symbol || 'XAU_USD').replace('/', '_').toUpperCase();
}

export function isTestnetMode(): boolean {
  return process.env.OANDA_IS_DEMO !== 'false';
}

export function getCurrentCredentials(): { apiKey: string; apiSecret: string } {
  const creds = getOandaCredentials();
  return {
    apiKey: creds.accountId || '',
    apiSecret: creds.apiToken || '',
  };
}

export async function getKlines(symbol: string, timeframe: string, limit: number, _testnet?: boolean): Promise<any[]> {
  return bmGetKlines(normalizeSymbol(symbol), timeframe, limit);
}

export async function getOrderBook(symbol: string, depth = 10, _testnet?: boolean): Promise<any> {
  return bmGetOrderBook(normalizeSymbol(symbol), depth);
}

export async function getTickerPrice(symbol: string, _testnet?: boolean): Promise<number> {
  return bmGetTickerPrice(normalizeSymbol(symbol));
}

export async function placeLimitOrder(
  _apiKey: string,
  _apiSecret: string,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  _timeInForce?: string,
  _testnet?: boolean
): Promise<any> {
  const res = await bmPlaceLimitOrder(normalizeSymbol(symbol), side, quantity, price);
  return {
    success: res.success,
    orderId: res.orderId,
    status: res.success ? 'NEW' : 'REJECTED',
    fills: [],
    error: res.error,
  };
}

export async function getOrderStatus(
  _apiKey: string,
  _apiSecret: string,
  _symbol: string,
  orderId: string | number,
  _testnet?: boolean
): Promise<any> {
  return {
    orderId,
    status: 'UNKNOWN',
    executedQty: '0',
    price: '0',
  };
}

export async function cancelOrder(
  _apiKey: string,
  _apiSecret: string,
  _symbol: string,
  _orderId: string | number,
  _testnet?: boolean
): Promise<any> {
  return { success: true, status: 'CANCELED' };
}
