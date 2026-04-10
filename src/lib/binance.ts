// ============================================
// RECO-TRADING - Binance API Client (SECURE VERSION)
// ============================================
// Handles all communication with Binance API
// Supports both testnet and production
// Multi-pair support with batch fetching & WebSocket
// ============================================

import crypto from "crypto";
import { 
  createLogger, 
  timingSafeCompare, 
  validateString, 
  validateNumber,
  checkRateLimit, 
  resetRateLimit,
  binanceCircuitBreaker,
  secureState,
  withRetry,
  logger 
} from './security';

const LOG = createLogger('BINANCE');

const BINANCE_BASE_URL = "https://api.binance.com";
const BINANCE_TESTNET_URL = "https://testnet.binance.vision";

// WebSocket URLs
const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws";
const BINANCE_TESTNET_WS_URL = "wss://testnet.binance.vision/ws";

interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  pair: string;
}

function getBaseUrl(testnet: boolean): string {
  return testnet ? BINANCE_TESTNET_URL : BINANCE_BASE_URL;
}

function getWsUrl(testnet: boolean): string {
  return testnet ? BINANCE_TESTNET_WS_URL : BINANCE_WS_URL;
}

function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
}

const requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_SECOND = 20;
const MIN_REQUEST_INTERVAL = 55; // ms between requests

async function rateLimitedFetch(url: string, options?: RequestInit, timeoutMs = 10000): Promise<Response> {
  const now = Date.now();
  // Remove timestamps older than 1 second
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - 1000) {
    requestTimestamps.shift();
  }
  // If at limit, wait
  if (requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
    const waitTime = 1000 - (now - requestTimestamps[0]) + 10;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  // Ensure minimum interval between requests
  const lastRequest = requestTimestamps[requestTimestamps.length - 1] || 0;
  if (now - lastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - (now - lastRequest)));
  }
  requestTimestamps.push(Date.now());
  return fetchWithTimeout(url, options, timeoutMs);
}

// ---- HMAC-SHA256 signing using Node.js native crypto ----
// Uses crypto.createHmac() which is reliable across all Node.js/Bun versions.
function hmacSign(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

// ---- Binance server time sync ----
// Uses secure state manager instead of global variables
async function getServerTimeOffset(base: string): Promise<number> {
  const cached = secureState.getServerTimeOffset();
  if (cached.valid) {
    return cached.offset;
  }
  
  try {
    const res = await withRetry(
      () => fetch(`${base}/api/v3/time`, { signal: AbortSignal.timeout(5000) }),
      { maxRetries: 2, baseDelayMs: 500 }
    );
    
    if (res.ok) {
      const data = await res.json();
      const offset = data.serverTime - Date.now();
      secureState.setServerTimeOffset(offset, Date.now() + 5 * 60 * 1000);
      LOG.info(`Server time offset: ${offset}ms`);
      return offset;
    }
  } catch (err) {
    LOG.warn(`Could not fetch server time, using local time: ${err}`);
  }
  return cached.offset;
}

async function getTimestamp(base: string): Promise<string> {
  const offset = await getServerTimeOffset(base);
  return (Date.now() + offset).toString();
}

// ---- Default trading pairs ----

export const DEFAULT_PAIRS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT",
  "MATICUSDT", "LTCUSDT", "UNIUSDT", "APTUSDT", "ARBUSDT",
  "OPUSDT", "NEARUSDT", "ATOMUSDT", "FILUSDT", "INJUSDT",
];

export const POPULAR_PAIRS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
];

export function formatPair(pair: string): string {
  // Convert BTCUSDT -> BTC/USDT for display
  if (pair.includes("/")) return pair;
  // Try to detect quote currency (USDT, BTC, ETH, etc.)
  const quotes = ["USDT", "USDC", "BUSD", "BTC", "ETH", "BNB"];
  for (const q of quotes) {
    if (pair.endsWith(q)) {
      const base = pair.slice(0, -q.length);
      return `${base}/${q}`;
    }
  }
  return pair;
}

export function unformatPair(pair: string): string {
  return pair.replace("/", "");
}

// ---- Public Endpoints (no auth needed) ----

export async function getTickerPrice(pair: string, testnet = true): Promise<number> {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const res = await rateLimitedFetch(`${base}/api/v3/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Failed to fetch price: ${res.status}`);
  const data = await res.json();
  return parseFloat(data.price);
}

/**
 * BATCH price fetch - get prices for multiple pairs in ONE request
 * This is MUCH faster than individual getTickerPrice calls
 */
export async function getBatchPrices(pairs: string[], testnet = true): Promise<Record<string, number>> {
  const base = getBaseUrl(testnet);
  const symbols = pairs.map(p => p.replace("/", "")).join('","');
  const res = await rateLimitedFetch(`${base}/api/v3/ticker/price?symbols=[${symbols}%5D`);
  if (!res.ok) {
    // Fallback: fetch individually
    console.warn('[BINANCE] Batch price fetch failed, falling back to individual');
    const results: Record<string, number> = {};
    for (const pair of pairs) {
      try {
        results[pair] = await getTickerPrice(pair, testnet);
      } catch {
        results[pair] = 0;
      }
    }
    return results;
  }
  const data = await res.json();
  const results: Record<string, number> = {};
  for (const item of data) {
    results[item.symbol] = parseFloat(item.price);
  }
  return results;
}

/**
 * Get ALL ticker prices in a single request
 * Returns prices for all USDT pairs
 * NOTE: For public endpoints, both testnet and production have same data.
 * Testnet mirrors production for market data.
 */
export async function getAllPrices(testnet = false): Promise<Record<string, { price: number; change24h: number }>> {
  const base = getBaseUrl(testnet);
  const res = await rateLimitedFetch(`${base}/api/v3/ticker/24hr`);
  if (!res.ok) throw new Error(`Failed to fetch all prices: ${res.status}`);
  const data = await res.json();
  const results: Record<string, { price: number; change24h: number }> = {};
  for (const item of data) {
    results[item.symbol] = {
      price: parseFloat(item.lastPrice || item.price),
      change24h: parseFloat(item.priceChangePercent),
    };
  }
  return results;
}

/**
 * Get 24h tickers for specific pairs (batch)
 */
export async function getBatch24hTickers(pairs: string[], testnet = true): Promise<Record<string, any>> {
  const base = getBaseUrl(testnet);
  const symbols = pairs.map(p => p.replace("/", "")).join('","');
  const res = await rateLimitedFetch(`${base}/api/v3/ticker/24hr?symbols=[${symbols}%5D`);
  if (!res.ok) {
    const results: Record<string, any> = {};
    for (const pair of pairs) {
      try {
        results[pair] = await get24hTicker(pair, testnet);
      } catch {
        results[pair] = null;
      }
    }
    return results;
  }
  const data = await res.json();
  const results: Record<string, any> = {};
  for (const item of data) {
    results[item.symbol] = item;
  }
  return results;
}

export async function get24hTicker(pair: string, testnet = true) {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const res = await rateLimitedFetch(`${base}/api/v3/ticker/24hr?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Failed to fetch 24h ticker: ${res.status}`);
  return res.json();
}

export async function getKlines(pair: string, interval = "5m", limit = 200, testnet = true): Promise<{
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}[]> {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  
  let res: Response;
  let lastError: Error | null = null;
  
  try {
    res = await rateLimitedFetch(
      `${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    // Network error - try fallback to production for public data
    if (testnet) {
      console.warn(`[BINANCE] Testnet klines request failed, falling back to production: ${lastError.message}`);
      try {
        const prodBase = getBaseUrl(false);
        res = await rateLimitedFetch(
          `${prodBase}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        );
        testnet = false; // Mark as production data
      } catch (fallbackErr) {
        throw new Error(`Failed to fetch klines from both testnet and production: ${lastError.message}`);
      }
    } else {
      throw lastError;
    }
  }
  
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    
    // If testnet returns an error, try production as fallback for public data
    if (testnet && res.status !== 200) {
      console.warn(`[BINANCE] Testnet returned ${res.status}, trying production for klines`);
      try {
        const prodBase = getBaseUrl(false);
        res = await rateLimitedFetch(
          `${prodBase}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch klines: testnet=${res.status} '${errorText}', production=${res.status}`);
        }
      } catch (fallbackErr) {
        throw new Error(`Failed to fetch klines: ${errorText}`);
      }
    } else {
      throw new Error(`Failed to fetch klines for ${symbol}: ${res.status} - ${errorText}`);
    }
  }
  
  const data = await res.json();
  
  // Validate response is an array
  if (!Array.isArray(data)) {
    throw new Error(`Invalid klines response: expected array, got ${typeof data}`);
  }
  
  return data.map((k: (string | number)[]) => ({
    time: Math.floor(Number(k[0]) / 1000),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
  }));
}

export async function getOrderBook(pair: string, limit = 10, testnet = true) {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const res = await rateLimitedFetch(`${base}/api/v3/depth?symbol=${symbol}&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch orderbook: ${res.status}`);
  const data = await res.json();
  const spread = parseFloat(data.asks[0][0]) - parseFloat(data.bids[0][0]);
  return {
    bid: parseFloat(data.bids[0][0]),
    ask: parseFloat(data.asks[0][0]),
    spread: +spread.toFixed(2),
    bidVolume: parseFloat(data.bids[0][1]),
    askVolume: parseFloat(data.asks[0][1]),
  };
}

/**
 * Get exchange info for multiple pairs at once
 */
export async function getExchangeInfo(pairs: string[] = [], testnet = true) {
  const base = getBaseUrl(testnet);
  const url = pairs.length > 0
    ? `${base}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(pairs.map(p => p.replace("/", ""))))}`
    : `${base}/api/v3/exchangeInfo`;
  const res = await rateLimitedFetch(url);
  if (!res.ok) throw new Error(`Exchange info fetch failed: ${res.status}`);
  return res.json();
}

// ---- Authenticated Endpoints ----

export async function getAccountBalance(apiKey: string, apiSecret: string, testnet = true) {
  const base = getBaseUrl(testnet);
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000; // 10 seconds tolerance
  const queryString = `timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, queryString);

  console.log(`[BINANCE] Fetching account balance from ${testnet ? 'TESTNET' : 'MAINNET'}...`);
  
  const res = await rateLimitedFetch(`${base}/api/v3/account?${queryString}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errMsg = err.msg || `HTTP ${res.status}`;
    console.error(`[BINANCE] Account fetch failed: ${errMsg}`);
    if (errMsg.includes("Invalid signature")) {
      console.error(`[BINANCE] This usually means: 1) Wrong API secret, 2) Wrong testnet/real mode, 3) API keys generated for a different endpoint`);
    }
    if (errMsg.includes("Timestamp")) {
      console.error(`[BINANCE] Timestamp error - local clock may be out of sync with Binance server`);
    }
    throw new Error(`Account fetch failed: ${errMsg}`);
  }
  
  const data = await res.json();
  console.log(`[BINANCE] Account data received. Balances count: ${data.balances?.length || 0}, ` +
    `Total USDT: ${data.balances?.find((b: any) => b.asset === "USDT")?.free || "0"}`);
  return data;
}

export async function getOpenOrders(apiKey: string, apiSecret: string, pair: string, testnet = true) {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const queryString = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, queryString);

  const res = await rateLimitedFetch(`${base}/api/v3/openOrders?${queryString}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) throw new Error(`Open orders fetch failed: ${res.status}`);
  return res.json();
}

export async function getPositions(apiKey: string, apiSecret: string, testnet = true) {
  const base = getBaseUrl(testnet);
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const queryString = `timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, queryString);

  // Note: /fapi/v2/positionRisk is for FUTURES. For SPOT, positions don't exist.
  // For spot accounts, open positions = open orders with status NEW.
  // We'll try futures endpoint first, fall back to empty array for spot.
  const res = await rateLimitedFetch(
    `${base}/fapi/v2/positionRisk?${queryString}&signature=${signature}`,
    { headers: { "X-MBX-APIKEY": apiKey } }
  ).catch(() => null);

  if (!res || !res.ok) return [];
  const data = await res.json();
  return data.filter((p: { positionAmt: string }) => parseFloat(p.positionAmt) !== 0);
}

// ---- Order Placement (Authenticated) ----

export interface OrderResult {
  success: boolean;
  orderId?: string | number;
  clientOrderId?: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price?: number;
  status?: string;
  fills?: Array<{ price: string; qty: string; commission: string }>;
  error?: string;
}

/**
 * Place a market order (BUY or SELL)
 */
export async function placeMarketOrder(
  apiKey: string,
  apiSecret: string,
  pair: string,
  side: "BUY" | "SELL",
  quantity: number,
  testnet = true
): Promise<OrderResult> {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");

  // Min notional check (Binance requires >= 10 USDT)
  try {
    const currentPrice = await getTickerPrice(pair, testnet);
    const estimatedValue = currentPrice * quantity;
    if (estimatedValue < 10) {
      return {
        success: false,
        symbol,
        side,
        type: "MARKET",
        quantity,
        error: `Order value (${estimatedValue.toFixed(2)} USDT) is below Binance minimum notional (10 USDT). Increase quantity or choose a different pair.`,
      };
    }
  } catch {
    // If we can't fetch price, proceed anyway and let Binance reject if needed
  }

  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const params = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, params);

  try {
    const res = await rateLimitedFetch(`${base}/api/v3/order?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        symbol,
        side,
        type: "MARKET",
        quantity,
        error: data.msg || `Order failed: ${res.status}`,
      };
    }

    return {
      success: true,
      orderId: data.orderId,
      clientOrderId: data.clientOrderId,
      symbol,
      side,
      type: "MARKET",
      quantity,
      price: parseFloat(data.price || data.fills?.[0]?.price || "0"),
      status: data.status,
      fills: data.fills,
    };
  } catch (err) {
    return {
      success: false,
      symbol,
      side,
      type: "MARKET",
      quantity,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Place a limit order
 */
export async function placeLimitOrder(
  apiKey: string,
  apiSecret: string,
  pair: string,
  side: "BUY" | "SELL",
  quantity: number,
  price: number,
  timeInForce: "GTC" | "IOC" | "FOK" = "GTC",
  testnet = true
): Promise<OrderResult> {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const params = `symbol=${symbol}&side=${side}&type=LIMIT&quantity=${quantity}&price=${price}&timeInForce=${timeInForce}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, params);

  try {
    const res = await rateLimitedFetch(`${base}/api/v3/order?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        symbol,
        side,
        type: "LIMIT",
        quantity,
        price,
        error: data.msg || `Order failed: ${res.status}`,
      };
    }

    return {
      success: true,
      orderId: data.orderId,
      clientOrderId: data.clientOrderId,
      symbol,
      side,
      type: "LIMIT",
      quantity,
      price,
      status: data.status,
    };
  } catch (err) {
    return {
      success: false,
      symbol,
      side,
      type: "LIMIT",
      quantity,
      price,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Place a stop-loss order
 */
export async function placeStopLossOrder(
  apiKey: string,
  apiSecret: string,
  pair: string,
  side: "BUY" | "SELL",
  quantity: number,
  stopPrice: number,
  testnet = true
): Promise<OrderResult> {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const params = `symbol=${symbol}&side=${side}&type=STOP_LOSS&quantity=${quantity}&stopPrice=${stopPrice}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, params);

  try {
    const res = await rateLimitedFetch(`${base}/api/v3/order?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        symbol,
        side,
        type: "STOP_LOSS",
        quantity,
        error: data.msg || `Stop-loss order failed: ${res.status}`,
      };
    }

    return {
      success: true,
      orderId: data.orderId,
      clientOrderId: data.clientOrderId,
      symbol,
      side,
      type: "STOP_LOSS",
      quantity,
      error: undefined,
    };
  } catch (err) {
    return {
      success: false,
      symbol,
      side,
      type: "STOP_LOSS",
      quantity,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Place a take-profit order
 */
export async function placeTakeProfitOrder(
  apiKey: string,
  apiSecret: string,
  pair: string,
  side: "BUY" | "SELL",
  quantity: number,
  stopPrice: number,
  testnet = true
): Promise<OrderResult> {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const params = `symbol=${symbol}&side=${side}&type=TAKE_PROFIT_MARKET&quantity=${quantity}&stopPrice=${stopPrice}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, params);

  try {
    const res = await rateLimitedFetch(`${base}/api/v3/order?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        symbol,
        side,
        type: "TAKE_PROFIT",
        quantity,
        error: data.msg || `Take-profit order failed: ${res.status}`,
      };
    }

    return {
      success: true,
      orderId: data.orderId,
      clientOrderId: data.clientOrderId,
      symbol,
      side,
      type: "TAKE_PROFIT",
      quantity,
      error: undefined,
    };
  } catch (err) {
    return {
      success: false,
      symbol,
      side,
      type: "TAKE_PROFIT",
      quantity,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Cancel an existing order
 */
export async function cancelOrder(
  apiKey: string,
  apiSecret: string,
  pair: string,
  orderId: string | number,
  testnet = true
): Promise<{ success: boolean; error?: string }> {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, params);

  try {
    const res = await rateLimitedFetch(`${base}/api/v3/order?${params}&signature=${signature}`, {
      method: "DELETE",
      headers: { "X-MBX-APIKEY": apiKey },
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.msg || `Cancel failed: ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Query order status
 */
export async function getOrderStatus(
  apiKey: string,
  apiSecret: string,
  pair: string,
  orderId: string | number,
  testnet = true
) {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, params);

  const res = await rateLimitedFetch(`${base}/api/v3/order?${params}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });

  if (!res.ok) throw new Error(`Order status fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Get exchange info (trading rules, filters, etc.)
 */
export async function getSingleExchangeInfo(pair: string, testnet = true) {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const res = await rateLimitedFetch(`${base}/api/v3/exchangeInfo?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Exchange info fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Get trading fee rate
 */
export async function getTradingFee(
  apiKey: string,
  apiSecret: string,
  pair: string,
  testnet = true
) {
  const base = getBaseUrl(testnet);
  const symbol = pair.replace("/", "");
  const timestamp = await getTimestamp(base);
  const recvWindow = 10000;
  const params = `symbol=${symbol}&timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = hmacSign(apiSecret, params);

  const res = await rateLimitedFetch(`${base}/api/v3/asset/tradeFee?${params}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  }).catch(() => null);

  if (!res || !res.ok) return { makerCommission: 0.1, takerCommission: 0.1 }; // Default 0.1%
  const data = await res.json();
  const fee = data.find((f: { symbol: string }) => f.symbol === symbol);
  return fee || { makerCommission: 0.1, takerCommission: 0.1 };
}

export async function validateCredentials(apiKey: string, apiSecret: string, testnet = true): Promise<{
  valid: boolean;
  error?: string;
  accountInfo?: { balances: any[] };
}> {
  if (!apiKey || !apiSecret) {
    return { valid: false, error: `API credentials not configured for ${testnet ? 'testnet' : 'real'} mode. Please add them in Settings.` };
  }
  try {
    const accountData = await getAccountBalance(apiKey, apiSecret, testnet);
    return { 
      valid: true, 
      accountInfo: { balances: accountData.balances } 
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================
// WEBSOCKET PRICE STREAM MANAGER
// ============================================
// Provides ultra-fast real-time price updates
// for multiple pairs simultaneously
// ============================================

export interface WSPriceUpdate {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

type PriceCallback = (update: WSPriceUpdate) => void;

export class BinanceWebSocketManager {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<PriceCallback>> = new Map();
  private allListeners: Set<PriceCallback> = new Set();
  private subscribedSymbols: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private isDestroyed = false;
  private testnet: boolean;
  private lastPrices: Map<string, WSPriceUpdate> = new Map();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(testnet = false) {
    this.testnet = testnet;
  }

  /** Subscribe to price updates for specific symbols */
  subscribe(symbols: string[]): void {
    const newSymbols = symbols
      .map(s => s.replace("/", "").toLowerCase())
      .filter(s => !this.subscribedSymbols.has(s));

    if (newSymbols.length === 0) return;

    for (const s of newSymbols) {
      this.subscribedSymbols.add(s);
    }

    // If WebSocket is already open, subscribe to new streams
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(newSymbols);
    } else if (!this.isConnecting) {
      this.connect();
    }
  }

  /** Add listener for specific symbol */
  on(symbol: string, callback: PriceCallback): () => void {
    const key = symbol.replace("/", "").toLowerCase();
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  /** Add listener for ALL price updates */
  onAny(callback: PriceCallback): () => void {
    this.allListeners.add(callback);
    return () => {
      this.allListeners.delete(callback);
    };
  }

  /** Get latest known price for a symbol */
  getPrice(symbol: string): WSPriceUpdate | undefined {
    return this.lastPrices.get(symbol.replace("/", "").toLowerCase());
  }

  /** Get all latest prices */
  getAllPrices(): Map<string, WSPriceUpdate> {
    return new Map(this.lastPrices);
  }

  /** Connect to WebSocket */
  private connect(): void {
    if (typeof WebSocket === 'undefined') {
      console.warn('[WS] WebSocket not available in this environment');
      return;
    }
    if (this.isConnecting || this.isDestroyed) return;
    this.isConnecting = true;

    try {
      let wsUrl: string;
      
      if (this.testnet) {
        // Testnet: Use individual stream WebSocket (testnet.binance.vision supports single streams)
        // Connect to first symbol as example - will use REST polling for others
        const firstSymbol = Array.from(this.subscribedSymbols)[0] || 'btcusdt';
        wsUrl = `wss://testnet.binance.vision/ws/${firstSymbol}@ticker`;
        console.log('[WS] Testnet: Using WebSocket single stream');
      } else {
        // Mainnet: use combined streams via stream.binance.com:9443/stream
        const streams = Array.from(this.subscribedSymbols)
          .map(s => `${s}@ticker`)
          .join("/");
        wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[WS] Connected to ${this.subscribedSymbols.size} streams`);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          // Combined stream format: { stream: "btcusdt@ticker", data: { ... } }
          // Single stream format: { e: "24hrTicker", s: "BTCUSDT", c: "50000", ... }
          let data = raw;
          
          // Check if it's a combined stream response
          if (raw.data && raw.stream) {
            data = raw.data;
          }
          // Single stream on testnet uses 's' for symbol and 'c' for close
          if (data.s && data.c) {
            const update: WSPriceUpdate = {
              symbol: data.s,
              price: parseFloat(data.c),
              change24h: parseFloat(data.P),
              high24h: parseFloat(data.h),
              low24h: parseFloat(data.l),
              volume24h: parseFloat(data.v),
              timestamp: data.E || Date.now(),
            };

            const key = data.s.toLowerCase();
            this.lastPrices.set(key, update);

            // Notify specific listeners
            this.listeners.get(key)?.forEach(cb => {
              try { cb(update); } catch { /* ignore listener errors */ }
            });

            // Notify global listeners
            this.allListeners.forEach(cb => {
              try { cb(update); } catch { /* ignore listener errors */ }
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this.isConnecting = false;
        this.ws = null;

        if (!this.isDestroyed && this.subscribedSymbols.size > 0) {
          this.scheduleReconnect();
        }
      };

      // Ping to keep alive
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          // WebSocket ping frames are sent automatically by the browser
        }
      }, 30000);

    } catch (err) {
      console.error('[WS] Connection error:', err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /** Subscribe to new streams on existing connection */
  private sendSubscribe(symbols: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const streams = symbols.map(s => `${s}@ticker`).join("/");
    this.ws.send(JSON.stringify({
      method: "SUBSCRIBE",
      params: symbols.map(s => `${s}@ticker`),
      id: Date.now(),
    }));
  }

  /** Schedule reconnection with exponential backoff */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[WS] Max reconnect attempts (${this.maxReconnectAttempts}) reached`);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connect();
      }
    }, delay);
  }

  /** Unsubscribe from a symbol */
  unsubscribe(symbols: string[]): void {
    for (const s of symbols) {
      this.subscribedSymbols.delete(s.replace("/", "").toLowerCase());
      this.listeners.delete(s.replace("/", "").toLowerCase());
    }
    // In production, we'd send UNSUBSCRIBE. For simplicity, we reconnect with remaining.
    if (this.subscribedSymbols.size === 0) {
      this.destroy();
    }
  }

  /** Destroy the WebSocket connection */
  destroy(): void {
    this.isDestroyed = true;
    this.subscribedSymbols.clear();
    this.listeners.clear();
    this.allListeners.clear();
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ============================================
// DUAL CREDENTIAL MANAGEMENT
// ============================================
// Stores separate API keys for testnet and real accounts.
// When switching modes, the correct credentials are used.
// This prevents errors when API keys don't match the mode.

interface AccountCredentials {
  apiKey: string;
  apiSecret: string;
}

// Dual credentials - one for each mode
const _credentials: { testnet: AccountCredentials; real: AccountCredentials } = {
  testnet: {
    apiKey: process.env.BINANCE_TESTNET_API_KEY || '',
    apiSecret: process.env.BINANCE_TESTNET_API_SECRET || '',
  },
  real: {
    apiKey: process.env.BINANCE_REAL_API_KEY || '',
    apiSecret: process.env.BINANCE_REAL_API_SECRET || '',
  },
};

// ============================================
// GLOBAL ACCOUNT MODE (Runtime-switchable)
// ============================================
// Allows switching between testnet and real account
// at runtime without restarting the server.

let _isTestnet = process.env.BINANCE_TESTNET !== "false";

export function isTestnetMode(): boolean {
  return _isTestnet;
}

/** Get the API credentials for the current active mode */
export function getCurrentCredentials(): AccountCredentials {
  return _isTestnet ? _credentials.testnet : _credentials.real;
}

/** Get the API credentials for a specific mode */
export function getCredentialsForMode(testnet: boolean): AccountCredentials {
  return testnet ? _credentials.testnet : _credentials.real;
}

/** Update credentials for a specific mode */
export function setCredentials(testnet: boolean, apiKey: string, apiSecret: string): void {
  if (testnet) {
    _credentials.testnet = { apiKey, apiSecret };
  } else {
    _credentials.real = { apiKey, apiSecret };
  }
  console.log(`[BINANCE] Credentials updated for ${testnet ? 'TESTNET' : 'REAL'} mode (key: ${apiKey ? apiKey.slice(0, 6) + '...' : 'NOT SET'})`);
}

/** Check if credentials are configured for a specific mode */
export function hasCredentials(testnet: boolean): boolean {
  const creds = getCredentialsForMode(testnet);
  return !!(creds.apiKey && creds.apiSecret);
}

export function setAccountMode(testnet: boolean): void {
  _isTestnet = testnet;
  console.log(`[BINANCE] Account mode switched to: ${testnet ? 'TESTNET (testnet.binance.vision)' : 'REAL (api.binance.com)'}`);
  console.log(`[BINANCE] Active credentials: ${hasCredentials(testnet) ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
}

// ============================================
// PERSISTENCE LOAD ON STARTUP
// ============================================
// Loads saved credentials and mode from database on server start

export async function loadPersistedCredentials(): Promise<void> {
  try {
    const { getSetting } = await import('@/lib/settings-manager');
    const { decryptCredential } = await import('@/lib/security');
    
    // Load account mode
    const savedMode = await getSetting('account_mode');
    if (savedMode === 'testnet' || savedMode === 'real') {
      _isTestnet = savedMode === 'testnet';
      console.log(`[BINANCE] Loaded account mode from DB: ${savedMode}`);
    }
    
    // Load and DECRYPT testnet credentials from DB
    const testnetKeyEncrypted = await getSetting('testnet_api_key');
    const testnetSecretEncrypted = await getSetting('testnet_api_secret');
    if (testnetKeyEncrypted && testnetSecretEncrypted) {
      const decryptedKey = decryptCredential(testnetKeyEncrypted);
      const decryptedSecret = decryptCredential(testnetSecretEncrypted);
      if (decryptedKey && decryptedSecret) {
        _credentials.testnet = { apiKey: decryptedKey, apiSecret: decryptedSecret };
        console.log(`[BINANCE] Loaded and decrypted TESTNET credentials from DB`);
      }
    }
    
    // Load and DECRYPT real credentials from DB
    const realKeyEncrypted = await getSetting('real_api_key');
    const realSecretEncrypted = await getSetting('real_api_secret');
    if (realKeyEncrypted && realSecretEncrypted) {
      const decryptedKey = decryptCredential(realKeyEncrypted);
      const decryptedSecret = decryptCredential(realSecretEncrypted);
      if (decryptedKey && decryptedSecret) {
        _credentials.real = { apiKey: decryptedKey, apiSecret: decryptedSecret };
        console.log(`[BINANCE] Loaded and decrypted REAL credentials from DB`);
      }
    }
    
    console.log(`[BINANCE] Persistence load complete. Mode: ${_isTestnet ? 'testnet' : 'real'}`);
  } catch (error) {
    console.error('[BINANCE] Failed to load persisted credentials:', error);
  }
}

// Export a function to initialize credentials (call this from API routes/server-side only)
export async function initializeCredentials(): Promise<void> {
  try {
    const { db } = await import('./db');
    await db.$connect();
    await loadPersistedCredentials();
  } catch (error) {
    console.error('[BINANCE] Failed to initialize credentials:', error);
  }
}

// ============================================
// GLOBAL WEBSOCKET SINGLETON (mutable getter)
// ============================================
// Uses a getter so that after reconnectWebSocket() creates a new instance,
// all existing imports automatically see the new one.

const _globalWS = globalThis as unknown as {
  _wsPriceManager: BinanceWebSocketManager | undefined;
};

if (!_globalWS._wsPriceManager) {
  _globalWS._wsPriceManager = new BinanceWebSocketManager(
    process.env.BINANCE_TESTNET !== "false"
  );
}

/** Access the current WebSocket manager (always the latest instance) */
export function getWSPriceManager(): BinanceWebSocketManager {
  return _globalWS._wsPriceManager!;
}

/**
 * Backwards-compatible alias — resolved at access time.
 * Modules that import { wsPriceManager } will always get the current instance.
 */
export const wsPriceManager: BinanceWebSocketManager = new Proxy({} as BinanceWebSocketManager, {
  get(_target, prop) {
    const mgr = _globalWS._wsPriceManager;
    if (mgr && prop in mgr) {
      const val = (mgr as any)[prop];
      if (typeof val === 'function') return val.bind(mgr);
      return val;
    }
    return undefined;
  },
});

/**
 * Reconnect the WebSocket singleton to the current mode's endpoint.
 * Call this after setAccountMode() to reconnect to the right server.
 */
export function reconnectWebSocket(testnet: boolean): void {
  getWSPriceManager().destroy();
  const newManager = new BinanceWebSocketManager(testnet);
  _globalWS._wsPriceManager = newManager;
  if (!testnet) {
    console.log(`[BINANCE] WebSocket will connect to: stream.binance.com:9443 (combined streams)`);
  } else {
    console.log(`[BINANCE] WebSocket disabled for testnet — using REST polling only`);
  }
}

/**
 * Resubscribe WebSocket to a list of symbols (called after reconnection)
 */
export function resubscribeWebSocket(symbols: string[]): void {
  wsPriceManager.subscribe(symbols);
}
