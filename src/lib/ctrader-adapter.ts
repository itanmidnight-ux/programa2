// ============================================
// RECO-TRADING - cTrader Broker Adapter
// ============================================
// Implements IBroker interface for cTrader Open API.
// Supports Forex, Metals, Energy, Indices.
// Works with IC Markets, Pepperstone, FP Markets.
// ============================================

import type { Candle } from '@/lib/analysis-engine';
import type {
  IBroker,
  SymbolSpec,
  OrderResult,
  PositionData,
  AccountData,
  OrderBookData,
} from '@/lib/broker-interface';

// ============================================
// cTrader Open API Configuration
// ============================================

const CTRADER_API_BASE_DEMO = 'https://demo.ctrader.com/api/v2';
const CTRADER_API_BASE_LIVE = 'https://live.ctrader.com/api/v2';

// ============================================
// cTrader Symbol Specifications (Forex/CFDs)
// ============================================

const SYMBOL_SPECS: Record<string, SymbolSpec> = {
  // Forex Majors
  'EURUSD': {
    symbol: 'EURUSD', displayName: 'EUR/USD', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 0.02, makerFee: 0, takerFee: 0,
  },
  'GBPUSD': {
    symbol: 'GBPUSD', displayName: 'GBP/USD', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 0.06, makerFee: 0, takerFee: 0,
  },
  'USDJPY': {
    symbol: 'USDJPY', displayName: 'USD/JPY', category: 'forex',
    pipSize: 0.01, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 0.05, makerFee: 0, takerFee: 0,
  },
  'AUDUSD': {
    symbol: 'AUDUSD', displayName: 'AUD/USD', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 0.06, makerFee: 0, takerFee: 0,
  },
  'USDCAD': {
    symbol: 'USDCAD', displayName: 'USD/CAD', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 0.07, makerFee: 0, takerFee: 0,
  },
  'NZDUSD': {
    symbol: 'NZDUSD', displayName: 'NZD/USD', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 0.09, makerFee: 0, takerFee: 0,
  },
  'USDCHF': {
    symbol: 'USDCHF', displayName: 'USD/CHF', category: 'forex',
    pipSize: 0.0001, pipValue: 10, minLotSize: 0.01, maxLotSize: 100,
    lotStep: 0.01, contractSize: 100000, tradingHours: '24/5',
    spreadTypical: 0.07, makerFee: 0, takerFee: 0,
  },
  // Metals
  'XAUUSD': {
    symbol: 'XAUUSD', displayName: 'XAU/USD (Gold)', category: 'metal',
    pipSize: 0.01, pipValue: 1, minLotSize: 0.01, maxLotSize: 50,
    lotStep: 0.01, contractSize: 100, tradingHours: '24/5',
    spreadTypical: 0.10, makerFee: 0, takerFee: 0,
  },
  'XAGUSD': {
    symbol: 'XAGUSD', displayName: 'XAG/USD (Silver)', category: 'metal',
    pipSize: 0.001, pipValue: 1, minLotSize: 0.01, maxLotSize: 50,
    lotStep: 0.01, contractSize: 5000, tradingHours: '24/5',
    spreadTypical: 0.50, makerFee: 0, takerFee: 0,
  },
  // Indices
  'US30': {
    symbol: 'US30', displayName: 'US30 (Dow Jones)', category: 'index',
    pipSize: 1, pipValue: 1, minLotSize: 0.01, maxLotSize: 10,
    lotStep: 0.01, contractSize: 1, tradingHours: 'market_hours',
    spreadTypical: 1.0, makerFee: 0, takerFee: 0,
  },
  'SPX500': {
    symbol: 'SPX500', displayName: 'S&P 500', category: 'index',
    pipSize: 0.1, pipValue: 1, minLotSize: 0.01, maxLotSize: 10,
    lotStep: 0.01, contractSize: 1, tradingHours: 'market_hours',
    spreadTypical: 0.5, makerFee: 0, takerFee: 0,
  },
  'NAS100': {
    symbol: 'NAS100', displayName: 'NASDAQ 100', category: 'index',
    pipSize: 0.1, pipValue: 1, minLotSize: 0.01, maxLotSize: 10,
    lotStep: 0.01, contractSize: 1, tradingHours: 'market_hours',
    spreadTypical: 0.8, makerFee: 0, takerFee: 0,
  },
};

// ============================================
// cTrader Adapter Class
// ============================================

export class cTraderAdapter implements IBroker {
  private appId: string = '';
  private appSecret: string = '';
  private ctraderId: string = '';
  private isDemo: boolean = true;
  private accessToken: string = '';
  private tokenExpiry: number = 0;
  private connected: boolean = false;

  /** Normalize symbol name (EURUSD, XAUUSD, etc.) */
  private normalizeSymbol(symbol: string): string {
    return symbol.replace(/[_\-\/]/g, '').toUpperCase();
  }

  /** Get API base URL */
  private getApiBase(): string {
    return this.isDemo ? CTRADER_API_BASE_DEMO : CTRADER_API_BASE_LIVE;
  }

  /** Make authenticated API request */
  private async apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    // Refresh token if needed
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }

    const url = `${this.getApiBase()}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      ...options.headers as Record<string, string>,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`cTrader API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /** Authenticate with cTrader Open API */
  private async authenticate(): Promise<void> {
    try {
      const response = await fetch(`${this.getApiBase()}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: this.appId,
          client_secret: this.appSecret,
          ctrader_id: this.ctraderId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 min buffer
      this.connected = true;
      console.log('[cTrader] Authenticated successfully');
    } catch (err: any) {
      console.error('[cTrader] Authentication failed:', err.message);
      this.connected = false;
      throw err;
    }
  }

  // ============================================
  // IBroker Implementation
  // ============================================

  getBrokerName(): string {
    return 'cTrader';
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
      spreadTypical: 0.1, makerFee: 0, takerFee: 0,
    };
  }

  async getPrice(symbol: string): Promise<number> {
    const normalized = this.normalizeSymbol(symbol);
    try {
      const data = await this.apiRequest(`/prices/${normalized}`);
      return data.bid || data.price || 0;
    } catch (err) {
      console.error(`[cTrader] Failed to get price for ${symbol}:`, err);
      return 0;
    }
  }

  async getBatchPrices(symbols: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    await Promise.all(
      symbols.map(async (s) => {
        result[s] = await this.getPrice(s);
      })
    );
    return result;
  }

  async getKlines(symbol: string, timeframe: string, limit: number): Promise<Candle[]> {
    const normalized = this.normalizeSymbol(symbol);

    // Map timeframe to cTrader format
    const tfMap: Record<string, string> = {
      '1m': 'Minute1', '5m': 'Minute5', '15m': 'Minute15',
      '30m': 'Minute30', '1h': 'Hour', '4h': 'Hour4',
      '1d': 'Daily', '1w': 'Weekly',
    };
    const cTraderTf = tfMap[timeframe] || timeframe;

    try {
      const data = await this.apiRequest(
        `/candles/${normalized}?tf=${cTraderTf}&count=${limit}`
      );

      if (!data || !Array.isArray(data)) return [];

      return data.map((candle: any) => ({
        time: candle.timestamp || candle.time || Date.now(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.tick_volume || candle.volume || 0,
      }));
    } catch (err) {
      console.error(`[cTrader] Failed to get klines for ${symbol}:`, err);
      return [];
    }
  }

  async getOrderBook(symbol: string, depth: number = 10): Promise<OrderBookData> {
    const normalized = this.normalizeSymbol(symbol);

    try {
      // cTrader doesn't have traditional order book for CFDs
      // Return synthetic order book based on bid/ask spread
      const data = await this.apiRequest(`/prices/${normalized}`);
      const bid = data.bid || 0;
      const ask = data.ask || bid + (data.spread || 0.0001);
      const spread = ask - bid;

      // Generate synthetic depth levels
      const bids = Array.from({ length: depth }, (_, i) => ({
        price: +(bid - (spread * 0.5 * (i + 1))).toFixed(5),
        quantity: +(10 - i).toFixed(2),
      }));

      const asks = Array.from({ length: depth }, (_, i) => ({
        price: +(ask + (spread * 0.5 * (i + 1))).toFixed(5),
        quantity: +(10 - i).toFixed(2),
      }));

      return {
        symbol: normalized,
        bids,
        asks,
        spread,
      };
    } catch (err) {
      console.error(`[cTrader] Failed to get order book for ${symbol}:`, err);
      return { symbol: normalized, bids: [], asks: [], spread: 0 };
    }
  }

  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number
  ): Promise<OrderResult> {
    const normalized = this.normalizeSymbol(symbol);

    try {
      const data = await this.apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: normalized,
          side: side === 'BUY' ? 'buy' : 'sell',
          type: 'market',
          quantity,
        }),
      });

      return {
        success: true,
        orderId: String(data.id || data.order_id || ''),
        symbol: normalized,
        side,
        type: 'MARKET',
        quantity,
        fillPrice: data.fill_price || data.price || 0,
        status: data.status || 'filled',
        fills: data.fills || [],
      };
    } catch (err: any) {
      console.error(`[cTrader] Market order failed for ${symbol}:`, err.message);
      return {
        success: false,
        symbol: normalized,
        side,
        type: 'MARKET',
        quantity,
        error: err.message || 'Order failed',
      };
    }
  }

  async placeLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number
  ): Promise<OrderResult> {
    const normalized = this.normalizeSymbol(symbol);

    try {
      const data = await this.apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: normalized,
          side: side === 'BUY' ? 'buy' : 'sell',
          type: 'limit',
          quantity,
          price,
        }),
      });

      return {
        success: true,
        orderId: String(data.id || data.order_id || ''),
        symbol: normalized,
        side,
        type: 'LIMIT',
        quantity,
        price,
        status: data.status || 'pending',
      };
    } catch (err: any) {
      return {
        success: false,
        symbol: normalized,
        side,
        type: 'LIMIT',
        quantity,
        price,
        error: err.message || 'Order failed',
      };
    }
  }

  async placeStopOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    stopPrice: number
  ): Promise<OrderResult> {
    const normalized = this.normalizeSymbol(symbol);

    try {
      const data = await this.apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: normalized,
          side: side === 'BUY' ? 'buy' : 'sell',
          type: 'stop',
          quantity,
          stop_price: stopPrice,
        }),
      });

      return {
        success: true,
        orderId: String(data.id || data.order_id || ''),
        symbol: normalized,
        side,
        type: 'STOP',
        quantity,
        price: stopPrice,
        status: data.status || 'pending',
      };
    } catch (err: any) {
      return {
        success: false,
        symbol: normalized,
        side,
        type: 'STOP',
        quantity,
        price: stopPrice,
        error: err.message || 'Order failed',
      };
    }
  }

  async closePosition(symbol: string, quantity: number): Promise<OrderResult> {
    const normalized = this.normalizeSymbol(symbol);

    try {
      // Close by placing opposite market order
      const data = await this.apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: normalized,
          side: 'close',
          type: 'market',
          quantity,
        }),
      });

      return {
        success: true,
        orderId: String(data.id || data.order_id || ''),
        symbol: normalized,
        side: 'SELL',
        type: 'MARKET',
        quantity,
        fillPrice: data.fill_price || 0,
        status: data.status || 'filled',
      };
    } catch (err: any) {
      return {
        success: false,
        symbol: normalized,
        side: 'SELL',
        type: 'MARKET',
        quantity,
        error: err.message || 'Close failed',
      };
    }
  }

  async cancelOrder(symbol: string, orderId: string): Promise<boolean> {
    try {
      await this.apiRequest(`/orders/${orderId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (err) {
      console.error('[cTrader] Cancel order failed:', err);
      return false;
    }
  }

  async getAccountData(): Promise<AccountData> {
    try {
      const data = await this.apiRequest('/accounts');
      const account = data[0] || data;

      return {
        balance: account.balance || 0,
        equity: account.equity || 0,
        margin: account.margin || 0,
        freeMargin: account.free_margin || 0,
        marginLevel: account.margin_level || 0,
        currency: account.currency || 'USD',
      };
    } catch (err) {
      console.error('[cTrader] Failed to get account data:', err);
      return { balance: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0, currency: 'USD' };
    }
  }

  async getOpenPositions(): Promise<PositionData[]> {
    try {
      const data = await this.apiRequest('/positions');

      if (!Array.isArray(data)) return [];

      return data.map((pos: any) => ({
        id: String(pos.id || ''),
        symbol: pos.symbol || '',
        side: pos.side === 'buy' ? 'LONG' : 'SHORT',
        entryPrice: pos.entry_price || 0,
        currentPrice: pos.current_price || pos.price || 0,
        quantity: pos.quantity || 0,
        unrealizedPnl: pos.profit || 0,
        stopLoss: pos.stop_loss || undefined,
        takeProfit: pos.take_profit || undefined,
        openedAt: new Date(pos.opened_at || pos.timestamp || Date.now()),
      }));
    } catch (err) {
      console.error('[cTrader] Failed to get open positions:', err);
      return [];
    }
  }

  async getBalance(): Promise<number> {
    const data = await this.getAccountData();
    return data.balance;
  }

  isMarketOpen(symbol: string): boolean {
    const spec = SYMBOL_SPECS[this.normalizeSymbol(symbol)];
    if (!spec) return true;

    if (spec.tradingHours === '24/5') {
      // Forex/metal: open Mon-Fri 22:00 GMT Sun - 22:00 GMT Fri
      const now = new Date();
      const day = now.getUTCDay();
      if (day === 0 || day === 6) return false;
      return true;
    }

    if (spec.tradingHours === '24/7') {
      return true;
    }

    // Market hours: assume standard stock market hours
    const hour = new Date().getUTCHours();
    return hour >= 9 && hour <= 16;
  }

  isConnected(): boolean {
    return this.connected;
  }

  setCredentials(accountId: string, apiToken: string, isDemo: boolean): void {
    // cTrader uses appId, appSecret, ctraderId
    // accountId -> appId, apiToken -> appSecret, isDemo -> isDemo
    // We parse the ctraderId from accountId if it contains a separator
    const parts = accountId.split(':');
    this.appId = parts[0] || accountId;
    this.appSecret = apiToken;
    this.ctraderId = parts[1] || parts[0] || '';
    this.isDemo = isDemo;
    console.log(`[cTrader] Credentials set: ${this.appId}, Demo: ${isDemo}`);
  }

  async validateCredentials(): Promise<{ valid: boolean; message: string }> {
    try {
      await this.authenticate();
      const accountData = await this.getAccountData();
      return {
        valid: true,
        message: `Connected to cTrader (${this.isDemo ? 'Demo' : 'Live'}). Balance: ${accountData.balance} ${accountData.currency}`,
      };
    } catch (err: any) {
      return {
        valid: false,
        message: `Connection failed: ${err.message}`,
      };
    }
  }
}

// ============================================
// Singleton Pattern
// ============================================

let cTraderInstance: cTraderAdapter | null = null;

export function getCTraderBroker(): cTraderAdapter {
  if (!cTraderInstance) {
    cTraderInstance = new cTraderAdapter();
    console.log('[cTrader] New adapter instance created');
  }
  return cTraderInstance;
}

export { cTraderAdapter as CTraderAdapter };
