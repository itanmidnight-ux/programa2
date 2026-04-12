// ============================================
// RECO-TRADING - Signal Analysis Engine
// ============================================
// Technical analysis and signal generation
// Uses real Broker kline data to compute:
// - Trend (EMA crossover)
// - Momentum (RSI)
// - Volume analysis
// - Volatility (ATR)
// - Structure (support/resistance)
// - Signal generation with confidence scoring
// ============================================

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---- Indicators ----

function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  result[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }
  return result;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  const gains = changes.filter((c) => c > 0);
  const losses = changes.filter((c) => c < 0).map((c) => Math.abs(c));
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / period : 0;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / period;
}

function adx(candles: Candle[], period = 14): number {
  if (candles.length < period * 2) return 0;
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const upMove = c.high - prev.high;
    const downMove = prev.low - c.low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    trs.push(tr);
  }

  const smooth = (arr: number[]) => {
    const sum = arr.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  };

  const atrVal = smooth(trs);
  const plusDI = atrVal ? (smooth(plusDMs) / atrVal) * 100 : 0;
  const minusDI = atrVal ? (smooth(minusDMs) / atrVal) * 100 : 0;
  const diSum = plusDI + minusDI;
  const dx = diSum ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

  // Simplified ADX (would normally smooth over multiple periods)
  return dx;
}

function findSupportResistance(candles: Candle[]): { support: number; resistance: number } {
  const recent = candles.slice(-50);
  const lows = recent.map((c) => c.low).sort((a, b) => a - b);
  const highs = recent.map((c) => c.high).sort((a, b) => b - a);
  const support = lows.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const resistance = highs.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  return { support, resistance };
}

// ---- Signal Generation ----

export interface SignalAnalysis {
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  momentum: "BULLISH" | "BEARISH" | "NEUTRAL";
  volume: "HIGH" | "NORMAL" | "LOW";
  volatility: "RISING" | "NORMAL" | "FALLING";
  structure: "BULLISH" | "BEARISH" | "NEUTRAL";
  orderFlow: "BULLISH" | "BEARISH" | "NEUTRAL";
  rsi: number;
  adx: number;
  atr: number;
  spread: number;
  volumeRatio: number;
  timeframeAnalysis: {
    "5m": string;
    "15m": string;
    "1h": string;
  };
  confluenceScore: number;
  marketRegime: string;
}

export function analyzeSignals(
  candles5m: Candle[],
  candles15m?: Candle[],
  candles1h?: Candle[],
  currentSpread = 0
): SignalAnalysis {
  const closes = candles5m.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  // EMA analysis
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema20Last = ema20[ema20.length - 1];
  const ema50Last = ema50[ema50.length - 1];
  const priceAboveEma20 = currentPrice > ema20Last;
  const ema20AboveEma50 = ema20Last > ema50Last;

  let trend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (priceAboveEma20 && ema20AboveEma50) trend = "BULLISH";
  else if (!priceAboveEma20 && !ema20AboveEma50) trend = "BEARISH";

  // RSI
  const rsiValue = rsi(closes);
  let momentum: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (rsiValue > 55) momentum = "BULLISH";
  else if (rsiValue < 45) momentum = "BEARISH";

  // Volume
  const recentVolumes = candles5m.slice(-20).map((c) => c.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const currentVolume = recentVolumes[recentVolumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  let volume: "HIGH" | "NORMAL" | "LOW" = "NORMAL";
  if (volumeRatio > 1.5) volume = "HIGH";
  else if (volumeRatio < 0.6) volume = "LOW";

  // ATR & Volatility
  const atrValue = atr(candles5m);
  const atrPercent = (atrValue / currentPrice) * 100;
  let volatility: "RISING" | "NORMAL" | "FALLING" = "NORMAL";
  if (atrPercent > 2) volatility = "RISING";
  else if (atrPercent < 0.5) volatility = "FALLING";

  // Structure
  const { support, resistance } = findSupportResistance(candles5m);
  const distToSupport = ((currentPrice - support) / currentPrice) * 100;
  const distToResistance = ((resistance - currentPrice) / currentPrice) * 100;
  let structure: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (distToSupport < distToResistance * 0.5) structure = "BEARISH";
  else if (distToResistance < distToSupport * 0.5) structure = "BULLISH";

  // Order flow (simplified from volume + price action)
  let orderFlow: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  const lastCandles = candles5m.slice(-5);
  const bullishCandles = lastCandles.filter((c) => c.close > c.open).length;
  if (bullishCandles >= 4) orderFlow = "BULLISH";
  else if (bullishCandles <= 1) orderFlow = "BEARISH";

  // ADX
  const adxValue = adx(candles5m);

  // Multi-timeframe analysis
  let tf5m: string = trend;
  if (candles15m && candles15m.length > 50) {
    const c15 = candles15m.map((c) => c.close);
    const e20_15 = ema(c15, 20);
    const e50_15 = ema(c15, 50);
    tf5m = c15[c15.length - 1] > e20_15[e20_15.length - 1] ? "BULLISH" : "BEARISH";
  }
  let tf15m = "NEUTRAL";
  if (candles15m && candles15m.length > 50) {
    const c15 = candles15m.map((c) => c.close);
    const e20 = ema(c15, 20);
    const e50 = ema(c15, 50);
    tf15m = c15[c15.length - 1] > e20[e20.length - 1] && e20[e20.length - 1] > e50[e50.length - 1]
      ? "BULLISH"
      : c15[c15.length - 1] < e20[e20.length - 1] ? "BEARISH" : "NEUTRAL";
  }
  let tf1h = "NEUTRAL";
  if (candles1h && candles1h.length > 50) {
    const c1h = candles1h.map((c) => c.close);
    const e20 = ema(c1h, 20);
    const e50 = ema(c1h, 50);
    tf1h = c1h[c1h.length - 1] > e20[e20.length - 1] ? "BULLISH" : "BEARISH";
  }

  // Confluence score
  const signals = [trend, momentum, structure, orderFlow];
  const bullish = signals.filter((s) => s === "BULLISH").length;
  const bearish = signals.filter((s) => s === "BEARISH").length;
  const confluenceScore = Math.abs(bullish - bearish) / signals.length;

  // Market regime
  let marketRegime = "RANGING";
  if (adxValue > 25 && confluenceScore > 0.5) marketRegime = "TRENDING";
  else if (atrPercent > 2) marketRegime = "VOLATILE";

  // Final signal with confidence
  let bullishScore = 0;
  let bearishScore = 0;

  if (trend === "BULLISH") bullishScore += 2; else if (trend === "BEARISH") bearishScore += 2;
  if (momentum === "BULLISH") bullishScore += 1.5; else if (momentum === "BEARISH") bearishScore += 1.5;
  if (structure === "BULLISH") bullishScore += 1; else if (structure === "BEARISH") bearishScore += 1;
  if (orderFlow === "BULLISH") bullishScore += 1; else if (orderFlow === "BEARISH") bearishScore += 1;
  if (rsiValue < 35) bullishScore += 1; else if (rsiValue > 65) bearishScore += 1;
  if (volume === "HIGH") bullishScore += 0.5; else if (volume === "LOW") bearishScore -= 0.5;

  let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
  const totalScore = Math.abs(bullishScore - bearishScore);

  if (totalScore >= 2.5) {
    signal = bullishScore > bearishScore ? "BUY" : "SELL";
  } else if (totalScore >= 1.5) {
    signal = bullishScore > bearishScore ? "BUY" : "SELL";
  }

  const confidence = Math.min(0.95, Math.max(0.3, 0.4 + totalScore * 0.08));
  const minConf = parseFloat(process.env.MIN_CONFIDENCE || "0.35");
  if (confidence < minConf) {
    signal = "HOLD";
  }

  return {
    signal,
    confidence: +confidence.toFixed(2),
    trend,
    momentum,
    volume,
    volatility,
    structure,
    orderFlow,
    rsi: +rsiValue.toFixed(1),
    adx: +adxValue.toFixed(1),
    atr: +atrValue.toFixed(2),
    spread: currentSpread,
    volumeRatio: +volumeRatio.toFixed(2),
    timeframeAnalysis: {
      "5m": tf5m,
      "15m": tf15m,
      "1h": tf1h,
    },
    confluenceScore: +confluenceScore.toFixed(2),
    marketRegime,
  };
}

