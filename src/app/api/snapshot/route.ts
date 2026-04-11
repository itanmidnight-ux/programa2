import { NextResponse } from "next/server";
import {
  getTickerPrice,
  getKlines,
  getOrderBook,
  getAccountBalance,
  getActiveSymbol,
  isBrokerConnected,
  getBrokerName,
} from "@/lib/broker-manager";
import { formatPair, getSymbolDisplayName } from "@/lib/format-utils";
import { analyzeSignals } from "@/lib/signal-engine";
import { predict } from "@/lib/ml-predictor";
import { computeCapitalState, type CapitalMode } from "@/lib/capital-manager";
import { automation } from "@/lib/automation";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const pairParam = searchParams.get("pair");
    const pair = pairParam || process.env.TRADING_SYMBOL || "XAU_USD";
    const brokerConnected = isBrokerConnected();

    // ---- Fetch market data via Broker Manager ----
    let price = 0;
    let ticker24h: any = { priceChangePercent: "0", quoteVolume: "0" };
    let klines5m: any[] = [];
    let klines15m: any[] = [];
    let klines1h: any[] = [];
    let orderBook: any = { bids: [], asks: [], spread: 0 };
    let publicDataFailed = false;

    try {
      // Get price
      price = await getTickerPrice(pair);
      
      // Get klines in parallel
      [klines5m, klines15m, klines1h] = await Promise.all([
        getKlines(pair, "5m", 200),
        getKlines(pair, "15m", 200).catch(() => []),
        getKlines(pair, "1h", 200).catch(() => []),
      ]);

      // Get order book
      orderBook = await getOrderBook(pair, 10).catch(() => ({ bids: [], asks: [], spread: 0 }));

      // Calculate 24h change from klines if available
      if (klines5m.length > 0) {
        const firstPrice = klines5m[0]?.open || price;
        const changePct = price > 0 && firstPrice > 0 ? ((price - firstPrice) / firstPrice) * 100 : 0;
        ticker24h = { priceChangePercent: changePct.toFixed(2), quoteVolume: "0" };
      }
    } catch (err) {
      console.error("[SNAPSHOT] Market data fetch failed:", err);
      publicDataFailed = true;
    }

    // If market data completely failed, return OFFLINE snapshot
    if (publicDataFailed || price === 0) {
      return NextResponse.json({
        mode: "OFFLINE",
        status: "OFFLINE",
        pair: formatPair(pair),
        price: 0,
        signal: "HOLD",
        confidence: 0,
        balance: 0,
        equity: 0,
        total_equity: 0,
        daily_pnl: 0,
        session_pnl: 0,
        unrealized_pnl: 0,
        win_rate: 0,
        total_trades: 0,
        wins: 0,
        losses: 0,
        trades_today: 0,
        avg_win: 0,
        avg_loss: 0,
        profit_factor: 0,
        expectancy: 0,
        has_open_position: false,
        open_positions: [],
        open_position_side: null,
        open_position_entry: 0,
        open_position_qty: 0,
        open_position_sl: 0,
        open_position_tp: 0,
        trend: "NEUTRAL",
        momentum: "NEUTRAL",
        volatility_state: "UNKNOWN",
        order_flow: "NEUTRAL",
        rsi: 0,
        adx: 0,
        atr: 0,
        spread: 0,
        volume_ratio: 0,
        change_24h: 0,
        volume_24h: 0,
        signals: { trend: "NEUTRAL", momentum: "NEUTRAL", volume: "NEUTRAL", volatility: "UNKNOWN", structure: "NEUTRAL", order_flow: "NEUTRAL" },
        timeframe_analysis: {},
        ml_status: "Inactive",
        ml_direction: null,
        ml_confidence: 0,
        ml_accuracy: 0,
        capital_manager: { capital_mode: "MEDIUM", current_capital: 0, initial_capital: 0, peak_capital: 0, current_drawdown_pct: 0, win_streak: 0, loss_streak: 0, daily_trades: 0, market_condition: "NORMAL", effective_params: { min_confidence: 0.62, risk_per_trade: 0.01, max_trades_per_day: 120 } },
        smart_stop_stats: { active_stops: 0, trails_activated: 0, break_evens_hit: 0, profit_locks: 0 },
        candles_5m: [],
        exchange_status: "DISCONNECTED",
        database_status: "UNKNOWN",
        api_latency_ms: Date.now() - startTime,
        market_regime: "UNKNOWN",
        confluence_score: 0,
        exit_intelligence_score: 0,
        smart_stop: { phase: 0, phaseName: "No Trailing", trailingActive: false, breakEvenActive: false, timeOpen: 0, nextProfitLock: null },
        smart_stop_trade: { isPaused: false, pauseReason: null, overallScore: 50, volatilityScore: 50, signalQualityScore: 50, performanceScore: 50, positionSizeMultiplier: 1 },
        notice: "Cannot reach exchange API. Showing offline data.",
      });
    }

    // ---- Signal analysis (public data is available) ----
    const signal = analyzeSignals(klines5m, klines15m, klines1h, orderBook.spread);

    // Run ML prediction
    let mlPrediction: any = null;
    try {
      const mlResult = predict(klines5m);
      mlPrediction = mlResult.prediction;
    } catch {
      // ML not available
    }

    // ---- If no API credentials, return real price data with zero balance ----
    if (!brokerConnected) {
      return NextResponse.json({
        mode: "NO_AUTH",
        status: "CONNECTED",
        pair: formatPair(pair),
        price: +price.toFixed(2),
        signal: signal.signal,
        confidence: signal.confidence,
        balance: 0,
        equity: 0,
        total_equity: 0,
        daily_pnl: 0,
        session_pnl: 0,
        unrealized_pnl: 0,
        win_rate: 0,
        total_trades: 0,
        wins: 0,
        losses: 0,
        trades_today: 0,
        avg_win: 0,
        avg_loss: 0,
        profit_factor: 0,
        expectancy: 0,
        has_open_position: false,
        open_positions: [],
        open_position_side: null,
        open_position_entry: 0,
        open_position_qty: 0,
        open_position_sl: 0,
        open_position_tp: 0,
        trend: signal.trend,
        momentum: signal.momentum,
        volatility_state: signal.volatility === "RISING" ? "HIGH" : signal.volatility === "FALLING" ? "LOW" : "NORMAL",
        order_flow: signal.orderFlow,
        rsi: signal.rsi,
        adx: signal.adx,
        atr: signal.atr,
        spread: signal.spread,
        volume_ratio: signal.volumeRatio,
        change_24h: +parseFloat(ticker24h.priceChangePercent).toFixed(2),
        volume_24h: +parseFloat(ticker24h.quoteVolume).toFixed(2),
        signals: {
          trend: signal.trend,
          momentum: signal.momentum,
          volume: signal.volume,
          volatility: signal.volatility,
          structure: signal.structure,
          order_flow: signal.orderFlow,
        },
        timeframe_analysis: signal.timeframeAnalysis || {},
        ml_status: mlPrediction ? "Active" : "Inactive",
        ml_direction: mlPrediction?.direction || null,
        ml_confidence: mlPrediction?.confidence || 0,
        ml_accuracy: 0,
        capital_manager: { capital_mode: "MEDIUM", current_capital: 0, initial_capital: 0, peak_capital: 0, current_drawdown_pct: 0, win_streak: 0, loss_streak: 0, daily_trades: 0, market_condition: signal.marketRegime || "NORMAL", effective_params: { min_confidence: 0.62, risk_per_trade: 0.01, max_trades_per_day: 120 } },
        smart_stop_stats: { active_stops: 0, trails_activated: 0, break_evens_hit: 0, profit_locks: 0 },
        candles_5m: klines5m,
        exchange_status: "CONNECTED",
        database_status: "UNKNOWN",
        api_latency_ms: Date.now() - startTime,
        market_regime: signal.marketRegime,
        confluence_score: signal.confluenceScore,
        exit_intelligence_score: signal.confidence * 0.9,
        smart_stop: { phase: 0, phaseName: "No Trailing", trailingActive: false, breakEvenActive: false, timeOpen: 0, nextProfitLock: null },
        smart_stop_trade: { isPaused: false, pauseReason: null, overallScore: 50, volatilityScore: 50, signalQualityScore: 50, performanceScore: 50, positionSizeMultiplier: 1 },
        notice: "Public market data loaded. Configure OANDA API keys in .env for account data.",
      });
    }

    // ---- Authenticated endpoints (API keys available) ----
    // Account data
    let accountData: any = null;
    let positions: any[] = [];
    try {
      const [accountResult, positionResult] = await Promise.all([
        getAccountBalance().catch(err => {
          console.error("[SNAPSHOT] Failed to fetch account data:", err instanceof Error ? err.message : err);
          return null;
        }),
        db.position.findMany({ include: { trade: true } }).catch(() => []),
      ]);
      accountData = accountResult;
      positions = positionResult;
    } catch (err) {
      console.error("[SNAPSHOT] Failed to fetch account data:", err instanceof Error ? err.message : err);
    }

    // Balance calculations
    const usdtBalance = accountData
      ? accountData.balances?.find((b: { asset: string }) => b.asset === "USDT")
      : null;
    const btcBalance = accountData
      ? accountData.balances?.find((b: { asset: string }) => b.asset === pair.replace("USDT", ""))
      : null;
    const balance = usdtBalance ? parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked) : 0;
    const cryptoQty = btcBalance ? parseFloat(btcBalance.free) + parseFloat(btcBalance.locked) : 0;
    // For DB positions (SPOT trading), use unrealizedPnl field
    const unrealizedPnl = positions.length > 0
      ? positions.reduce((sum: number, p: any) => sum + parseFloat(p.unrealizedPnl || 0), 0)
      : 0;
    const equity = balance + cryptoQty * price + unrealizedPnl;

    // Open position info (from DB - uses 'side', 'quantity', 'entryPrice' fields)
    const openPosition = positions.length > 0 ? positions[0] : null;
    const hasOpen = !!openPosition;
    const posSide = openPosition ? openPosition.side : null;
    const posQty = openPosition ? parseFloat(openPosition.quantity) : 0;
    const posEntry = openPosition ? parseFloat(openPosition.entryPrice) : 0;
    const posSL = openPosition ? parseFloat(openPosition.stopLoss) : 0;
    const posTP = openPosition ? parseFloat(openPosition.takeProfit) : 0;

    // Fetch trade stats from database - include BOTH open and closed trades
    let closedTrades: any[] = [];
    let openTrades: any[] = [];
    let wins = 0;
    let losses = 0;
    let avgWin = 0;
    let avgLoss = 0;
    let profitFactor = 0;
    let expectancy = 0;
    let totalTrades = 0;
    let tradesToday = 0;
    let bestTrade = 0;
    let worstTrade = 0;
    let totalPnl = 0;
    let sessionPnl = 0;
    let openPnl = 0;
    let closedPnl = 0;

    try {
      // Get CLOSED trades for win/loss stats
      closedTrades = await db.trade.findMany({ where: { status: "CLOSED" } });
      // Get OPEN trades for current PnL
      openTrades = await db.trade.findMany({ where: { status: "OPEN" } });

      // Stats from CLOSED trades
      totalTrades = closedTrades.length;
      wins = closedTrades.filter((t) => t.pnl > 0).length;
      losses = closedTrades.filter((t) => t.pnl <= 0).length;

      if (wins > 0) {
        avgWin = closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / wins;
      }
      if (losses > 0) {
        avgLoss = Math.abs(closedTrades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0) / losses);
      }
      if (avgLoss > 0) {
        profitFactor = (avgWin * wins) / (avgLoss * losses);
      }

      // PnL from closed trades
      closedPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      // PLUS unrealized PnL from open trades
      openPnl = openTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      totalPnl = closedPnl + openPnl;
      sessionPnl = totalPnl; // Session = closed + open

      expectancy = totalTrades > 0 ? closedPnl / totalTrades : 0;

      const pnls = closedTrades.map(t => t.pnl);
      bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
      worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

      // Count trades today (open + closed)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTrades = await db.trade.findMany({ where: { openedAt: { gte: today } } });
      tradesToday = todayTrades.length;
    } catch { /* db not ready */ }

    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    // Get config for capital manager
    let config: any = null;
    let capitalMode: CapitalMode = "MEDIUM";
    let initialCapital = 1000;
    try {
      config = await db.tradingConfig.findUnique({ where: { id: "main" } });
      if (config) {
        capitalMode = (config.capitalMode as CapitalMode) || "MEDIUM";
        initialCapital = config.initialCapital || 1000;
      }
    } catch { /* config not available */ }

    // Enhanced capital manager with real stats
    const capitalState = computeCapitalState(
      closedTrades.map(t => ({
        pnl: t.pnl,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
      })),
      balance,
      initialCapital,
      capitalMode,
      signal.marketRegime.toUpperCase()
    );

    // Engine status
    const engineMetrics = automation.getMetrics();
    const engineStatus = automation.getStatus();
    const isRunning = engineStatus.running ? "RUNNING" : "CONNECTED";

    // Smart stop stats from DB
    let smartStopStats = { active_stops: 0, trails_activated: 0, break_evens_hit: 0, profit_locks: 0 };
    try {
      const activeStops = await db.position.count();
      const stopEvents = await db.smartStopEvent.findMany();
      smartStopStats = {
        active_stops: activeStops,
        trails_activated: stopEvents.filter(e => e.stopType === "TRAILING").length,
        break_evens_hit: stopEvents.filter(e => e.stopType === "BREAK_EVEN").length,
        profit_locks: stopEvents.filter(e => e.stopType === "PROFIT_LOCK").length,
      };
    } catch { /* smart stop data not available */ }

    // ---- Smart Stop Loss status - direct call instead of HTTP ----
    let smartStopData: { phase: number; phaseName: string; trailingActive: boolean; breakEvenActive: boolean; timeOpen: number; nextProfitLock: number | null } = { phase: 0, phaseName: "No Trailing", trailingActive: false, breakEvenActive: false, timeOpen: 0, nextProfitLock: null };

    // ---- Smart Stop Trade status - direct call instead of HTTP ----
    let smartStopTradeData: { isPaused: boolean; pauseReason: string | null; overallScore: number; volatilityScore: number; signalQualityScore: number; performanceScore: number; positionSizeMultiplier: number } = {
      isPaused: false, pauseReason: null, overallScore: 50, volatilityScore: 50, signalQualityScore: 50, performanceScore: 50, positionSizeMultiplier: 1,
    };

    try {
      // Use direct imports from automation instead of HTTP
      const engine = (automation.getExecutionEngine() as any);
      if (engine && engine.getStatus().hasOpenPosition) {
        const pos = engine.currentPosition as any;
        if (pos) {
          const sl = engine.smartStopLoss;
          if (sl && typeof sl.getStatus === 'function') {
            smartStopData = sl.getStatus(pos, { atr: 0, marketRegime: 'UNKNOWN' } as any);
          }
        }
      }
    } catch { /* smart stop not available */ }

    try {
      const engine = (automation.getExecutionEngine() as any);
      const sst = engine?.smartStopTrade;
      if (sst && typeof sst.getMetrics === 'function') {
        const metrics = sst.getMetrics(null, [], 0);
        smartStopTradeData = {
          isPaused: metrics.isPaused,
          pauseReason: metrics.pauseReason,
          overallScore: metrics.overallScore,
          volatilityScore: metrics.volatilityScore,
          signalQualityScore: metrics.signalQualityScore,
          performanceScore: metrics.performanceScore,
          positionSizeMultiplier: (metrics as any).positionSizeMultiplier || 1,
        };
      }
    } catch { /* smart stop trade not available */ }

    // Add pair prices for the dropdown (OANDA markets)
    const pairPricesData: Record<string, any> = {};
    const oandaMarkets = ["XAU_USD", "XAG_USD", "EUR_USD", "GBP_USD", "USD_JPY", "WTI_USD", "US30_USD", "NAS100_USD"];
    for (const sym of oandaMarkets) {
      pairPricesData[sym] = {
        symbol: sym,
        display: formatPair(sym),
        price: sym === pair ? price : 0,
        change24h: sym === pair ? parseFloat(ticker24h.priceChangePercent || "0") : 0,
        high24h: 0, low24h: 0, volume24h: 0,
        active: sym === pair,
        lastUpdate: Date.now(),
      };
    }

    const apiLatency = Date.now() - startTime;

    return NextResponse.json({
      mode: "LIVE",
      status: isRunning,
      pair: formatPair(pair),
      price: +price.toFixed(2),
      signal: signal.signal,
      confidence: signal.confidence,
      balance: +balance.toFixed(2),
      equity: +equity.toFixed(2),
      total_equity: +equity.toFixed(2),
      daily_pnl: +totalPnl.toFixed(2),
      session_pnl: +sessionPnl.toFixed(2),
      unrealized_pnl: +openPnl.toFixed(2),
      closed_pnl: +closedPnl.toFixed(2),
      win_rate: +winRate.toFixed(1),
      total_trades: totalTrades,
      wins,
      losses,
      trades_today: tradesToday,
      avg_win: +avgWin.toFixed(2),
      avg_loss: +avgLoss.toFixed(2),
      profit_factor: +profitFactor.toFixed(2),
      expectancy: +expectancy.toFixed(2),
      has_open_position: hasOpen || openTrades.length > 0,
      open_position_count: openTrades.length,
      open_positions: openTrades.map((t: any, i: number) => ({
        id: t.id, side: t.side, entry: +t.entryPrice.toFixed(2),
        size: +t.quantity.toFixed(6),
        sl: +(t.stopLoss || 0).toFixed(2),
        tp: +(t.takeProfit || 0).toFixed(2),
        pnl: +(t.pnl || 0).toFixed(2),
        pnlPct: +(t.pnlPercent || 0).toFixed(2),
        time: Math.floor(new Date(t.openedAt).getTime() / 1000),
      })),
      open_position_side: posSide,
      open_position_entry: +posEntry.toFixed(2),
      open_position_qty: +posQty.toFixed(4),
      open_position_sl: +(posSL || 0).toFixed(2),
      open_position_tp: +(posTP || 0).toFixed(2),
      trend: signal.trend,
      momentum: signal.momentum,
      volatility_state: signal.volatility === "RISING" ? "HIGH" : signal.volatility === "FALLING" ? "LOW" : "NORMAL",
      order_flow: signal.orderFlow,
      rsi: signal.rsi,
      adx: signal.adx,
      atr: signal.atr,
      spread: signal.spread,
      volume_ratio: signal.volumeRatio,
      change_24h: +parseFloat(ticker24h.priceChangePercent).toFixed(2),
      volume_24h: +parseFloat(ticker24h.quoteVolume).toFixed(2),
      signals: {
        trend: signal.trend,
        momentum: signal.momentum,
        volume: signal.volume,
        volatility: signal.volatility,
        structure: signal.structure,
        order_flow: signal.orderFlow,
      },
      timeframe_analysis: signal.timeframeAnalysis,
      ml_status: mlPrediction ? "Active" : "Inactive",
      ml_direction: mlPrediction?.direction || null,
      ml_confidence: mlPrediction?.confidence || 0,
      ml_accuracy: 0,
      capital_manager: capitalState,
      smart_stop_stats: smartStopStats,
      candles_5m: klines5m,
      exchange_status: "CONNECTED",
      database_status: "CONNECTED",
      api_latency_ms: apiLatency,
      market_regime: signal.marketRegime,
      confluence_score: signal.confluenceScore,
      exit_intelligence_score: signal.confidence * 0.9,
      smart_stop: smartStopData,
      smart_stop_trade: smartStopTradeData,
      pair_prices: pairPricesData,
    });
  } catch (error: any) {
    console.error("Snapshot API error:", error);
    // Return OFFLINE with zeros instead of fake mock data
    return NextResponse.json({
      mode: "OFFLINE",
      status: "ERROR",
      pair: "BTC/USDT",
      price: 0,
      signal: "HOLD",
      confidence: 0,
      balance: 0,
      equity: 0,
      total_equity: 0,
      daily_pnl: 0,
      session_pnl: 0,
      unrealized_pnl: 0,
      win_rate: 0,
      total_trades: 0,
      wins: 0,
      losses: 0,
      trades_today: 0,
      avg_win: 0,
      avg_loss: 0,
      profit_factor: 0,
      expectancy: 0,
      has_open_position: false,
      open_positions: [],
      open_position_side: null,
      open_position_entry: 0,
      open_position_qty: 0,
      open_position_sl: 0,
      open_position_tp: 0,
      trend: "NEUTRAL",
      momentum: "NEUTRAL",
      volatility_state: "UNKNOWN",
      order_flow: "NEUTRAL",
      rsi: 0,
      adx: 0,
      atr: 0,
      spread: 0,
      volume_ratio: 0,
      change_24h: 0,
      volume_24h: 0,
      signals: { trend: "NEUTRAL", momentum: "NEUTRAL", volume: "NEUTRAL", volatility: "UNKNOWN", structure: "NEUTRAL", order_flow: "NEUTRAL" },
      timeframe_analysis: {},
      ml_status: "Inactive",
      ml_direction: null,
      ml_confidence: 0,
      ml_accuracy: 0,
      capital_manager: { capital_mode: "MEDIUM", current_capital: 0, initial_capital: 0, peak_capital: 0, current_drawdown_pct: 0, win_streak: 0, loss_streak: 0, daily_trades: 0, market_condition: "NORMAL", effective_params: { min_confidence: 0.62, risk_per_trade: 0.01, max_trades_per_day: 120 } },
      smart_stop_stats: { active_stops: 0, trails_activated: 0, break_evens_hit: 0, profit_locks: 0 },
      candles_5m: [],
      exchange_status: "ERROR",
      database_status: "UNKNOWN",
      api_latency_ms: Date.now() - startTime,
      market_regime: "UNKNOWN",
      confluence_score: 0,
      exit_intelligence_score: 0,
      smart_stop: { phase: 0, phaseName: "No Trailing", trailingActive: false, breakEvenActive: false, timeOpen: 0, nextProfitLock: null },
      smart_stop_trade: { isPaused: false, pauseReason: null, overallScore: 50, volatilityScore: 50, signalQualityScore: 50, performanceScore: 50, positionSizeMultiplier: 1 },
      notice: `API Error: ${error.message}. Showing offline data (no mock data).`,
    });
  }
}
