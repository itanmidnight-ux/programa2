// ============================================
// RECO-TRADING - cTrader WebSocket Client
// ============================================
// Real-time streaming for prices, candles, and
// account updates via cTrader Open API WebSocket.
// ============================================

import WebSocket from 'ws';

export interface cTraderWebSocketConfig {
  appId: string;
  appSecret: string;
  ctraderId: string;
  isDemo: boolean;
}

export type cTraderEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'price'
  | 'candle'
  | 'balance_update'
  | 'position_update'
  | 'order_fill';

export interface cTraderEvent {
  type: cTraderEventType;
  data: any;
  timestamp: number;
}

export interface PriceUpdate {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface CandleUpdate {
  symbol: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  isClosed: boolean;
}

type EventHandler = (event: cTraderEvent) => void;

const WS_URL_DEMO = 'wss://demo.ctrader.com:443';
const WS_URL_LIVE = 'wss://live.ctrader.com:443';

export class cTraderWebSocket {
  private ws: WebSocket | null = null;
  private config: cTraderWebSocketConfig;
  private handlers: Map<cTraderEventType, EventHandler[]> = new Map();
  private subscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isManuallyClosed = false;

  constructor(config: cTraderWebSocketConfig) {
    this.config = config;
  }

  /** Connect to cTrader WebSocket */
  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      const url = this.config.isDemo ? WS_URL_DEMO : WS_URL_LIVE;

      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          console.log('[cTrader WS] Connected');
          this.reconnectAttempts = 0;
          this.authenticate();
          this.emit('connected', { url });
          resolve(true);
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (err) {
            console.error('[cTrader WS] Failed to parse message:', err);
          }
        });

        this.ws.on('error', (error) => {
          console.error('[cTrader WS] Error:', error.message);
          this.emit('error', { error: error.message });
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnect();
          }
          resolve(false);
        });

        this.ws.on('close', () => {
          console.log('[cTrader WS] Closed');
          this.emit('disconnected', {});
          if (!this.isManuallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnect();
          }
        });
      } catch (err) {
        console.error('[cTrader WS] Connection failed:', err);
        resolve(false);
      }
    });
  }

  /** Authenticate after connection */
  private authenticate(): void {
    const authMsg = {
      type: 'authorize',
      app_id: this.config.appId,
      app_secret: this.config.appSecret,
      ctrader_id: this.config.ctraderId,
    };
    this.send(authMsg);
  }

  /** Subscribe to price updates for a symbol */
  subscribePrices(symbol: string): void {
    const key = `prices:${symbol}`;
    if (!this.subscriptions.has(key)) {
      this.send({
        type: 'subscribe',
        channel: 'prices',
        symbol,
      });
      this.subscriptions.add(key);
      console.log(`[cTrader WS] Subscribed to prices: ${symbol}`);
    }
  }

  /** Subscribe to candle updates */
  subscribeCandles(symbol: string, timeframe: string): void {
    const key = `candles:${symbol}:${timeframe}`;
    if (!this.subscriptions.has(key)) {
      this.send({
        type: 'subscribe',
        channel: 'candles',
        symbol,
        timeframe,
      });
      this.subscriptions.add(key);
      console.log(`[cTrader WS] Subscribed to candles: ${symbol} ${timeframe}`);
    }
  }

  /** Subscribe to account updates */
  subscribeAccount(): void {
    this.send({
      type: 'subscribe',
      channel: 'account',
    });
    console.log('[cTrader WS] Subscribed to account updates');
  }

  /** Subscribe to position updates */
  subscribePositions(): void {
    this.send({
      type: 'subscribe',
      channel: 'positions',
    });
    console.log('[cTrader WS] Subscribed to position updates');
  }

  /** Handle incoming messages */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'price_update':
        this.emit('price', {
          type: 'price',
          data: {
            symbol: message.symbol,
            bid: message.bid,
            ask: message.ask,
            timestamp: message.timestamp || Date.now(),
          } as PriceUpdate,
          timestamp: Date.now(),
        });
        break;

      case 'candle_update':
        this.emit('candle', {
          type: 'candle',
          data: {
            symbol: message.symbol,
            timeframe: message.timeframe,
            open: message.open,
            high: message.high,
            low: message.low,
            close: message.close,
            volume: message.volume || 0,
            timestamp: message.timestamp || Date.now(),
            isClosed: message.is_closed || false,
          } as CandleUpdate,
          timestamp: Date.now(),
        });
        break;

      case 'balance_update':
        this.emit('balance_update', {
          type: 'balance_update',
          data: message.data,
          timestamp: Date.now(),
        });
        break;

      case 'position_update':
        this.emit('position_update', {
          type: 'position_update',
          data: message.data,
          timestamp: Date.now(),
        });
        break;

      case 'error':
        this.emit('error', {
          type: 'error',
          data: { error: message.message },
          timestamp: Date.now(),
        });
        break;
    }
  }

  /** Send message to WebSocket */
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[cTrader WS] Cannot send - not connected');
    }
  }

  /** Register event handler */
  on(event: cTraderEventType, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  /** Remove event handler */
  off(event: cTraderEventType, handler: EventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }

  /** Emit event to all handlers */
  private emit(event: cTraderEventType, data: any): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(h => h(data));
    }
  }

  /** Reconnect with exponential backoff */
  private reconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[cTrader WS] Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (!this.isManuallyClosed) {
        this.connect();
      }
    }, delay);
  }

  /** Close connection */
  close(): void {
    this.isManuallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log('[cTrader WS] Manually closed');
  }

  /** Check if connected */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
