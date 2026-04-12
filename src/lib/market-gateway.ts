// Compatibility layer kept for legacy imports.
// This file NO longer calls Broker APIs.
// All market/trading operations are routed through broker-manager.

import {
  getTickerPrice as brokerGetTickerPrice,
  getKlines as brokerGetKlines,
  getOrderBook as brokerGetOrderBook,
  placeLimitOrder as brokerPlaceLimitOrder,
  getSupportedSymbols,
  getBroker,
} from "@/lib/broker-manager";
import { formatPair as fmtPair, unformatPair as unfmtPair } from "@/lib/format-utils";

export interface WSPriceUpdate {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

type Credentials = { apiKey: string; apiSecret: string };

let _isDemo = true;
let _demoCreds: Credentials = { apiKey: "", apiSecret: "" };
let _liveCreds: Credentials = { apiKey: "", apiSecret: "" };

export const DEFAULT_PAIRS = ["XAU_USD", "XAG_USD", "EUR_USD", "GBP_USD", "USD_JPY", "WTI_USD", "US30_USD", "NAS100_USD"];
export const POPULAR_PAIRS = ["XAU_USD", "EUR_USD", "GBP_USD", "USD_JPY", "WTI_USD"];

export function formatPair(pair: string): string {
  return fmtPair(pair);
}

export function unformatPair(pair: string): string {
  return unfmtPair(pair);
}

export async function getTickerPrice(pair: string, _testnet = true): Promise<number> {
  return brokerGetTickerPrice(pair);
}

export async function getKlines(pair: string, interval = "5m", limit = 200, _testnet = true) {
  return brokerGetKlines(pair, interval, limit);
}

export async function getOrderBook(pair: string, depth = 10, _testnet = true): Promise<any> {
  return brokerGetOrderBook(pair, depth);
}

export async function get24hTicker(pair: string, _testnet = true) {
  const candles = await brokerGetKlines(pair, "1h", 24);
  const first = candles[0]?.open || 0;
  const last = candles[candles.length - 1]?.close || 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const volume = candles.reduce((sum, c) => sum + (c.volume || 0), 0);
  return {
    symbol: pair,
    priceChangePercent: change.toFixed(2),
    quoteVolume: volume.toFixed(2),
    lastPrice: String(last || 0),
  };
}

export async function getBatchPrices(pairs: string[], _testnet = true): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(
    pairs.map(async (pair) => {
      out[pair] = await brokerGetTickerPrice(pair).catch(() => 0);
    })
  );
  return out;
}

export async function getBatch24hTickers(pairs: string[], _testnet = true): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  await Promise.all(
    pairs.map(async (pair) => {
      out[pair] = await get24hTicker(pair).catch(() => null);
    })
  );
  return out;
}

export async function getAllPrices(_testnet = true): Promise<Record<string, { price: number; change24h: number }>> {
  const symbols = await getSupportedSymbols().catch(() => DEFAULT_PAIRS);
  const prices = await getBatchPrices(symbols);
  const out: Record<string, { price: number; change24h: number }> = {};
  for (const s of symbols) {
    out[s] = { price: prices[s] || 0, change24h: 0 };
  }
  return out;
}

export async function placeLimitOrder(
  _apiKey: string,
  _apiSecret: string,
  pair: string,
  side: "BUY" | "SELL",
  quantity: number,
  price: number,
  _recvWindowOrTestnet?: number | boolean,
  _testnet = true
) {
  const result = await brokerPlaceLimitOrder(pair, side, quantity, price);
  const fills = (result.fills || []).map((f) => ({
    price: String(f.price),
    qty: String(f.quantity),
    quantity: String(f.quantity),
    commission: String(f.commission || "0"),
  }));

  return {
    success: result.success,
    orderId: result.orderId,
    clientOrderId: result.clientOrderId,
    status: result.status || (result.success ? "NEW" : "REJECTED"),
    fills,
    error: result.error,
  };
}

export async function cancelOrder(
  _apiKey: string,
  _apiSecret: string,
  pair: string,
  orderId: string | number,
  _testnet = true
): Promise<boolean> {
  const broker = getBroker();
  if (!broker) return false;
  return broker.cancelOrder(pair, String(orderId));
}

export async function getOrderStatus(
  _apiKey: string,
  _apiSecret: string,
  _pair: string,
  orderId: string | number,
  _testnet = true
): Promise<{ orderId: string; status: string; executedQty?: string; price?: string }> {
  return {
    orderId: String(orderId),
    status: "FILLED",
    executedQty: "0",
    price: "0",
  };
}

export function setCredentials(apiKey: string, apiSecret: string, testnet = true): void {
  if (testnet) _demoCreds = { apiKey, apiSecret };
  else _liveCreds = { apiKey, apiSecret };
}

export function getCurrentCredentials(): Credentials {
  return _isDemo ? _demoCreds : _liveCreds;
}

export function getCredentialsForMode(testnet: boolean): Credentials {
  return testnet ? _demoCreds : _liveCreds;
}

export function hasCredentials(testnet: boolean): boolean {
  const c = getCredentialsForMode(testnet);
  return !!(c.apiKey && c.apiSecret);
}

export async function validateCredentials(_apiKey: string, _apiSecret: string, _testnet: boolean) {
  return { valid: true, error: null as string | null };
}

export function isTestnetMode(): boolean {
  return _isDemo;
}

export function setAccountMode(testnet: boolean): void {
  _isDemo = testnet;
}

export function reconnectWebSocket(_testnet: boolean): void {
  // noop compatibility
}

export async function loadPersistedCredentials(): Promise<void> {
  // noop compatibility
}

type AnyHandler = (event: WSPriceUpdate) => void;

class WSPriceManagerCompat {
  private prices = new Map<string, WSPriceUpdate>();
  private handlers = new Set<AnyHandler>();
  private symbols = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  subscribe(symbols: string[]): void {
    symbols.forEach((s) => this.symbols.add(s));
    this.ensurePolling();
  }

  unsubscribe(symbols: string[]): void {
    symbols.forEach((s) => this.symbols.delete(s));
    if (this.symbols.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onAny(handler: AnyHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  getAllPrices(): Map<string, WSPriceUpdate> {
    return this.prices;
  }

  private ensurePolling(): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      if (this.symbols.size === 0) return;
      const list = Array.from(this.symbols);
      const batch = await getBatchPrices(list).catch(() => ({}));
      const now = Date.now();
      for (const sym of list) {
        const update: WSPriceUpdate = {
          symbol: sym,
          price: batch[sym] || 0,
          change24h: 0,
          high24h: 0,
          low24h: 0,
          volume24h: 0,
          timestamp: now,
        };
        this.prices.set(sym.toLowerCase(), update);
        this.handlers.forEach((h) => h(update));
      }
    }, 3000);
  }
}

export const wsPriceManager = new WSPriceManagerCompat();

