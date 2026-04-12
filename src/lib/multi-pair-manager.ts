// ============================================
// RECO-TRADING - Multi-Pair Manager (OANDA)
// ============================================

import { getTickerPrice } from './broker-manager';
import { formatPair, unformatPair } from './format-utils';

export interface PairInfo {
  symbol: string;
  display: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdate: number;
  active: boolean;
}

interface MultiPairConfig {
  activePair: string;
  watchlist: string[];
  priceRefreshInterval: number;
}

const OANDA_DEFAULT_PAIRS = [
  'XAU_USD',
  'XAG_USD',
  'EUR_USD',
  'GBP_USD',
  'USD_JPY',
  'WTI_USD',
  'US30_USD',
  'NAS100_USD',
];

export class MultiPairManager {
  private pairs: Map<string, PairInfo> = new Map();
  private config: MultiPairConfig;
  private priceRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private _isStarted = false;

  constructor(config?: Partial<MultiPairConfig>) {
    this.config = {
      activePair: process.env.TRADING_SYMBOL || 'XAU_USD',
      watchlist: OANDA_DEFAULT_PAIRS,
      priceRefreshInterval: 5000,
      ...config,
    };

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
  }

  start(): void {
    if (this._isStarted) return;
    this._isStarted = true;
    this.refreshAllPrices();
    this.priceRefreshTimer = setInterval(() => {
      this.refreshAllPrices().catch(() => {});
    }, this.config.priceRefreshInterval);
  }

  stop(): void {
    if (this.priceRefreshTimer) {
      clearInterval(this.priceRefreshTimer);
      this.priceRefreshTimer = null;
    }
    this._isStarted = false;
  }

  get isStarted(): boolean {
    return this._isStarted;
  }

  async refreshAllPrices(): Promise<void> {
    const symbols = Array.from(this.pairs.keys());
    const now = Date.now();

    const updates = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const price = await getTickerPrice(symbol);
          return { symbol, price: price || 0 };
        } catch {
          return { symbol, price: 0 };
        }
      })
    );

    for (const { symbol, price } of updates) {
      const pair = this.pairs.get(symbol);
      if (!pair) continue;
      pair.price = price;
      pair.lastUpdate = now;
    }
  }

  getAllPairs(): PairInfo[] {
    return Array.from(this.pairs.values());
  }

  getPair(symbol: string): PairInfo | undefined {
    return this.pairs.get(unformatPair(symbol));
  }

  getActivePair(): PairInfo | undefined {
    return this.pairs.get(this.config.activePair);
  }

  setActivePair(symbol: string): void {
    const cleanSymbol = unformatPair(symbol);
    if (cleanSymbol === this.config.activePair) return;

    const prev = this.pairs.get(this.config.activePair);
    if (prev) prev.active = false;

    this.config.activePair = cleanSymbol;
    const next = this.pairs.get(cleanSymbol);
    if (next) {
      next.active = true;
      return;
    }

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
  }

  addToWatchlist(symbol: string): void {
    const cleanSymbol = unformatPair(symbol);
    if (this.pairs.has(cleanSymbol)) return;

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
  }

  removeFromWatchlist(symbol: string): boolean {
    const cleanSymbol = unformatPair(symbol);
    if (cleanSymbol === this.config.activePair) return false;
    if (!this.pairs.has(cleanSymbol)) return false;

    this.pairs.delete(cleanSymbol);
    this.config.watchlist = this.config.watchlist.filter(s => s !== cleanSymbol);
    return true;
  }

  getSummary() {
    const active = this.getActivePair();
    return {
      activePair: this.config.activePair,
      activePairDisplay: formatPair(this.config.activePair),
      activePairPrice: active?.price || 0,
      activePairChange24h: active?.change24h || 0,
      totalPairs: this.pairs.size,
      pairs: this.getAllPairs().map(p => ({ ...p })),
    };
  }
}

const globalForMPM = globalThis as unknown as {
  multiPairManager: MultiPairManager | undefined;
};

export const multiPairManager: MultiPairManager =
  globalForMPM.multiPairManager ?? new MultiPairManager();

if (process.env.NODE_ENV !== 'production') {
  globalForMPM.multiPairManager = multiPairManager;
}
