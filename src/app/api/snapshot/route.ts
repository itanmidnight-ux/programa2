import { NextResponse } from 'next/server';
import {
  getTickerPrice,
  getKlines,
  getOrderBook,
  getAccountBalance,
  isBrokerConnected,
  getBrokerName,
  getSupportedSymbols,
  getActiveSymbol,
} from '@/lib/broker-manager';
import { analyzeSignals } from '@/lib/signal-engine';
import { automation } from '@/lib/automation';
import { db } from '@/lib/db';

function fallbackSnapshot(message: string) {
  return {
    mode: 'OFFLINE',
    status: 'OFFLINE',
    broker: 'none',
    pair: 'XAU_USD',
    price: 0,
    signal: 'HOLD',
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
    trend: 'NEUTRAL',
    momentum: 'NEUTRAL',
    volatility_state: 'UNKNOWN',
    order_flow: 'NEUTRAL',
    rsi: 0,
    adx: 0,
    atr: 0,
    spread: 0,
    volume_ratio: 0,
    change_24h: 0,
    volume_24h: 0,
    signals: {},
    timeframe_analysis: {},
    ml_status: 'Inactive',
    ml_direction: null,
    ml_confidence: 0,
    ml_accuracy: 0,
    capital_manager: {},
    smart_stop_stats: { active_stops: 0, trails_activated: 0, break_evens_hit: 0, profit_locks: 0 },
    candles_5m: [],
    exchange_status: 'DISCONNECTED',
    database_status: 'CONNECTED',
    api_latency_ms: 0,
    market_regime: 'UNKNOWN',
    confluence_score: 0,
    exit_intelligence_score: 0,
    smart_stop: { phase: 0, phaseName: 'No Trailing', trailingActive: false, breakEvenActive: false, timeOpen: 0, nextProfitLock: null },
    smart_stop_trade: { isPaused: false, pauseReason: null, overallScore: 50, volatilityScore: 50, signalQualityScore: 50, performanceScore: 50, positionSizeMultiplier: 1 },
    pair_prices: {},
    notice: message,
  };
}

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const pair = (searchParams.get('pair') || process.env.TRADING_SYMBOL || getActiveSymbol() || 'XAU_USD').replace('/', '_').toUpperCase();

    let price = 0;
    let klines5m: any[] = [];
    let klines15m: any[] = [];
    let klines1h: any[] = [];
    let orderBook: any = null;

    try {
      [price, klines5m, klines15m, klines1h, orderBook] = await Promise.all([
        getTickerPrice(pair),
        getKlines(pair, '5m', 200),
        getKlines(pair, '15m', 200).catch(() => []),
        getKlines(pair, '1h', 200).catch(() => []),
        getOrderBook(pair, 10).catch(() => null),
      ]);
    } catch {
      // handled below
    }

    if (!price || price <= 0) {
      const response = fallbackSnapshot('Cannot reach broker market data');
      response.api_latency_ms = Date.now() - startTime;
      return NextResponse.json(response);
    }

    const signal = analyzeSignals(klines5m, klines15m, klines1h, orderBook?.spread || 0);
    const brokerConnected = isBrokerConnected();
    const brokerName = getBrokerName();

    const positions = await db.position.findMany({ include: { trade: true } });
    const openTrades = await db.trade.findMany({ where: { status: 'OPEN' } });
    const closedTrades = await db.trade.findMany({ where: { status: 'CLOSED' } });

    const account = brokerConnected ? await getAccountBalance().catch(() => null) : null;
    const balance = account?.balance || 0;
    const equity = account?.equity || balance;

    const wins = closedTrades.filter((t) => t.pnl > 0).length;
    const losses = closedTrades.filter((t) => t.pnl <= 0).length;
    const totalTrades = closedTrades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) + openTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    const avgWin = wins > 0 ? closedTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(closedTrades.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0) / losses) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses || 1) : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTrades = await db.trade.findMany({ where: { openedAt: { gte: today } } });
    const tradesToday = todayTrades.length;

    const symbols = await getSupportedSymbols().catch(() => [pair]);
    const pairPrices: Record<string, any> = {};
    for (const sym of symbols.slice(0, 12)) {
      pairPrices[sym] = {
        symbol: sym,
        display: sym.replace('_', '/'),
        price: sym === pair ? price : 0,
        change24h: 0,
        active: sym === pair,
        lastUpdate: Date.now(),
      };
    }

    const engineStatus = automation.getStatus();
    const openPosition = positions[0];
    const apiLatency = Date.now() - startTime;

    return NextResponse.json({
      mode: brokerConnected ? 'LIVE' : 'NO_AUTH',
      status: engineStatus.running ? 'RUNNING' : 'CONNECTED',
      broker: brokerName,
      pair,
      price: +price.toFixed(2),
      signal: signal.signal,
      confidence: signal.confidence,
      balance: +balance.toFixed(2),
      equity: +equity.toFixed(2),
      total_equity: +equity.toFixed(2),
      daily_pnl: +totalPnl.toFixed(2),
      session_pnl: +totalPnl.toFixed(2),
      unrealized_pnl: +openTrades.reduce((s, t) => s + (t.pnl || 0), 0).toFixed(2),
      win_rate: +winRate.toFixed(1),
      total_trades: totalTrades,
      wins,
      losses,
      trades_today: tradesToday,
      avg_win: +avgWin.toFixed(2),
      avg_loss: +avgLoss.toFixed(2),
      profit_factor: +profitFactor.toFixed(2),
      expectancy: totalTrades > 0 ? +(totalPnl / totalTrades).toFixed(2) : 0,
      has_open_position: positions.length > 0,
      open_position_count: positions.length,
      open_positions: openTrades.map((t) => ({
        id: t.id,
        side: t.side,
        entry: t.entryPrice,
        size: t.quantity,
        sl: t.stopLoss || 0,
        tp: t.takeProfit || 0,
        pnl: t.pnl || 0,
        pnlPct: t.pnlPercent || 0,
        time: Math.floor(new Date(t.openedAt).getTime() / 1000),
      })),
      open_position_side: openPosition?.side || null,
      open_position_entry: openPosition?.entryPrice || 0,
      open_position_qty: openPosition?.quantity || 0,
      open_position_sl: openPosition?.stopLoss || 0,
      open_position_tp: openPosition?.takeProfit || 0,
      trend: signal.trend,
      momentum: signal.momentum,
      volatility_state: signal.volatility,
      order_flow: signal.orderFlow,
      rsi: signal.rsi,
      adx: signal.adx,
      atr: signal.atr,
      spread: signal.spread,
      volume_ratio: signal.volumeRatio,
      change_24h: 0,
      volume_24h: 0,
      signals: {
        trend: signal.trend,
        momentum: signal.momentum,
        volume: signal.volume,
        volatility: signal.volatility,
        structure: signal.structure,
        order_flow: signal.orderFlow,
      },
      timeframe_analysis: signal.timeframeAnalysis || {},
      ml_status: 'Active',
      ml_direction: engineStatus.engineStatus.mlDirection || null,
      ml_confidence: engineStatus.engineStatus.mlConfidence || 0,
      ml_accuracy: 0,
      capital_manager: {
        capital_mode: 'MEDIUM',
        current_capital: equity,
        initial_capital: parseFloat(process.env.INITIAL_CAPITAL || '1000'),
      },
      smart_stop_stats: { active_stops: positions.length, trails_activated: 0, break_evens_hit: 0, profit_locks: 0 },
      candles_5m: klines5m,
      exchange_status: brokerConnected ? 'CONNECTED' : 'DISCONNECTED',
      database_status: 'CONNECTED',
      api_latency_ms: apiLatency,
      market_regime: signal.marketRegime,
      confluence_score: signal.confluenceScore,
      exit_intelligence_score: signal.confidence * 0.9,
      smart_stop: { phase: 0, phaseName: 'No Trailing', trailingActive: false, breakEvenActive: false, timeOpen: 0, nextProfitLock: null },
      smart_stop_trade: { isPaused: false, pauseReason: null, overallScore: 50, volatilityScore: 50, signalQualityScore: 50, performanceScore: 50, positionSizeMultiplier: 1 },
      pair_prices: pairPrices,
    });
  } catch (error: any) {
    const response = fallbackSnapshot(`Snapshot error: ${error.message}`);
    response.api_latency_ms = Date.now() - startTime;
    return NextResponse.json(response);
  }
}
