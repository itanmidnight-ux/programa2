// ============================================
// RECO-TRADING - Professional Scalping Engine v3.0
// ============================================
// Optimized for high-frequency scalping + Micro Market Making
// 
// CAPA 1: Generador de trades (Scalping basado en micro-tendencias)
// CAPA 2: Optimizador de ejecución (Market Making direccional)
// CAPA 3: Filtro inteligente de mercado
// CAPA 4: Gestión dinámica de riesgo
// ============================================

import { getKlines, getOrderBook, getTickerPrice, placeLimitOrder, cancelOrder, getOrderStatus, isTestnetMode, getCurrentCredentials } from '@/lib/market-bridge';
import { analyzeMarket, Candle } from '@/lib/analysis-engine';
import { db } from '@/lib/db';
import type { Trade } from '@/lib/risk-manager';
import { getCurrentWeights, loadSavedWeights, predictWithTrainedModel, getTrainingStatus } from './ml-dynamic-trainer';

// ============================================
// CONFIGURACIÓN ÓPTIMA (lista para producción)
// ============================================

const TRADE_CONFIG = {
  // Fees (Binance USDT-M futures - considerar maker)
  MAKER_FEE: 0.0002,    // 0.02%
  TAKER_FEE: 0.0004,    // 0.04%
  SLIPPAGE: 0.0003,     // 0.03% estimated (LIMIT orders son mejores)
  
  // TP/SL percentages (no ATR-based)
  TP_MIN_PERCENT: 0.003,  // 0.3% mínimo
  TP_MAX_PERCENT: 0.008,  // 0.8% máximo
  SL_MIN_PERCENT: 0.002,  // 0.2% mínimo
  SL_MAX_PERCENT: 0.004,  // 0.4% máximo
  
  // Scalping parameters
  RSI_PERIOD: 14,          // EXPERT STANDARD: RSI period 14 (Wilder)
  RSI_ENTRY_BUY_MIN: 25,  // EXPERT: Oversold zone
  RSI_ENTRY_BUY_MAX: 45,   // EXPERT: Lower mid for BUY
  RSI_ENTRY_SELL_MIN: 55,  // EXPERT: Upper mid for SELL
  RSI_ENTRY_SELL_MAX: 75,  // EXPERT: Overbought zone
  
  // EMA periods
  EMA_FAST: 9,
  EMA_SLOW: 21,
  
  // Market filters
  MIN_ATR_PERCENT: 0.2,    // Mínima volatilidad
  MAX_ATR_PERCENT: 3.0,    // Máxima volatilidad (evitar spikes)
  MIN_VOLUME_RATIO: 0.6,   // Volumen mínimo vs media
  MAX_SPREAD_PERCENT: 0.15,// Spread máximo
  
  // Risk management
  MAX_CONSECUTIVE_LOSSES: 3,
  PAUSE_ON_LOSS_MINUTES: 30,
  DAILY_LOSS_LIMIT_PERCENT: 3,
  MAX_DRAWDOWN_TO_PAUSE: 10,

  // ML Model Configuration
  ML_ENABLED: true,           // Enable ML filter
  ML_MIN_PROBABILITY: 0.55,  // Minimum probability to execute trade
  ML_MODEL_TYPE: 'logistic', // 'logistic' | 'decision_tree'
   
  // Position sizing
  MAX_RISK_PER_TRADE: 1.0,    // % de balance por trade
  MIN_CONFIDENCE: 0.40,
  MIN_RISK_REWARD: 1.5,        // Mínimo 1.5x
  
  // Grid / escalado
  GRID_ENABLED: true,         // EXPERT: Enable grid trading in lateral markets
  GRID_LEVELS: 3,             // Niveles de grid
  GRID_SPACING: 0.001,        // 0.1% entre niveles
  GRID_SIZE_MULTIPLIER: 0.5,  // Reducir tamaño en grid
  
  // Trailing stop
  TRAILING_ACTIVATION: 0.5,   // Activar cuando TP% alcanzado
  TRAILING_DISTANCE: 0.002,   // 0.2% detrás
  
  // Timeframe
  TIMEFRAME: '1m',

  // Execution improvements
  ORDER_TIMEOUT_MS: 15000,      // Timeout for order fill (15s)
  ORDER_CHECK_INTERVAL: 2000,   // Check order status every 2s
  RETRY_EXPONENTIAL: 1.5,       // Exponential backoff multiplier
  PRICE_ADJUSTMENT_ON_RETRY: 0.0002, // Adjust price by 0.02% on retry
  
  // Indicator caching
  CACHE_INDICATORS: true,       // Cache EMA/RSI to avoid recalculation
  CACHE_TTL_MS: 30000,          // Cache TTL (30 seconds)

  // Auto-Optimizer Configuration
  AUTO_OPTIMIZER_ENABLED: true,     // Enable auto-optimization
  OPTIMIZATION_INTERVAL: 30,        // Optimize every N trades
  OPTIMIZATION_WINDOW: 50,          // Look at last N trades
  MIN_TRADES_FOR_OPTIMIZATION: 20,  // Minimum trades before first optimization
  
  // Parameter bounds (min/max values)
  ML_PROB_MIN: 0.50,               // ML probability minimum
  ML_PROB_MAX: 0.75,               // ML probability maximum
  TP_MIN: 0.003,                   // TP minimum (0.3%)
  TP_MAX: 0.010,                   // TP maximum (1.0%)
  SL_MIN: 0.002,                   // SL minimum (0.2%)
  SL_MAX: 0.006,                   // SL maximum (0.6%)
  MIN_ATR_PERCENT_MIN: 0.15,       // Min ATR% min
  MIN_ATR_PERCENT_MAX: 0.50,       // Min ATR% max
  MIN_VOLUME_RATIO_MIN: 0.50,      // Min volume ratio min
  MIN_VOLUME_RATIO_MAX: 1.00,     // Min volume ratio max
  
  // Adjustment steps (conservative)
  PROB_STEP: 0.02,                 // Step for probability adjustment
  TP_STEP: 0.001,                  // Step for TP adjustment (0.1%)
  SL_STEP: 0.001,                  // Step for SL adjustment (0.1%)
  ATR_STEP: 0.05,                  // Step for ATR filter
  VOL_STEP: 0.10,                  // Step for volume filter
  
  // Performance thresholds
  WIN_RATE_LOW_THRESHOLD: 0.35,   // Below this: reduce risk
  WIN_RATE_HIGH_THRESHOLD: 0.55, // Above this: can be more aggressive
  DRAWDOWN_CAUTION: 3.0,          // Drawdown % to be cautious
  DRAWDOWN_CRITICAL: 7.0,          // Drawdown % to reduce risk significantly

  // Multi-timeframe confirmation
  MULTI_TF_ENABLED: true,         // Enable multi-timeframe confirmation
  CONFIRM_TIMEFRAME: '5m',        // Confirmation timeframe
  CONFIRM_TREND_ALIGNED: true,    // Require aligned trend

  // Intelligent stop system
  INTELLIGENT_STOP_ENABLED: true, // Enable intelligent stops
  IA_LOW_PROB_THRESHOLD: 0.45,   // If ML prob below this sustained, reduce activity
  IA_LOW_PROB_COUNT: 5,          // Count of low prob signals before action
  MARKET_STOP_HIGH_VOLATILITY: true, // Stop in extreme volatility
  MARKET_STOP_LOW_VOLUME: true,    // Stop in low volume
  
  // Enhanced logging
  LOG_LEVEL: 'INFO',              // DEBUG, INFO, WARN, ERROR
  LOG_EXECUTION_DETAILS: true,   // Log order details
  LOG_ML_DECISIONS: true,         // Log ML decisions
  LOG_OPTIMIZER_CHANGES: true,    // Log optimizer changes
  LOG_MARKET_FILTERS: true,       // Log market filter decisions

  // Adaptive Mode System
  ADAPTIVE_MODE_ENABLED: true,    // Enable adaptive mode switching
  MODE_CHANGE_INTERVAL: 20,       // Check for mode change every N ticks
  DEFAULT_MODE: 'BALANCED',       // Default operating mode
  
  // Mode-specific parameters
  CONSERVATIVO: {
    ML_PROB_THRESHOLD: 0.65,      // Higher threshold (more selective)
    TP_PERCENT: 0.004,           // 0.4% TP
    SL_PERCENT: 0.003,           // 0.3% SL
    MIN_VOLUME_RATIO: 1.0,        // Higher volume requirement
    MIN_ATR_PERCENT: 0.3,        // Higher ATR requirement
    POSITION_SIZE_MULT: 0.5,     // 50% position size
  },
  
  BALANCED: {
    ML_PROB_THRESHOLD: 0.55,      // Standard threshold
    TP_PERCENT: 0.005,           // 0.5% TP
    SL_PERCENT: 0.0025,           // 0.25% SL
    MIN_VOLUME_RATIO: 0.7,        // Standard volume
    MIN_ATR_PERCENT: 0.2,         // Standard ATR
    POSITION_SIZE_MULT: 0.8,     // 80% position size
  },
  
  ALTA_FRECUENCIA: {
    ML_PROB_THRESHOLD: 0.45,      // Lower threshold (more trades)
    TP_PERCENT: 0.003,           // 0.3% TP (smaller)
    SL_PERCENT: 0.002,           // 0.2% SL (tighter)
    MIN_VOLUME_RATIO: 0.5,       // Lower volume requirement
    MIN_ATR_PERCENT: 0.15,        // Lower ATR requirement
    POSITION_SIZE_MULT: 1.0,     // 100% position size
  },
  
  // Mode switch thresholds
  SWITCH_TO_CONSERVATIVO: {
    DRAWDOWN_MIN: 5.0,            // Drawdown % to switch
    LOW_WIN_RATE: 0.30,          // Win rate to switch
    HIGH_VOLATILITY: 3.5,         // ATR % to switch
  },
  
  SWITCH_TO_ALTA_FRECUENCIA: {
    WIN_RATE_MIN: 0.55,          // Win rate to switch
    LOW_VOLATILITY: 0.4,         // ATR % to switch
    CONSECUTIVE_WINS: 5,         // Win streak to switch
  },
};

// ============================================
// INDICATOR CACHE (Performance Optimization)
// ============================================

interface CachedIndicators {
  ema9: number[];
  ema21: number[];
  rsi: number[];
  atr: number[];
  timestamp: number;
}

const indicatorCache: Map<string, CachedIndicators> = new Map();

function getCachedIndicators(key: string): CachedIndicators | undefined {
  if (!TRADE_CONFIG.CACHE_INDICATORS) return undefined;
  
  const cached = indicatorCache.get(key);
  if (cached && Date.now() - cached.timestamp < TRADE_CONFIG.CACHE_TTL_MS) {
    return cached;
  }
  return undefined;
}

function setCachedIndicators(key: string, data: CachedIndicators): void {
  if (!TRADE_CONFIG.CACHE_INDICATORS) return;
  indicatorCache.set(key, { ...data, timestamp: Date.now() });
}

export function clearIndicatorCache(): void {
  indicatorCache.clear();
}

// ============================================
// PROFESSIONAL LOGGING SYSTEM
// ============================================

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  const configLevel = TRADE_CONFIG.LOG_LEVEL as LogLevel;
  return levels.indexOf(level) >= levels.indexOf(configLevel);
}

function logMessage(context: string, message: string, level: LogLevel = 'INFO'): void {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${context}] ${message}`);
}

export const logger = {
  exec: (msg: string) => TRADE_CONFIG.LOG_EXECUTION_DETAILS && logMessage('EXEC', msg),
  ml: (msg: string) => TRADE_CONFIG.LOG_ML_DECISIONS && logMessage('ML', msg),
  opt: (msg: string) => TRADE_CONFIG.LOG_OPTIMIZER_CHANGES && logMessage('OPT', msg),
  filter: (msg: string) => TRADE_CONFIG.LOG_MARKET_FILTERS && logMessage('FILTER', msg),
  info: (msg: string) => logMessage('INFO', msg),
  warn: (msg: string) => logMessage('WARN', msg),
  error: (msg: string) => logMessage('ERROR', msg, 'ERROR'),
};

// ============================================
// MULTI-TIMEFRAME CONFIRMATION (Enhanced)
// ============================================

export interface MultiTimeframeConfirmation {
  aligned: boolean;
  reason: string;
  baseSignal: 'BUY' | 'SELL' | 'HOLD';
  confirmSignal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  timeframeSignals: TimeframeSignal[];
  score: number;
}

export interface TimeframeSignal {
  timeframe: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  trend: string;
  strength: number;
  aligned: boolean;
}

function analyzeTimeframe(candles: Candle[]): { signal: 'BUY' | 'SELL' | 'HOLD', trend: string, strength: number } {
  if (candles.length < 20) return { signal: 'HOLD', trend: 'UNKNOWN', strength: 0 };
  
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  
  const currentPrice = closes[closes.length - 1];
  const ema9Val = ema9[ema9.length - 1];
  const ema21Val = ema21[ema21.length - 1];
  const ema50Val = ema50.length > 0 ? ema50[ema50.length - 1] : currentPrice;
  
  const atrArray = calculateATR(candles, 14);
  const atr = atrArray[atrArray.length - 1] || 0;
  const atrPercent = (atr / currentPrice) * 100;
  
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let trend = 'NEUTRAL';
  let strength = 0;
  
  const priceAboveEma9 = currentPrice > ema9Val;
  const ema9AboveEma21 = ema9Val > ema21Val;
  const ema21AboveEma50 = ema21Val > ema50Val;
  
  if (priceAboveEma9 && ema9AboveEma21) {
    signal = 'BUY';
    trend = ema21AboveEma50 ? 'STRONG_UP' : 'UP';
    strength = ema21AboveEma50 ? 1.0 : 0.7;
  } else if (!priceAboveEma9 && !ema9AboveEma21) {
    signal = 'SELL';
    trend = !ema21AboveEma50 ? 'STRONG_DOWN' : 'DOWN';
    strength = !ema21AboveEma50 ? 1.0 : 0.7;
  }
  
  if (atrPercent > 2.5) {
    strength *= 0.7;
  }
  
  return { signal, trend, strength };
}

export async function checkMultiTimeframeConfirmation(
  pair: string,
  baseSignal: 'BUY' | 'SELL' | 'HOLD',
  testnet: boolean
): Promise<MultiTimeframeConfirmation> {
  if (!TRADE_CONFIG.MULTI_TF_ENABLED || baseSignal === 'HOLD') {
    return { aligned: true, reason: 'Multi-TF disabled or no signal', baseSignal, confirmSignal: baseSignal, confidence: 1.0, timeframeSignals: [], score: 100 };
  }
  
  const timeframes = ['1m', '5m', '15m'];
  const timeframeSignals: TimeframeSignal[] = [];
  
  try {
    for (const tf of timeframes) {
      const candles = await getKlines(pair, tf, 50, testnet);
      if (candles.length >= 20) {
        const analysis = analyzeTimeframe(candles);
        timeframeSignals.push({
          timeframe: tf,
          signal: analysis.signal,
          trend: analysis.trend,
          strength: analysis.strength,
          aligned: analysis.signal === baseSignal,
        });
      }
    }
    
    if (timeframeSignals.length < 2) {
      return { aligned: true, reason: 'Insufficient TF data', baseSignal, confirmSignal: baseSignal, confidence: 0.8, timeframeSignals, score: 50 };
    }
    
    const alignedCount = timeframeSignals.filter(t => t.aligned).length;
    const totalCount = timeframeSignals.length;
    const alignmentRatio = alignedCount / totalCount;
    
    const avgStrength = timeframeSignals.reduce((sum, t) => sum + (t.aligned ? t.strength : 0), 0) / totalCount;
    
    const score = Math.round(alignmentRatio * 50 + avgStrength * 50);
    
    let confirmSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    const buySignals = timeframeSignals.filter(t => t.signal === 'BUY').length;
    const sellSignals = timeframeSignals.filter(t => t.signal === 'SELL').length;
    
    if (buySignals > sellSignals) confirmSignal = 'BUY';
    else if (sellSignals > buySignals) confirmSignal = 'SELL';
    
    const aligned = confirmSignal === baseSignal;
    const confidence = aligned ? (0.5 + alignmentRatio * 0.5) : (1 - alignmentRatio);
    
    let reason = '';
    if (aligned) {
      reason = `${alignedCount}/${totalCount} TFs aligned (${baseSignal})`;
    } else {
      reason = `Conflicting: ${buySignals} BUY vs ${sellSignals} SELL`;
    }
    
    return {
      aligned,
      reason,
      baseSignal,
      confirmSignal,
      confidence,
      timeframeSignals,
      score,
    };
  } catch (error) {
    logger.warn(`Multi-TF check failed: ${error}`);
    return { aligned: true, reason: 'Multi-TF check error', baseSignal, confirmSignal: baseSignal, confidence: 0.7, timeframeSignals: [], score: 50 };
  }
}

// ============================================
// INTELLIGENT STOP SYSTEM
// ============================================

export interface StopDecision {
  shouldStop: boolean;
  reason: string;
  reduceActivity: boolean;
}

export class IntelligentStopSystem {
  private lowProbCount: number = 0;
  private highVolatilityPause: boolean = false;
  
  reset(): void {
    this.lowProbCount = 0;
    this.highVolatilityPause = false;
  }
  
  check(
    marketConditions: { allowed: boolean; reason: string; isVolatile: boolean },
    mlProbability: number,
    riskStatus: { currentDrawdown: number; canTrade: boolean }
  ): StopDecision {
    // Check 1: Market conditions
    if (TRADE_CONFIG.MARKET_STOP_HIGH_VOLATILITY && marketConditions.isVolatile && !marketConditions.allowed) {
      return {
        shouldStop: true,
        reason: `Market stopped: ${marketConditions.reason}`,
        reduceActivity: true,
      };
    }
    
    // Check 2: Intelligent drawdown stop (already handled by risk manager, but extra check)
    if (riskStatus.currentDrawdown > TRADE_CONFIG.DRAWDOWN_CRITICAL) {
      return {
        shouldStop: true,
        reason: `Critical drawdown: ${riskStatus.currentDrawdown.toFixed(1)}%`,
        reduceActivity: true,
      };
    }
    
    // Check 3: AI low probability sustained
    if (TRADE_CONFIG.INTELLIGENT_STOP_ENABLED) {
      if (mlProbability < TRADE_CONFIG.IA_LOW_PROB_THRESHOLD) {
        this.lowProbCount++;
        if (this.lowProbCount >= TRADE_CONFIG.IA_LOW_PROB_COUNT) {
          logger.opt(`AI low probability sustained (${this.lowProbCount}x) - reducing activity`);
          return {
            shouldStop: false,
            reason: `Low ML probability (${this.lowProbCount}x)`,
            reduceActivity: true,
          };
        }
      } else {
        this.lowProbCount = Math.max(0, this.lowProbCount - 1);
      }
    }
    
    // Check 4: Risk manager says can't trade
    const riskStatusValue = riskStatus as { canTrade: boolean; reason?: string; currentDrawdown: number };
    if (!riskStatusValue.canTrade) {
      return {
        shouldStop: true,
        reason: `Risk manager: ${riskStatusValue.reason || 'unknown'}`,
        reduceActivity: true,
      };
    }
    
    return {
      shouldStop: false,
      reason: 'OK',
      reduceActivity: false,
    };
  }
}

// ============================================
// ADAPTIVE MODE SYSTEM
// ============================================

export type TradingMode = 'CONSERVATIVO' | 'BALANCED' | 'ALTA_FRECUENCIA';

export interface ModeParams {
  mlProbThreshold: number;
  tpPercent: number;
  slPercent: number;
  minVolumeRatio: number;
  minAtrPercent: number;
  positionSizeMult: number;
}

export class AdaptiveModeSystem {
  private currentMode: TradingMode = 'BALANCED';
  private tickCount: number = 0;
  
  constructor() {
    this.currentMode = TRADE_CONFIG.DEFAULT_MODE as TradingMode;
  }
  
  getMode(): TradingMode {
    return this.currentMode;
  }
  
  getParams(): ModeParams {
    const modeConfig = TRADE_CONFIG[this.currentMode] as any;
    return {
      mlProbThreshold: modeConfig.ML_PROB_THRESHOLD,
      tpPercent: modeConfig.TP_PERCENT,
      slPercent: modeConfig.SL_PERCENT,
      minVolumeRatio: modeConfig.MIN_VOLUME_RATIO,
      minAtrPercent: modeConfig.MIN_ATR_PERCENT,
      positionSizeMult: modeConfig.POSITION_SIZE_MULT,
    };
  }
  
  shouldChangeMode(): boolean {
    if (!TRADE_CONFIG.ADAPTIVE_MODE_ENABLED) return false;
    this.tickCount++;
    return this.tickCount >= TRADE_CONFIG.MODE_CHANGE_INTERVAL;
  }
  
  evaluateAndSwitch(
    metrics: PerformanceMetrics,
    riskStatus: { currentDrawdown: number },
    marketConditions: { atrPercent: number }
  ): TradingMode {
    if (!TRADE_CONFIG.ADAPTIVE_MODE_ENABLED || !this.shouldChangeMode()) {
      return this.currentMode;
    }
    
    this.tickCount = 0;
    const oldMode = this.currentMode;
    let newMode = this.currentMode;
    
    const { currentDrawdown } = riskStatus;
    const atrPercent = marketConditions.atrPercent;
    const winRate = metrics.winRate;
    
    // Switch to CONSERVATIVO conditions
    if (
      currentDrawdown > TRADE_CONFIG.SWITCH_TO_CONSERVATIVO.DRAWDOWN_MIN ||
      winRate < TRADE_CONFIG.SWITCH_TO_CONSERVATIVO.LOW_WIN_RATE ||
      atrPercent > TRADE_CONFIG.SWITCH_TO_CONSERVATIVO.HIGH_VOLATILITY
    ) {
      newMode = 'CONSERVATIVO';
    }
    // Switch to ALTA_FRECUENCIA conditions
    else if (
      winRate >= TRADE_CONFIG.SWITCH_TO_ALTA_FRECUENCIA.WIN_RATE_MIN &&
      atrPercent < TRADE_CONFIG.SWITCH_TO_ALTA_FRECUENCIA.LOW_VOLATILITY
    ) {
      newMode = 'ALTA_FRECUENCIA';
    }
    // Default to BALANCED
    else {
      newMode = 'BALANCED';
    }
    
    if (newMode !== oldMode) {
      logger.opt(`Mode changed: ${oldMode} → ${newMode} | WR: ${(winRate*100).toFixed(0)}% | DD: ${currentDrawdown.toFixed(1)}% | ATR: ${atrPercent.toFixed(1)}%`);
    }
    
    this.currentMode = newMode;
    return newMode;
  }
}

// ============================================
// MULTI-PAIR ADAPTIVE PARAMETERS
// ============================================

export function getAdaptiveParamsForPair(
  pair: string,
  volatility: number, // ATR percent
  regime: string
): { tpPercent: number; slPercent: number; baseRiskPercent: number } {
  // Normalize parameters based on volatility
  const baseMultiplier = volatility > 1.5 ? 1.3 : volatility > 0.8 ? 1.0 : 0.8;
  
  let tpPercent = TRADE_CONFIG.TP_MIN_PERCENT * baseMultiplier;
  let slPercent = TRADE_CONFIG.SL_MIN_PERCENT * baseMultiplier;
  let baseRiskPercent = TRADE_CONFIG.MAX_RISK_PER_TRADE;
  
  // Adjust for regime
  if (regime === 'HIGH_VOLATILITY') {
    tpPercent *= 1.2;
    slPercent *= 1.1;
    baseRiskPercent *= 0.7;
  } else if (regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN') {
    tpPercent *= 1.1;
    baseRiskPercent *= 1.1;
  }
  
  // Clamp values
  tpPercent = Math.max(0.003, Math.min(0.012, tpPercent));
  slPercent = Math.max(0.002, Math.min(0.008, slPercent));
  baseRiskPercent = Math.max(0.3, Math.min(2.0, baseRiskPercent));
  
  return { tpPercent, slPercent, baseRiskPercent };
}

// ============================================
// AUTO-OPTIMIZER MODULE
// ============================================
// Self-tuning system that adjusts parameters based on performance
// Uses sliding window of recent trades to make conservative adjustments
// ============================================

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  currentDrawdown: number;
  netPnl: number;
  pnlPercent: number;
}

export interface OptimizerConfig {
  mlProbability: number;
  tpPercent: number;
  slPercent: number;
  minAtrPercent: number;
  minVolumeRatio: number;
}

export class AutoOptimizer {
  private tradeCount: number = 0;
  private lastOptimization: number = 0;
  private currentConfig: OptimizerConfig;
  private initialConfig: OptimizerConfig;
  private baselineMetrics: PerformanceMetrics | null = null;
  
  constructor() {
    this.currentConfig = {
      mlProbability: TRADE_CONFIG.ML_MIN_PROBABILITY,
      tpPercent: TRADE_CONFIG.TP_MIN_PERCENT,
      slPercent: TRADE_CONFIG.SL_MIN_PERCENT,
      minAtrPercent: TRADE_CONFIG.MIN_ATR_PERCENT,
      minVolumeRatio: TRADE_CONFIG.MIN_VOLUME_RATIO,
    };
    
    this.initialConfig = { ...this.currentConfig };
  }
  
  getConfig(): OptimizerConfig {
    return { ...this.currentConfig };
  }
  
  resetConfig(): void {
    this.currentConfig = { ...this.initialConfig };
    this.baselineMetrics = null;
    console.log('[AUTO-OPT] Config reset to baseline');
  }
  
  setBaseline(metrics: PerformanceMetrics): void {
    if (!this.baselineMetrics) {
      this.baselineMetrics = { ...metrics };
      console.log('[AUTO-OPT] Baseline metrics set');
    }
  }
  
  incrementTradeCount(): void {
    this.tradeCount++;
  }
  
  shouldOptimize(): boolean {
    if (!TRADE_CONFIG.AUTO_OPTIMIZER_ENABLED) return false;
    
    const tradesSinceLast = this.tradeCount - this.lastOptimization;
    return tradesSinceLast >= TRADE_CONFIG.OPTIMIZATION_INTERVAL;
  }
  
  optimize(metrics: PerformanceMetrics, riskStatus: any): OptimizerConfig {
    if (!this.shouldOptimize() || metrics.totalTrades < TRADE_CONFIG.MIN_TRADES_FOR_OPTIMIZATION) {
      return this.currentConfig;
    }
    
    this.lastOptimization = this.tradeCount;
    const changes: string[] = [];
    const config = this.currentConfig;
    const winRate = metrics.winRate;
    const drawdown = metrics.currentDrawdown;
    const profitFactor = metrics.profitFactor;
    
    console.log(`[AUTO-OPT] Evaluating at trade ${this.tradeCount} | WR: ${(winRate*100).toFixed(1)}% | PF: ${profitFactor.toFixed(2)} | DD: ${drawdown.toFixed(1)}%`);
    
    // === ML Probability Adjustment ===
    if (winRate < TRADE_CONFIG.WIN_RATE_LOW_THRESHOLD) {
      // Poor win rate - increase selectivity
      const newProb = Math.min(config.mlProbability + TRADE_CONFIG.PROB_STEP, TRADE_CONFIG.ML_PROB_MAX);
      if (newProb !== config.mlProbability) {
        config.mlProbability = newProb;
        changes.push(`ML prob: ${(newProb*100).toFixed(0)}% (+${(TRADE_CONFIG.PROB_STEP*100).toFixed(0)}%)`);
      }
    } else if (winRate > TRADE_CONFIG.WIN_RATE_HIGH_THRESHOLD && profitFactor > 1.3) {
      // Good performance - can be more aggressive
      const newProb = Math.max(config.mlProbability - TRADE_CONFIG.PROB_STEP, TRADE_CONFIG.ML_PROB_MIN);
      if (newProb !== config.mlProbability) {
        config.mlProbability = newProb;
        changes.push(`ML prob: ${(newProb*100).toFixed(0)}% (-${(TRADE_CONFIG.PROB_STEP*100).toFixed(0)}%)`);
      }
    }
    
    // === TP/SL Adjustment based on profit factor ===
    if (profitFactor < 0.8 && metrics.totalTrades > 30) {
      // Losing money - make TP smaller, SL tighter
      const newTP = Math.max(config.tpPercent - TRADE_CONFIG.TP_STEP, TRADE_CONFIG.TP_MIN);
      const newSL = Math.max(config.slPercent - TRADE_CONFIG.SL_STEP, TRADE_CONFIG.SL_MIN);
      if (newTP !== config.tpPercent) {
        config.tpPercent = newTP;
        changes.push(`TP: ${(newTP*100).toFixed(1)}%`);
      }
      if (newSL !== config.slPercent) {
        config.slPercent = newSL;
        changes.push(`SL: ${(newSL*100).toFixed(1)}%`);
      }
    } else if (profitFactor > 1.5 && metrics.totalTrades > 30) {
      // Doing well - can extend TP slightly
      const newTP = Math.min(config.tpPercent + TRADE_CONFIG.TP_STEP, TRADE_CONFIG.TP_MAX);
      if (newTP !== config.tpPercent) {
        config.tpPercent = newTP;
        changes.push(`TP: ${(newTP*100).toFixed(1)}%`);
      }
    }
    
    // === Drawdown Risk Management ===
    if (drawdown > TRADE_CONFIG.DRAWDOWN_CRITICAL) {
      // Significant drawdown - reduce risk significantly
      config.mlProbability = Math.min(config.mlProbability + TRADE_CONFIG.PROB_STEP * 2, TRADE_CONFIG.ML_PROB_MAX);
      config.slPercent = Math.max(config.slPercent - TRADE_CONFIG.SL_STEP * 2, TRADE_CONFIG.SL_MIN);
      changes.push(`DRAWDOWN CRITICAL - reduced risk`);
    } else if (drawdown > TRADE_CONFIG.DRAWDOWN_CAUTION) {
      // Elevated drawdown - be more cautious
      config.mlProbability = Math.min(config.mlProbability + TRADE_CONFIG.PROB_STEP, TRADE_CONFIG.ML_PROB_MAX);
      changes.push(`DRAWDOWN ${drawdown.toFixed(1)}% - more selective`);
    }
    
    // === Volume/ATR Filter Adjustment ===
    if (metrics.avgWin > 0 && metrics.avgLoss > 0) {
      // Adjust filters based on market conditions
      if (metrics.avgWin < Math.abs(metrics.avgLoss) * 1.2) {
        // Wins barely covering losses - tighten filters
        const newVol = Math.min(config.minVolumeRatio + TRADE_CONFIG.VOL_STEP, TRADE_CONFIG.MIN_VOLUME_RATIO_MAX);
        if (newVol !== config.minVolumeRatio) {
          config.minVolumeRatio = newVol;
          changes.push(`Volume filter: ${newVol.toFixed(2)}x`);
        }
      }
    }
    
    // Apply changes
    if (changes.length > 0) {
      console.log(`[AUTO-OPT] Applied changes: ${changes.join(', ')}`);
    } else {
      console.log(`[AUTO-OPT] No changes - maintaining current config`);
    }
    
    return config;
  }
  
  getMetricsSummary(): string {
    return `[AUTO-OPT] Trades: ${this.tradeCount}, Last opt: ${this.lastOptimization}`;
  }
}

// Global optimizer instance (will be instantiated in ScalpingEngine)
let globalOptimizer: AutoOptimizer | null = null;

export function getOptimizer(): AutoOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new AutoOptimizer();
  }
  return globalOptimizer;
}

// ============================================
// MARKET REGIME DETECTOR (Enhanced)
// ============================================

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'LATERAL' | 'HIGH_VOLATILITY' | 'LOW_VOLATILITY';

export function detectMarketRegime(candles: Candle[], atrPercent: number, adx: number): MarketRegime {
  if (candles.length < 20) return 'LATERAL';
  
  const closes = candles.map(c => c.close);
  
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  
  const currentPrice = closes[closes.length - 1];
  const ema9Val = ema9[ema9.length - 1];
  const ema21Val = ema21[ema21.length - 1];
  const ema50Val = ema50.length > 0 ? ema50[ema50.length - 1] : ema21Val;
  
  // High volatility check
  if (atrPercent > TRADE_CONFIG.MAX_ATR_PERCENT) {
    return 'HIGH_VOLATILITY';
  }
  
  // Low volatility check
  if (atrPercent < TRADE_CONFIG.MIN_ATR_PERCENT) {
    return 'LOW_VOLATILITY';
  }
  
  // Trend detection with ADX
  const upTrend = currentPrice > ema9Val && ema9Val > ema21Val && ema21Val > ema50Val && adx > 20;
  const downTrend = currentPrice < ema9Val && ema9Val < ema21Val && ema21Val < ema50Val && adx > 20;
  
  if (upTrend) {
    return 'TRENDING_UP';
  }
  if (downTrend) {
    return 'TRENDING_DOWN';
  }
  
  return 'LATERAL';
}

export interface MarketConditionResult {
  allowed: boolean;
  reason: string;
  regime: MarketRegime;
  isVolatile: boolean;
  isLowVolatility: boolean;
  isTrending: boolean;
  atrPercent: number;
  adx: number;
}

export function analyzeMarketConditions(
  candles: Candle[],
  atrPercent: number,
  adx: number
): MarketConditionResult {
  const regime = detectMarketRegime(candles, atrPercent, adx);
  
  const isVolatile = regime === 'HIGH_VOLATILITY';
  const isLowVolatility = regime === 'LOW_VOLATILITY';
  const isTrending = regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN';
  
  let allowed = true;
  let reason = 'OK';
  
  if (isVolatile) {
    allowed = false;
    reason = `High volatility: ${atrPercent.toFixed(1)}%`;
  } else if (atrPercent < TRADE_CONFIG.MIN_ATR_PERCENT * 0.5) {
    allowed = false;
    reason = `Extremely low volatility: ${atrPercent.toFixed(1)}%`;
  }
  
  return {
    allowed,
    reason,
    regime,
    isVolatile,
    isLowVolatility,
    isTrending,
    atrPercent,
    adx,
  };
}

// ============================================
// LIGHTWEIGHT ML MODEL FOR TRADE PROBABILITY
// ============================================
// Simple logistic regression model for trade probability prediction
// Designed for low-latency inference
// ============================================

export interface TradeFeatures {
  rsi: number;
  emaDiff: number;           // EMA9 - EMA21 normalized
  emaDiffMomentum: number;   // Change in EMA diff
  atrPercent: number;
  volumeRatio: number;
  spreadPercent: number;
  priceMomentum: number;     // Last 3 candles direction
  regime: number;            // 0=LATERAL, 1=TRENDING_UP, 2=TRENDING_DOWN
  rsiMomentum: number;       // Change in RSI
}

export interface MLPrediction {
  probability: number;       // 0.0 to 1.0
  confidence: number;         // Model confidence
  features: TradeFeatures;
  modelUsed: string;
}

// Simple logistic regression weights (pre-trained)
// These weights are based on common scalping patterns
// Format: [intercept, rsi, emaDiff, atrPercent, volumeRatio, spreadPercent, momentum, regime, rsiMomentum]
const LOGISTIC_WEIGHTS = {
  intercept: 0.1,
  rsi: 0.15,
  emaDiff: 0.25,
  atrPercent: -0.1,
  volumeRatio: 0.2,
  spreadPercent: -0.3,
  priceMomentum: 0.15,
  regime: 0.2,
  rsiMomentum: 0.1,
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

export function extractFeatures(
  candles: Candle[],
  analysis: { rsi: number; atr: number; atrPct: number; volumeRatio: number; adx: number; price?: number },
  regime: MarketRegime,
  orderBook?: { bid: number; ask: number }
): TradeFeatures {
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  const ema9 = calculateEMA(closes, TRADE_CONFIG.EMA_FAST);
  const ema21 = calculateEMA(closes, TRADE_CONFIG.EMA_SLOW);
  const rsiValues = calculateRSI(closes, TRADE_CONFIG.RSI_PERIOD);
  
  const ema9Val = ema9[ema9.length - 1];
  const ema21Val = ema21[ema21.length - 1];
  const rsiVal = rsiValues[rsiValues.length - 1];
  const rsiPrev = rsiValues.length > 1 ? rsiValues[rsiValues.length - 2] : 50;
  
  // EMA diff normalized
  const emaDiff = (ema9Val - ema21Val) / ema21Val;
  const emaDiffPrev = (ema9[ema9.length - 2] - ema21[ema21.length - 2]) / ema21[ema21.length - 2];
  const emaDiffMomentum = emaDiff - emaDiffPrev;
  
  // Price momentum (last 3 candles)
  let priceMomentum = 0;
  if (closes.length >= 4) {
    const last3 = closes.slice(-3);
    const gains = last3[2] - last3[0];
    priceMomentum = gains / last3[0];
  }
  
  // Spread
  let spreadPercent = 0;
  if (orderBook && orderBook.bid && orderBook.ask) {
    spreadPercent = (orderBook.ask - orderBook.bid) / orderBook.ask * 100;
  }
  
  // Regime encoding
  let regimeNum = 0;
  if (regime === 'TRENDING_UP') regimeNum = 1;
  else if (regime === 'TRENDING_DOWN') regimeNum = 2;
  else if (regime === 'HIGH_VOLATILITY') regimeNum = 3;
  
  // RSI momentum
  const rsiMomentum = rsiVal - rsiPrev;
  
  return {
    rsi: rsiVal,
    emaDiff,
    emaDiffMomentum,
    atrPercent: analysis.atrPct,
    volumeRatio: analysis.volumeRatio,
    spreadPercent,
    priceMomentum,
    regime: regimeNum,
    rsiMomentum,
  };
}

export function predictTradeProbability(features: TradeFeatures): MLPrediction {
  const trainedStatus = getTrainingStatus();
  
  let w: any;
  let modelUsed = 'logistic_regression_static';
  
  if (trainedStatus.isTrained) {
    w = getCurrentWeights();
    modelUsed = 'logistic_regression_trained';
  } else {
    w = LOGISTIC_WEIGHTS;
  }
  
  // Calculate linear combination
  const z = w.intercept +
    w.rsi * features.rsi +
    w.emaDiff * features.emaDiff +
    w.atrPercent * features.atrPercent +
    w.volumeRatio * features.volumeRatio +
    w.spreadPercent * features.spreadPercent +
    w.priceMomentum * features.priceMomentum +
    w.regime * features.regime +
    w.rsiMomentum * features.rsiMomentum;
  
  const probability = sigmoid(z);

  // Confidence based on how far from 0.5
  const confidence = Math.abs(probability - 0.5) * 2;
  
  return {
    probability: Math.max(0, Math.min(1, probability)),
    confidence: Math.min(1, confidence),
    features,
    modelUsed,
  };
}

// Alternative: Decision tree for faster inference
export function predictWithDecisionTree(features: TradeFeatures): MLPrediction {
  let probability = 0.5;
  let confidence = 0.3;
  
  // Simple rule-based scoring
  let score = 0;
  let maxScore = 0;
  
  // RSI in sweet spot (35-55)
  if (features.rsi >= 35 && features.rsi <= 55) {
    score += 2;
  }
  maxScore += 2;
  
  // EMA bullish alignment
  if (features.emaDiff > 0) {
    score += 2;
    if (features.emaDiffMomentum > 0) {
      score += 1;  // Improving
    }
  } else if (features.emaDiff < 0) {
    score -= 1;  // Bearish - reduce probability
  }
  maxScore += 3;
  
  // Volume confirmation
  if (features.volumeRatio > 1.0) {
    score += 1.5;
  } else if (features.volumeRatio < 0.7) {
    score -= 1;
  }
  maxScore += 1.5;
  
  // Low spread is good
  if (features.spreadPercent < 0.1) {
    score += 1;
  } else if (features.spreadPercent > 0.2) {
    score -= 1;
  }
  maxScore += 1;
  
  // Regime check
  if (features.regime === 1 || features.regime === 2) {  // Trending
    score += 1;
  }
  maxScore += 1;
  
  // Price momentum positive
  if (features.priceMomentum > 0) {
    score += 1;
  } else if (features.priceMomentum < -0.001) {
    score -= 0.5;
  }
  maxScore += 1;
  
  // Normalize to probability
  probability = maxScore > 0 ? score / maxScore : 0.5;
  probability = Math.max(0.1, Math.min(0.9, probability));
  confidence = Math.abs(probability - 0.5) * 2;
  
  return {
    probability,
    confidence: Math.min(1, confidence),
    features,
    modelUsed: 'decision_tree',
  };
}

// Main prediction function - routes to selected model
export function predictProfitability(
  candles: Candle[],
  analysis: { rsi: number; atr: number; atrPct: number; volumeRatio: number; adx: number; price?: number },
  regime: MarketRegime,
  orderBook?: { bid: number; ask: number }
): MLPrediction {
  try {
    const features = extractFeatures(candles, analysis, regime, orderBook);
    
    if (TRADE_CONFIG.ML_MODEL_TYPE === 'decision_tree') {
      return predictWithDecisionTree(features);
    }
    
    return predictTradeProbability(features);
  } catch (error) {
    // Fallback: return neutral probability if model fails
    return {
      probability: 0.5,
      confidence: 0,
      features: {
        rsi: 50,
        emaDiff: 0,
        emaDiffMomentum: 0,
        atrPercent: 0,
        volumeRatio: 1,
        spreadPercent: 0,
        priceMomentum: 0,
        regime: 0,
        rsiMomentum: 0,
      },
      modelUsed: 'fallback',
    };
  }
}

// ============================================
// TRAINING DATA COLLECTION
// ============================================

export interface TrainingSample {
  features: TradeFeatures;
  label: number;  // 1 = winner, 0 = loser
  pair: string;
  timestamp: number;
}

// In-memory storage for training (would be persisted in production)
const trainingHistory: TrainingSample[] = [];

export function recordTradeOutcome(
  features: TradeFeatures,
  wasWinner: boolean,
  pair: string
): void {
  trainingHistory.push({
    features,
    label: wasWinner ? 1 : 0,
    pair,
    timestamp: Date.now(),
  });
  
  // Keep only last 1000 samples for memory efficiency
  if (trainingHistory.length > 1000) {
    trainingHistory.shift();
  }
}

export function getTrainingData(): TrainingSample[] {
  return [...trainingHistory];
}

export function getModelStats(): { samples: number; winRate: number; avgProbability: number } {
  if (trainingHistory.length === 0) {
    return { samples: 0, winRate: 0.5, avgProbability: 0.5 };
  }
  
  const winners = trainingHistory.filter(s => s.label === 1).length;
  const winRate = winners / trainingHistory.length;
  
  const avgProb = trainingHistory.reduce((sum, s) => {
    const pred = predictTradeProbability(s.features);
    return sum + pred.probability;
  }, 0) / trainingHistory.length;
  
  return {
    samples: trainingHistory.length,
    winRate,
    avgProbability: avgProb,
  };
}

// ============================================
// CORE INDICATORS - MATHEMATICALLY CORRECT
// ============================================
// EXPERT LEVEL INDICATORS (RSI, EMA, ATR)
// ============================================
// All indicators use Wilder smoothing and SMA initialization
// RSI Period standardized to 14 (EXPERT STANDARD)
// ============================================

export function calculateRSI(closes: number[], period: number = 14): number[] {
  const result: number[] = [];
  const n = closes.length;
  
  if (n < period + 1) {
    return new Array(n).fill(50);
  }
  
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  for (let i = 0; i < period; i++) {
    result.push(50);
  }
  
  for (let i = period; i < n; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  
  return result;
}

export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const n = data.length;
  const k = 2 / (period + 1);
  
  if (n < period) {
    return new Array(n).fill(data[0] || 0);
  }
  
  let sma = 0;
  for (let i = 0; i < period; i++) {
    sma += data[i];
  }
  sma /= period;
  
  for (let i = 0; i < period; i++) {
    result.push(sma);
  }
  
  let prevEMA = sma;
  for (let i = period; i < n; i++) {
    const ema = data[i] * k + prevEMA * (1 - k);
    result.push(ema);
    prevEMA = ema;
  }
  
  return result;
}

export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  const n = candles.length;
  
  if (n < period + 1) {
    return new Array(n).fill(0);
  }
  
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  result.push(sum / period);
  
  for (let i = period + 1; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    const prevATR = result[result.length - 1];
    result.push((prevATR * (period - 1) + tr) / period);
  }
  
  return result;
}

// ============================================
// REALISTIC PnL CALCULATOR
// ============================================

export interface RealisticPnL {
  grossPnl: number;
  fees: number;
  slippage: number;
  netPnl: number;
  netPnlPercent: number;
}

export function calculateRealisticPnL(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  side: 'LONG' | 'SHORT',
  entryFeeRate: number = TRADE_CONFIG.TAKER_FEE,
  exitFeeRate: number = TRADE_CONFIG.TAKER_FEE,
  slippageRate: number = TRADE_CONFIG.SLIPPAGE
): RealisticPnL {
  let grossPnl = 0;
  if (side === 'LONG') {
    grossPnl = (exitPrice - entryPrice) * quantity;
  } else {
    grossPnl = (entryPrice - exitPrice) * quantity;
  }
  
  const entryFee = entryPrice * quantity * entryFeeRate;
  const exitFee = exitPrice * quantity * exitFeeRate;
  const fees = entryFee + exitFee;
  
  const slippageEntry = entryPrice * quantity * slippageRate;
  const slippageExit = exitPrice * quantity * slippageRate;
  const slippage = slippageEntry + slippageExit;
  
  const netPnl = grossPnl - fees - slippage;
  const invested = entryPrice * quantity;
  const netPnlPercent = invested > 0 ? (netPnl / invested) * 100 : 0;
  
  return { grossPnl, fees, slippage, netPnl, netPnlPercent };
}

// ============================================
// MARKET FILTERS (CAPA 3)
// ============================================

export interface MarketCondition {
  allowed: boolean;
  reason: string;
  regime: MarketRegime;
  atrPercent: number;
  volumeRatio: number;
  spreadPercent: number;
  isVolatile: boolean;
}

export function evaluateMarketConditions(
  analysis: { atr: number; atrPct: number; volumeRatio: number; rsi: number; adx: number },
  candles: Candle[],
  orderBook?: { bid: number; ask: number; spread: number }
): MarketCondition {
  const { atrPct, volumeRatio, rsi, adx } = analysis;
  const regime = detectMarketRegime(candles, atrPct, adx);
  
  // Filtro: Alta volatilidad
  const isVolatile = atrPct > TRADE_CONFIG.MAX_ATR_PERCENT;
  if (isVolatile) {
    return {
      allowed: false,
      reason: `Alta volatilidad: ${atrPct.toFixed(2)}% (max: ${TRADE_CONFIG.MAX_ATR_PERCENT}%)`,
      regime,
      atrPercent: atrPct,
      volumeRatio,
      spreadPercent: 0,
      isVolatile: true,
    };
  }
  
  // Filtro: Baja volatilidad
  if (atrPct < TRADE_CONFIG.MIN_ATR_PERCENT) {
    return {
      allowed: false,
      reason: `Volatilidad muy baja: ${atrPct.toFixed(2)}%`,
      regime,
      atrPercent: atrPct,
      volumeRatio,
      spreadPercent: 0,
      isVolatile: false,
    };
  }
  
  // Filtro: Volumen bajo
  if (volumeRatio < TRADE_CONFIG.MIN_VOLUME_RATIO) {
    return {
      allowed: false,
      reason: `Volumen bajo: ${volumeRatio.toFixed(2)}x`,
      regime,
      atrPercent: atrPct,
      volumeRatio,
      spreadPercent: 0,
      isVolatile: false,
    };
  }
  
  // Filtro: Spread alto
  let spreadPercent = 0;
  if (orderBook && orderBook.bid && orderBook.ask) {
    spreadPercent = ((orderBook.ask - orderBook.bid) / orderBook.ask) * 100;
    if (spreadPercent > TRADE_CONFIG.MAX_SPREAD_PERCENT) {
      return {
        allowed: false,
        reason: `Spread alto: ${spreadPercent.toFixed(2)}%`,
        regime,
        atrPercent: atrPct,
        volumeRatio,
        spreadPercent,
        isVolatile: false,
      };
    }
  }
  
  // Filtro: RSI extremo
  if (rsi < 25 || rsi > 75) {
    return {
      allowed: false,
      reason: `RSI extremo: ${rsi.toFixed(1)}`,
      regime,
      atrPercent: atrPct,
      volumeRatio,
      spreadPercent,
      isVolatile: false,
    };
  }
  
  return {
    allowed: true,
    reason: 'Condiciones favorables',
    regime,
    atrPercent: atrPct,
    volumeRatio,
    spreadPercent,
    isVolatile: false,
  };
}

// ============================================
// SCALPING SIGNAL ENGINE (CAPA 1)
// ============================================

export interface ScalpingSignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasons: string[];
  ema9: number;
  ema21: number;
  rsi: number;
  tp: number;
  sl: number;
  riskReward: number;
  regime: MarketRegime;
  mlProbability?: number;
  mlConfidence?: number;
  mlModelUsed?: string;
}

export function generateScalpingSignal(candles: Candle[], analysis: any): ScalpingSignal {
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  if (closes.length < 30 || !analysis) {
    return {
      signal: 'HOLD',
      confidence: 0,
      reasons: ['Insufficient data'],
      ema9: 0,
      ema21: 0,
      rsi: 50,
      tp: 0,
      sl: 0,
      riskReward: 0,
      regime: 'LATERAL',
    };
  }
  
  const ema9 = calculateEMA(closes, TRADE_CONFIG.EMA_FAST);
  const ema21 = calculateEMA(closes, TRADE_CONFIG.EMA_SLOW);
  const rsiValues = calculateRSI(closes, TRADE_CONFIG.RSI_PERIOD);
  
  const ema9Val = ema9[ema9.length - 1];
  const ema21Val = ema21[ema21.length - 1];
  const rsiVal = rsiValues[rsiValues.length - 1];
  
  const regime = detectMarketRegime(candles, analysis.atrPct, analysis.adx);
  
  const reasons: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  
  // 1. EMA Crossover (peso: 2)
  if (ema9Val > ema21Val) {
    bullishScore += 2;
    reasons.push('EMA 9 > EMA 21');
  } else {
    bearishScore += 2;
    reasons.push('EMA 9 < EMA 21');
  }
  
  // 2. RSI Zone (peso: 1.5)
  if (rsiVal >= TRADE_CONFIG.RSI_ENTRY_BUY_MIN && rsiVal <= TRADE_CONFIG.RSI_ENTRY_BUY_MAX) {
    bullishScore += 1.5;
    reasons.push(`RSI buy zone: ${rsiVal.toFixed(1)}`);
  } else if (rsiVal >= TRADE_CONFIG.RSI_ENTRY_SELL_MIN && rsiVal <= TRADE_CONFIG.RSI_ENTRY_SELL_MAX) {
    bearishScore += 1.5;
    reasons.push(`RSI sell zone: ${rsiVal.toFixed(1)}`);
  } else if (rsiVal > 55 && rsiVal < 70) {
    bearishScore += 0.5;
  } else if (rsiVal < 45 && rsiVal > 30) {
    bullishScore += 0.5;
  }
  
  // 3. Precio cerca de EMA (evitar extensión)
  const priceDistFromEma = Math.abs(currentPrice - ema21Val) / currentPrice * 100;
  if (priceDistFromEma < 0.8) {
    if (currentPrice > ema21Val) {
      bullishScore += 0.5;
      reasons.push('Precio cerca EMA (soporte)');
    } else {
      bearishScore += 0.5;
      reasons.push('Precio cerca EMA (resistencia)');
    }
  }
  
  // 4. Confirmación de volumen
  if (analysis.volumeRatio > 1.2) {
    if (bullishScore > bearishScore) {
      bullishScore += 0.5;
      reasons.push('Alto volumen confirmando up');
    } else {
      bearishScore += 0.5;
      reasons.push('Alto volumen confirmando down');
    }
  } else if (analysis.volumeRatio < 0.6) {
    reasons.push('Bajo volumen - señal débil');
  }
  
  // 5. Ajuste por régimen de mercado
  if (regime === 'TRENDING_UP') {
    bullishScore += 1;
    reasons.push('Tendencia bullish');
  } else if (regime === 'TRENDING_DOWN') {
    bearishScore += 1;
    reasons.push('Tendencia bearish');
  } else if (regime === 'LATERAL') {
    // Reducir score en lateral
    bullishScore *= 0.7;
    bearishScore *= 0.7;
    reasons.push('Mercado lateral (score reducido)');
  }
  
  // Determinar señal
  const totalScore = bullishScore + bearishScore;
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 0.3;
  
  if (totalScore >= 2) {
    if (bullishScore > bearishScore) {
      signal = 'BUY';
      confidence = Math.min(0.85, 0.4 + (bullishScore / totalScore) * 0.4);
    } else if (bearishScore > bullishScore) {
      signal = 'SELL';
      confidence = Math.min(0.85, 0.4 + (bearishScore / totalScore) * 0.4);
    }
  } else if (totalScore >= 1) {
    if (bullishScore > bearishScore) {
      signal = 'BUY';
      confidence = Math.min(0.65, 0.35 + (bullishScore / totalScore) * 0.3);
    } else if (bearishScore > bullishScore) {
      signal = 'SELL';
      confidence = Math.min(0.65, 0.35 + (bearishScore / totalScore) * 0.3);
    }
  }
  
  // TP/SL basados en porcentaje determinista (basado en régimen de mercado y volatilidad)
  let tpPercent: number;
  let slPercent: number;
  
  // Deterministic TP/SL based on market regime and volatility
  if (regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN') {
    // In trending markets, use larger TP to capture momentum
    tpPercent = TRADE_CONFIG.TP_MAX_PERCENT;
    slPercent = TRADE_CONFIG.SL_MIN_PERCENT;
  } else if (regime === 'LATERAL') {
    // In ranging markets, use tighter TP/SL
    tpPercent = TRADE_CONFIG.TP_MIN_PERCENT;
    slPercent = TRADE_CONFIG.SL_MAX_PERCENT;
  } else if (regime === 'HIGH_VOLATILITY') {
    // In high volatility, reduce exposure with smaller TP
    tpPercent = TRADE_CONFIG.TP_MIN_PERCENT;
    slPercent = TRADE_CONFIG.SL_MAX_PERCENT;
  } else {
    // Default: use middle values
    tpPercent = (TRADE_CONFIG.TP_MIN_PERCENT + TRADE_CONFIG.TP_MAX_PERCENT) / 2;
    slPercent = (TRADE_CONFIG.SL_MIN_PERCENT + TRADE_CONFIG.SL_MAX_PERCENT) / 2;
  }
  
  // Adjust based on confidence score (higher confidence = larger TP)
  tpPercent = tpPercent * (0.8 + confidence * 0.4);
  
  const tp = signal === 'BUY' 
    ? currentPrice * (1 + tpPercent)
    : currentPrice * (1 - tpPercent);
    
  const sl = signal === 'BUY'
    ? currentPrice * (1 - slPercent)
    : currentPrice * (1 + slPercent);
  
  const tpDist = Math.abs(tp - currentPrice);
  const slDist = Math.abs(currentPrice - sl);
  const riskReward = slDist > 0 ? tpDist / slDist : 0;
  
  // Verificar mínimo risk/reward
  if (riskReward < TRADE_CONFIG.MIN_RISK_REWARD) {
    if (signal !== 'HOLD') {
      reasons.push(`RR bajo: ${riskReward.toFixed(2)} (min: ${TRADE_CONFIG.MIN_RISK_REWARD})`);
    }
  }
  
  // ML Filter: Get probability prediction
  let mlProbability = 0.5;
  let mlConfidence = 0;
  let mlModelUsed = 'disabled';
  
  if (TRADE_CONFIG.ML_ENABLED) {
    try {
      const mlPrediction = predictProfitability(
        candles,
        { rsi: rsiVal, atr: 0, atrPct: analysis.atrPct, volumeRatio: analysis.volumeRatio, adx: analysis.adx },
        regime
      );
      mlProbability = mlPrediction.probability;
      mlConfidence = mlPrediction.confidence;
      mlModelUsed = mlPrediction.modelUsed;
      
      reasons.push(`ML prob: ${(mlProbability * 100).toFixed(1)}% (${mlModelUsed})`);
    } catch (e) {
      reasons.push('ML disabled (error)');
      mlProbability = 0.5;
    }
  }
  
  // Apply ML filter: reduce confidence or block if probability too low
  let finalSignal = signal;
  let finalConfidence = confidence;
  
  if (signal !== 'HOLD' && TRADE_CONFIG.ML_ENABLED) {
    if (mlProbability < TRADE_CONFIG.ML_MIN_PROBABILITY) {
      finalSignal = 'HOLD';
      finalConfidence = 0;
      reasons.push(`ML BLOCKED: prob ${(mlProbability * 100).toFixed(1)}% < min ${(TRADE_CONFIG.ML_MIN_PROBABILITY * 100).toFixed(0)}%`);
    } else {
      // Adjust confidence based on ML probability
      const mlWeight = 0.3;
      finalConfidence = confidence * (1 - mlWeight) + mlProbability * mlWeight;
      reasons.push(`ML CONFIRMED: prob ${(mlProbability * 100).toFixed(1)}%`);
    }
  }
  
  return {
    signal: finalSignal,
    confidence: finalConfidence,
    reasons,
    ema9: ema9Val,
    ema21: ema21Val,
    rsi: rsiVal,
    tp,
    sl,
    riskReward,
    regime,
    mlProbability: mlProbability,
    mlConfidence: mlConfidence,
    mlModelUsed: mlModelUsed,
  };
}

// ============================================
// LIMIT ORDER EXECUTION (CAPA 2 - Micro Market Making)
// ============================================

export interface OrderResult {
  success: boolean;
  orderId?: string;
  filledPrice?: number;
  filledQty?: number;
  remainingQty?: number;
  error?: string;
  message: string;
}

export interface LimitOrderParams {
  pair: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  basePrice: number;
  offset: number;
  maxRetries: number;
  timeoutMs: number;
  testnet: boolean;
}

const ORDER_RETRY_DELAY = TRADE_CONFIG.ORDER_CHECK_INTERVAL || 1500;

async function calculateOptimalOffset(
  orderBook: { bids: [number, number][]; asks: [number, number][] } | null,
  side: 'BUY' | 'SELL',
  basePrice: number,
  regime: MarketRegime
): Promise<number> {
  if (!orderBook || orderBook.bids.length === 0 || orderBook.asks.length === 0) {
    // En tendencias, colocar más cerca del precio
    if (regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN') {
      return 0.0002;
    }
    return 0.0005;
  }
  
  const bestAsk = orderBook.asks[0][0];
  const bestBid = orderBook.bids[0][0];
  const spread = bestAsk - bestBid;
  
  if (side === 'BUY') {
    // En BUY: colocar 20-40% dentro del spread para mejor fill
    const offset = -(bestAsk - basePrice) * 0.3;
    return Math.max(-0.001, Math.min(0.001, offset));
  } else {
    const offset = (basePrice - bestBid) * 0.3;
    return Math.max(-0.001, Math.min(0.001, offset));
  }
}

// Adjust price for retry (move slightly for better fill probability)
function adjustPriceForRetry(price: number, side: 'BUY' | 'SELL', attempt: number): number {
  const adjustment = TRADE_CONFIG.PRICE_ADJUSTMENT_ON_RETRY * attempt;
  return side === 'BUY' 
    ? price * (1 - adjustment)  // Better price for buyer
    : price * (1 + adjustment);
}

// ============================================
// EXECUTION ENGINE PROFESIONAL (Order Status Tracking)
// ============================================

export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'PENDING' | 'EXPIRED';

export interface OrderTrackingResult {
  success: boolean;
  orderId?: string;
  status?: OrderStatus;
  filledPrice?: number;
  filledQty?: number;
  avgFillPrice?: number;
  remainingQty?: number;
  error?: string;
  message: string;
  executionLog: string[];
}

export async function placeSmartLimitOrder(
  apiKey: string,
  apiSecret: string,
  params: LimitOrderParams
): Promise<OrderResult> {
  const { pair, side, quantity, basePrice, offset, maxRetries, timeoutMs, testnet } = params;
  
  let limitPrice = side === 'BUY'
    ? basePrice * (1 - offset)
    : basePrice * (1 + offset);

  const precision = pair.includes('BTC') || pair.includes('ETH') ? 2 : 2;
  let roundedPrice = parseFloat(limitPrice.toFixed(precision));
  
  let lastError: string = '';
  let attempt = 0;
  let orderId: string | number | undefined;
  
  const executionLog: string[] = [];
  executionLog.push(`[EXEC] Placing LIMIT ${side} ${quantity} @ ${roundedPrice}`);

  while (attempt < maxRetries) {
    attempt++;
    
    try {
      const result = await placeLimitOrder(
        apiKey,
        apiSecret,
        pair,
        side,
        quantity,
        roundedPrice,
        undefined,
        testnet
      );
      
      if (result.success) {
        orderId = result.orderId;
        executionLog.push(`[EXEC] Order placed: ${orderId}`);
        
        // Verify fill status immediately
        if (result.status === 'FILLED' || (result.fills && result.fills.length > 0)) {
          const fills = result.fills || [];
          const filledQty = fills.reduce((sum, f) => sum + parseFloat(f.qty), 0) || quantity;
          if (filledQty > 0) {
            const avgFillPrice = fills.length > 0 
              ? fills.reduce((sum, f) => sum + parseFloat(f.price) * parseFloat(f.qty), 0) / filledQty 
              : roundedPrice;
            executionLog.push(`[EXEC] FILLED: ${filledQty}/${quantity} @ ${avgFillPrice}`);
            
            return {
              success: true,
              orderId: String(result.orderId),
              filledPrice: avgFillPrice,
              filledQty: filledQty,
              remainingQty: quantity - filledQty,
              message: `FILLED: ${filledQty} @ ${avgFillPrice}`,
            };
          }
        }
        
        // Order not immediately filled - track status
        if (!orderId) {
          return { success: false, error: 'No order ID', message: 'Failed to get order ID' };
        }
        
        const trackResult = await trackOrderStatus(
          apiKey,
          apiSecret,
          pair,
          orderId,
          quantity,
          side,
          roundedPrice,
          timeoutMs || 15000,
          testnet,
          executionLog
        );
        
        if (trackResult.success) {
          return trackResult;
        }
        
        // If tracking failed or order expired, log and retry
        lastError = trackResult.error || 'Order tracking failed';
        executionLog.push(`[EXEC] Track failed: ${lastError}`);
        
      } else {
        lastError = result.error || 'Order failed';
        executionLog.push(`[EXEC] Order failed: ${lastError}`);
      }
      
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      executionLog.push(`[EXEC] Exception: ${lastError}`);
    }
    
    // Adjust price for next retry attempt
    if (attempt < maxRetries) {
      const oldPrice = roundedPrice;
      roundedPrice = adjustPriceForRetry(basePrice, side, attempt);
      executionLog.push(`[EXEC] Price adjusted for retry: ${oldPrice} -> ${roundedPrice}`);
      
      // Wait before retry with exponential backoff
      const delay = ORDER_RETRY_DELAY * Math.pow(TRADE_CONFIG.RETRY_EXPONENTIAL || 1.5, attempt - 1);
      executionLog.push(`[EXEC] Retry ${attempt}/${maxRetries} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  executionLog.push(`[EXEC] FAILED after ${maxRetries} attempts: ${lastError}`);
  
  return {
    success: false,
    error: lastError,
    message: `Failed after ${maxRetries} attempts: ${lastError}`,
  };
}

async function trackOrderStatus(
  apiKey: string,
  apiSecret: string,
  pair: string,
  orderId: string | number,
  quantity: number,
  side: 'BUY' | 'SELL',
  originalPrice: number,
  timeoutMs: number,
  testnet: boolean,
  log: string[]
): Promise<OrderResult> {
  const startTime = Date.now();
  const checkInterval = 2000; // Check every 2 seconds
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await getOrderStatus(apiKey, apiSecret, pair, orderId, testnet);
      const orderStatus = status.status as string;
      
      log.push(`[EXEC] Order status: ${orderStatus}, filled: ${status.executedQty || 0}`);
      
      if (orderStatus === 'FILLED') {
        const filledPrice = parseFloat(status.price || originalPrice);
        return {
          success: true,
          orderId: String(orderId),
          filledPrice: filledPrice,
          filledQty: parseFloat(status.executedQty || quantity),
          message: `FILLED @ ${filledPrice}`,
        };
      }
      
      if (orderStatus === 'PARTIALLY_FILLED') {
        const filledQty = parseFloat(status.executedQty || 0);
        if (filledQty > 0) {
          const avgPrice = parseFloat(status.price || originalPrice);
          return {
            success: true,
            orderId: String(orderId),
            filledPrice: avgPrice,
            filledQty: filledQty,
            remainingQty: quantity - filledQty,
            message: `PARTIAL: ${filledQty}/${quantity} @ ${avgPrice}`,
          };
        }
      }
      
      if (orderStatus === 'CANCELED' || orderStatus === 'EXPIRED' || orderStatus === 'REJECTED') {
        log.push(`[EXEC] Order ${orderStatus}, attempting dynamic replacement`);
        return {
          success: false,
          error: `Order ${orderStatus}`,
          message: `Order ${orderStatus}, needs replacement`,
        };
      }
      
      // NEW or PENDING - wait and check again
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
    } catch (err) {
      log.push(`[EXEC] Status check error: ${err}`);
      // Continue trying
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
  
  // Timeout - try to cancel and return failure
  log.push(`[EXEC] Timeout after ${timeoutMs}ms`);
  
  try {
    await cancelOrder(apiKey, apiSecret, pair, orderId, testnet);
    log.push(`[EXEC] Order cancelled after timeout`);
  } catch {
    log.push(`[EXEC] Cancel failed (may already be filled)`);
  }
  
  return {
    success: false,
    error: 'Order timeout',
    message: `Timeout after ${timeoutMs}ms`,
  };
}

// Dynamic order replacement with price adjustment
export async function placeDynamicLimitOrder(
  apiKey: string,
  apiSecret: string,
  pair: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  currentPrice: number,
  direction: 'aggressive' | 'passive',
  maxRetries: number,
  testnet: boolean
): Promise<OrderResult> {
  const executionLog: string[] = [];
  
  // Calculate optimal offset based on strategy
  let offset = 0;
  if (direction === 'aggressive') {
    // Aggressive: place slightly better than mid-price
    offset = side === 'BUY' ? -0.0003 : 0.0003;
  } else {
    // Passive: place at current price
    offset = 0;
  }
  
  const targetPrice = side === 'BUY'
    ? currentPrice * (1 + offset)
    : currentPrice * (1 - offset);
  
  executionLog.push(`[EXEC] Dynamic order: ${side} ${quantity} @ ${targetPrice}`);
  
  return placeSmartLimitOrder(
    apiKey,
    apiSecret,
    {
      pair,
      side,
      quantity,
      basePrice: currentPrice,
      offset: side === 'BUY' ? -Math.abs(targetPrice - currentPrice) / currentPrice : Math.abs(targetPrice - currentPrice) / currentPrice,
      maxRetries,
      timeoutMs: 15000,
      testnet,
    }
  );
}

// ============================================
// GRID ENTRY SYSTEM (Escalado de entradas)
// ============================================

interface GridEntry {
  level: number;
  price: number;
  quantity: number;
  filled: boolean;
}

export class GridManager {
  private entries: GridEntry[] = [];
  private maxLevels: number;
  private spacing: number;
  
  constructor(maxLevels: number = TRADE_CONFIG.GRID_LEVELS, spacing: number = TRADE_CONFIG.GRID_SPACING) {
    this.maxLevels = maxLevels;
    this.spacing = spacing;
  }
  
  generateGrid(basePrice: number, totalQty: number, direction: 'BUY' | 'SELL'): GridEntry[] {
    this.entries = [];
    const qtyPerLevel = totalQty / this.maxLevels;
    
    for (let i = 0; i < this.maxLevels; i++) {
      const offset = direction === 'BUY' 
        ? -this.spacing * (i + 1)
        : this.spacing * (i + 1);
      
      this.entries.push({
        level: i + 1,
        price: basePrice * (1 + offset),
        quantity: qtyPerLevel * TRADE_CONFIG.GRID_SIZE_MULTIPLIER,
        filled: false,
      });
    }
    
    return this.entries;
  }
  
  getEntries(): GridEntry[] {
    return this.entries;
  }
  
  markFilled(level: number): void {
    const entry = this.entries.find(e => e.level === level);
    if (entry) entry.filled = true;
  }
  
  reset(): void {
    this.entries = [];
  }
}

// ============================================
// RISK MANAGER CON GESTIÓN DINÁMICA (CAPA 4)
// ============================================

export interface RiskStatus {
  canTrade: boolean;
  reason: string;
  currentDrawdown: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  dailyLoss: number;
  positionSizeMultiplier: number;
}

export class ScalpingRiskManager {
  private trades: Trade[] = [];
  private peakBalance: number = 0;
  private balance: number = 1000;
  private lastPauseTime: number = 0;
  private winStreak: number = 0;
  private lossStreak: number = 0;
  
  constructor(initialBalance: number = 1000) {
    this.balance = initialBalance;
    this.peakBalance = initialBalance;
  }
  
  recordTrade(trade: Trade): void {
    this.trades.push(trade);
    
    if (trade.status === 'CLOSED') {
      this.balance += trade.pnl || 0;
      this.peakBalance = Math.max(this.peakBalance, this.balance);
      
      if (trade.pnl && trade.pnl > 0) {
        this.winStreak++;
        this.lossStreak = 0;
      } else {
        this.lossStreak++;
        this.winStreak = 0;
      }
    }
  }
  
  getStatus(): RiskStatus {
    const closedTrades = this.trades.filter(t => t.status === 'CLOSED');
    const todayTrades = closedTrades.filter(t => {
      const today = new Date().toDateString();
      return t.closedAt && new Date(t.closedAt).toDateString() === today;
    });
    
    let consecutiveLosses = 0;
    const recentTrades = closedTrades.slice(-10);
    for (const t of recentTrades.reverse()) {
      if (t.pnl && t.pnl < 0) consecutiveLosses++;
      else break;
    }
    
    let consecutiveWins = 0;
    for (const t of recentTrades.reverse()) {
      if (t.pnl && t.pnl > 0) consecutiveWins++;
      else break;
    }
    
    const dailyLoss = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const dailyLossPercent = this.balance > 0 ? (dailyLoss / this.balance) * 100 : 0;
    
    const timeSincePause = Date.now() - this.lastPauseTime;
    const isPaused = consecutiveLosses >= TRADE_CONFIG.MAX_CONSECUTIVE_LOSSES && 
                     timeSincePause < TRADE_CONFIG.PAUSE_ON_LOSS_MINUTES * 60 * 1000;
    
    const drawdown = this.peakBalance > 0 
      ? ((this.peakBalance - this.balance) / this.peakBalance) * 100 
      : 0;
    
    let positionSizeMultiplier = 1.0;
    
    // Reducir tamaño en drawdown
    if (drawdown > 2) positionSizeMultiplier = 0.75;
    if (drawdown > 5) positionSizeMultiplier = 0.5;
    if (drawdown > 10) positionSizeMultiplier = 0.25;
    
    // Aumentar tamaño en racha positiva
    if (consecutiveWins >= 3) positionSizeMultiplier = Math.min(1.5, positionSizeMultiplier * 1.2);
    if (consecutiveWins >= 5) positionSizeMultiplier = Math.min(2.0, positionSizeMultiplier * 1.3);
    
    // Reducir en racha negativa
    if (consecutiveLosses >= 2) positionSizeMultiplier *= 0.7;
    
    return {
      canTrade: !isPaused && dailyLossPercent > -TRADE_CONFIG.DAILY_LOSS_LIMIT_PERCENT && drawdown < TRADE_CONFIG.MAX_DRAWDOWN_TO_PAUSE,
      reason: isPaused 
        ? `Pausado: ${consecutiveLosses} pérdidas, ${Math.ceil((TRADE_CONFIG.PAUSE_ON_LOSS_MINUTES * 60 * 1000 - timeSincePause) / 60000)}min restantes`
        : dailyLossPercent <= -TRADE_CONFIG.DAILY_LOSS_LIMIT_PERCENT 
          ? `Límite pérdida diaria: ${dailyLossPercent.toFixed(2)}%`
          : drawdown >= TRADE_CONFIG.MAX_DRAWDOWN_TO_PAUSE
            ? `Drawdown máximo: ${drawdown.toFixed(2)}%`
            : 'OK',
      currentDrawdown: drawdown,
      consecutiveLosses,
      consecutiveWins,
      dailyLoss,
      positionSizeMultiplier,
    };
  }
  
  getConsecutiveLosses(): number {
    return this.lossStreak;
  }
  
  getRecentTrades(count: number = TRADE_CONFIG.OPTIMIZATION_WINDOW): Trade[] {
    return this.trades.slice(-count).filter(t => t.status === 'CLOSED');
  }
  
  getAllTrades(): Trade[] {
    return [...this.trades];
  }
  
  // Advanced position sizing with volatility, confidence, and risk control
  calculatePositionSize(
    entryPrice: number,
    stopLoss: number,
    riskPercent: number = TRADE_CONFIG.MAX_RISK_PER_TRADE,
    options: {
      confidence?: number;
      mlProbability?: number;
      atrPercent?: number;
      regime?: MarketRegime;
      modeMultiplier?: number;
    } = {}
  ): number {
    const { confidence = 0.5, mlProbability = 0.5, atrPercent = 0.5, regime = 'LATERAL', modeMultiplier = 1.0 } = options;
    
    // Base risk amount
    let riskAmount = this.balance * (riskPercent / 100);
    
    // Volatility adjustment: reduce position in high volatility
    let volatilityMultiplier = 1.0;
    if (atrPercent > 2.0) {
      volatilityMultiplier = 0.6;
    } else if (atrPercent > 1.5) {
      volatilityMultiplier = 0.8;
    } else if (atrPercent > 1.0) {
      volatilityMultiplier = 0.9;
    } else if (atrPercent < 0.3) {
      volatilityMultiplier = 1.2;
    }
    
    // Confidence scaling: higher confidence = larger position
    let confidenceMultiplier = 0.5 + (confidence * 0.5);
    confidenceMultiplier = Math.max(0.3, Math.min(1.5, confidenceMultiplier));
    
    // ML probability scaling
    let mlMultiplier = 0.5 + (mlProbability * 0.5);
    mlMultiplier = Math.max(0.4, Math.min(1.3, mlMultiplier));
    
    // Regime adjustment
    let regimeMultiplier = 1.0;
    if (regime === 'HIGH_VOLATILITY') {
      regimeMultiplier = 0.5;
    } else if (regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN') {
      regimeMultiplier = 1.2;
    } else if (regime === 'LOW_VOLATILITY') {
      regimeMultiplier = 1.3;
    }
    
    // Apply all multipliers
    riskAmount = riskAmount * volatilityMultiplier * confidenceMultiplier * mlMultiplier * regimeMultiplier * modeMultiplier;
    
    // Calculate position size based on risk
    const priceRisk = Math.abs(entryPrice - stopLoss);
    if (priceRisk <= 0) return 0;
    
    const rawSize = riskAmount / priceRisk;
    
    // Apply additional safety limits
    const maxPositionValue = this.balance * 0.2; // Max 20% of balance in one trade
    const maxSize = maxPositionValue / entryPrice;
    
    return Math.min(rawSize, maxSize);
  }
  
  pauseTrading(): void {
    this.lastPauseTime = Date.now();
  }
  
  getBalance(): number {
    return this.balance;
  }
}

// ============================================
// TRAILING STOP MANAGER
// ============================================
// INTELLIGENT TRAILING STOP MANAGER (Enhanced)
// ============================================

export class TrailingStopManager {
  private active: boolean = false;
  private side: 'LONG' | 'SHORT' = 'LONG';
  private entryPrice: number = 0;
  
  // ATR-based trailing
  private useATR: boolean = true;
  private atrMultiplier: number = 2.0;
  private currentATR: number = 0;
  
  // Traditional percentage-based trailing
  private activationPercent: number = 0;
  private distancePercent: number = 0;
  
  // Break-even
  private breakEvenTriggered: boolean = false;
  private breakEvenPercent: number = 0.5;
  
  // Time-based exit
  private maxHoldTimeMs: number = 300000;
  private entryTime: number = 0;
  private useTimeExit: boolean = true;
  
  // Price tracking
  private highestPrice: number = 0;
  private lowestPrice: number = 0;
  private trailingStop: number = 0;
  
  activate(entryPrice: number, side: 'LONG' | 'SHORT', currentPrice: number, tpPercent: number, atr: number = 0): void {
    this.side = side;
    this.entryPrice = entryPrice;
    this.entryTime = Date.now();
    this.breakEvenTriggered = false;
    
    // ATR-based configuration
    if (this.useATR && atr > 0) {
      this.currentATR = atr;
      this.atrMultiplier = 2.0;
    }
    
    // Traditional percentage configuration
    this.activationPercent = tpPercent * TRADE_CONFIG.TRAILING_ACTIVATION;
    this.distancePercent = TRADE_CONFIG.TRAILING_DISTANCE;
    
    if (side === 'LONG') {
      this.highestPrice = currentPrice;
      this.trailingStop = currentPrice - (this.useATR && atr > 0 ? atr * this.atrMultiplier : currentPrice * this.distancePercent);
    } else {
      this.lowestPrice = currentPrice;
      this.trailingStop = currentPrice + (this.useATR && atr > 0 ? atr * this.atrMultiplier : currentPrice * this.distancePercent);
    }
    
    this.active = true;
  }
  
  update(currentPrice: number, atr: number = 0): { shouldStop: boolean; stopPrice: number; reason: string } {
    if (!this.active) {
      return { shouldStop: false, stopPrice: 0, reason: '' };
    }
    
    let shouldStop = false;
    let reason = '';
    
    // Update ATR if provided
    if (atr > 0) {
      this.currentATR = atr;
    }
    
    const now = Date.now();
    
    if (this.side === 'LONG') {
      // Update highest price
      if (currentPrice > this.highestPrice) {
        this.highestPrice = currentPrice;
        // ATR-based trailing
        if (this.useATR && this.currentATR > 0) {
          this.trailingStop = currentPrice - (this.currentATR * this.atrMultiplier);
        } else {
          this.trailingStop = currentPrice * (1 - this.distancePercent);
        }
      }
      
      // Check break-even
      const profitPercent = (currentPrice - this.entryPrice) / this.entryPrice;
      if (!this.breakEvenTriggered && profitPercent >= this.breakEvenPercent) {
        this.breakEvenTriggered = true;
        this.trailingStop = this.entryPrice;
        reason = 'BREAK_EVEN';
      }
      
      // Check trailing stop
      if (currentPrice <= this.trailingStop) {
        shouldStop = true;
        reason = reason || 'TRAILING_STOP';
      }
    } else {
      // Update lowest price
      if (currentPrice < this.lowestPrice) {
        this.lowestPrice = currentPrice;
        // ATR-based trailing
        if (this.useATR && this.currentATR > 0) {
          this.trailingStop = currentPrice + (this.currentATR * this.atrMultiplier);
        } else {
          this.trailingStop = currentPrice * (1 + this.distancePercent);
        }
      }
      
      // Check break-even
      const profitPercent = (this.entryPrice - currentPrice) / this.entryPrice;
      if (!this.breakEvenTriggered && profitPercent >= this.breakEvenPercent) {
        this.breakEvenTriggered = true;
        this.trailingStop = this.entryPrice;
        reason = 'BREAK_EVEN';
      }
      
      // Check trailing stop
      if (currentPrice >= this.trailingStop) {
        shouldStop = true;
        reason = reason || 'TRAILING_STOP';
      }
    }
    
    // Check time-based exit
    if (this.useTimeExit && (now - this.entryTime) > this.maxHoldTimeMs) {
      shouldStop = true;
      reason = 'TIME_EXIT';
    }
    
    return { shouldStop, stopPrice: this.trailingStop, reason };
  }
  
  reset(): void {
    this.active = false;
    this.highestPrice = 0;
    this.lowestPrice = 0;
    this.trailingStop = 0;
    this.breakEvenTriggered = false;
    this.entryTime = 0;
    this.currentATR = 0;
  }
  
  isActive(): boolean {
    return this.active;
  }
  
  getHoldTime(): number {
    return this.entryTime > 0 ? Date.now() - this.entryTime : 0;
  }
  
  setMaxHoldTime(ms: number): void {
    this.maxHoldTimeMs = ms;
  }
  
  setATRMultiplier(mult: number): void {
    this.atrMultiplier = mult;
  }
}

// ============================================
// TRADE FREQUENCY CONTROLLER
// ============================================

export class TradeFrequencyController {
  private tradesToday: number = 0;
  private tradesThisHour: number = 0;
  private lastTradeTime: number = 0;
  private hourStartTime: number = Date.now();
  private dayStartTime: number = Date.now();
  
  // Configuration
  private maxTradesPerHour: number = 12;
  private maxTradesPerDay: number = 60;
  private minIntervalMs: number = 5000;
  
  // Dynamic throttling based on conditions
  private optimalConditionsScore: number = 0;
  
  constructor() {
    this.resetDaily();
  }
  
  resetDaily(): void {
    this.tradesToday = 0;
    this.dayStartTime = Date.now();
  }
  
  private resetHourly(): void {
    this.tradesThisHour = 0;
    this.hourStartTime = Date.now();
  }
  
  canTrade(conditions: { isTrending: boolean; isLowVolatility: boolean; confidence: number }): { allowed: boolean; reason: string; throttleMs: number } {
    const now = Date.now();
    
    // Check hourly reset
    if (now - this.hourStartTime > 3600000) {
      this.resetHourly();
    }
    
    // Check daily reset
    if (now - this.dayStartTime > 86400000) {
      this.resetDaily();
    }
    
    // Calculate optimal conditions score (0-1)
    this.optimalConditionsScore = 0;
    if (conditions.isTrending) this.optimalConditionsScore += 0.4;
    if (conditions.isLowVolatility) this.optimalConditionsScore += 0.2;
    if (conditions.confidence > 0.7) this.optimalConditionsScore += 0.4;
    
    // Check max trades limits
    if (this.tradesThisHour >= this.maxTradesPerHour) {
      const waitMs = 3600000 - (now - this.hourStartTime);
      return { allowed: false, reason: `Max hourly trades reached (${this.maxTradesPerHour})`, throttleMs: waitMs };
    }
    
    if (this.tradesToday >= this.maxTradesPerDay) {
      const waitMs = 86400000 - (now - this.dayStartTime);
      return { allowed: false, reason: `Max daily trades reached (${this.maxTradesPerDay})`, throttleMs: waitMs };
    }
    
    // Check minimum interval
    const timeSinceLastTrade = now - this.lastTradeTime;
    if (timeSinceLastTrade < this.minIntervalMs) {
      return { allowed: false, reason: `Min interval not met`, throttleMs: this.minIntervalMs - timeSinceLastTrade };
    }
    
    // Dynamic throttling based on optimal conditions
    if (this.optimalConditionsScore < 0.5 && this.tradesThisHour > 4) {
      return { allowed: false, reason: `Suboptimal conditions (score: ${this.optimalConditionsScore.toFixed(1)})`, throttleMs: 10000 };
    }
    
    return { allowed: true, reason: 'OK', throttleMs: 0 };
  }
  
  recordTrade(): void {
    const now = Date.now();
    this.tradesToday++;
    this.tradesThisHour++;
    this.lastTradeTime = now;
  }
  
  getStats(): { tradesToday: number; tradesThisHour: number; optimalScore: number } {
    return {
      tradesToday: this.tradesToday,
      tradesThisHour: this.tradesThisHour,
      optimalScore: this.optimalConditionsScore,
    };
  }
  
  adjustLimits(wasWinner: boolean, recentWinRate: number): void {
    if (wasWinner && recentWinRate > 0.6) {
      this.maxTradesPerHour = Math.min(20, this.maxTradesPerHour + 1);
      this.maxTradesPerDay = Math.min(100, this.maxTradesPerDay + 5);
    } else if (!wasWinner && recentWinRate < 0.4) {
      this.maxTradesPerHour = Math.max(6, this.maxTradesPerHour - 1);
      this.maxTradesPerDay = Math.max(30, this.maxTradesPerDay - 5);
    }
  }
}

// ============================================
// MAIN SCALPING ENGINE
// ============================================

export interface ScalpingConfig {
  pair: string;
  testnet: boolean;
  apiKey: string;
  apiSecret: string;
  initialBalance: number;
  dryRun: boolean;
  tickIntervalMs: number;
}

export class ScalpingEngine {
  private config: ScalpingConfig;
  private candles: Candle[] = [];
  private currentPosition: any = null;
  private riskManager: ScalpingRiskManager;
  private gridManager: GridManager;
  private trailingManager: TrailingStopManager;
  private optimizer: AutoOptimizer;
  private intelligentStopSystem: IntelligentStopSystem;
  private adaptiveMode: AdaptiveModeSystem;
  private isRunning = false;
  private tickCount = 0;
  private lastError?: string;
  
  constructor(config: Partial<ScalpingConfig> = {}) {
    const creds = getCurrentCredentials();
    
    this.config = {
      pair: process.env.TRADING_SYMBOL || 'XAU_USD',
      testnet: isTestnetMode(),
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
      initialBalance: parseFloat(process.env.INITIAL_CAPITAL || '1000'),
      dryRun: process.env.DRY_RUN === 'true',
      tickIntervalMs: 30000, // 30 segundos por defecto
      ...config,
    };
    
    this.riskManager = new ScalpingRiskManager(this.config.initialBalance);
    this.gridManager = new GridManager();
    this.trailingManager = new TrailingStopManager();
    this.optimizer = new AutoOptimizer();
    this.intelligentStopSystem = new IntelligentStopSystem();
    this.adaptiveMode = new AdaptiveModeSystem();
    
    logger.info(`Engine initialized. Pair: ${this.config.pair}, Mode: ${this.adaptiveMode.getMode()}, Interval: ${this.config.tickIntervalMs}ms`);
  }
  
  async start(): Promise<void> {
    this.isRunning = true;
    logger.info('Engine started');
  }
  
  async stop(): Promise<void> {
    this.isRunning = false;
    this.trailingManager.reset();
    this.intelligentStopSystem.reset();
    logger.info('Engine stopped');
  }
  
  async tick(): Promise<any> {
    if (!this.isRunning) return { action: 'STOPPED' };
    
    this.tickCount++;
    
    try {
      const [currentPrice, orderBook] = await Promise.all([
        getTickerPrice(this.config.pair, this.config.testnet),
        getOrderBook(this.config.pair, 10, this.config.testnet).catch(() => null),
      ]);
      
      // Fetch candles (1m timeframe)
      if (this.tickCount === 1 || this.tickCount % 2 === 0) {
        this.candles = await getKlines(this.config.pair, TRADE_CONFIG.TIMEFRAME, 100, this.config.testnet);
      }
      
      if (this.candles.length < 30) {
        return { action: 'WAIT_DATA', reason: 'Insufficient candles' };
      }
      
      const analysis = analyzeMarket(this.candles);
      
      // Evaluate market conditions (CAPA 3 - Filtro)
      const marketConditions = evaluateMarketConditions(
        { atr: analysis.atr, atrPct: analysis.atrPct, volumeRatio: analysis.volumeRatio, rsi: analysis.rsi, adx: analysis.adx },
        this.candles,
        orderBook || undefined
      );
      
      if (!marketConditions.allowed) {
        logger.filter(`Market filtered: ${marketConditions.reason}`);
        return { action: 'FILTERED', reason: marketConditions.reason, regime: marketConditions.regime };
      }
      
      // Check risk (CAPA 4)
      const riskStatus = this.riskManager.getStatus();
      if (!riskStatus.canTrade) {
        logger.filter(`Risk blocked: ${riskStatus.reason}`);
        return { action: 'RISK_BLOCKED', reason: riskStatus.reason, riskStatus };
      }
      
      // Generate signal (CAPA 1)
      const signal = generateScalpingSignal(this.candles, analysis);
      
      // Adaptive Mode System - evaluate and get parameters
      const mode = this.adaptiveMode.evaluateAndSwitch(
        { totalTrades: this.riskManager.getAllTrades().length, winRate: 0.5, profitFactor: 1, avgWin: 0, avgLoss: 0, currentDrawdown: riskStatus.currentDrawdown, netPnl: 0, pnlPercent: 0 },
        riskStatus,
        { atrPercent: analysis.atrPct }
      );
      
      const modeParams = this.adaptiveMode.getParams();
      
      // Adjust signal based on mode
      if (mode !== 'BALANCED') {
        signal.reasons.push(`Mode: ${mode}`);
        
        // Adjust ML threshold based on mode
        if (signal.mlProbability && signal.mlProbability < modeParams.mlProbThreshold) {
          signal.confidence *= 0.7;
          signal.reasons.push(`ML prob below mode threshold`);
        }
      }
      
      // Apply adaptive TP/SL based on mode and pair volatility
      const adaptiveParams = getAdaptiveParamsForPair(this.config.pair, analysis.atrPct, signal.regime);
      
      // Adjust position size based on mode
      const riskStatusAdjusted = {
        ...riskStatus,
        positionSizeMultiplier: riskStatus.positionSizeMultiplier * modeParams.positionSizeMult
      };
      
      // Intelligent Stop Check
      const intelligentStop = this.intelligentStopSystem.check(
        marketConditions,
        signal.mlProbability || 0.5,
        riskStatus
      );
      
      if (intelligentStop.shouldStop) {
        logger.filter(`Intelligent stop: ${intelligentStop.reason}`);
        return { action: 'INTELLIGENT_STOP', reason: intelligentStop.reason, signal };
      }
      
      // Multi-timeframe confirmation
      let mtConfirmation: MultiTimeframeConfirmation | null = null;
      if (TRADE_CONFIG.MULTI_TF_ENABLED && signal.signal !== 'HOLD') {
        mtConfirmation = await checkMultiTimeframeConfirmation(
          this.config.pair,
          signal.signal,
          this.config.testnet
        );
        
        if (!mtConfirmation.aligned) {
          logger.filter(`Multi-TF not aligned: ${mtConfirmation.reason}`);
          signal.confidence *= 0.5;
          signal.reasons.push(`Multi-TF: ${mtConfirmation.reason}`);
        }
      }
      
      // Reduce activity if intelligent stop says so
      if (intelligentStop.reduceActivity) {
        signal.confidence *= 0.5;
        signal.reasons.push('Reduced activity (intelligent stop)');
      }
      
      // Manage existing position
      if (this.currentPosition) {
        const closeResult = await this.managePosition(currentPrice, analysis, signal.regime);
        if (closeResult) {
          return closeResult;
        }
      }
      
      // Execute new trade
      if (signal.signal !== 'HOLD' && signal.confidence >= TRADE_CONFIG.MIN_CONFIDENCE) {
        const executeResult = await this.executeTrade(signal, analysis, orderBook);
        return executeResult;
      }
      
      return { 
        action: 'NO_SIGNAL', 
        signal,
        marketConditions,
        riskStatus,
        regime: signal.regime,
        mtConfirmation: mtConfirmation || undefined,
      };
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.lastError = errorMsg;
      
      return { 
        action: 'ERROR', 
        error: errorMsg,
        tickCount: this.tickCount,
      };
    }
  }
  
  private async executeTrade(signal: any, analysis: any, orderBook: any): Promise<any> {
    const side = signal.signal === 'BUY' ? 'LONG' : 'SHORT';
    const price = analysis.price;
    
    // EXPERT: Grid Trading for lateral markets
    if (signal.regime === 'LATERAL' && !this.currentPosition && TRADE_CONFIG.GRID_ENABLED) {
      logger.info(`[GRID] Lateral market detected - using grid strategy`);
      const gridOrders = this.gridManager.generateGrid(price, 
        this.riskManager.getBalance() * 0.1 / price, // 10% de balance
        signal.signal
      );
      
      // Execute grid orders in background
      this.executeGridOrders(gridOrders, signal, analysis);
    }
    
    // Get mode parameters for position sizing
    const modeParams = this.adaptiveMode.getParams();
    
    // Advanced position sizing with confidence, ML probability, volatility, and regime
    const quantity = this.riskManager.calculatePositionSize(price, signal.sl, TRADE_CONFIG.MAX_RISK_PER_TRADE, {
      confidence: signal.confidence || 0.5,
      mlProbability: signal.mlProbability || 0.5,
      atrPercent: analysis.atrPct || 0.5,
      regime: signal.regime || 'LATERAL',
      modeMultiplier: modeParams.positionSizeMult,
    });
    
    if (quantity <= 0) {
      return { action: 'NO_POSITION', reason: 'Invalid quantity' };
    }
    
    const riskStatus = this.riskManager.getStatus();
    const adjustedQty = quantity * riskStatus.positionSizeMultiplier;
    
    logger.exec(`${side} @ ${price}, qty: ${adjustedQty}, TP: ${signal.tp.toFixed(2)}, SL: ${signal.sl.toFixed(2)}, RR: ${signal.riskReward.toFixed(2)}`);
    
    if (this.config.dryRun) {
      this.currentPosition = {
        side,
        entryPrice: price,
        quantity: adjustedQty,
        takeProfit: signal.tp,
        stopLoss: signal.sl,
        openedAt: new Date(),
        tpPercent: Math.abs((signal.tp - price) / price),
      };
      
      return {
        action: 'TRADE_OPENED',
        side,
        entryPrice: price,
        quantity: adjustedQty,
        tp: signal.tp,
        sl: signal.sl,
        dryRun: true,
      };
    }
    
    if (!this.config.apiKey || !this.config.apiSecret) {
      return { action: 'NO_KEYS', error: 'API keys required' };
    }
    
    const orderSide = side === 'LONG' ? 'BUY' : 'SELL';
    const offset = await calculateOptimalOffset(orderBook, orderSide, price, signal.regime);
    
    const orderResult = await placeSmartLimitOrder(
      this.config.apiKey,
      this.config.apiSecret,
      {
        pair: this.config.pair,
        side: orderSide,
        quantity: adjustedQty,
        basePrice: price,
        offset: offset,
        maxRetries: 3,
        timeoutMs: 30000,
        testnet: this.config.testnet,
      }
    );
    
    if (orderResult.success) {
      const filledPrice = orderResult.filledPrice || price;
      const filledQty = orderResult.filledQty || adjustedQty;
      
      this.currentPosition = {
        side,
        entryPrice: filledPrice,
        quantity: filledQty,
        takeProfit: signal.tp,
        stopLoss: signal.sl,
        openedAt: new Date(),
        tpPercent: Math.abs((signal.tp - filledPrice) / filledPrice),
      };
      
      // Activate trailing stop with ATR
      const atr = analysis.atr || 0;
      this.trailingManager.activate(filledPrice, side, filledPrice, Math.abs((signal.tp - filledPrice) / filledPrice), atr);
      
      return {
        action: 'TRADE_OPENED',
        side,
        entryPrice: filledPrice,
        quantity: filledQty,
        tp: signal.tp,
        sl: signal.sl,
        orderId: orderResult.orderId,
      };
    }
    
    return {
      action: 'ORDER_FAILED',
      error: orderResult.error,
    };
  }
  
  // EXPERT: Execute grid orders in lateral markets
  private async executeGridOrders(gridOrders: GridEntry[], signal: any, analysis: any): Promise<void> {
    logger.info(`[GRID] Executing ${gridOrders.length} grid orders`);
    
    for (const entry of gridOrders) {
      try {
        const orderSide = signal.signal === 'BUY' ? 'BUY' : 'SELL';
        const result = await placeSmartLimitOrder(
          this.config.apiKey,
          this.config.apiSecret,
          {
            pair: this.config.pair,
            side: orderSide,
            quantity: entry.quantity,
            basePrice: entry.price,
            offset: 0.0001,
            maxRetries: 2,
            timeoutMs: 10000,
            testnet: this.config.testnet,
          }
        );
        
        if (result.success) {
          this.gridManager.markFilled(entry.level);
          logger.info(`[GRID] Order filled at level ${entry.level}: ${entry.price}`);
        }
      } catch (error) {
        logger.error(`[GRID] Order failed at level ${entry.level}: ${error}`);
      }
    }
  }

  private async managePosition(currentPrice: number, analysis: any, regime: MarketRegime): Promise<any> {
    if (!this.currentPosition) return null;
    
    const pos = this.currentPosition;
    let shouldClose = false;
    let closeReason = '';
    
    // Check Stop Loss
    if (pos.side === 'LONG' && currentPrice <= pos.stopLoss) {
      shouldClose = true;
      closeReason = 'STOP_LOSS';
    } else if (pos.side === 'SHORT' && currentPrice >= pos.stopLoss) {
      shouldClose = true;
      closeReason = 'STOP_LOSS';
    }
    
    // Check Take Profit
    if (!shouldClose) {
      if (pos.side === 'LONG' && currentPrice >= pos.takeProfit) {
        shouldClose = true;
        closeReason = 'TAKE_PROFIT';
      } else if (pos.side === 'SHORT' && currentPrice <= pos.takeProfit) {
        shouldClose = true;
        closeReason = 'TAKE_PROFIT';
      }
    }
    
    // Check Trailing Stop (pass ATR for ATR-based trailing)
    if (!shouldClose && this.trailingManager.isActive()) {
      const trailingCheck = this.trailingManager.update(currentPrice, analysis.atr);
      if (trailingCheck.shouldStop) {
        shouldClose = true;
        closeReason = trailingCheck.reason || 'TRAILING_STOP';
        pos.stopLoss = trailingCheck.stopPrice;
      }
    }
    
    if (shouldClose) {
      return await this.closePosition(closeReason);
    }
    
    return null;
  }
  
  private async closePosition(reason: string): Promise<any> {
    if (!this.currentPosition) return null;
    
    const pos = this.currentPosition;
    const currentPrice = await getTickerPrice(this.config.pair, this.config.testnet);
    
    const pnlResult = calculateRealisticPnL(
      pos.entryPrice,
      currentPrice,
      pos.quantity,
      pos.side as 'LONG' | 'SHORT'
    );
    
    logger.exec(`Close ${pos.side}: PnL=${pnlResult.netPnl.toFixed(2)} (${pnlResult.netPnlPercent.toFixed(2)}%)`);
    
    this.riskManager.recordTrade({
      id: Date.now(),
      pair: this.config.pair,
      side: pos.side as 'LONG' | 'SHORT',
      entryPrice: pos.entryPrice,
      exitPrice: currentPrice,
      quantity: pos.quantity,
      pnl: pnlResult.netPnl,
      pnlPercent: pnlResult.netPnlPercent,
      confidence: pos.tpPercent || 0.5,
      status: 'CLOSED',
      signal: pos.side === 'LONG' ? 'BUY' : 'SELL',
      strategy: 'Scalping v3',
      openedAt: pos.openedAt,
      closedAt: new Date(),
      commission: pnlResult.fees,
    });
    
    if (pnlResult.netPnl < 0) {
      const losses = this.riskManager.getConsecutiveLosses();
      if (losses >= TRADE_CONFIG.MAX_CONSECUTIVE_LOSSES) {
        this.riskManager.pauseTrading();
      }
    }
    
    // Record trade outcome for ML training (if enabled)
    if (TRADE_CONFIG.ML_ENABLED && this.currentPosition) {
      try {
        const features: TradeFeatures = {
          rsi: 50,
          emaDiff: 0,
          emaDiffMomentum: 0,
          atrPercent: 0,
          volumeRatio: 1,
          spreadPercent: 0,
          priceMomentum: 0,
          regime: 0,
          rsiMomentum: 0,
        };
        const wasWinner = pnlResult.netPnl > 0;
        recordTradeOutcome(features, wasWinner, this.config.pair);
        console.log(`[ML] Recorded trade outcome: ${wasWinner ? 'WIN' : 'LOSS'}`);
        this.optimizer.incrementTradeCount();
        
        if (this.optimizer.shouldOptimize()) {
          const closedTrades = this.riskManager.getRecentTrades ? this.riskManager.getRecentTrades() : [];
          if (closedTrades.length >= TRADE_CONFIG.OPTIMIZATION_WINDOW) {
            const recentMetrics = this.calculateMetrics(closedTrades);
            const riskStatus = this.riskManager.getStatus();
            const newConfig = this.optimizer.optimize(recentMetrics, riskStatus);
            console.log(`[AUTO-OPT] New config: ML prob=${(newConfig.mlProbability*100).toFixed(0)}%, TP=${(newConfig.tpPercent*100).toFixed(1)}%, SL=${(newConfig.slPercent*100).toFixed(1)}%`);
          }
        }
      } catch (e) {
        console.log(`[ML] Could not record outcome: ${e}`);
      }
    }
    
    const result = {
      action: 'TRADE_CLOSED',
      reason,
      entryPrice: pos.entryPrice,
      exitPrice: currentPrice,
      quantity: pos.quantity,
      pnl: pnlResult.netPnl,
      pnlPercent: pnlResult.netPnlPercent,
    };
    
    this.currentPosition = null;
    this.trailingManager.reset();
    
    return result;
  }
  
  getStatus(): any {
    return {
      running: this.isRunning,
      pair: this.config.pair,
      hasPosition: this.currentPosition !== null,
      position: this.currentPosition,
      riskStatus: this.riskManager.getStatus(),
      optimizerConfig: this.optimizer.getConfig(),
      adaptiveMode: this.adaptiveMode.getMode(),
      modeParams: this.adaptiveMode.getParams(),
      tickCount: this.tickCount,
      lastError: this.lastError,
      balance: this.riskManager.getBalance(),
    };
  }
  
  private calculateMetrics(trades: Trade[]): PerformanceMetrics {
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    if (closedTrades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0.5,
        profitFactor: 1,
        avgWin: 0,
        avgLoss: 0,
        currentDrawdown: 0,
        netPnl: 0,
        pnlPercent: 0,
      };
    }
    
    const wins = closedTrades.filter(t => t.pnl && t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl && t.pnl < 0);
    const winRate = wins.length / closedTrades.length;
    
    const totalWins = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 2 : 0;
    
    const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
    
    const netPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const initialBalance = this.config.initialBalance;
    const pnlPercent = (netPnl / initialBalance) * 100;
    
    const peakBalance = initialBalance + Math.max(0, ...closedTrades.map((t, i) => {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += closedTrades[j].pnl || 0;
      return sum;
    }));
    const currentBalance = initialBalance + netPnl;
    const drawdown = peakBalance > 0 ? ((peakBalance - currentBalance) / peakBalance) * 100 : 0;
    
    return {
      totalTrades: closedTrades.length,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      currentDrawdown: drawdown,
      netPnl,
      pnlPercent,
    };
  }
}
