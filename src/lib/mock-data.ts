import { randomInRange } from "./utils";

function generateCandles(count: number, basePrice: number) {
  const candles: Array<{time: number; open: number; high: number; low: number; close: number; volume: number}> = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  for (let i = count; i >= 0; i--) {
    const time = now - i * 300;
    const change = randomInRange(-0.005, 0.005);
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.abs(randomInRange(0, 0.003)));
    const low = Math.min(open, close) * (1 - Math.abs(randomInRange(0, 0.003)));
    const volume = randomInRange(50, 500);
    candles.push({ time, open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2), volume: +volume.toFixed(2) });
    price = close;
  }
  return candles;
}

function generateTrades() {
  const trades: Array<{id: number; pair: string; side: string; entry: number; exit: number; size: number; pnl: number; pnl_pct: number; status: string; time: number; close_time: number | null; confidence: number; sl: number; tp: number}> = [];
  const now = Math.floor(Date.now() / 1000);
  const sides = ["LONG", "SHORT"];
  const statuses = ["CLOSED", "CLOSED", "CLOSED", "CLOSED", "CLOSED", "CLOSED", "CLOSED", "CLOSED", "OPEN", "OPEN"];
  for (let i = 0; i < 50; i++) {
    const side = sides[Math.floor(Math.random() * 2)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const entry = randomInRange(93000, 98000);
    const pnlPct = randomInRange(-3, 4);
    const exit = status === "CLOSED" ? entry * (1 + pnlPct / 100) : entry;
    const qty = randomInRange(0.001, 0.05);
    trades.push({
      id: i + 1,
      pair: "XAU/USD",
      side,
      entry: +entry.toFixed(2),
      exit: +exit.toFixed(2),
      size: +qty.toFixed(4),
      pnl: +((exit - entry) * qty * (side === "SHORT" ? -1 : 1)).toFixed(2),
      pnl_pct: +pnlPct.toFixed(2),
      status,
      time: now - (i * 1800 + Math.floor(Math.random() * 1800)),
      close_time: status === "CLOSED" ? now - (i * 1800 + Math.floor(Math.random() * 900)) : null,
      confidence: +randomInRange(0.55, 0.95).toFixed(2),
      sl: +(entry * (1 + randomInRange(-0.02, -0.005))).toFixed(2),
      tp: +(entry * (1 + randomInRange(0.005, 0.03))).toFixed(2),
    });
  }
  return trades;
}

export function generateSnapshot() {
  // Return zeroed/neutral data — never fabricate realistic-looking numbers.
  // This is only used as a last-resort fallback; real API data should always be preferred.
  return {
    status: "OFFLINE",
    pair: "XAU/USD",
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
    signals: {
      trend: "NEUTRAL",
      momentum: "NEUTRAL",
      volume: "NORMAL",
      volatility: "UNKNOWN",
      structure: "NEUTRAL",
      order_flow: "NEUTRAL",
    },
    timeframe_analysis: null,
    ml_status: "Inactive",
    ml_direction: null,
    ml_confidence: 0,
    ml_accuracy: 0,
    capital_manager: {
      capital_mode: "MEDIUM",
      current_capital: 0,
      initial_capital: 0,
      peak_capital: 0,
      current_drawdown_pct: 0,
      win_streak: 0,
      loss_streak: 0,
      daily_trades: 0,
      market_condition: "UNKNOWN",
      effective_params: {
        min_confidence: 0,
        risk_per_trade: 0,
        max_trades_per_day: 0,
      },
    },
    smart_stop_stats: {
      active_stops: 0,
      trails_activated: 0,
      break_evens_hit: 0,
      profit_locks: 0,
    },
    candles_5m: [],
    exchange_status: "DISCONNECTED",
    database_status: "UNKNOWN",
    api_latency_ms: 0,
    market_regime: "UNKNOWN",
    confluence_score: 0,
    exit_intelligence_score: 0,
  };
}

export function generateRiskMetrics() {
  // Return zeroed data — never fabricate realistic-looking risk metrics
  return {
    daily_loss_used: 0,
    daily_loss_limit: 0,
    current_drawdown: 0,
    max_drawdown: 0,
    position_size_pct: 0,
    max_position_size: 0,
    risk_per_trade: 0,
    total_risk_exposure: 0,
    margin_used: 0,
    sharpe_ratio: 0,
    sortino_ratio: 0,
    max_consecutive_losses: 0,
    avg_holding_time: "0m 0s",
    best_trade: 0,
    worst_trade: 0,
    risk_reward_ratio: 0,
  };
}

export function generateMLData() {
  // Return zeroed/inactive data — never fabricate realistic ML metrics
  return {
    status: "Inactive",
    model_type: "N/A",
    last_prediction: "HOLD",
    confidence: 0,
    accuracy_7d: 0,
    accuracy_30d: 0,
    total_predictions: 0,
    correct_predictions: 0,
    features_used: 0,
    last_trained: null,
    market_regime: "UNKNOWN",
    regime_confidence: 0,
    prediction_history: [],
    signal_quality: {
      trend_accuracy: 0,
      momentum_accuracy: 0,
      volume_accuracy: 0,
      volatility_accuracy: 0,
      structure_accuracy: 0,
    },
  };
}

export const mockTrades = generateTrades();

const logMessages = [
  { level: "INFO", msg: "Signal analysis complete: BUY detected, confidence 0.78" },
  { level: "INFO", msg: "Opened LONG position: 0.012 BTC @ 96,234.50" },
  { level: "INFO", msg: "Stop loss set at 94,812.67 | Take profit at 97,656.38" },
  { level: "WARNING", msg: "Spread elevated: 1.8 USDT (threshold: 1.5)" },
  { level: "INFO", msg: "Smart stop trailing activated for position #98" },
  { level: "INFO", msg: "Capital manager: Market condition changed to VOLATILE" },
  { level: "ERROR", msg: "API request timeout after 5000ms, retrying..." },
  { level: "INFO", msg: "Closed position #95: PNL +$18.42 (+0.89%)" },
  { level: "INFO", msg: "ML model prediction: SELL with 0.72 confidence" },
  { level: "WARNING", msg: "RSI approaching overbought: 72.3" },
  { level: "INFO", msg: "Break-even stop activated for position #97" },
  { level: "INFO", msg: "Daily loss at 65% of limit ($32.50 / $50.00)" },
  { level: "INFO", msg: "Candle pattern detected: Bullish engulfing on 5m" },
  { level: "ERROR", msg: "Failed to fetch order status: Connection reset" },
  { level: "INFO", msg: "Profit lock engaged at 1.5% gain on position #99" },
  { level: "INFO", msg: "ADX trending: 32.5 (strong trend confirmed)" },
  { level: "WARNING", msg: "Volume declining: ratio 0.62" },
  { level: "INFO", msg: "Session stats: 8 trades, 6 wins, 2 losses, +$47.80" },
  { level: "INFO", msg: "Order flow shifted to bullish: 1.3 buy/sell ratio" },
  { level: "INFO", msg: "Loop iteration completed in 42ms" },
];

export function generateLogEntry() {
  const entry = logMessages[Math.floor(Math.random() * logMessages.length)];
  return {
    timestamp: new Date().toISOString(),
    level: entry.level,
    message: entry.msg,
  };
}

export function generateInitialLogs() {
  return Array.from({ length: 30 }, (_, i) => {
    const entry = logMessages[i % logMessages.length];
    return {
      timestamp: new Date(Date.now() - (30 - i) * 3000).toISOString(),
      level: entry.level,
      message: entry.msg,
    };
  });
}
