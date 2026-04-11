// ============================================
// RECO-TRADING - Execution Engine
// ============================================
// Core trading execution loop that:
// - Fetches market data via Broker Manager (OANDA)
// - Runs analysis + strategies + ML
// - Validates all conditions
// - Executes trades via OANDA API
// - Manages open positions with trailing stops
// - Records everything to database
// ============================================

import {
  getKlines,
  getOrderBook,
  getTickerPrice,
  placeMarketOrder,
  placeStopOrder,
  closePosition as brokerClosePosition,
  getAccountBalance,
  isMarketOpen,
  isBrokerConnected,
  getBrokerName,
  getActiveSymbol,
  getSymbolSpec,
} from '@/lib/broker-manager';
import { analyzeMarket } from '@/lib/analysis-engine';
import type { Candle, FullAnalysis, OrderBookData } from '@/lib/analysis-engine';
import { StrategyEnsemble } from '@/lib/strategies';
import type { EnsembleResult } from '@/lib/strategies';
import { MLPredictor } from '@/lib/ml/predictor';
import type { MLPrediction } from '@/lib/ml/predictor';
import { RiskManager } from '@/lib/risk-manager';
import type { Trade } from '@/lib/risk-manager';
import { SmartStopLoss } from '@/lib/smart-stop-loss';
import type { StopAction } from '@/lib/smart-stop-loss';
import { SmartStopTrade } from '@/lib/smart-stop-trade';
import { evaluateMarket } from '@/lib/market-intelligence';
import type { MarketIntelligenceResult } from '@/lib/market-intelligence';
import { db } from '@/lib/db';

// ---- Types ----

export interface Position {
  id: number;
  tradeId: number;
  pair: string;
  side: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  unrealizedPnl: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;
  highestPrice?: number;
  lowestPrice?: number;
  openedAt: Date;
}

export interface EngineStatus {
  running: boolean;
  pair: string;
  testnet: boolean;
  lastTick: number;
  currentPrice: number;
  hasOpenPosition: boolean;
  positionSide?: string;
  positionEntry?: number;
  positionPnl?: number;
  signal: string;
  confidence: number;
  mlDirection: string | null;
  mlConfidence: number;
  tradesToday: number;
  dailyPnl: number;
  regime: string;
  uptime: number;
  tickCount: number;
  errorCount: number;
  lastError?: string;
  smartStopActive: boolean;
  smartStopPhase: number;
  smartStopTradePaused: boolean;
  smartStopTradeReason: string | null;
  positionSizeMultiplier: number;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  trade?: Trade;
  error?: string;
  message: string;
}

export interface TickResult {
  tickTime: number;
  price: number;
  analysis: FullAnalysis | null;
  ensemble: EnsembleResult | null;
  mlPrediction: MLPrediction | null;
  action: string;
  tradeResult?: TradeResult;
  error?: string;
}

export interface PositionAction {
  type: 'TRAILING_STOP' | 'BREAK_EVEN' | 'PROFIT_LOCK' | 'CLOSE' | 'CLOSE_PARTIAL' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT';
  message: string;
  newStopLoss?: number;
  newTakeProfit?: number;
  closePct?: number;
}

// ---- Configuration ----

interface ExecutionConfig {
  symbol: string;              // Trading symbol (e.g., XAU_USD)
  broker: string;              // Broker name (e.g., 'oanda')
  interval: number;            // tick interval in ms
  minConfidence: number;
  minMLConfidence: number;
  useML: boolean;
  dryRun: boolean;             // if true, don't place real orders
}

// ============================================
// EXECUTION ENGINE CLASS
// ============================================

export class ExecutionEngine {
  private isRunning = false;
  private currentPosition: Position | null = null;
  private lastSignal = 'HOLD';
  private tradeCount = 0;
  private dailyPnl = 0;
  private tickCount = 0;
  private errorCount = 0;
  private lastError?: string;
  private startTime = 0;
  private config: ExecutionConfig;

  // Subsystems
  private strategyEnsemble: StrategyEnsemble;
  private mlPredictor: MLPredictor;
  private riskManager: RiskManager;
  private smartStopLoss: SmartStopLoss;
  private smartStopTrade: SmartStopTrade;

  // Cache
  private candles5m: Candle[] = [];
  private candles15m: Candle[] = [];
  private candles1h: Candle[] = [];
  private candles4h: Candle[] = [];

  // API Cache for reducing latency
  private lastKlineFetch5m = 0;
  private lastKlineFetchHtf = 0;
  private readonly KLINE_CACHE_5M = 15000; // 15 seconds cache for 5m
  private readonly KLINE_CACHE_HTF = 60000; // 60 seconds cache for higher TFs
  private lastAnalysis: FullAnalysis | null = null;
  private lastEnsemble: EnsembleResult | null = null;
  private lastMLPrediction: MLPrediction | null = null;
  private lastMarketIntel: MarketIntelligenceResult | null = null;
  private cachedTrades: Trade[] = [];
  private lastRealBalance = 0;
  private positionSizeMultiplier: number = 1;

  constructor(config?: Partial<ExecutionConfig>) {
    this.config = {
      symbol: process.env.TRADING_SYMBOL || 'XAU_USD',
      broker: 'oanda',
      interval: parseInt(process.env.TICK_INTERVAL || '3000'),
      minConfidence: parseFloat(process.env.MIN_CONFIDENCE || '0.35'),
      minMLConfidence: 0.45,
      useML: true,
      dryRun: process.env.DRY_RUN === 'true',
      ...config,
    };

    this.strategyEnsemble = new StrategyEnsemble();
    this.mlPredictor = new MLPredictor();
    this.riskManager = new RiskManager();
    this.smartStopLoss = new SmartStopLoss();
    this.smartStopTrade = new SmartStopTrade();

    console.log(`[ENGINE] Initialized. Symbol: ${this.config.symbol}, Broker: ${this.config.broker}, DryRun: ${this.config.dryRun}`);

    // Load persisted configurations from DB asynchronously
    this.initSubsystemsFromDB().catch(err => console.error('[ENGINE] Failed to load configs from DB:', err));
  }

  /** Start the execution engine */
  start(): void {
    if (this.isRunning) {
      console.log('[ENGINE] Already running');
      return;
    }
    this.isRunning = true;
    this.startTime = Date.now();
    console.log('[ENGINE] Started');
  }

  /** Stop the execution engine */
  stop(): void {
    this.isRunning = false;
    console.log('[ENGINE] Stopped');
  }

  /** Get current engine status */
  getStatus(): EngineStatus {
    const hasOpen = this.currentPosition !== null;
    const totalPnl = hasOpen && this.currentPosition ? this.currentPosition.unrealizedPnl : 0;
    return {
      running: this.isRunning,
      pair: this.config.symbol,
      testnet: false,
      lastTick: this.lastAnalysis ? Date.now() : 0,
      currentPrice: this.lastAnalysis?.price || 0,
      hasOpenPosition: hasOpen,
      positionSide: hasOpen ? this.currentPosition?.side : undefined,
      positionEntry: hasOpen ? this.currentPosition?.entryPrice : undefined,
      positionPnl: hasOpen ? totalPnl : undefined,
      signal: this.lastSignal,
      confidence: this.lastEnsemble?.confidence || 0,
      mlDirection: this.lastMLPrediction?.direction || null,
      mlConfidence: this.lastMLPrediction?.confidence || 0,
      tradesToday: this.riskManager['dailyTradeCount'],
      dailyPnl: this.dailyPnl,
      regime: this.lastAnalysis?.marketRegime || 'UNKNOWN',
      uptime: this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0,
      tickCount: this.tickCount,
      errorCount: this.errorCount,
      lastError: this.lastError,
      smartStopActive: hasOpen,
      smartStopPhase: (hasOpen && this.currentPosition && this.lastAnalysis) ? this.smartStopLoss.getStatus(this.currentPosition, this.lastAnalysis).currentPhase : 0,
      smartStopTradePaused: this.smartStopTrade.getStatus().isPaused,
      smartStopTradeReason: this.smartStopTrade.getStatus().pauseReason,
      positionSizeMultiplier: this.positionSizeMultiplier,
    };
  }

  /** Main trading tick - called on interval */
  async tick(): Promise<TickResult> {
    const tickTime = Date.now();
    this.tickCount++;

    try {
      // 1. Fetch market data with caching
      const now = Date.now();

      // Always fetch latest price (no cache)
      const [price, orderBook] = await Promise.all([
        getTickerPrice(this.config.symbol),
        getOrderBook(this.config.symbol, 10).catch(() => null),
      ]);

      // Cache 5m klines - fetch new only every 15s
      if (now - this.lastKlineFetch5m > this.KLINE_CACHE_5M || this.candles5m.length === 0) {
        this.candles5m = await getKlines(this.config.symbol, '5m', 200);
        this.lastKlineFetch5m = now;
      }

      // Cache higher timeframes - fetch new only every 60s
      if (now - this.lastKlineFetchHtf > this.KLINE_CACHE_HTF || this.candles15m.length === 0) {
        try {
          const [c15m, c1h, c4h] = await Promise.all([
            getKlines(this.config.symbol, '15m', 200),
            getKlines(this.config.symbol, '1h', 200),
            getKlines(this.config.symbol, '4h', 200),
          ]);
          this.candles15m = c15m;
          this.candles1h = c1h;
          this.candles4h = c4h;
          this.lastKlineFetchHtf = now;
        } catch (err) {
          console.log('[ENGINE] Higher timeframe fetch failed:', err);
        }
      }

      // Fetch real balance periodically
      if (isBrokerConnected() && this.tickCount % 10 === 0) {
        try {
          const accountData = await getAccountBalance();
          this.lastRealBalance = accountData.balance;
          console.log(`[ENGINE] Real balance updated: ${this.lastRealBalance.toFixed(2)} ${accountData.currency}`);
        } catch (err) {
          console.log('[ENGINE] Balance fetch failed, using cached');
        }
      }

      // 2. Run analysis — adapt OrderBook to expected format
      let orderBookForAnalysis: OrderBookData | undefined;
      if (orderBook) {
        // getOrderBook returns { bid, ask, spread, bidVolume, askVolume }
        // but analyzeMarket expects { bid, ask, spread, bidVolume, askVolume, bids: [], asks: [] }
        orderBookForAnalysis = {
          ...(orderBook as any),
          bids: orderBook.bid ? [[orderBook.bid, orderBook.bidVolume || 0]] : [],
          asks: orderBook.ask ? [[orderBook.ask, orderBook.askVolume || 0]] : [],
        };
      }
      const analysis = analyzeMarket(this.candles5m, this.candles15m, this.candles1h, this.candles4h, orderBookForAnalysis);
      this.lastAnalysis = analysis;

      // 3. Run strategy ensemble
      const ensemble = this.strategyEnsemble.runAll(this.candles5m, analysis);
      this.lastEnsemble = ensemble;

      // 4. Run Market Intelligence (volatility regime + confidence + confluence)
      // This uses the reference reco-trading approach: evaluate market conditions
      // and adapt thresholds dynamically, but NEVER auto-block unless market is dead.
      let marketIntel: MarketIntelligenceResult | null = null;
      try {
        const analysis15mFull = this.candles15m.length > 0
          ? analyzeMarket(this.candles15m, [], [], [], undefined)
          : null;
        marketIntel = evaluateMarket(analysis, analysis15mFull);
        this.lastMarketIntel = marketIntel;

        // Apply market intelligence size multiplier
        if (marketIntel.sizeMultiplier !== 1.0) {
          this.positionSizeMultiplier = marketIntel.sizeMultiplier;
        }

        // Log market intelligence every 12 ticks
        if (this.tickCount % 12 === 0) {
          console.log(
            `[ENGINE] Market Intel: regime=${marketIntel.adaptedThresholds.regime}, ` +
            `vol=${marketIntel.volatilityRegime.regime}, ` +
            `conf=${marketIntel.confidence.grade}(${marketIntel.confidence.confidence.toFixed(2)}), ` +
            `confluence=${marketIntel.confluence.score.toFixed(2)}, ` +
            `sizeMultiplier=${marketIntel.sizeMultiplier.toFixed(2)}`
          );
        }
      } catch (err) {
        console.log('[ENGINE] Market Intelligence failed, using defaults:', err);
      }

      // 5. Run ML prediction
      let mlPrediction: MLPrediction | null = null;
      if (this.config.useML) {
        try {
          mlPrediction = this.mlPredictor.predict(analysis, this.candles5m);
          this.lastMLPrediction = mlPrediction;

          // Save ML prediction to DB
          try {
            await db.mLPrediction.create({
              data: {
                pair: this.config.symbol,
                direction: mlPrediction.direction,
                confidence: mlPrediction.confidence,
                modelType: mlPrediction.modelType,
                features: JSON.stringify(mlPrediction.features),
                marketRegime: mlPrediction.marketRegime,
              },
            });
          } catch (dbErr) {
            console.error('[ENGINE] Failed to save ML prediction to DB:', dbErr);
          }
        } catch (err) {
          console.log('[ENGINE] ML prediction failed:', err);
        }
      }

      // 5. Manage existing position
      if (this.currentPosition) {
        const action = await this.managePosition(price, analysis);
        if (action && (action.type === 'CLOSE' || action.type === 'STOP_LOSS_HIT' || action.type === 'TAKE_PROFIT_HIT')) {
          const result = await this.closePosition(action.message);
          return {
            tickTime,
            price,
            analysis,
            ensemble,
            mlPrediction,
            action: action.type,
            tradeResult: result,
          };
        }
      }

      // 6. Check Smart Stop Trade (should we be trading?)
      let action = 'NO_ACTION';
      let tradeResult: TradeResult | undefined;

      if (!this.currentPosition) {
        const stopTradeResult = this.smartStopTrade.evaluate(
          analysis,
          this.cachedTrades,
          this.getActualBalance(),
          mlPrediction?.direction,
          mlPrediction?.confidence
        );

        // Store position size multiplier from smart stop trade evaluation
        this.positionSizeMultiplier = stopTradeResult.positionSizeMultiplier ?? 1;

        if (!stopTradeResult.allowed) {
          action = `STOP_TRADE: ${stopTradeResult.reason} - ${stopTradeResult.message}`;
          console.log(`[ENGINE] Smart Stop Trade: ${action}`);
          return { tickTime, price, analysis, ensemble, mlPrediction, action };
        }

        // Check for new entry signal
        if (ensemble.finalSignal === 'NEUTRAL') {
          if (this.tickCount % 6 === 0) {
            console.log(`[ENGINE] NEUTRAL signal — score: ${ensemble.weightedScore.toFixed(3)}, confidence: ${ensemble.confidence.toFixed(2)}, reasons: ${ensemble.reasons.slice(0, 3).join('; ')}`);
          }
        } else {
          const signal = {
            name: 'Ensemble',
            direction: ensemble.finalSignal,
            confidence: ensemble.confidence,
            reasons: ensemble.reasons,
            sl: ensemble.sl,
            tp: ensemble.tp,
            riskReward: analysis.riskRewardRatio,
          };

          const validation = this.validateEntry(signal, analysis);
          if (validation.valid) {
            tradeResult = await this.executeTrade(signal, analysis);
            action = tradeResult.success ? 'TRADE_OPENED' : 'TRADE_FAILED';
          } else {
            action = `BLOCKED: ${validation.reason}`;
            const rr = analysis.riskRewardRatio;
            console.log(`[ENGINE] Entry blocked: signal=${signal.direction}, confidence=${signal.confidence.toFixed(2)}, minConf=${this.config.minConfidence}, RR=${rr.toFixed(2)}, minRR=${this.riskManager.config.minRiskReward}, ATR=${analysis.atrPct.toFixed(2)}%. Reason: ${validation.reason}`);
          }
        }
      }

      // Update ML accuracy if we have previous predictions
      if (this.candles5m.length >= 2) {
        const prevPrice = this.candles5m[this.candles5m.length - 2].close;
        const actualMove = ((price - prevPrice) / prevPrice) * 100;
        if (this.lastMLPrediction && this.tickCount % 12 === 0) {
          this.mlPredictor.updateAccuracy(this.lastMLPrediction, actualMove);
        }
      }

      this.lastSignal = ensemble.finalSignal;

      // Update session every 30 ticks
      if (this.tickCount % 30 === 0) {
        this.updateSession().catch(err => console.error('[ENGINE] Failed to update session on tick:', err));
      }

      return {
        tickTime,
        price,
        analysis,
        ensemble,
        mlPrediction,
        action,
        tradeResult,
      };

    } catch (err) {
      this.errorCount++;
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error('[ENGINE] Tick error:', err);

      return {
        tickTime,
        price: 0,
        analysis: null,
        ensemble: null,
        mlPrediction: null,
        action: 'ERROR',
        error: this.lastError,
      };
    }
  }

  /** Execute a trade */
  async executeTrade(signal: { direction: string; confidence: number; sl: number; tp: number; reasons: string[] }, analysis: FullAnalysis): Promise<TradeResult> {
    try {
      const price = analysis.price;
      const side = signal.direction === 'LONG' ? 'LONG' : 'SHORT';

      // Calculate position size
      const quantity = this.calculatePositionSize(analysis);
      if (quantity <= 0) {
        return { success: false, error: 'Invalid quantity', message: 'Position size calculation returned 0' };
      }

      // Calculate optimal stops using Smart Stop Loss
      const sl = this.smartStopLoss.calculateInitialSL(price, side as 'LONG' | 'SHORT', analysis);
      const tp = this.smartStopLoss.calculateInitialTP(price, side as 'LONG' | 'SHORT', analysis, sl);

      console.log(`[ENGINE] Executing ${side} @ ${price}, qty: ${quantity}, SL: ${sl}, TP: ${tp}`);

      // DRY RUN: Skip actual order placement
      if (this.config.dryRun) {
        console.log('[ENGINE] DRY RUN - skipping order placement');

        // Still record to database
        try {
          const trade = await db.trade.create({
            data: {
              pair: this.config.symbol,
              side,
              entryPrice: price,
              quantity,
              confidence: signal.confidence,
              stopLoss: sl,
              takeProfit: tp,
              status: 'OPEN',
              signal: side === 'LONG' ? 'BUY' : 'SELL',
              strategy: 'Ensemble',
              leverage: 1,
              commission: 0,
            },
          });

          // Create position record
          const position = await db.position.create({
            data: {
              tradeId: trade.id,
              pair: this.config.symbol,
              side,
              entryPrice: price,
              currentPrice: price,
              quantity,
              unrealizedPnl: 0,
              stopLoss: sl,
              takeProfit: tp,
            },
          });

          this.currentPosition = {
            id: position.id,
            tradeId: trade.id,
            pair: this.config.symbol,
            side,
            entryPrice: price,
            currentPrice: price,
            quantity,
            unrealizedPnl: 0,
            stopLoss: sl,
            takeProfit: tp,
            highestPrice: price,
            lowestPrice: price,
            openedAt: new Date(),
          };

          this.riskManager.recordTrade({
            id: trade.id,
            pair: this.config.symbol,
            side,
            entryPrice: price,
            quantity,
            pnl: 0,
            pnlPercent: 0,
            confidence: signal.confidence,
            stopLoss: sl,
            takeProfit: tp,
            status: 'OPEN',
            signal: side === 'LONG' ? 'BUY' : 'SELL',
            strategy: 'Ensemble',
            openedAt: new Date(),
            commission: 0,
          });

          console.log(`[ENGINE] Trade #${trade.id} opened (DRY RUN)`);

          return {
            success: true,
            orderId: `dry_${trade.id}`,
            trade: { id: trade.id, pair: this.config.symbol, side, entryPrice: price, quantity, pnl: 0, pnlPercent: 0, confidence: signal.confidence, status: 'OPEN', signal: side, strategy: 'Ensemble', openedAt: new Date(), commission: 0 },
            message: `Dry run ${side} trade opened @ ${price}`,
          };
        } catch (dbErr) {
          console.error('[ENGINE] DB error:', dbErr);
          return { success: false, error: 'Database error', message: 'Failed to record trade in database' };
        }
      }

      // REAL ORDER: Place via Broker Manager
      if (!isBrokerConnected()) {
        console.error('[ENGINE] Broker not connected');
        return { success: false, error: 'Broker not connected', message: 'Configure OANDA credentials in settings' };
      }

      console.log(`[ENGINE] Placing ${side} order: ${quantity} ${this.config.symbol}`);

      // Place market order
      const orderSide = side === 'LONG' ? 'BUY' : 'SELL';
      const orderResult = await placeMarketOrder(this.config.symbol, orderSide, quantity);

      if (!orderResult.success) {
        console.error(`[ENGINE] Order failed: ${orderResult.error}`);
        return { success: false, error: orderResult.error, message: `Order placement failed: ${orderResult.error}` };
      }

      // Calculate commission from fills
      let commission = 0;
      if (orderResult.fills && orderResult.fills.length > 0) {
        commission = orderResult.fills.reduce((sum, fill) => {
          return sum + parseFloat(fill.commission || '0');
        }, 0);
      }

      // Record to database
      try {
        const trade = await db.trade.create({
          data: {
            externalId: String(orderResult.orderId),
            pair: this.config.symbol,
            side,
            entryPrice: price,
            quantity,
            confidence: signal.confidence,
            stopLoss: sl,
            takeProfit: tp,
            status: 'OPEN',
            signal: side === 'LONG' ? 'BUY' : 'SELL',
            strategy: 'Ensemble',
            leverage: 1,
            commission,
          },
        });

        const position = await db.position.create({
          data: {
            tradeId: trade.id,
            pair: this.config.symbol,
            side,
            entryPrice: price,
            currentPrice: price,
            quantity,
            unrealizedPnl: 0,
            stopLoss: sl,
            takeProfit: tp,
          },
        });

        this.currentPosition = {
          id: position.id,
          tradeId: trade.id,
          pair: this.config.symbol,
          side,
          entryPrice: price,
          currentPrice: price,
          quantity,
          unrealizedPnl: 0,
          stopLoss: sl,
          takeProfit: tp,
          highestPrice: price,
          lowestPrice: price,
          openedAt: new Date(),
        };

        this.riskManager.recordTrade({
          id: trade.id,
          pair: this.config.symbol,
          side,
          entryPrice: price,
          quantity,
          pnl: 0,
          pnlPercent: 0,
          confidence: signal.confidence,
          stopLoss: sl,
          takeProfit: tp,
          status: 'OPEN',
          signal: side === 'LONG' ? 'BUY' : 'SELL',
          strategy: 'Ensemble',
          openedAt: new Date(),
          commission,
        });

        console.log(`[ENGINE] Trade #${trade.id} opened. OrderID: ${orderResult.orderId}, Commission: ${commission}`);

        return {
          success: true,
          orderId: String(orderResult.orderId),
          trade: { id: trade.id, pair: this.config.symbol, side, entryPrice: price, quantity, pnl: 0, pnlPercent: 0, confidence: signal.confidence, status: 'OPEN', signal: side, strategy: 'Ensemble', openedAt: new Date(), commission },
          message: `Real ${side} trade opened @ ${price}, OrderID: ${orderResult.orderId}`,
        };
      } catch (dbErr) {
        console.error('[ENGINE] DB error after successful order:', dbErr);
        return { success: false, error: 'Database error', message: 'Order placed but failed to record in database' };
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ENGINE] Execute trade error:', errorMsg);
      return { success: false, error: errorMsg, message: `Trade execution failed: ${errorMsg}` };
    }
  }

  /** Close the current position */
  async closePosition(reason: string): Promise<TradeResult> {
    if (!this.currentPosition) {
      return { success: false, error: 'No open position', message: 'No position to close' };
    }

    const pos = this.currentPosition;
    const currentPrice = pos.currentPrice;
    let pnl = 0;
    let pnlPct = 0;

    if (pos.side === 'LONG') {
      pnl = (currentPrice - pos.entryPrice) * pos.quantity;
      pnlPct = pos.entryPrice > 0 ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;
    } else {
      pnl = (pos.entryPrice - currentPrice) * pos.quantity;
      pnlPct = pos.entryPrice > 0 ? ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100 : 0;
    }

    console.log(`[ENGINE] Closing position #${pos.tradeId}: ${reason}, PnL: ${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`);

    try {
      // Place real closing order on Binance (only for non-dry-run trades)
      if (!this.config.dryRun && isBrokerConnected()) {
        const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
        console.log(`[ENGINE] Placing real ${closeSide} order to close position: ${pos.quantity} ${this.config.symbol}`);
        const closeResult = await placeMarketOrder(this.config.symbol, closeSide, pos.quantity);
        if (!closeResult.success) {
          console.error(`[ENGINE] Failed to close position on exchange: ${closeResult.error}`);
          // Still update DB locally even if exchange order fails
          // The position may still be open on the exchange — user should check manually
        } else {
          console.log(`[ENGINE] Position closed on exchange. Order ID: ${closeResult.orderId}`);
        }
      }

      // Update database
      await db.trade.update({
        where: { id: pos.tradeId },
        data: {
          exitPrice: currentPrice,
          pnl,
          pnlPercent: pnlPct,
          status: 'CLOSED',
          exitReason: reason,
          closedAt: new Date(),
        },
      });

      await db.position.delete({
        where: { tradeId: pos.tradeId },
      });

      // Log smart stop event if trailing was active
      if (pos.trailingStop) {
        await db.smartStopEvent.create({
          data: {
            tradeId: pos.tradeId,
            pair: this.config.symbol,
            stopType: 'TRAILING',
            previousStop: pos.stopLoss,
            newStop: pos.trailingStop,
            reason: reason,
          },
        });
      }

      this.dailyPnl += pnl;
      this.riskManager.recordTrade({
        id: pos.tradeId,
        pair: this.config.symbol,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice: currentPrice,
        quantity: pos.quantity,
        pnl,
        pnlPercent: pnlPct,
        status: 'CLOSED',
        signal: pos.side === 'LONG' ? 'BUY' : 'SELL',
        strategy: 'Ensemble',
        openedAt: pos.openedAt,
        closedAt: new Date(),
        commission: 0,
        confidence: 0,
      });

      const trade: Trade = {
        id: pos.tradeId,
        pair: this.config.symbol,
        side: pos.side,
        entryPrice: pos.entryPrice,
        exitPrice: currentPrice,
        quantity: pos.quantity,
        pnl,
        pnlPercent: pnlPct,
        status: 'CLOSED',
        signal: pos.side === 'LONG' ? 'BUY' : 'SELL',
        strategy: 'Ensemble',
        openedAt: pos.openedAt,
        closedAt: new Date(),
        commission: 0,
        confidence: 0,
      };

      this.currentPosition = null;
      this.smartStopLoss.reset();
      this.smartStopTrade.recordTradeResult(trade);

      // Update session stats in DB after closing position
      this.updateSession().catch(err => console.error('[ENGINE] Failed to update session:', err));

      console.log(`[ENGINE] Position closed. Daily PnL: ${this.dailyPnl.toFixed(2)}`);

      return {
        success: true,
        message: `Position closed: ${reason}, PnL: ${pnl.toFixed(2)}`,
        trade,
      };

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ENGINE] Close position error:', errorMsg);
      return { success: false, error: errorMsg, message: `Failed to close position: ${errorMsg}` };
    }
  }

  /** Manage the open position using Smart Stop Loss system */
  async managePosition(currentPrice: number, analysis: FullAnalysis): Promise<PositionAction | null> {
    if (!this.currentPosition) return null;

    const pos = this.currentPosition;
    pos.currentPrice = currentPrice;

    // Update unrealized PnL
    if (pos.side === 'LONG') {
      pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
      pos.highestPrice = Math.max(pos.highestPrice || pos.entryPrice, currentPrice);
    } else {
      pos.unrealizedPnl = (pos.entryPrice - currentPrice) * pos.quantity;
      pos.lowestPrice = Math.min(pos.lowestPrice || pos.entryPrice, currentPrice);
    }

    // UPDATE DB every tick so dashboard shows real-time PnL
    await this.updatePositionDB(pos);

    // === AGGRESSIVE QUICK PROFIT TAKING (Broker-style) ===
    const profitPct = pos.side === 'LONG'
      ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
    const timeOpenSec = (Date.now() - pos.openedAt.getTime()) / 1000;

    // 0.3%+ profit after 15s → scalp
    if (profitPct >= 0.3 && timeOpenSec >= 15) {
      console.log(`[ENGINE] 💰 Scalp: ${profitPct.toFixed(2)}% after ${timeOpenSec.toFixed(0)}s`);
      return { type: 'CLOSE', message: `Scalp ${profitPct.toFixed(2)}%` };
    }
    // 0.8%+ profit → close on weakness or 30s+
    if (profitPct >= 0.8 && (timeOpenSec >= 30 || analysis.rsi > 65 || analysis.rsi < 35)) {
      console.log(`[ENGINE] 💰 Secure: ${profitPct.toFixed(2)}% after ${timeOpenSec.toFixed(0)}s`);
      return { type: 'CLOSE', message: `Secure ${profitPct.toFixed(2)}%` };
    }
    // 2%+ profit → aggressive close
    if (profitPct >= 2.0) {
      console.log(`[ENGINE] 💰💰 Strong profit: ${profitPct.toFixed(2)}%`);
      return { type: 'CLOSE', message: `Lock ${profitPct.toFixed(2)}%` };
    }
    // -1% loss after 20s → cut loss
    if (profitPct <= -1.0 && timeOpenSec >= 20) {
      console.log(`[ENGINE] 🛑 Cut loss: ${profitPct.toFixed(2)}% after ${timeOpenSec.toFixed(0)}s`);
      return { type: 'CLOSE', message: `Cut ${profitPct.toFixed(2)}%` };
    }

    // Check basic stop-loss and take-profit FIRST (hard limits)
    if (pos.side === 'LONG' && currentPrice <= pos.stopLoss) {
      console.log(`[ENGINE] STOP LOSS hit for LONG @ ${currentPrice} (SL: ${pos.stopLoss})`);
      return { type: 'STOP_LOSS_HIT', message: 'Stop loss triggered' };
    }
    if (pos.side === 'SHORT' && currentPrice >= pos.stopLoss) {
      console.log(`[ENGINE] STOP LOSS hit for SHORT @ ${currentPrice} (SL: ${pos.stopLoss})`);
      return { type: 'STOP_LOSS_HIT', message: 'Stop loss triggered' };
    }
    if (pos.side === 'LONG' && currentPrice >= pos.takeProfit) {
      console.log(`[ENGINE] TAKE PROFIT hit for LONG @ ${currentPrice} (TP: ${pos.takeProfit})`);
      return { type: 'TAKE_PROFIT_HIT', message: 'Take profit triggered' };
    }
    if (pos.side === 'SHORT' && currentPrice <= pos.takeProfit) {
      console.log(`[ENGINE] TAKE PROFIT hit for SHORT @ ${currentPrice} (TP: ${pos.takeProfit})`);
      return { type: 'TAKE_PROFIT_HIT', message: 'Take profit triggered' };
    }

    // Use Smart Stop Loss for advanced management
    const stopAction: StopAction = this.smartStopLoss.evaluate(pos, analysis);

    if (stopAction.type === 'NO_ACTION') {
      return null;
    }

    console.log(`[ENGINE] Smart Stop: ${stopAction.type} - ${stopAction.message} (Phase: ${stopAction.phase || '-'})`);

    // Handle different stop actions
    switch (stopAction.type) {
      case 'TRAILING_UPDATE':
      case 'BREAK_EVEN':
      case 'SAR_STOP':
        if (stopAction.newSL) {
          pos.stopLoss = stopAction.newSL;
          pos.trailingStop = stopAction.newSL;
          await this.updatePositionSL(stopAction.newSL);
        }
        if (stopAction.newTP) {
          pos.takeProfit = stopAction.newTP;
          await this.updatePositionTP(stopAction.newTP);
        }
        return { type: stopAction.type === 'BREAK_EVEN' ? 'BREAK_EVEN' : 'TRAILING_STOP', message: stopAction.message, newStopLoss: stopAction.newSL };

      case 'PROFIT_LOCK':
        if (stopAction.newSL) {
          pos.stopLoss = stopAction.newSL;
          pos.trailingStop = stopAction.newSL;
          await this.updatePositionSL(stopAction.newSL);
        }
        return { type: 'PROFIT_LOCK', message: stopAction.message, newStopLoss: stopAction.newSL };

      case 'TIME_STOP':
      case 'MOMENTUM_STOP':
        return { type: 'CLOSE', message: stopAction.message };

      case 'CLOSE_FULL':
        return { type: 'CLOSE', message: stopAction.message };

      case 'CLOSE_PARTIAL': {
        // Close only a portion of the position
        const closePct = (stopAction as any).closePct ?? 0.5;
        const closeQty = pos.quantity * closePct;
        const reducedQty = pos.quantity - closeQty;

        console.log(`[ENGINE] CLOSE_PARTIAL: closing ${closePct * 100}% (${closeQty}) of position, keeping ${reducedQty}`);

        // Place real partial closing order on Binance (only for non-dry-run trades)
        if (!this.config.dryRun && isBrokerConnected()) {
          const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
          console.log(`[ENGINE] Placing real ${closeSide} order for partial close: ${closeQty} ${this.config.symbol}`);
          const partialCloseResult = await placeMarketOrder(this.config.symbol, closeSide, closeQty);
          if (!partialCloseResult.success) {
            console.error(`[ENGINE] Failed to execute partial close on exchange: ${partialCloseResult.error}`);
          } else {
            console.log(`[ENGINE] Partial close executed on exchange. Order ID: ${partialCloseResult.orderId}`);
          }
        }

        // Update the position quantity
        pos.quantity = reducedQty;

        // Update DB with reduced quantity
        await db.position.update({
          where: { id: pos.id },
          data: {
            quantity: reducedQty,
            currentPrice: pos.currentPrice,
            unrealizedPnl: pos.unrealizedPnl,
          },
        });
        await db.trade.update({
          where: { id: pos.tradeId },
          data: { quantity: reducedQty },
        });

        return { type: 'CLOSE_PARTIAL', message: stopAction.message };
      }

      default:
        return null;
    }
  }

  /** Update take-profit in database */
  private async updatePositionTP(newTP: number): Promise<void> {
    if (!this.currentPosition) return;
    try {
      await db.position.update({
        where: { id: this.currentPosition.id },
        data: {
          takeProfit: newTP,
          currentPrice: this.currentPosition.currentPrice,
          unrealizedPnl: this.currentPosition.unrealizedPnl,
        },
      });

      await db.trade.update({
        where: { id: this.currentPosition.tradeId },
        data: { takeProfit: newTP },
      });
    } catch (err) {
      console.error('[ENGINE] Update TP error:', err);
    }
  }

  /** Update stop-loss in database */
  private async updatePositionSL(newSL: number): Promise<void> {
    if (!this.currentPosition) return;
    try {
      await db.position.update({
        where: { id: this.currentPosition.id },
        data: {
          stopLoss: newSL,
          trailingStop: newSL,
          currentPrice: this.currentPosition.currentPrice,
          unrealizedPnl: this.currentPosition.unrealizedPnl,
          highestPrice: this.currentPosition.highestPrice,
          lowestPrice: this.currentPosition.lowestPrice,
        },
      });

      await db.trade.update({
        where: { id: this.currentPosition.tradeId },
        data: { stopLoss: newSL },
      });
    } catch (err) {
      console.error('[ENGINE] Update SL error:', err);
    }
  }

  /** Update position in database - called every tick to sync PnL */
  private async updatePositionDB(pos: any): Promise<void> {
    try {
      await db.position.update({
        where: { id: pos.id },
        data: {
          currentPrice: pos.currentPrice,
          unrealizedPnl: pos.unrealizedPnl,
          highestPrice: pos.highestPrice,
          lowestPrice: pos.lowestPrice,
        },
      });
      const pnlPct = pos.entryPrice > 0 ? (pos.unrealizedPnl / (pos.entryPrice * pos.quantity)) * 100 : 0;
      await db.trade.update({
        where: { id: pos.tradeId },
        data: { pnl: +pos.unrealizedPnl.toFixed(2), pnlPercent: +pnlPct.toFixed(2), status: 'OPEN' },
      });
    } catch (err) { /* Silent fail */ }
  }

  /** Calculate position size based on risk parameters */
  calculatePositionSize(analysis: FullAnalysis): number {
    if (!this.currentPosition) {
      const price = analysis.price;
      const sl = analysis.suggestedSL;
      if (price <= 0 || sl <= 0) return 0;

      // Use a simplified size calculation
      const balance = this.getActualBalance();
      const riskPct = this.riskManager.getAdjustedRisk(analysis, this.riskManager.config.maxRiskPerTrade);
      const riskAmount = balance * (riskPct / 100);
      const priceRisk = Math.abs(price - sl);

      if (priceRisk <= 0) return 0;

      const rawSize = +(riskAmount / priceRisk).toFixed(6);
      return +(rawSize * this.positionSizeMultiplier).toFixed(6);
    }
    return 0;
  }

  /** Validate entry conditions before placing a trade */
  validateEntry(signal: { direction: string; confidence: number; sl: number; tp: number; reasons: string[] }, analysis: FullAnalysis): { valid: boolean; reason?: string } {
    // Use dynamic minimum confidence from Market Intelligence
    // Reference: reco-trading adapts thresholds based on regime
    const effectiveMinConf = this.lastMarketIntel?.effectiveMinConfidence ?? this.config.minConfidence;
    const minConf = Math.min(effectiveMinConf, this.config.minConfidence);

    // Check minimum confidence — use the LOWER of market-adapted vs configured
    if (signal.confidence < minConf) {
      return { valid: false, reason: `Confidence ${signal.confidence.toFixed(2)} below effective min ${minConf.toFixed(2)}` };
    }

    // Check risk/reward
    const entry = analysis.price;
    const slDist = Math.abs(entry - signal.sl);
    const tpDist = Math.abs(signal.tp - entry);
    const rr = slDist > 0 ? tpDist / slDist : 0;
    if (rr < this.riskManager.config.minRiskReward) {
      return { valid: false, reason: `Risk/reward ${rr.toFixed(2)} below minimum ${this.riskManager.config.minRiskReward}` };
    }

    // Check spread (if order book data available)
    if (analysis.atrPct > 12) {
      return { valid: false, reason: `ATR too high (${analysis.atrPct.toFixed(2)}%)` };
    }

    // ML confirmation (soft - only block if ML strongly contradicts)
    if (this.config.useML && this.lastMLPrediction) {
      if (signal.direction === 'LONG' && this.lastMLPrediction.direction === 'SELL' && this.lastMLPrediction.confidence > 0.80) {
        return { valid: false, reason: 'ML strongly contradicts signal (SELL with very high confidence)' };
      }
      if (signal.direction === 'SHORT' && this.lastMLPrediction.direction === 'BUY' && this.lastMLPrediction.confidence > 0.80) {
        return { valid: false, reason: 'ML strongly contradicts signal (BUY with very high confidence)' };
      }
    }

    // Check circuit breaker
    const trades = this.cachedTrades;
    const balance = this.getActualBalance();
    const drawdown = this.riskManager.getDrawdown(balance);
    if (this.riskManager.checkCircuitBreaker(trades, balance, drawdown)) {
      return { valid: false, reason: 'Circuit breaker triggered' };
    }

    // Check risk manager
    const canTradeResult = this.riskManager.canTrade(trades, balance);
    if (!canTradeResult.allowed) {
      return { valid: false, reason: canTradeResult.reason };
    }

    return { valid: true };
  }

  /** Load open position from database (on startup) */
  async loadOpenPosition(): Promise<void> {
    try {
      await this.loadTradeHistory();

      const openPosition = await db.position.findFirst({
        include: { trade: true },
      });

      if (openPosition) {
        this.currentPosition = {
          id: openPosition.id,
          tradeId: openPosition.tradeId,
          pair: openPosition.pair,
          side: openPosition.side,
          entryPrice: openPosition.entryPrice,
          currentPrice: openPosition.currentPrice,
          quantity: openPosition.quantity,
          unrealizedPnl: openPosition.unrealizedPnl,
          stopLoss: openPosition.stopLoss,
          takeProfit: openPosition.takeProfit,
          trailingStop: openPosition.trailingStop ?? undefined,
          highestPrice: openPosition.highestPrice ?? undefined,
          lowestPrice: openPosition.lowestPrice ?? undefined,
          openedAt: openPosition.openedAt,
        };
        console.log(`[ENGINE] Loaded open position #${openPosition.tradeId}`);
      }

      // Update session on startup
      await this.updateSession();
    } catch (err) {
      console.error('[ENGINE] Load position error:', err);
    }
  }

  /** Change the trading pair dynamically */
  async setPair(newPair: string): Promise<void> {
    if (this.currentPosition) {
      console.warn(`[ENGINE] Cannot change pair while position is open on ${this.config.symbol}`);
      return;
    }
    const cleanPair = newPair.replace("/", "");
    console.log(`[ENGINE] Switching pair from ${this.config.symbol} to ${cleanPair}`);
    this.config.symbol = cleanPair;
    // Clear cached candles to force fresh fetch
    this.candles5m = [];
    this.candles15m = [];
    this.candles1h = [];
    this.candles4h = [];
    this.lastAnalysis = null;
    this.lastEnsemble = null;
    this.lastMLPrediction = null;

    // Persist the pair change to TradingConfig in DB
    try {
      await db.tradingConfig.upsert({
        where: { id: 'main' },
        update: { pair: cleanPair },
        create: { id: 'main', pair: cleanPair },
      });
    } catch (err) {
      console.error('[ENGINE] Failed to persist pair change to DB:', err);
    }
  }

  /** Get current pair */
  getPair(): string {
    return this.config.symbol;
  }

  /** Load persisted subsystem configurations from DB */
  private async initSubsystemsFromDB(): Promise<void> {
    try {
      await Promise.all([
        this.riskManager.initFromDB(),
        this.smartStopLoss.initFromDB(),
        this.smartStopTrade.initFromDB(),
      ]);
      console.log('[ENGINE] All subsystem configs loaded from DB');
    } catch (err) {
      console.error('[ENGINE] Failed to init subsystems from DB:', err);
    }
  }

  /** Update session record in database */
  private async updateSession(): Promise<void> {
    try {
      const balance = this.getActualBalance();
      const currentEquity = balance + this.dailyPnl;
      const riskMetrics = this.riskManager.getRiskMetrics(this.cachedTrades, balance, currentEquity);

      await db.session.upsert({
        where: { id: 1 },
        update: {
          isActive: this.isRunning,
          currentBalance: currentEquity,
          totalEquity: currentEquity,
          dailyPnl: this.dailyPnl,
          sessionPnl: this.dailyPnl,
          tradesToday: this.riskManager['dailyTradeCount'],
          wins: riskMetrics.wins,
          losses: riskMetrics.losses,
          winRate: riskMetrics.winRate,
          avgWin: riskMetrics.avgWin,
          avgLoss: riskMetrics.avgLoss,
          profitFactor: riskMetrics.profitFactor,
          peakCapital: Math.max(balance, currentEquity),
          currentDrawdown: riskMetrics.currentDrawdown,
        },
        create: {
          isActive: this.isRunning,
          initialBalance: balance,
          currentBalance: currentEquity,
          totalEquity: currentEquity,
          dailyPnl: this.dailyPnl,
          sessionPnl: this.dailyPnl,
          tradesToday: this.riskManager['dailyTradeCount'],
          wins: riskMetrics.wins,
          losses: riskMetrics.losses,
          winRate: riskMetrics.winRate,
          peakCapital: Math.max(balance, currentEquity),
        },
      });
    } catch (err) {
      console.error('[ENGINE] Failed to upsert session:', err);
    }
  }

  /** Calculate actual balance: initial capital + sum of closed trades PnL */
  private getActualBalance(): number {
    if (this.lastRealBalance > 0) return this.lastRealBalance;
    const initialCapital = parseFloat(process.env.INITIAL_CAPITAL || '1000');
    const closedPnl = this.cachedTrades
      .filter(t => t.status === 'CLOSED' && t.pnl !== undefined)
      .reduce((sum, t) => sum + (t.pnl || 0), 0);
    return initialCapital + closedPnl;
  }

  /** Load recent trades from DB for risk analysis */
  private async loadTradeHistory(): Promise<void> {
    try {
      const trades = await db.trade.findMany({
        orderBy: { openedAt: 'desc' },
        take: 100,
      });

      this.cachedTrades = trades.map(t => ({
        id: t.id,
        pair: t.pair,
        side: t.side as 'LONG' | 'SHORT',
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice ?? undefined,
        quantity: t.quantity,
        pnl: t.pnl ?? 0,
        pnlPercent: t.pnlPercent ?? 0,
        confidence: t.confidence,
        stopLoss: t.stopLoss ?? undefined,
        takeProfit: t.takeProfit ?? undefined,
        status: t.status as 'OPEN' | 'CLOSED',
        signal: t.signal,
        strategy: t.strategy,
        openedAt: t.openedAt,
        closedAt: t.closedAt ?? undefined,
        commission: t.commission ?? 0,
      }));

      // Initialize peakBalance on riskManager
      const initialCapital = parseFloat(process.env.INITIAL_CAPITAL || '1000');
      const closedPnl = this.cachedTrades
        .filter(t => t.status === 'CLOSED' && t.pnl !== undefined)
        .reduce((sum, t) => sum + (t.pnl || 0), 0);
      let peakBalance = initialCapital + closedPnl;
      let runningBalance = initialCapital;
      for (const trade of this.cachedTrades) {
        if (trade.status === 'CLOSED' && trade.pnl !== undefined) {
          runningBalance += trade.pnl;
          peakBalance = Math.max(peakBalance, runningBalance);
        }
      }
      this.riskManager.updatePeakBalance(peakBalance);

      console.log(`[ENGINE] Loaded ${this.cachedTrades.length} trades, peak balance: ${peakBalance.toFixed(2)}`);
    } catch (err) {
      console.error('[ENGINE] Failed to load trade history:', err);
    }
  }

  /** Get subsystem references */
  getStrategyEnsemble(): StrategyEnsemble { return this.strategyEnsemble; }
  getMLPredictor(): MLPredictor { return this.mlPredictor; }
  getRiskManager(): RiskManager { return this.riskManager; }
  getSmartStopLoss(): SmartStopLoss { return this.smartStopLoss; }
  getSmartStopTrade(): SmartStopTrade { return this.smartStopTrade; }
  getLastAnalysis(): FullAnalysis | null { return this.lastAnalysis; }
  getLastEnsemble(): EnsembleResult | null { return this.lastEnsemble; }
  getLastMLPrediction(): MLPrediction | null { return this.lastMLPrediction; }
  getCurrentPosition(): Position | null { return this.currentPosition; }

  /** Update symbol dynamically */
  async updateSymbol(newSymbol: string): Promise<void> {
    if (this.currentPosition) {
      console.warn(`[ENGINE] Cannot change symbol while position is open on ${this.config.symbol}`);
      return;
    }
    console.log(`[ENGINE] Changing symbol from ${this.config.symbol} to ${newSymbol}`);
    this.config.symbol = newSymbol;
    this.candles5m = [];
    this.candles15m = [];
    this.candles1h = [];
    this.candles4h = [];
    this.lastAnalysis = null;
    this.lastEnsemble = null;
    this.lastMLPrediction = null;
  }
}
