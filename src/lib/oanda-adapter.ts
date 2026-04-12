// ============================================
// RECO-TRADING - OANDA Broker Adapter
// ============================================
// Connects to OANDA v20 API for Forex, Metals,
// Energy, and Indices trading.
// Docs: https://developer.oanda.com/rest-live-v20/introduction/
// ============================================

import type { Candle } from '@/lib/analysis-engine';
import type {
  IBroker, SymbolSpec, OrderResult, PositionData,
  AccountData, OrderBookData
} from '@/lib/broker-interface';

// ============================================
// OANDA Configuration
// ============================================

const OANDA_ENVIRONMENTS = {
  practice: 'https://api-fxpractice.oanda.com',
  live: 'https://api-fxtrade.oanda.com',
};

// ============================================
// Symbol Specifications
// ============================================

const SYMBOL_SPECS: Record<string, SymbolSpec> = {
  // Forex Majors
  'EUR_USD': {
    symbol: 'EUR_USD', displayName: 'EUR/USD', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 1.0, makerFee: 0, takerFee: 0,
  },
  'GBP_USD': {
    symbol: 'GBP_USD', displayName: 'GBP/USD', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 1.2, makerFee: 0, takerFee: 0,
  },
  'USD_JPY': {
    symbol: 'USD_JPY', displayName: 'USD/JPY', category: 'forex',
    pipSize: 0.01, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 1.0, makerFee: 0, takerFee: 0,
  },
  'AUD_USD': {
    symbol: 'AUD_USD', displayName: 'AUD/USD', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 1.0, makerFee: 0, takerFee: 0,
  },
  'USD_CHF': {
    symbol: 'USD_CHF', displayName: 'USD/CHF', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 1.2, makerFee: 0, takerFee: 0,
  },

  // Metals
  'XAU_USD': {
    symbol: 'XAU_USD', displayName: 'Gold/USD', category: 'metal',
    pipSize: 0.01, pipValue: 1, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 1, tradingHours: '24/5',
    spreadTypical: 0.30, makerFee: 0, takerFee: 0,
  },
  'XAG_USD': {
    symbol: 'XAG_USD', displayName: 'Silver/USD', category: 'metal',
    pipSize: 0.001, pipValue: 1, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 1, tradingHours: '24/5',
    spreadTypical: 0.02, makerFee: 0, takerFee: 0,
  },

  // Energy
  'WTI_USD': {
    symbol: 'WTI_USD', displayName: 'Crude Oil WTI', category: 'energy',
    pipSize: 0.01, pipValue: 1, minLotSize: 0.01, maxLotSize: 50,
    lotStep: 0.01, contractSize: 1000, tradingHours: '24/5',
    spreadTypical: 0.03, makerFee: 0, takerFee: 0,
  },
  'BCO_USD': {
    symbol: 'BCO_USD', displayName: 'Brent Crude Oil', category: 'energy',
    pipSize: 0.01, pipValue: 1, minLotSize: 0.01, maxLotSize: 50,
    lotStep: 0.01, contractSize: 1000, tradingHours: '24/5',
    spreadTypical: 0.04, makerFee: 0, takerFee: 0,
  },

  // Indices
  'US30_USD': {
    symbol: 'US30_USD', displayName: 'US Wall Street 30', category: 'index',
    pipSize: 0.1, pipValue: 1, minLotSize: 0.01, maxLotSize: 10,
    lotStep: 0.01, contractSize: 1, tradingHours: 'market_hours',
    spreadTypical: 2.0, makerFee: 0, takerFee: 0,
  },
  'SPX500_USD': {
    symbol: 'SPX500_USD', displayName: 'US S&P 500', category: 'index',
    pipSize: 0.1, pipValue: 1, minLotSize: 0.01, maxLotSize: 10,
    lotStep: 0.01, contractSize: 1, tradingHours: 'market_hours',
    spreadTypical: 0.5, makerFee: 0, takerFee: 0,
  },
  'NAS100_USD': {
    symbol: 'NAS100_USD', displayName: 'US Tech 100 (NASDAQ)', category: 'index',
    pipSize: 0.1, pipValue: 1, minLotSize: 0.01, maxLotSize: 10,
    lotStep: 0.01, contractSize: 1, tradingHours: 'market_hours',
    spreadTypical: 1.5, makerFee: 0, takerFee: 0,
  },
};

// ============================================
// OANDA Adapter Class
// ============================================

export class OandaAdapter implements IBroker {
  private accountId: string = '';
  private apiToken: string = '';
  private isDemo: boolean = true;
  private connected: boolean = false;
  private baseUrl: string = '';

  constructor() {}

  // ============================================
  // Credentials
  // ============================================

  setCredentials(accountId: string, apiToken: string, isDemo: boolean): void {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.isDemo = isDemo;
    this.baseUrl = isDemo ? OANDA_ENVIRONMENTS.practice : OANDA_ENVIRONMENTS.live;
    this.connected = false;
    console.log(`[OANDA] Credentials set. Account: ${accountId}, Demo: ${isDemo}`);
  }

  async validateCredentials(): Promise<{ valid: boolean; message: string }> {
    try {
      if (!this.accountId || !this.apiToken) {
        return { valid: false, message: 'Account ID and API Token required' };
      }

      const res = await this.fetch(`/v3/accounts/${this.accountId}/summary`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { valid: false, message: err.errorMessage || `HTTP ${res.status}` };
      }

      const data = await res.json();
      const account = data.account;
      this.connected = true;

      return {
        valid: true,
        message: `Connected: ${account.currency} ${parseFloat(account.balance).toFixed(2)} (${this.isDemo ? 'Demo' : 'Live'})`,
      };
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  // ============================================
  // Identification
  // ============================================

  getBrokerName(): string {
    return 'OANDA';
  }

  async getSupportedSymbols(): Promise<string[]> {
    return Object.keys(SYMBOL_SPECS);
  }

  async getSymbolSpec(symbol: string): Promise<SymbolSpec> {
    const normalized = this.normalizeSymbol(symbol);
    return SYMBOL_SPECS[normalized] || {
      symbol: normalized, displayName: normalized, category: 'forex',
      pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
      lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
      spreadTypical: 1.0, makerFee: 0, takerFee: 0,
    };
  }

  // ============================================
  // Market Data
  // ============================================

  async getPrice(symbol: string): Promise<number> {
    const normalized = this.normalizeSymbol(symbol);
    try {
      const res = await this.fetch(`/v3/accounts/${this.accountId}/pricing`, {
        query: { instruments: normalized }
      });
      const data = await res.json();
      if (!data.prices || data.prices.length === 0) {
        throw new Error(`No price for ${symbol}`);
      }
      const price = data.prices[0];
      // Use mid price
      return (parseFloat(price.closeoutAsk) + parseFloat(price.closeoutBid)) / 2;
    } catch (err) {
      console.error(`[OANDA] Price fetch error for ${symbol}:`, err);
      return 0;
    }
  }

  async getBatchPrices(symbols: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const sym of symbols) {
      result[sym] = await this.getPrice(sym);
    }
    return result;
  }

  async getKlines(symbol: string, timeframe: string, limit: number): Promise<Candle[]> {
    const normalized = this.normalizeSymbol(symbol);
    try {
      // Map timeframe to OANDA granularity
      const granularity = this.mapTimeframe(timeframe);

      const res = await this.fetch(`/v3/instruments/${normalized}/candles`, {
        query: {
          granularity,
          count: Math.min(limit, 500).toString(),
          price: 'MBA', // Mid, Bid, Ask
        }
      });
      const data = await res.json();

      if (!data.candles) return [];

      return data.candles
        .filter((c: any) => c.complete)
        .map((c: any) => ({
          time: new Date(c.time).getTime(),
          open: parseFloat(c.mid?.o || 0),
          high: parseFloat(c.mid?.h || 0),
          low: parseFloat(c.mid?.l || 0),
          close: parseFloat(c.mid?.c || 0),
          volume: parseInt(c.volume || '0'),
        }));
    } catch (err) {
      console.error(`[OANDA] Klines fetch error for ${symbol}:`, err);
      return [];
    }
  }

  async getOrderBook(symbol: string, depth: number = 10): Promise<OrderBookData> {
    const normalized = this.normalizeSymbol(symbol);
    try {
      // OANDA doesn't have traditional order book, use pricing with spread
      const res = await this.fetch(`/v3/accounts/${this.accountId}/pricing`, {
        query: { instruments: normalized }
      });
      const data = await res.json();
      if (!data.prices || data.prices.length === 0) {
        throw new Error(`No order book for ${symbol}`);
      }
      const price = data.prices[0];
      const bid = parseFloat(price.closeoutBid);
      const ask = parseFloat(price.closeoutAsk);
      const spread = ask - bid;

      // Create synthetic order book
      const bids = Array.from({ length: depth }, (_, i) => ({
        price: bid - (spread * i * 0.5),
        quantity: 1000000, // Standard lot
      }));
      const asks = Array.from({ length: depth }, (_, i) => ({
        price: ask + (spread * i * 0.5),
        quantity: 1000000,
      }));

      return {
        symbol: normalized,
        bids,
        asks,
        spread,
      };
    } catch (err) {
      return { symbol: normalized, bids: [], asks: [], spread: 0 };
    }
  }

  // ============================================
  // Trading
  // ============================================

  async placeMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number): Promise<OrderResult> {
    return this.placeOrder(symbol, side, quantity, 'MARKET');
  }

  async placeLimitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number): Promise<OrderResult> {
    return this.placeOrder(symbol, side, quantity, 'LIMIT', price);
  }

  async placeStopOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, stopPrice: number): Promise<OrderResult> {
    return this.placeOrder(symbol, side, quantity, 'STOP', undefined, stopPrice);
  }

  async closePosition(symbol: string, quantity: number): Promise<OrderResult> {
    // OANDA closes by specifying units with opposite side
    // For now, we use the account position close endpoint
    const normalized = this.normalizeSymbol(symbol);
    try {
      const res = await this.fetch(`/v3/accounts/${this.accountId}/positions/${normalized}/close`, {
        method: 'PUT',
        body: JSON.stringify({
          longUnits: 'ALL',
          shortUnits: 'ALL',
        })
      });
      const data = await res.json();
      return {
        success: res.ok,
        orderId: data.relatedTransactionIDs?.[0],
        symbol: normalized,
        side: 'SELL',
        type: 'MARKET',
        quantity,
        status: 'FILLED',
      };
    } catch (err) {
      return {
        success: false,
        symbol: normalized,
        side: 'SELL',
        type: 'MARKET',
        quantity,
        error: err instanceof Error ? err.message : 'Close failed',
      };
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<boolean> {
    try {
      const res = await this.fetch(`/v3/accounts/${this.accountId}/orders/${orderId}/cancel`, {
        method: 'PUT',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ============================================
  // Account
  // ============================================

  async getAccountData(): Promise<AccountData> {
    try {
      const res = await this.fetch(`/v3/accounts/${this.accountId}/summary`);
      const data = await res.json();
      const acc = data.account;

      const balance = parseFloat(acc.balance || '0');
      const equity = parseFloat(acc.NAV || acc.balance || '0');
      const margin = parseFloat(acc.marginUsed || '0');
      const freeMargin = parseFloat(acc.marginAvailable || '0');
      const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;

      return {
        balance,
        equity,
        margin,
        freeMargin,
        marginLevel,
        currency: acc.currency || 'USD',
      };
    } catch (err) {
      console.error('[OANDA] Account data error:', err);
      return { balance: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0, currency: 'USD' };
    }
  }

  async getBalance(): Promise<number> {
    const data = await this.getAccountData();
    return data.balance;
  }

  async getOpenPositions(): Promise<PositionData[]> {
    try {
      const res = await this.fetch(`/v3/accounts/${this.accountId}/openPositions`);
      const data = await res.json();

      if (!data.positions) return [];

      return data.positions.map((pos: any) => {
        // Correct: derive side from currentUnits sign (positive = LONG, negative = SHORT)
        const side = parseFloat(pos.trade.currentUnits) > 0 ? 'LONG' : 'SHORT';
        return {
          id: pos.trade.id,
          symbol: pos.instrument,
          side: side as 'LONG' | 'SHORT',
          entryPrice: parseFloat(pos.trade.price),
          currentPrice: parseFloat(pos.trade.price), // Entry price; real-time update needs separate fetch
          quantity: Math.abs(parseFloat(pos.trade.currentUnits)),
          unrealizedPnl: parseFloat(pos.unrealizedPL || pos.pl || '0'),
          stopLoss: pos.trade.guaranteedStopLossOrder ? parseFloat(pos.trade.guaranteedStopLossOrder.price) : undefined,
          takeProfit: pos.trade.takeProfitOrder ? parseFloat(pos.trade.takeProfitOrder.price) : undefined,
          openedAt: new Date(pos.trade.openTime),
        };
      });
    } catch (err) {
      console.error('[OANDA] Open positions error:', err);
      return [];
    }
  }

  // ============================================
  // Market Status
  // ============================================

  isMarketOpen(symbol: string): boolean {
    const normalized = this.normalizeSymbol(symbol);
    const spec = SYMBOL_SPECS[normalized];
    if (!spec) return false;

    if (spec.tradingHours === '24/7') return true;

    // 24/5: closed Saturday 22:00 UTC to Sunday 22:00 UTC
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();

    if (day === 6 && hour >= 22) return false; // Saturday after 22:00
    if (day === 0 && hour < 22) return false;  // Sunday before 22:00

    return true;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ============================================
  // Internal Methods
  // ============================================

  private async placeOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    type: 'MARKET' | 'LIMIT' | 'STOP',
    price?: number,
    stopPrice?: number
  ): Promise<OrderResult> {
    const normalized = this.normalizeSymbol(symbol);

    try {
      const orderData: any = {
        order: {
          instrument: normalized,
          units: side === 'BUY' ? quantity.toString() : (-quantity).toString(),
          type: type === 'MARKET' ? 'MARKET' : type === 'LIMIT' ? 'LIMIT' : 'STOP',
          timeInForce: 'FOK',
        }
      };

      if (type === 'LIMIT' && price) {
        orderData.order.price = price.toFixed(5);
        orderData.order.timeInForce = 'GTC'; // Good Till Cancel
      }
      if (type === 'STOP' && stopPrice) {
        orderData.order.price = stopPrice.toFixed(5);
        orderData.order.timeInForce = 'GTC';
      }

      const res = await this.fetch(`/v3/accounts/${this.accountId}/orders`, {
        method: 'POST',
        body: JSON.stringify(orderData),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          symbol: normalized,
          side,
          type,
          quantity,
          price,
          error: data.errorMessage || `HTTP ${res.status}`,
        };
      }

      const order = data.order;
      const trades = data.relatedTransactionIDs || [];

      return {
        success: true,
        orderId: order.id,
        clientOrderId: order.clientExtensions?.id,
        symbol: normalized,
        side,
        type,
        quantity,
        price: price ? parseFloat(order.price) : undefined,
        status: order.state,
        fills: trades.map((id: string) => ({
          price: order.price || '0',
          quantity: order.units,
          commission: '0',
        })),
      };
    } catch (err) {
      return {
        success: false,
        symbol: normalized,
        side,
        type,
        quantity,
        price,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async fetch(path: string, options: RequestInit & { query?: Record<string, string> } = {}): Promise<Response> {
    const { query, ...fetchOptions } = options;

    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    return fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`,
        ...fetchOptions.headers,
      },
    });
  }

  private normalizeSymbol(symbol: string): string {
    // Convert various formats to OANDA format
    const mappings: Record<string, string> = {
      // Forex
      'EURUSD': 'EUR_USD', 'EUR/USD': 'EUR_USD',
      'GBPUSD': 'GBP_USD', 'GBP/USD': 'GBP_USD',
      'USDJPY': 'USD_JPY', 'USD/JPY': 'USD_JPY',
      'AUDUSD': 'AUD_USD', 'AUD/USD': 'AUD_USD',
      'USDCHF': 'USD_CHF', 'USD/CHF': 'USD_CHF',
      // Metals
      'XAUUSD': 'XAU_USD', 'XAU/USD': 'XAU_USD', 'GOLD': 'XAU_USD',
      'XAGUSD': 'XAG_USD', 'XAG/USD': 'XAG_USD', 'SILVER': 'XAG_USD',
      // Energy
      'WTI': 'WTI_USD', 'WTIUSD': 'WTI_USD', 'OIL': 'WTI_USD', 'USOIL': 'WTI_USD',
      'BCO': 'BCO_USD', 'BRENT': 'BCO_USD', 'UKOIL': 'BCO_USD',
      // Indices
      'US30': 'US30_USD', 'DJI': 'US30_USD',
      'SPX500': 'SPX500_USD', 'SPX': 'SPX500_USD',
      'NAS100': 'NAS100_USD', 'NDX': 'NAS100_USD',
    };

    const upper = symbol.toUpperCase().replace(/[\/\-\s]/g, '');
    return mappings[upper] || symbol.replace('/', '_').replace('-', '_');
  }

  private mapTimeframe(timeframe: string): string {
    const map: Record<string, string> = {
      '1m': 'M1', '3m': 'M3', '5m': 'M5', '10m': 'M10',
      '15m': 'M15', '30m': 'M30', '1h': 'H1', '2h': 'H2',
      '3h': 'H3', '4h': 'H4', '6h': 'H6', '8h': 'H8',
      '12h': 'H12', '1d': 'D', '1w': 'W',
    };
    return map[timeframe] || 'M5'; // Default to 5-minute candles
  }
}

// ============================================
// Singleton
// ============================================

let globalOanda: OandaAdapter | null = null;

export function getOandaBroker(): OandaAdapter {
  if (!globalOanda) {
    globalOanda = new OandaAdapter();
  }
  return globalOanda;
}
