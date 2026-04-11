// ============================================
// RECO-TRADING - Binance WebSocket Client
// ============================================
// Real-time market data via WebSocket streams
// Replaces slow REST polling with <100ms updates
// ============================================

import WebSocket from 'ws';
import { EventEmitter } from 'events';

// ============================================
// Types
// ============================================

export interface WSConfig {
  pairs: string[];
  testnet: boolean;
  reconnectMaxAttempts?: number;
  healthCheckInterval?: number;
}

export interface KlineData {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closed: boolean;
}

export interface TradeData {
  symbol: string;
  price: string;
  quantity: string;
  time: number;
  isBuyerMaker: boolean;
}

export interface TickerData {
  symbol: string;
  price: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  priceChange: string;
  priceChangePercent: string;
}

export interface OrderBookData {
  symbol: string;
  bids: Array<{ price: string; quantity: string }>;
  asks: Array<{ price: string; quantity: string }>;
  updateId: number;
}

// ============================================
// WebSocket Client Class
// ============================================

export class BinanceWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WSConfig;
  private streams: string[] = [];
  private reconnectCount = 0;
  private lastMessageTime = 0;
  private isConnecting = false;
  private healthCheckId: NodeJS.Timeout | null = null;
  private klineCache: Map<string, KlineData> = new Map();
  private currentPrices: Map<string, number> = new Map();
  private orderBooks: Map<string, OrderBookData> = new Map();

  constructor(config: WSConfig) {
    super();
    this.config = {
      pairs: config.pairs,
      testnet: config.testnet,
      reconnectMaxAttempts: config.reconnectMaxAttempts || 10,
      healthCheckInterval: config.healthCheckInterval || 5000,
    };
  }

  // ============================================
  // Connection Management
  // ============================================

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('Already connecting'));
        return;
      }

      this.isConnecting = true;

      const baseUrl = this.config.testnet
        ? 'wss://testnet.binance.vision'
        : 'wss://stream.binance.com:9443';

      // Build stream list
      this.streams = this.config.pairs.flatMap(pair => {
        const p = pair.toLowerCase();
        return [
          `${p}@kline_1m`,
          `${p}@kline_5m`,
          `${p}@trade`,
          `${p}@ticker`,
          `${p}@depth10@100ms`,
        ];
      });

      const streamPath = this.streams.join('/');
      const url = `${baseUrl}/stream?streams=${streamPath}`;

      console.log(`[WS] Connecting to ${baseUrl}`);
      console.log(`[WS] Streams: ${this.streams.length} active for ${this.config.pairs.length} pairs`);

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log('[WS] ✅ Connection established');
        this.isConnecting = false;
        this.reconnectCount = 0;
        this.startHealthCheck();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.lastMessageTime = Date.now();
        this.handleMessage(data.toString());
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[WS] Connection closed (code: ${code})`);
        this.isConnecting = false;
        this.stopHealthCheck();
        this.handleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
        this.isConnecting = false;
        reject(err);
      });
    });
  }

  disconnect(): void {
    this.stopHealthCheck();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ============================================
  // Message Handler
  // ============================================

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      // Combined stream format: { stream: "...", data: {...} }
      if (msg.stream && msg.data) {
        this.handleStreamMessage(msg.stream, msg.data);
      }
    } catch (err) {
      console.error('[WS] Message parse error:', err);
    }
  }

  private handleStreamMessage(stream: string, data: any): void {
    if (stream.includes('@kline_') || data.k) {
      this.handleKline(data);
    } else if (stream.includes('@trade') || data.e === 'trade') {
      this.handleTrade(data);
    } else if (stream.includes('@ticker') || data.e === '24hrTicker') {
      this.handleTicker(data);
    } else if (stream.includes('@depth')) {
      this.handleOrderBook(data);
    }
  }

  // ============================================
  // Kline Handler
  // ============================================

  private handleKline(data: any): void {
    const kline = data.k;
    const klineData: KlineData = {
      symbol: data.s,
      interval: kline.i,
      openTime: kline.t,
      closeTime: kline.T,
      open: kline.o,
      high: kline.h,
      low: kline.l,
      close: kline.c,
      volume: kline.v,
      closed: kline.x,
    };

    // Update cache
    const cacheKey = `${klineData.symbol}@${klineData.interval}`;
    this.klineCache.set(cacheKey, klineData);

    this.emit('kline', klineData);
  }

  // ============================================
  // Trade Handler
  // ============================================

  private handleTrade(data: any): void {
    const trade: TradeData = {
      symbol: data.s,
      price: data.p,
      quantity: data.q,
      time: data.T,
      isBuyerMaker: data.m,
    };

    this.emit('trade', trade);
  }

  // ============================================
  // Ticker Handler (updates current prices)
  // ============================================

  private handleTicker(data: any): void {
    const ticker: TickerData = {
      symbol: data.s,
      price: data.c,
      highPrice: data.h,
      lowPrice: data.l,
      volume: data.v,
      priceChange: data.p,
      priceChangePercent: data.P,
    };

    // Update current price cache
    this.currentPrices.set(ticker.symbol, parseFloat(ticker.price));

    this.emit('ticker', ticker);
  }

  // ============================================
  // Order Book Handler
  // ============================================

  private handleOrderBook(data: any): void {
    const book: OrderBookData = {
      symbol: data.s,
      bids: data.b.map((b: string[]) => ({
        price: b[0],
        quantity: b[1],
      })),
      asks: data.a.map((a: string[]) => ({
        price: a[0],
        quantity: a[1],
      })),
      updateId: data.u,
    };

    this.orderBooks.set(book.symbol, book);
    this.emit('orderbook', book);
  }

  // ============================================
  // Reconnection Logic
  // ============================================

  private handleReconnect(): void {
    const maxAttempts = this.config.reconnectMaxAttempts || 10;
    
    if (this.reconnectCount >= maxAttempts) {
      console.error('[WS] ❌ Max reconnection attempts reached');
      this.emit('error', new Error('Max reconnection attempts'));
      return;
    }

    this.reconnectCount++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectCount), 30000);
    console.log(`[WS] 🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectCount}/${maxAttempts})`);

    setTimeout(() => {
      this.connect().catch(err => {
        console.error('[WS] Reconnection failed:', err);
      });
    }, delay);
  }

  // ============================================
  // Health Check
  // ============================================

  private startHealthCheck(): void {
    const interval = this.config.healthCheckInterval || 5000;

    this.healthCheckId = setInterval(() => {
      const timeSinceLastMessage = Date.now() - this.lastMessageTime;

      if (this.lastMessageTime > 0 && timeSinceLastMessage > 10000) {
        console.warn(`[WS] ⚠️ No messages in ${timeSinceLastMessage}ms, reconnecting...`);
        this.ws?.terminate();
      }
    }, interval);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckId) {
      clearInterval(this.healthCheckId);
      this.healthCheckId = null;
    }
  }

  // ============================================
  // Cache Access (for engine to use)
  // ============================================

  getCurrentPrice(symbol: string): number | undefined {
    return this.currentPrices.get(symbol);
  }

  getKlineCache(symbol: string, interval: string): KlineData | undefined {
    return this.klineCache.get(`${symbol}@${interval}`);
  }

  getOrderBook(symbol: string): OrderBookData | undefined {
    return this.orderBooks.get(symbol);
  }

  // ============================================
  // Status
  // ============================================

  getStatus(): {
    connected: boolean;
    streams: number;
    reconnectCount: number;
    lastMessageTime: number;
    pricesCached: number;
  } {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      streams: this.streams.length,
      reconnectCount: this.reconnectCount,
      lastMessageTime: this.lastMessageTime,
      pricesCached: this.currentPrices.size,
    };
  }
}
