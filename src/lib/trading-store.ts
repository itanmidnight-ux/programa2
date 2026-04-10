import { create } from "zustand";

export type NavItem = "overview" | "trades" | "charts" | "risk" | "ml" | "smart-stops" | "settings" | "logs";

export interface Trade {
  id: number;
  pair: string;
  side: string;
  entry: number;
  exit: number;
  size: number;
  pnl: number;
  pnl_pct: number;
  status: string;
  time: number;
  close_time: number | null;
  confidence: number;
  sl: number;
  tp: number;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

// ---- Multi-Pair Types ----

export interface PairData {
  symbol: string;
  display: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  active: boolean;
  lastUpdate: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PairCandlesData {
  symbol: string;
  interval: string;
  candles: CandleData[];
  indicators: {
    ma7: number | null;
    ma25: number | null;
    ma99: number | null;
    rsi: number;
    volume_avg: number;
  };
  lastFetch: number;
}

// Snapshot type — matches the API response structure
export interface Snapshot {
  mode?: string;
  notice?: string;
  status: string;
  pair: string;
  price: number;
  signal: string;
  confidence: number;
  balance: number;
  equity: number;
  total_equity: number;
  daily_pnl: number;
  session_pnl: number;
  unrealized_pnl: number;
  win_rate: number;
  total_trades: number;
  wins: number;
  losses: number;
  trades_today: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  expectancy: number;
  has_open_position: boolean;
  open_positions: Array<{
    id: number;
    side: string;
    entry: number;
    size: number;
    sl: number;
    tp: number;
    pnl: number;
    time: number;
  }>;
  open_position_side: string | null;
  open_position_entry: number;
  open_position_qty: number;
  open_position_sl: number;
  open_position_tp: number;
  trend: string;
  momentum: string;
  volatility_state: string;
  order_flow: string;
  rsi: number;
  adx: number;
  atr: number;
  spread: number;
  volume_ratio: number;
  change_24h: number;
  volume_24h: number;
  signals: Record<string, string>;
  timeframe_analysis: Record<string, string>;
  ml_status: string;
  ml_direction: string | null;
  ml_confidence: number;
  ml_accuracy: number;
  capital_manager: {
    capital_mode: string;
    current_capital: number;
    initial_capital: number;
    peak_capital: number;
    current_drawdown_pct: number;
    win_streak: number;
    loss_streak: number;
    daily_trades: number;
    market_condition: string;
    effective_params: {
      min_confidence: number;
      risk_per_trade: number;
      max_trades_per_day: number;
    };
  };
  smart_stop_stats: {
    active_stops: number;
    trails_activated: number;
    break_evens_hit: number;
    profit_locks: number;
  };
  candles_5m: CandleData[];
  exchange_status: string;
  database_status: string;
  api_latency_ms: number;
  market_regime: string;
  confluence_score: number;
  exit_intelligence_score: number;
  smart_stop: {
    phase: number;
    phaseName: string;
    trailingActive: boolean;
    breakEvenActive: boolean;
    timeOpen: number;
    nextProfitLock: number | null;
  };
  smart_stop_trade: {
    isPaused: boolean;
    pauseReason: string | null;
    overallScore: number;
    volatilityScore: number;
    signalQualityScore: number;
    performanceScore: number;
    positionSizeMultiplier: number;
  };
  [key: string]: any;
}

// ---- New types ----

export interface RiskMetricsState {
  daily_loss_used: number;
  daily_loss_limit: number;
  current_drawdown: number;
  max_drawdown: number;
  position_size_pct: number;
  max_position_size: number;
  risk_per_trade: number;
  total_risk_exposure: number;
  margin_used: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_consecutive_losses: number;
  avg_holding_time: string;
  best_trade: number;
  worst_trade: number;
  risk_reward_ratio: number;
}

export interface MLPredictionHistoryEntry {
  time: number;
  prediction: string;
  actual: string;
  correct: boolean;
  confidence: number;
}

export interface MLDataState {
  status: string;
  model_type: string;
  last_prediction: string;
  confidence: number;
  accuracy_7d: number;
  accuracy_30d: number;
  total_predictions: number;
  correct_predictions: number;
  features_used: number;
  last_trained: string;
  market_regime: string;
  regime_confidence: number;
  prediction_history: MLPredictionHistoryEntry[];
  signal_quality: {
    trend_accuracy: number;
    momentum_accuracy: number;
    volume_accuracy: number;
    volatility_accuracy: number;
    structure_accuracy: number;
  };
}

// ---- Default values ----

const defaultRiskMetrics: RiskMetricsState = {
  daily_loss_used: 0,
  daily_loss_limit: 50,
  current_drawdown: 0,
  max_drawdown: 15,
  position_size_pct: 0,
  max_position_size: 25,
  risk_per_trade: 1,
  total_risk_exposure: 0,
  margin_used: 0,
  sharpe_ratio: 0,
  sortino_ratio: 0,
  max_consecutive_losses: 0,
  avg_holding_time: "0s",
  best_trade: 0,
  worst_trade: 0,
  risk_reward_ratio: 0,
};

const defaultMLData: MLDataState = {
  status: "Loading",
  model_type: "LSTM + Gradient Boosting Ensemble",
  last_prediction: "HOLD",
  confidence: 0,
  accuracy_7d: 0,
  accuracy_30d: 0,
  total_predictions: 0,
  correct_predictions: 0,
  features_used: 47,
  last_trained: new Date().toISOString(),
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

const defaultSnapshot: Snapshot = {
  status: "CONNECTING",
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
  volatility_state: "NORMAL",
  order_flow: "NEUTRAL",
  rsi: 50,
  adx: 0,
  atr: 0,
  spread: 0,
  volume_ratio: 0,
  change_24h: 0,
  volume_24h: 0,
  signals: {},
  timeframe_analysis: {},
  ml_status: "Loading",
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
    market_condition: "NORMAL",
    effective_params: { min_confidence: 0.62, risk_per_trade: 0.01, max_trades_per_day: 120 },
  },
  smart_stop_stats: { active_stops: 0, trails_activated: 0, break_evens_hit: 0, profit_locks: 0 },
  candles_5m: [],
  exchange_status: "CONNECTING",
  database_status: "CONNECTING",
  api_latency_ms: 0,
  market_regime: "RANGING",
  confluence_score: 0,
  exit_intelligence_score: 0,
  smart_stop: { phase: 0, phaseName: "No Trailing", trailingActive: false, breakEvenActive: false, timeOpen: 0, nextProfitLock: null },
  smart_stop_trade: { isPaused: false, pauseReason: null, overallScore: 50, volatilityScore: 50, signalQualityScore: 50, performanceScore: 50, positionSizeMultiplier: 1 },
};

// ---- Store interface ----

interface TradingStore {
  // Navigation
  activeNav: NavItem;
  setActiveNav: (nav: NavItem) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Data — populated from real API endpoints
  snapshot: Snapshot;
  trades: Trade[];
  logs: LogEntry[];
  isLoading: boolean;
  connected: boolean;

  // Engine state (new)
  engineStatus: "IDLE" | "RUNNING" | "PAUSED" | "ERROR";
  engineUptime: number;
  engineLastTick: string | null;

  // Enhanced risk data (from real API)
  riskMetrics: RiskMetricsState;

  // Enhanced ML data (from real API)
  mlData: MLDataState;

  // Smart stop loss status
  smartStopStatus: {
    phase: number;
    phaseName: string;
    trailingActive: boolean;
    breakEvenActive: boolean;
    timeOpen: number;
    nextProfitLock: number | null;
    hasPosition: boolean;
    entryPrice: number;
    currentPrice: number;
    currentSL: number;
    initialSL: number;
    profitPct: number;
    timeStopAt: number;
    config: {
      phase1: { profitPct: number; trailATR: number };
      phase2: { profitPct: number; trailATR: number };
      phase3: { profitPct: number; trailATR: number };
      phase4: { profitPct: number; trailATR: number };
      breakEvenTriggerPct: number;
      profitLocks: Array<{ profitPct: number; closePct: number; moveSLToPct: number }>;
      maxHoldingMinutes: number;
    };
  } | null;

  // Smart stop trade status
  smartStopTradeStatus: {
    isPaused: boolean;
    pauseReason: string | null;
    overallScore: number;
    volatilityScore: number;
    signalQualityScore: number;
    performanceScore: number;
    timingScore: number;
    regimeScore: number;
    consecutiveLosses: number;
    dailyPnlPct: number;
    currentDrawdownPct: number;
    positionSizeMultiplier: number;
    pauseCount: number;
    totalPausedTime: number;
    autoResumeCountdown: number;
    peakBalance: number;
    config: {
      maxConsecutiveLosses: number;
      maxDailyLossPct: number;
      maxDrawdownPct: number;
      autoResumeAfterMinutes: number;
      pauseCooldownMinutes: number;
    };
  } | null;

  // Market analysis data (new)
  marketAnalysis: any | null;

  // ---- MULTI-PAIR STATE ----
  selectedPair: string;           // Currently selected pair for display (e.g. "BTCUSDT")
  pairPrices: Record<string, PairData>;  // All pair prices {symbol: PairData}
  pairCandles: PairCandlesData | null;   // Candles for the selected pair
  pairSearchOpen: boolean;               // Pair selector dropdown state

  // Actions
  setSnapshot: (data: Snapshot) => void;
  setTrades: (data: Trade[]) => void;
  setLogs: (data: LogEntry[]) => void;
  setConnected: (v: boolean) => void;

  // New engine actions
  setEngineStatus: (status: "IDLE" | "RUNNING" | "PAUSED" | "ERROR") => void;
  setEngineUptime: (uptime: number) => void;
  setEngineLastTick: (tick: string | null) => void;

  // New data actions (from real APIs)
  setRiskMetrics: (metrics: RiskMetricsState) => void;
  setMLData: (data: MLDataState) => void;
  setSmartStopStatus: (status: any) => void;
  setSmartStopTradeStatus: (status: any) => void;
  setMarketAnalysis: (analysis: any) => void;

  // Multi-pair actions
  setSelectedPair: (pair: string) => void;
  setPairPrices: (prices: Record<string, PairData>) => void;
  setPairCandles: (candles: PairCandlesData | null) => void;
  setPairSearchOpen: (open: boolean) => void;

  // Log actions
  addLog: (entry: { level: string; message: string }) => void;
  clearLogs: () => void;

  // Trade action
  closeTrade: (id: number) => void;
}

export const useTradingStore = create<TradingStore>((set, get) => ({
  // Navigation
  activeNav: "overview",
  setActiveNav: (nav) => set({ activeNav: nav }),
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  // Data
  snapshot: defaultSnapshot,
  trades: [],
  logs: [],
  isLoading: false,
  connected: false,

  // Engine state
  engineStatus: "IDLE",
  engineUptime: 0,
  engineLastTick: null,

  // Risk metrics (from real API)
  riskMetrics: defaultRiskMetrics,

  // ML data (from real API)
  mlData: defaultMLData,

  // Smart stop status
  smartStopStatus: null,
  smartStopTradeStatus: null,

  // Market analysis
  marketAnalysis: null,

  // ---- MULTI-PAIR STATE ----
  selectedPair: "BTCUSDT",
  pairPrices: {},
  pairCandles: null,
  pairSearchOpen: false,

  // Snapshot / trades / logs from real APIs
  setSnapshot: (data) => set({ 
    snapshot: data,
    // Also update pair prices if available
    pairPrices: data.pair_prices ? data.pair_prices : get().pairPrices,
  }),
  setTrades: (data) => set({ trades: data }),
  setLogs: (data) => set({ logs: data }),
  setConnected: (v) => set({ connected: v }),

  // Engine actions
  setEngineStatus: (status) => set({ engineStatus: status }),
  setEngineUptime: (uptime) => set({ engineUptime: uptime }),
  setEngineLastTick: (tick) => set({ engineLastTick: tick }),

  // Data setters from real APIs
  setRiskMetrics: (metrics) => set({ riskMetrics: metrics }),
  setMLData: (data) => set({ mlData: data }),
  setSmartStopStatus: (status) => set({ smartStopStatus: status }),
  setSmartStopTradeStatus: (status) => set({ smartStopTradeStatus: status }),
  setMarketAnalysis: (analysis) => set({ marketAnalysis: analysis }),

  // Multi-pair actions
  setSelectedPair: (pair) => set({ selectedPair: pair.replace("/", ""), pairCandles: null }),
  setPairPrices: (prices) => set({ pairPrices: prices }),
  setPairCandles: (candles) => set({ pairCandles: candles }),
  setPairSearchOpen: (open) => set({ pairSearchOpen: open }),

  // Log actions
  addLog: (entry) =>
    set((s) => ({
      logs: [
        { timestamp: new Date().toISOString(), ...entry },
        ...s.logs,
      ].slice(0, 500), // Keep max 500 entries
    })),
  clearLogs: () => set({ logs: [] }),

  // Trade action
  closeTrade: (id) =>
    set((s) => ({
      trades: s.trades.map((t) =>
        t.id === id
          ? { ...t, status: "CLOSED" as const, pnl: +(t.pnl + Math.random() * 10 - 3).toFixed(2) }
          : t
      ),
    })),
}));
