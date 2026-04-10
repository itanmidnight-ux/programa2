// ============================================
// RECO-TRADING - Multi-Pair Manager
// ============================================
// Manages multiple trading pairs simultaneously
// Provides fast price updates via WebSocket
// Manages per-pair candle data and state
// ============================================

import { getBatchPrices, getBatch24hTickers, getAllPrices, DEFAULT_PAIRS, formatPair, unformatPair, type WSPriceUpdate, wsPriceManager, isTestnetMode } from './binance';

export interface PairInfo {
  symbol: string;         // e.g. "BTCUSDT"
  display: string;        // e.g. "BTC/USDT"
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdate: number;
  active: boolean;        // is this pair being actively traded?
}

export interface PairCandles {
  symbol: string;
  timeframe: string;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  lastFetch: number;
}

interface MultiPairConfig {
  activePair: string;       // Currently selected/trading pair
  watchlist: string[];      // Pairs to monitor
  testnet: boolean;
  priceRefreshInterval: number;  // ms between REST price refreshes (fallback)
}

// ============================================
// MULTI-PAIR MANAGER CLASS
// ============================================

export class MultiPairManager {
  private pairs: Map<string, PairInfo> = new Map();
  private candleCache: Map<string, Map<string, PairCandles>> = new Map(); // symbol -> timeframe -> candles
  private config: MultiPairConfig;
  private priceRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private wsUnsubscribe: (() => void) | null = null;
  private _isStarted: boolean = false;

  constructor(config?: Partial<MultiPairConfig>) {
    this.config = {
      activePair: process.env.TRADING_PAIR || 'BTCUSDT',
      watchlist: DEFAULT_PAIRS,
      testnet: isTestnetMode(),
      priceRefreshInterval: 5000,
      ...config,
    };

    // Initialize pair info objects
    for (const symbol of this.config.watchlist) {
      this.pairs.set(symbol, {
        symbol,
        display: formatPair(symbol),
        price: 0,
        change24h: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        lastUpdate: 0,
        active: symbol === this.config.activePair,
      });
    }

    console.log(`[MULTI-PAIR] Initialized with ${this.config.watchlist.length} pairs. Active: ${this.config.activePair}`);
  }

  /** Start price monitoring (idempotent — safe to call multiple times) */
  start(): void {
    if (this._isStarted) return;
    this._isStarted = true;

    // Initial fetch via REST (fast batch)
    this.refreshAllPrices();

    // Start WebSocket for real-time prices
    this.startWebSocket();

    // Fallback REST refresh every 5 seconds
    this.priceRefreshTimer = setInterval(() => {
      this.refreshAllPrices();
    }, this.config.priceRefreshInterval);

    console.log('[MULTI-PAIR] Price monitoring started');
  }

  /** Whether start() has been called */
  get isStarted(): boolean {
    return this._isStarted;
  }

  /** Stop price monitoring */
  stop(): void {
    if (this.priceRefreshTimer) {
      clearInterval(this.priceRefreshTimer);
      this.priceRefreshTimer = null;
    }
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
  }

  /** Start WebSocket price streams */
  private startWebSocket(): void {
    try {
      // Subscribe to all watchlist pairs
      wsPriceManager.subscribe(this.config.watchlist);

      // Listen for all price updates
      this.wsUnsubscribe = wsPriceManager.onAny((update: WSPriceUpdate) => {
        const pair = this.pairs.get(update.symbol);
        if (pair) {
          pair.price = update.price;
          pair.change24h = update.change24h;
          pair.high24h = update.high24h;
          pair.low24h = update.low24h;
          pair.volume24h = update.volume24h;
          pair.lastUpdate = update.timestamp;
        }
      });

      console.log(`[MULTI-PAIR] WebSocket started for ${this.config.watchlist.length} pairs`);
    } catch (err) {
      console.error('[MULTI-PAIR] WebSocket start failed:', err);
    }
  }

  /** Refresh all prices via REST API (batch) */
  async refreshAllPrices(): Promise<void> {
    try {
      const prices = await getBatchPrices(this.config.watchlist, this.config.testnet);
      for (const [symbol, price] of Object.entries(prices)) {
        const pair = this.pairs.get(symbol);
        if (pair) {
          pair.price = price;
          pair.lastUpdate = Date.now();
        }
      }

      // Also get 24h change data
      const tickers = await getBatch24hTickers(this.config.watchlist, this.config.testnet);
      for (const [symbol, ticker] of Object.entries(tickers)) {
        const pair = this.pairs.get(symbol);
        if (pair && ticker) {
          pair.change24h = parseFloat(ticker.priceChangePercent || 0);
          pair.high24h = parseFloat(ticker.highPrice || 0);
          pair.low24h = parseFloat(ticker.lowPrice || 0);
          pair.volume24h = parseFloat(ticker.quoteVolume || 0);
        }
      }
    } catch (err) {
      console.error('[MULTI-PAIR] REST price refresh failed:', err);
    }
  }

  /** Get all pair info */
  getAllPairs(): PairInfo[] {
    return Array.from(this.pairs.values());
  }

  /** Get pair info for specific symbol */
  getPair(symbol: string): PairInfo | undefined {
    return this.pairs.get(unformatPair(symbol));
  }

  /** Get active trading pair */
  getActivePair(): PairInfo | undefined {
    return this.pairs.get(this.config.activePair);
  }

  /** Set active trading pair */
  setActivePair(symbol: string): void {
    const cleanSymbol = unformatPair(symbol);

    // Deduplication: skip if pair hasn't actually changed
    if (cleanSymbol === this.config.activePair) return;

    // Deactivate previous
    const prev = this.pairs.get(this.config.activePair);
    if (prev) prev.active = false;

    // Activate new
    this.config.activePair = cleanSymbol;
    const next = this.pairs.get(cleanSymbol);
    if (next) {
      next.active = true;
    } else {
      // Add new pair to watchlist if not present
      this.pairs.set(cleanSymbol, {
        symbol: cleanSymbol,
        display: formatPair(cleanSymbol),
        price: 0,
        change24h: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        lastUpdate: 0,
        active: true,
      });
      this.config.watchlist.push(cleanSymbol);
      wsPriceManager.subscribe([cleanSymbol]);
    }

    console.log(`[MULTI-PAIR] Active pair changed to ${cleanSymbol}`);
  }

  /** Add pair to watchlist */
  addToWatchlist(symbol: string): void {
    const cleanSymbol = unformatPair(symbol);
    if (!this.pairs.has(cleanSymbol)) {
      this.pairs.set(cleanSymbol, {
        symbol: cleanSymbol,
        display: formatPair(cleanSymbol),
        price: 0,
        change24h: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        lastUpdate: 0,
        active: false,
      });
      this.config.watchlist.push(cleanSymbol);
      wsPriceManager.subscribe([cleanSymbol]);
      console.log(`[MULTI-PAIR] Added ${cleanSymbol} to watchlist`);
    }
  }

  /** Remove pair from watchlist (can't remove active pair) */
  removeFromWatchlist(symbol: string): boolean {
    const cleanSymbol = unformatPair(symbol);
    if (cleanSymbol === this.config.activePair) return false;
    if (this.pairs.has(cleanSymbol)) {
      this.pairs.delete(cleanSymbol);
      this.config.watchlist = this.config.watchlist.filter(s => s !== cleanSymbol);
      wsPriceManager.unsubscribe([cleanSymbol]);
      console.log(`[MULTI-PAIR] Removed ${cleanSymbol} from watchlist`);
      return true;
    }
    return false;
  }

  /** Get candles for a specific pair and timeframe */
  getCandles(symbol: string, timeframe: string): PairCandles | null {
    const key = unformatPair(symbol);
    const tfCache = this.candleCache.get(key);
    if (!tfCache) return null;
    return tfCache.get(timeframe) || null;
  }

  /** Get formatted summary for frontend */
  getSummary() {
    const active = this.getActivePair();
    return {
      activePair: this.config.activePair,
      activePairDisplay: formatPair(this.config.activePair),
      activePairPrice: active?.price || 0,
      activePairChange24h: active?.change24h || 0,
      totalPairs: this.pairs.size,
      pairs: this.getAllPairs().map(p => ({
        symbol: p.symbol,
        display: p.display,
        price: p.price,
        change24h: p.change24h,
        high24h: p.high24h,
        low24h: p.low24h,
        volume24h: p.volume24h,
        active: p.active,
        lastUpdate: p.lastUpdate,
      })),
    };
  }
}

// ============================================
// GLOBAL SINGLETON
// ============================================

const globalForMPM = globalThis as unknown as {
  multiPairManager: MultiPairManager | undefined;
};

export const multiPairManager: MultiPairManager =
  globalForMPM.multiPairManager ?? new MultiPairManager();

if (process.env.NODE_ENV !== 'production') {
  globalForMPM.multiPairManager = multiPairManager;
}
