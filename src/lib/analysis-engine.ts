// ============================================
// RECO-TRADING - Advanced Technical Analysis Engine
// ============================================
// Comprehensive market analysis with 30+ indicators,
// multi-timeframe confluence, pattern recognition,
// and regime classification.
// ============================================

// ---- Core Types ----

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookData {
  bid: number;
  ask: number;
  spread: number;
  bidVolume: number;
  askVolume: number;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}

export interface FullAnalysis {
  price: number;
  change1h: number;
  change24h: number;

  trend: 'STRONG_UP' | 'UP' | 'NEUTRAL' | 'DOWN' | 'STRONG_DOWN';
  trendStrength: number;
  adx: number;
  adxTrend: 'TRENDING' | 'RANGING';
  supertrend: { direction: 'UP' | 'DOWN'; value: number };

  rsi: number;
  rsiZone: 'OVERBOUGHT' | 'HIGH' | 'NEUTRAL' | 'LOW' | 'OVERSOLD';
  macd: { macd: number; signal: number; histogram: number; crossover: 'BULLISH' | 'BEARISH' | null };
  stochastic: { k: number; d: number; zone: 'OVERBOUGHT' | 'NEUTRAL' | 'OVERSOLD' };
  cci: number;
  roc: number;

  atr: number;
  atrPct: number;
  bollingerBands: { upper: number; middle: number; lower: number; percentB: number; bandwidth: number; squeeze: boolean };
  keltnerChannels: { upper: number; middle: number; lower: number };

  obv: number;
  obvTrend: 'RISING' | 'FALLING' | 'FLAT';
  vwap: number;
  mfi: number;
  mfiZone: 'OVERBOUGHT' | 'NEUTRAL' | 'OVERSOLD';
  volumeRatio: number;
  volumeTrend: 'INCREASING' | 'DECREASING' | 'NORMAL';

  support: number;
  resistance: number;
  pivotPoints: { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };
  higherHighs: boolean;
  lowerLows: boolean;

  patterns: string[];

  orderFlow: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  buyPressure: number;
  sellPressure: number;

  timeframes: {
    '5m': { trend: string; rsi: number; macd: { macd: number; signal: number }; volume: string };
    '15m': { trend: string; rsi: number; macd: { macd: number; signal: number }; volume: string };
    '1h': { trend: string; rsi: number; macd: { macd: number; signal: number }; volume: string };
    '4h': { trend: string; rsi: number; macd: { macd: number; signal: number }; volume: string };
  };

  confluenceScore: number;
  marketRegime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'BREAKOUT' | 'REVERSAL';

  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;

  suggestedSL: number;
  suggestedTP: number;
  riskRewardRatio: number;
}

// ============================================
// INDICATORS - Moving Averages
// ============================================

/** Simple Moving Average */
function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

/** Exponential Moving Average */
function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prev = data[0];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0]);
      continue;
    }
    prev = data[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

/** Weighted Moving Average */
function wma(data: number[], period: number): number[] {
  const result: number[] = [];
  const weightSum = (period * (period + 1)) / 2;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j] * (period - j);
    }
    result.push(sum / weightSum);
  }
  return result;
}

/** Double Exponential Moving Average */
function dema(data: number[], period: number): number[] {
  const e1 = ema(data, period);
  const e2 = ema(e1, period);
  return e1.map((v, i) => 2 * v - e2[i]);
}

/** Triple Exponential Moving Average */
function tema(data: number[], period: number): number[] {
  const e1 = ema(data, period);
  const e2 = ema(e1, period);
  const e3 = ema(e2, period);
  return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
}

/** Hull Moving Average */
function hullMA(data: number[], period: number): number[] {
  const halfPeriod = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(period)));
  const wma1 = wma(data, halfPeriod);
  const wma2 = wma(data, period);
  const diff: number[] = wma1.map((v, i) => (2 * v - (wma2[i] || 0)));
  return wma(diff, sqrtPeriod);
}

/** Volume Weighted Moving Average */
function vwma(candles: Candle[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sumPV = 0, sumV = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumPV += candles[j].close * candles[j].volume;
      sumV += candles[j].volume;
    }
    result.push(sumV > 0 ? sumPV / sumV : candles[i].close);
  }
  return result;
}

// ============================================
// INDICATORS - Oscillators
// ============================================

/** RSI using Wilder's smoothing */
function calcRSI(closes: number[], period = 14): number[] {
  const result: number[] = [];
  if (closes.length < period + 1) {
    for (let i = 0; i < closes.length; i++) result.push(50);
    return result;
  }

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i < period; i++) result.push(50);

  for (let i = period; i < closes.length; i++) {
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

/** Stochastic Oscillator */
function calcStochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { k: number[]; d: number[] } {
  const kValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { kValues.push(50); continue; }
    let highestHigh = -Infinity, lowestLow = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      highestHigh = Math.max(highestHigh, candles[j].high);
      lowestLow = Math.min(lowestLow, candles[j].low);
    }
    const range = highestHigh - lowestLow;
    kValues.push(range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100);
  }
  const dValues = sma(kValues, dPeriod).map(v => isNaN(v) ? 50 : v);
  return { k: kValues, d: dValues };
}

/** Stochastic RSI */
function calcStochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): { k: number[]; d: number[] } {
  const rsiValues = calcRSI(closes, rsiPeriod);
  const kRaw: number[] = [];
  for (let i = 0; i < rsiValues.length; i++) {
    if (i < stochPeriod - 1) { kRaw.push(50); continue; }
    let min = Infinity, max = -Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      min = Math.min(min, rsiValues[j]);
      max = Math.max(max, rsiValues[j]);
    }
    const range = max - min;
    kRaw.push(range === 0 ? 50 : ((rsiValues[i] - min) / range) * 100);
  }
  const kValues = sma(kRaw, kSmooth).map(v => isNaN(v) ? 50 : v);
  const dValues = sma(kRaw, kSmooth + dSmooth).map(v => isNaN(v) ? 50 : v);
  return { k: kValues, d: dValues };
}

/** Commodity Channel Index */
function calcCCI(candles: Candle[], period = 20): number[] {
  const tps: number[] = candles.map(c => (c.high + c.low + c.close) / 3);
  const smaTps = sma(tps, period);
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(0); continue; }
    let meanDev = 0;
    for (let j = i - period + 1; j <= i; j++) {
      meanDev += Math.abs(tps[j] - smaTps[i]);
    }
    meanDev /= period;
    result.push(meanDev === 0 ? 0 : (tps[i] - smaTps[i]) / (0.015 * meanDev));
  }
  return result;
}

/** Williams %R */
function calcWilliamsR(candles: Candle[], period = 14): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(-50); continue; }
    let highestHigh = -Infinity, lowestLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      highestHigh = Math.max(highestHigh, candles[j].high);
      lowestLow = Math.min(lowestLow, candles[j].low);
    }
    const range = highestHigh - lowestLow;
    result.push(range === 0 ? -50 : ((highestHigh - candles[i].close) / range) * -100);
  }
  return result;
}

/** MACD with signal and histogram */
function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

/** Rate of Change */
function calcROC(closes: number[], period = 12): number[] {
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { result.push(0); continue; }
    const prev = closes[i - period];
    result.push(prev === 0 ? 0 : ((closes[i] - prev) / prev) * 100);
  }
  return result;
}

// ============================================
// INDICATORS - Volatility
// ============================================

/** Average True Range */
function calcATR(candles: Candle[], period = 14): number[] {
  const result: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    if (i < period) {
      result.push(tr);
      continue;
    }
    // Wilder's smoothing
    result.push((result[i - 1] * (period - 1) + tr) / period);
  }
  return result;
}

/** Bollinger Bands with %B and bandwidth */
function calcBollingerBands(closes: number[], period = 20, stdDevMult = 2): {
  upper: number[]; middle: number[]; lower: number[];
  percentB: number[]; bandwidth: number[];
} {
  const middle = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const percentB: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1 || isNaN(middle[i])) {
      upper.push(closes[i]); lower.push(closes[i]); percentB.push(0.5); bandwidth.push(0);
      continue;
    }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += Math.pow(closes[j] - middle[i], 2);
    }
    const stdDev = Math.sqrt(sumSq / period);
    const u = middle[i] + stdDevMult * stdDev;
    const l = middle[i] - stdDevMult * stdDev;
    upper.push(u);
    lower.push(l);
    const range = u - l;
    percentB.push(range === 0 ? 0.5 : (closes[i] - l) / range);
    bandwidth.push(middle[i] === 0 ? 0 : (range / middle[i]) * 100);
  }
  return { upper, middle, lower, percentB, bandwidth };
}

/** Keltner Channels */
function calcKeltnerChannels(candles: Candle[], emaPeriod = 20, atrPeriod = 10, mult = 1.5): {
  upper: number[]; middle: number[]; lower: number[];
} {
  const closes = candles.map(c => c.close);
  const middle = ema(closes, emaPeriod);
  const atrs = calcATR(candles, atrPeriod);
  return {
    upper: middle.map((v, i) => v + mult * atrs[i]),
    middle,
    lower: middle.map((v, i) => v - mult * atrs[i]),
  };
}

/** Donchian Channels */
function calcDonchianChannels(candles: Candle[], period = 20): {
  upper: number[]; middle: number[]; lower: number[];
} {
  const upper: number[] = [];
  const lower: number[] = [];
  const middle: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      upper.push(candles[i].high);
      lower.push(candles[i].low);
      middle.push((candles[i].high + candles[i].low) / 2);
      continue;
    }
    let hi = -Infinity, lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    upper.push(hi);
    lower.push(lo);
    middle.push((hi + lo) / 2);
  }
  return { upper, middle, lower };
}

/** Standard Deviation */
function calcStdDev(data: number[], period: number): number[] {
  const smaVals = sma(data, period);
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1 || isNaN(smaVals[i])) { result.push(0); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += Math.pow(data[j] - smaVals[i], 2);
    }
    result.push(Math.sqrt(sumSq / period));
  }
  return result;
}

// ============================================
// INDICATORS - Trend
// ============================================

/** ADX with +DI/-DI */
function calcADX(candles: Candle[], period = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  if (candles.length < period * 2) {
    const empty = () => new Array(candles.length).fill(0);
    return { adx: empty(), plusDI: empty(), minusDI: empty() };
  }

  const plusDMs: number[] = [0];
  const minusDMs: number[] = [0];
  const trs: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }

  // Wilder's smoothing
  const smoothTR: number[] = [trs.slice(1, period + 1).reduce((a, b) => a + b, 0)];
  const smoothPDM: number[] = [plusDMs.slice(1, period + 1).reduce((a, b) => a + b, 0)];
  const smoothMDM: number[] = [minusDMs.slice(1, period + 1).reduce((a, b) => a + b, 0)];

  for (let i = period; i < trs.length; i++) {
    smoothTR.push(smoothTR[i - period] - smoothTR[i - period] / period + trs[i]);
    smoothPDM.push(smoothPDM[i - period] - smoothPDM[i - period] / period + plusDMs[i]);
    smoothMDM.push(smoothMDM[i - period] - smoothMDM[i - period] / period + minusDMs[i]);
  }

  const plusDI: number[] = smoothTR.map((tr, i) => tr === 0 ? 0 : (smoothPDM[i] / tr) * 100);
  const minusDI: number[] = smoothTR.map((tr, i) => tr === 0 ? 0 : (smoothMDM[i] / tr) * 100);
  const dx: number[] = plusDI.map((pdi, i) => {
    const diSum = pdi + minusDI[i];
    return diSum === 0 ? 0 : (Math.abs(pdi - minusDI[i]) / diSum) * 100;
  });

  const adx: number[] = [];
  // First ADX is average of first 'period' DX values
  if (dx.length >= period) {
    adx.push(dx.slice(0, period).reduce((a, b) => a + b, 0) / period);
    for (let i = period; i < dx.length; i++) {
      adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
    }
    // Pad with leading zeros
    while (adx.length < candles.length) adx.unshift(0);
  } else {
    while (adx.length < candles.length) adx.push(0);
  }

  return { adx, plusDI, minusDI };
}

/** SuperTrend */
function calcSuperTrend(candles: Candle[], period = 10, multiplier = 3): { direction: ('UP' | 'DOWN')[]; value: number[] } {
  const atrs = calcATR(candles, period);
  const upperBands: number[] = [];
  const lowerBands: number[] = [];
  const direction: ('UP' | 'DOWN')[] = [];
  const value: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const mid = (candles[i].high + candles[i].low) / 2;
    upperBands.push(mid + multiplier * atrs[i]);
    lowerBands.push(mid - multiplier * atrs[i]);
  }

  let prevUpper = upperBands[0];
  let prevLower = lowerBands[0];
  let prevDir: 'UP' | 'DOWN' = 'DOWN';

  for (let i = 0; i < candles.length; i++) {
    let upper = upperBands[i];
    let lower = lowerBands[i];

    // Adjust bands - SuperTrend uses ATR-based bands
    if (i > 0) {
      // SuperTrend lower band: uses lowest of (previous lower, current low - multiplier * ATR)
      const newLower = candles[i].low - multiplier * atrs[i];
      lower = Math.max(prevLower, newLower);
      
      // SuperTrend upper band: uses highest of (previous upper, current high + multiplier * ATR)
      const newUpper = candles[i].high + multiplier * atrs[i];
      upper = Math.min(prevUpper, newUpper);
    }

    let dir: 'UP' | 'DOWN';
    if (prevDir === 'UP') {
      dir = candles[i].close < lower ? 'DOWN' : 'UP';
    } else {
      dir = candles[i].close > upper ? 'UP' : 'DOWN';
    }

    direction.push(dir);
    value.push(dir === 'UP' ? lower : upper);
    prevUpper = upper;
    prevLower = lower;
    prevDir = dir;
  }

  return { direction, value };
}

/** Parabolic SAR */
function calcParabolicSAR(candles: Candle[], step = 0.02, maxStep = 0.2): number[] {
  const result: number[] = [];
  if (candles.length < 2) {
    for (let i = 0; i < candles.length; i++) result.push(candles[i]?.close || 0);
    return result;
  }

  let isUpTrend = candles[1].close > candles[0].close;
  let af = step;
  let ep = isUpTrend ? candles[0].high : candles[0].low;
  let sar = isUpTrend ? candles[0].low : candles[0].high;

  result.push(isUpTrend ? candles[0].low : candles[0].high);

  for (let i = 1; i < candles.length; i++) {
    const prevSAR = sar;

    // Calculate SAR for current candle
    sar = prevSAR + af * (ep - prevSAR);

    // Check for reversal
    if (isUpTrend) {
      if (candles[i].low < sar) {
        // Reversal to downtrend
        isUpTrend = false;
        sar = Math.max(ep, candles[i - 1].high, candles[i].high);
        ep = candles[i].low;
        af = step;
      } else {
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      if (candles[i].high > sar) {
        // Reversal to uptrend
        isUpTrend = true;
        sar = Math.min(ep, candles[i - 1].low, candles[i].low);
        ep = candles[i].high;
        af = step;
      } else {
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(af + step, maxStep);
        }
      }
    }

    result.push(sar);
  }
  return result;
}

/** Ichimoku Cloud (simplified) */
function calcIchimoku(candles: Candle[], tenkanPeriod = 9, kijunPeriod = 26, senkou = 52): {
  tenkan: number[]; kijun: number[]; senkouA: number[]; senkouB: number[]; chikou: number[];
} {
  const highLow = (start: number, period: number) => {
    let hi = -Infinity, lo = Infinity;
    const end = Math.min(start + period, candles.length);
    for (let j = start; j < end; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    return (hi + lo) / 2;
  };

  const tenkanLine: number[] = [];
  const kijunLine: number[] = [];
  const senkouA: number[] = [];
  const senkouB: number[] = [];
  const chikou: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    tenkanLine.push(i < tenkanPeriod - 1 ? candles[i].close : highLow(i - tenkanPeriod + 1, tenkanPeriod));
    kijunLine.push(i < kijunPeriod - 1 ? candles[i].close : highLow(i - kijunPeriod + 1, kijunPeriod));
    senkouA.push((tenkanLine[i] + kijunLine[i]) / 2);
    senkouB.push(i < senkou - 1 ? candles[i].close : highLow(i - senkou + 1, senkou));
    chikou.push(i >= senkou ? candles[i - senkou].close : candles[i].close);
  }

  return { tenkan: tenkanLine, kijun: kijunLine, senkouA, senkouB, chikou };
}

/** Aroon Indicator */
function calcAroon(candles: Candle[], period = 25): { up: number[]; down: number[]; oscillator: number[] } {
  const up: number[] = [];
  const down: number[] = [];
  const oscillator: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      up.push(50); down.push(50); oscillator.push(0);
      continue;
    }
    let highIdx = i, lowIdx = i;
    for (let j = i - period; j <= i; j++) {
      if (candles[j].high > candles[highIdx].high) highIdx = j;
      if (candles[j].low < candles[lowIdx].low) lowIdx = j;
    }
    const aUp = ((period - (i - highIdx)) / period) * 100;
    const aDown = ((period - (i - lowIdx)) / period) * 100;
    up.push(aUp);
    down.push(aDown);
    oscillator.push(aUp - aDown);
  }

  return { up, down, oscillator };
}

// ============================================
// INDICATORS - Volume
// ============================================

/** On Balance Volume */
function calcOBV(candles: Candle[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      result.push(result[i - 1] + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      result.push(result[i - 1] - candles[i].volume);
    } else {
      result.push(result[i - 1]);
    }
  }
  return result;
}

/** VWAP */
function calcVWAP(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumTPV = 0, cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumTPV += tp * candles[i].volume;
    cumV += candles[i].volume;
    result.push(cumV > 0 ? cumTPV / cumV : candles[i].close);
  }
  return result;
}

/** Volume Profile (simplified - returns key levels) */
function calcVolumeProfile(candles: Candle[], bins = 10): { poc: number; vah: number; val: number; profile: Array<{ price: number; volume: number }> } {
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const range = maxPrice - minPrice;
  if (range === 0) return { poc: candles[candles.length - 1].close, vah: maxPrice, val: minPrice, profile: [] };

  const binSize = range / bins;
  const profile: Array<{ price: number; volume: number }> = [];

  for (let b = 0; b < bins; b++) {
    const low = minPrice + b * binSize;
    const high = low + binSize;
    let vol = 0;
    for (const c of candles) {
      const overlap = Math.min(c.high, high) - Math.max(c.low, low);
      if (overlap > 0) {
        vol += (overlap / (c.high - c.low || 1)) * c.volume;
      }
    }
    profile.push({ price: (low + high) / 2, volume: vol });
  }

  // POC = Point of Control (highest volume bin)
  const pocBin = profile.reduce((max, p) => p.volume > max.volume ? p : max, profile[0]);
  // VAH = Value Area High (top of value area containing 70% of volume)
  // VAL = Value Area Low
  const sortedProfile = [...profile].sort((a, b) => b.volume - a.volume);
  const totalVol = profile.reduce((s, p) => s + p.volume, 0);
  let accumVol = 0;
  let vah = pocBin.price, val = pocBin.price;
  for (const p of sortedProfile) {
    accumVol += p.volume;
    vah = Math.max(vah, p.price + binSize / 2);
    val = Math.min(val, p.price - binSize / 2);
    if (accumVol / totalVol >= 0.7) break;
  }

  return { poc: pocBin.price, vah, val, profile };
}

/** Money Flow Index */
function calcMFI(candles: Candle[], period = 14): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { result.push(50); continue; }

    let posMF = 0, negMF = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      const mf = tp * candles[j].volume;
      if (j > 0) {
        const prevTP = (candles[j - 1].high + candles[j - 1].low + candles[j - 1].close) / 3;
        if (tp > prevTP) posMF += mf;
        else negMF += mf;
      }
    }
    const mfr = negMF === 0 ? 100 : posMF / negMF;
    result.push(100 - 100 / (1 + mfr));
  }
  return result;
}

/** Accumulation/Distribution Line */
function calcADLine(candles: Candle[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const range = candles[i].high - candles[i].low;
    if (range === 0) {
      result.push(result[i - 1]);
      continue;
    }
    const mfm = ((candles[i].close - candles[i].low) - (candles[i].high - candles[i].close)) / range;
    result.push(result[i - 1] + mfm * candles[i].volume);
  }
  return result;
}

// ============================================
// INDICATORS - Momentum
// ============================================

/** TRIX - Triple Exponential Smoothed Rate of Change */
function calcTRIX(closes: number[], period = 15): number[] {
  const e1 = ema(closes, period);
  const e2 = ema(e1, period);
  const e3 = ema(e2, period);
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < 1 || e3[i - 1] === 0) { result.push(0); continue; }
    result.push(((e3[i] - e3[i - 1]) / e3[i - 1]) * 10000);
  }
  return result;
}

/** Ultimate Oscillator */
function calcUltimateOscillator(candles: Candle[], p1 = 7, p2 = 14, p3 = 28): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < p3) { result.push(50); continue; }

    const calcBP = (period: number): { bp: number; tr: number } => {
      let bp = 0, tr = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const cLow = Math.min(candles[j].close, candles[j - 1]?.close ?? candles[j].close);
        const trueLow = Math.min(candles[j].low, candles[j - 1]?.close ?? candles[j].low);
        const trueHigh = Math.max(candles[j].high, candles[j - 1]?.close ?? candles[j].high);
        bp += candles[j].close - trueLow;
        tr += trueHigh - trueLow;
      }
      return { bp, tr };
    };

    const r1 = calcBP(p1);
    const r2 = calcBP(p2);
    const r3 = calcBP(p3);

    const avg1 = r1.tr === 0 ? 0 : r1.bp / r1.tr;
    const avg2 = r2.tr === 0 ? 0 : r2.bp / r2.tr;
    const avg3 = r3.tr === 0 ? 0 : r3.bp / r3.tr;

    result.push(((4 * avg1 + 2 * avg2 + avg3) / 7) * 100);
  }
  return result;
}

// ============================================
// PATTERN RECOGNITION
// ============================================

/** Detect candlestick patterns in recent candles */
function detectPatterns(candles: Candle[]): string[] {
  const patterns: string[] = [];
  const n = candles.length;
  if (n < 5) return patterns;

  const c = candles[n - 1];
  const c1 = candles[n - 2];
  const c2 = candles[n - 3];
  const body = Math.abs(c.close - c.open);
  const body1 = Math.abs(c1.close - c1.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const range = c.high - c.low;
  const range1 = c1.high - c1.low;

  // Doji - body less than 10% of range
  if (range > 0 && body / range < 0.1) {
    patterns.push('DOJI');
  }

  // Hammer - small body at top, long lower shadow
  if (range > 0 && lowerWick > body * 2 && upperWick < body * 0.5 && body / range < 0.4) {
    patterns.push(c.close > c.open ? 'HAMMER' : 'INVERTED_HAMMER');
  }

  // Shooting Star - small body at bottom, long upper shadow
  if (range > 0 && upperWick > body * 2 && lowerWick < body * 0.5 && body / range < 0.4) {
    patterns.push('SHOOTING_STAR');
  }

  // Pin Bar
  if (range > 0) {
    const totalWick = upperWick + lowerWick;
    if (totalWick > 0 && body / totalWick < 0.3 && (upperWick / totalWick > 0.7 || lowerWick / totalWick > 0.7)) {
      patterns.push('PIN_BAR');
    }
  }

  // Engulfing patterns
  if (n >= 3) {
    const bullish = c1.close < c1.open && c.close > c.open && c.close > c1.open && c.open < c1.close;
    const bearish = c1.close > c1.open && c.close < c.open && c.close < c1.open && c.open > c1.close;
    if (bullish) patterns.push('BULLISH_ENGULFING');
    if (bearish) patterns.push('BEARISH_ENGULFING');
  }

  // Harami
  if (n >= 3) {
    const bullishHarami = c1.close > c1.open && c.close < c.open && c.open < c1.close && c.close > c1.open;
    const bearishHarami = c1.close < c1.open && c.close > c.open && c.open > c1.close && c.close < c1.open;
    if (bullishHarami) patterns.push('BULLISH_HARAMI');
    if (bearishHarami) patterns.push('BEARISH_HARAMI');
  }

  // Morning Star / Evening Star (3 candle pattern)
  if (n >= 4) {
    const c3 = candles[n - 3];
    const body2 = Math.abs(c2.close - c2.open);
    const body3 = Math.abs(c3.close - c3.open);

    // Morning Star: big bearish -> small body -> big bullish
    if (c3.close < c3.open && body3 > body2 * 2 && body > body2 * 2 &&
        c2.close < c3.close && c.close > (c3.open + c3.close) / 2) {
      patterns.push('MORNING_STAR');
    }
    // Evening Star: big bullish -> small body -> big bearish
    if (c3.close > c3.open && body3 > body2 * 2 && body > body2 * 2 &&
        c2.close > c3.close && c.close < (c3.open + c3.close) / 2) {
      patterns.push('EVENING_STAR');
    }
  }

  // Three White Soldiers / Three Black Crows
  if (n >= 4) {
    const c3 = candles[n - 3];
    const isWhite1 = c3.close > c3.open;
    const isWhite2 = c1.close > c1.open;
    const isWhite3 = c.close > c.open;
    if (isWhite1 && isWhite2 && isWhite3 && c.close > c1.close && c1.close > c3.close) {
      patterns.push('THREE_WHITE_SOLDIERS');
    }
    const isBlack1 = c3.close < c3.open;
    const isBlack2 = c1.close < c1.open;
    const isBlack3 = c.close < c.open;
    if (isBlack1 && isBlack2 && isBlack3 && c.close < c1.close && c1.close < c3.close) {
      patterns.push('THREE_BLACK_CROWS');
    }
  }

  return patterns;
}

// ============================================
// SUPPORT / RESISTANCE & STRUCTURE
// ============================================

/** Find support and resistance levels using pivot points and clustering */
function findSupportResistance(candles: Candle[]): { support: number; resistance: number; pivotPoints: FullAnalysis['pivotPoints'] } {
  const recent = candles.slice(-50);
  if (recent.length < 2) {
    const price = candles[candles.length - 1]?.close || 0;
    return {
      support: price * 0.99, resistance: price * 1.01,
      pivotPoints: { pp: price, r1: price * 1.005, r2: price * 0.01, r3: price * 0.015, s1: price * 0.995, s2: price * 0.99, s3: price * 0.985 }
    };
  }

  // Classic Pivot Points from the previous period
  const prev = recent[recent.length - 2];
  const pp = (prev.high + prev.low + prev.close) / 3;
  const r1 = 2 * pp - prev.low;
  const s1 = 2 * pp - prev.high;
  const r2 = pp + (prev.high - prev.low);
  const s2 = pp - (prev.high - prev.low);
  const r3 = r1 + (prev.high - prev.low);
  const s3 = s1 - (prev.high - prev.low);

  // Local highs/lows clustering for additional S/R
  const lows = recent.map(c => c.low).sort((a, b) => a - b);
  const highs = recent.map(c => c.high).sort((a, b) => b - a);
  const support = lows.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const resistance = highs.slice(0, 5).reduce((a, b) => a + b, 0) / 5;

  return {
    support: Math.min(support, s1),
    resistance: Math.max(resistance, r1),
    pivotPoints: { pp, r1, r2, r3, s1, s2, s3 }
  };
}

/** Check for higher highs / lower lows */
function checkStructure(candles: Candle[]): { higherHighs: boolean; lowerLows: boolean } {
  const recent = candles.slice(-20);
  if (recent.length < 10) return { higherHighs: false, lowerLows: false };

  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));

  const firstHigh = Math.max(...firstHalf.map(c => c.high));
  const secondHigh = Math.max(...secondHalf.map(c => c.high));
  const firstLow = Math.min(...firstHalf.map(c => c.low));
  const secondLow = Math.min(...secondHalf.map(c => c.low));

  return {
    higherHighs: secondHigh > firstHigh,
    lowerLows: secondLow < firstLow,
  };
}

// ============================================
// ORDER FLOW ANALYSIS
// ============================================

function analyzeOrderFlow(candles: Candle[], orderBook?: OrderBookData): { orderFlow: FullAnalysis['orderFlow']; buyPressure: number; sellPressure: number } {
  const recent = candles.slice(-10);
  let buyVol = 0, sellVol = 0;

  for (const c of recent) {
    if (c.close > c.open) buyVol += c.volume;
    else sellVol += c.volume;
  }

  let bookPressure = 0.5;
  if (orderBook) {
    const totalBidVol = orderBook.bids.reduce((s, [, v]) => s + v, 0);
    const totalAskVol = orderBook.asks.reduce((s, [, v]) => s + v, 0);
    const total = totalBidVol + totalAskVol;
    bookPressure = total > 0 ? totalBidVol / total : 0.5;
  }

  const totalVol = buyVol + sellVol;
  const candlePressure = totalVol > 0 ? buyVol / totalVol : 0.5;
  const combined = candlePressure * 0.6 + bookPressure * 0.4;

  const buyPressure = Math.round(combined * 100);
  const sellPressure = 100 - buyPressure;

  let orderFlow: FullAnalysis['orderFlow'] = 'NEUTRAL';
  if (combined > 0.7) orderFlow = 'STRONG_BUY';
  else if (combined > 0.55) orderFlow = 'BUY';
  else if (combined < 0.3) orderFlow = 'STRONG_SELL';
  else if (combined < 0.45) orderFlow = 'SELL';

  return { orderFlow, buyPressure, sellPressure };
}

// ============================================
// MULTI-TIMEFRAME ANALYSIS
// ============================================

interface TimeframeData {
  trend: string;
  rsi: number;
  macd: { macd: number; signal: number };
  volume: string;
}

function analyzeTimeframe(candles: Candle[]): TimeframeData {
  if (candles.length < 30) {
    return { trend: 'NEUTRAL', rsi: 50, macd: { macd: 0, signal: 0 }, volume: 'NORMAL' };
  }

  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];

  // EMA trend
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, Math.min(50, Math.floor(closes.length * 0.6)));
  const priceAboveEma20 = currentPrice > ema20[ema20.length - 1];
  const emaAbove = ema20[ema20.length - 1] > ema50[ema50.length - 1];

  let trend = 'NEUTRAL';
  if (priceAboveEma20 && emaAbove) trend = 'BULLISH';
  else if (!priceAboveEma20 && !emaAbove) trend = 'BEARISH';

  // RSI
  const rsiValues = calcRSI(closes);
  const rsiVal = rsiValues[rsiValues.length - 1] || 50;

  // MACD
  const macdData = calcMACD(closes);

  // Volume
  const volumes = candles.slice(-20).map(c => c.volume);
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const currentVol = volumes[volumes.length - 1];
  const volRatio = currentVol / avgVol;

  let volume = 'NORMAL';
  if (volRatio > 1.5) volume = 'HIGH';
  else if (volRatio < 0.6) volume = 'LOW';

  return {
    trend,
    rsi: +rsiVal.toFixed(1),
    macd: {
      macd: +(macdData.macd[macdData.macd.length - 1] || 0).toFixed(4),
      signal: +(macdData.signal[macdData.signal.length - 1] || 0).toFixed(4),
    },
    volume,
  };
}

// ============================================
// CONFLUENCE SCORING & REGIME CLASSIFICATION
// ============================================

function calculateConfluence(analysis: Partial<FullAnalysis>, tfData: Record<string, TimeframeData>): number {
  let bullish = 0, bearish = 0, total = 0;

  // Trend contribution
  const trendScore = { STRONG_UP: 2, UP: 1.5, NEUTRAL: 0, DOWN: -1.5, STRONG_DOWN: -2 };
  const t = trendScore[analysis.trend as keyof typeof trendScore] || 0;
  if (t > 0) bullish += t; else bearish += Math.abs(t);
  total += 2;

  // RSI contribution
  const rsiVal = analysis.rsi ?? 50;
  if (rsiVal < 30) bullish += 1.5;
  else if (rsiVal < 40) bullish += 0.5;
  else if (rsiVal > 70) bearish += 1.5;
  else if (rsiVal > 60) bearish += 0.5;
  total += 1.5;

  // MACD contribution
  if (analysis.macd?.crossover === 'BULLISH') bullish += 1.5;
  else if (analysis.macd?.crossover === 'BEARISH') bearish += 1.5;
  const macdHist = analysis.macd?.histogram ?? 0;
  if (macdHist > 0) bullish += 0.5;
  else if (macdHist < 0) bearish += 0.5;
  total += 2;

  // Stochastic contribution
  if (analysis.stochastic?.zone === 'OVERSOLD') bullish += 1;
  else if (analysis.stochastic?.zone === 'OVERBOUGHT') bearish += 1;
  total += 1;

  // Order flow
  if (analysis.orderFlow === 'STRONG_BUY') bullish += 2;
  else if (analysis.orderFlow === 'BUY') bullish += 1;
  else if (analysis.orderFlow === 'STRONG_SELL') bearish += 2;
  else if (analysis.orderFlow === 'SELL') bearish += 1;
  total += 2;

  // Volume trend
  if (analysis.volumeTrend === 'INCREASING') {
    if (bullish > bearish) bullish += 0.5; else bearish += 0.5;
  }
  total += 0.5;

  // Patterns
  if (analysis.patterns) {
    const bullishPatterns = ['BULLISH_ENGULFING', 'HAMMER', 'MORNING_STAR', 'THREE_WHITE_SOLDIERS', 'BULLISH_HARAMI'];
    const bearishPatterns = ['BEARISH_ENGULFING', 'SHOOTING_STAR', 'EVENING_STAR', 'THREE_BLACK_CROWS', 'BEARISH_HARAMI'];
    bullish += analysis.patterns.filter(p => bullishPatterns.includes(p)).length;
    bearish += analysis.patterns.filter(p => bearishPatterns.includes(p)).length;
    total += Math.max(1, analysis.patterns.length);
  }

  // Multi-timeframe alignment
  for (const tf of Object.values(tfData)) {
    if (tf.trend === 'BULLISH') bullish += 0.8;
    else if (tf.trend === 'BEARISH') bearish += 0.8;
    total += 0.8;
  }

  const maxSide = Math.max(bullish, bearish);
  return total > 0 ? maxSide / total : 0;
}

function classifyRegime(analysis: Partial<FullAnalysis>, tfData: Record<string, TimeframeData>): FullAnalysis['marketRegime'] {
  const adxVal = analysis.adx || 0;
  const atrPct = analysis.atrPct || 0;
  const trendStrength = analysis.trendStrength || 0;
  const confluence = analysis.confluenceScore || 0;

  const trending = adxVal > 25;
  const volatile = atrPct > 2.5;
  const strongTrend = trending && trendStrength > 60;
  const alignedTFs = Object.values(tfData).filter(tf => tf.trend === 'BULLISH').length;

  if (strongTrend && confluence > 0.65 && analysis.trend?.includes('UP')) return 'TRENDING_UP';
  if (strongTrend && confluence > 0.65 && analysis.trend?.includes('DOWN')) return 'TRENDING_DOWN';
  if (volatile && !trending) return 'VOLATILE';
  if (confluence > 0.7 && atrPct > 1.5) return 'BREAKOUT';
  if (adxVal > 20 && trendStrength > 40 && (
    analysis.patterns?.some(p => p.includes('STAR') || p.includes('ENGULFING'))
  )) return 'REVERSAL';
  if (!trending && !volatile) return 'RANGING';

  return 'RANGING';
}

function generateSignal(confluence: number, bullishScore: number, bearishScore: number): {
  signal: FullAnalysis['signal'];
  confidence: number;
} {
  const net = bullishScore - bearishScore;
  const strength = Math.abs(net);

  let signal: FullAnalysis['signal'] = 'HOLD';
  let confidence = 0.3;

  if (strength >= 8) {
    signal = net > 0 ? 'STRONG_BUY' : 'STRONG_SELL';
    confidence = 0.85 + confluence * 0.1;
  } else if (strength >= 5) {
    signal = net > 0 ? 'BUY' : 'SELL';
    confidence = 0.65 + confluence * 0.15;
  } else if (strength >= 3) {
    signal = net > 0 ? 'BUY' : 'SELL';
    confidence = 0.5 + confluence * 0.1;
  }

  return { signal, confidence: Math.min(0.95, Math.max(0.3, confidence)) };
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

/** Perform comprehensive market analysis with all indicators */
export function analyzeMarket(
  candles5m: Candle[],
  candles15m?: Candle[],
  candles1h?: Candle[],
  candles4h?: Candle[],
  orderBook?: OrderBookData
): FullAnalysis {
  if (candles5m.length < 10) {
    const price = candles5m[candles5m.length - 1]?.close || 0;
    return createEmptyAnalysis(price);
  }

  const closes = candles5m.map(c => c.close);
  const price = closes[closes.length - 1];

  // ---- Moving Averages ----
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, Math.min(200, closes.length));
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];
  const lastEma200 = ema200[ema200.length - 1];

  // ---- Oscillators ----
  const rsiValues = calcRSI(closes);
  const rsiVal = rsiValues[rsiValues.length - 1];

  const stoch = calcStochastic(candles5m);
  const stochK = stoch.k[stoch.k.length - 1];
  const stochD = stoch.d[stoch.d.length - 1];

  const macdData = calcMACD(closes);
  const lastMacd = macdData.macd[macdData.macd.length - 1];
  const lastSignal = macdData.signal[macdData.signal.length - 1];
  const lastHist = macdData.histogram[macdData.histogram.length - 1];
  const prevHist = macdData.histogram[macdData.histogram.length - 2];

  const cciValues = calcCCI(candles5m);
  const cciVal = cciValues[cciValues.length - 1];

  const rocValues = calcROC(closes);
  const rocVal = rocValues[rocValues.length - 1];

  // ---- Volatility ----
  const atrValues = calcATR(candles5m);
  const atrVal = atrValues[atrValues.length - 1];
  const atrPct = price > 0 ? (atrVal / price) * 100 : 0;

  const bb = calcBollingerBands(closes);
  const lastBBUpper = bb.upper[bb.upper.length - 1];
  const lastBBMiddle = bb.middle[bb.middle.length - 1];
  const lastBBLower = bb.lower[bb.lower.length - 1];
  const lastPercentB = bb.percentB[bb.percentB.length - 1];
  const lastBandwidth = bb.bandwidth[bb.bandwidth.length - 1];
  const bandwidthSMA = sma(bb.bandwidth.filter(v => !isNaN(v)), 20);
  const lastBWMA = bandwidthSMA.filter(v => !isNaN(v));
  const bbSqueeze = lastBWMA.length > 0 && lastBandwidth < lastBWMA[lastBWMA.length - 1];

  const keltner = calcKeltnerChannels(candles5m);
  const lastKeltner = {
    upper: keltner.upper[keltner.upper.length - 1],
    middle: keltner.middle[keltner.middle.length - 1],
    lower: keltner.lower[keltner.lower.length - 1],
  };

  // ---- Trend ----
  const adxData = calcADX(candles5m);
  const adxVal = adxData.adx[adxData.adx.length - 1];

  const supertrend = calcSuperTrend(candles5m);
  const lastSTDir = supertrend.direction[supertrend.direction.length - 1];
  const lastSTVal = supertrend.value[supertrend.value.length - 1];

  // ---- Volume ----
  const obvValues = calcOBV(candles5m);
  const obvVal = obvValues[obvValues.length - 1];
  const obvPrev = obvValues[obvValues.length - 6] || obvVal;
  let obvTrend: 'RISING' | 'FALLING' | 'FLAT' = 'FLAT';
  if (obvVal > obvPrev * 1.01) obvTrend = 'RISING';
  else if (obvVal < obvPrev * 0.99) obvTrend = 'FALLING';

  const vwapValues = calcVWAP(candles5m);
  const vwapVal = vwapValues[vwapValues.length - 1];

  const mfiValues = calcMFI(candles5m);
  const mfiVal = mfiValues[mfiValues.length - 1];

  const recentVolumes = candles5m.slice(-20).map(c => c.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const currentVolume = recentVolumes[recentVolumes.length - 1];
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

  let volumeTrend: 'INCREASING' | 'DECREASING' | 'NORMAL' = 'NORMAL';
  const recent5Vol = candles5m.slice(-5).map(c => c.volume).reduce((a, b) => a + b, 0) / 5;
  const recent10Vol = candles5m.slice(-10).map(c => c.volume).reduce((a, b) => a + b, 0) / 10;
  if (recent5Vol > recent10Vol * 1.2) volumeTrend = 'INCREASING';
  else if (recent5Vol < recent10Vol * 0.8) volumeTrend = 'DECREASING';

  // ---- Structure ----
  const { support, resistance, pivotPoints } = findSupportResistance(candles5m);
  const structure = checkStructure(candles5m);

  // ---- Patterns ----
  const patterns = detectPatterns(candles5m);

  // ---- Order Flow ----
  const flowAnalysis = analyzeOrderFlow(candles5m, orderBook);

  // ---- Trend classification ----
  let trend: FullAnalysis['trend'] = 'NEUTRAL';
  let trendStrength = 0;

  const priceAboveEma20 = price > lastEma20;
  const ema20AboveEma50 = lastEma20 > lastEma50;
  const ema50AboveEma200 = lastEma50 > lastEma200;

  if (priceAboveEma20 && ema20AboveEma50 && ema50AboveEma200) {
    trend = 'STRONG_UP';
    trendStrength = 85 + Math.min(15, adxVal * 0.3);
  } else if (priceAboveEma20 && ema20AboveEma50) {
    trend = 'UP';
    trendStrength = 55 + Math.min(30, adxVal * 0.4);
  } else if (!priceAboveEma20 && !ema20AboveEma50 && !ema50AboveEma200) {
    trend = 'STRONG_DOWN';
    trendStrength = 85 + Math.min(15, adxVal * 0.3);
  } else if (!priceAboveEma20 && !ema20AboveEma50) {
    trend = 'DOWN';
    trendStrength = 55 + Math.min(30, adxVal * 0.4);
  } else {
    trend = 'NEUTRAL';
    trendStrength = 30 + Math.min(20, adxVal * 0.3);
  }

  // ---- Multi-timeframe ----
  const tf5m = analyzeTimeframe(candles5m);
  const tf15m = candles15m ? analyzeTimeframe(candles15m) : { trend: 'NEUTRAL', rsi: 50, macd: { macd: 0, signal: 0 }, volume: 'NORMAL' };
  const tf1h = candles1h ? analyzeTimeframe(candles1h) : { trend: 'NEUTRAL', rsi: 50, macd: { macd: 0, signal: 0 }, volume: 'NORMAL' };
  const tf4h = candles4h ? analyzeTimeframe(candles4h) : { trend: 'NEUTRAL', rsi: 50, macd: { macd: 0, signal: 0 }, volume: 'NORMAL' };

  const timeframes = { '5m': tf5m, '15m': tf15m, '1h': tf1h, '4h': tf4h };

  // ---- Price changes ----
  const change1h = candles1h && candles1h.length >= 2
    ? +((closes[closes.length - 1] - candles1h[candles1h.length - 2].close) / candles1h[candles1h.length - 2].close * 100).toFixed(2)
    : 0;
  const change24h = candles5m.length >= 288
    ? +((closes[closes.length - 1] - closes[closes.length - 288]) / closes[closes.length - 288] * 100).toFixed(2)
    : 0;

  // ---- Build partial analysis for confluence ----
  const partial: Partial<FullAnalysis> = {
    price, trend, trendStrength, adx: adxVal, atrPct,
    rsi: rsiVal,
    macd: {
      macd: lastMacd, signal: lastSignal, histogram: lastHist,
      crossover: (prevHist !== undefined && lastHist !== undefined && prevHist <= 0 && lastHist > 0) ? 'BULLISH' :
                 (prevHist !== undefined && lastHist !== undefined && prevHist >= 0 && lastHist < 0) ? 'BEARISH' : null,
    },
    stochastic: {
      k: stochK, d: stochD,
      zone: stochK > 80 ? 'OVERBOUGHT' : stochK < 20 ? 'OVERSOLD' : 'NEUTRAL',
    },
    cci: cciVal, roc: rocVal,
    atr: atrVal,
    bollingerBands: {
      upper: lastBBUpper, middle: lastBBMiddle, lower: lastBBLower,
      percentB: lastPercentB, bandwidth: lastBandwidth, squeeze: bbSqueeze,
    },
    obv: obvVal, obvTrend, vwap: vwapVal, mfi: mfiVal,
    volumeRatio, volumeTrend,
    support, resistance, pivotPoints,
    higherHighs: structure.higherHighs, lowerLows: structure.lowerLows,
    patterns,
    orderFlow: flowAnalysis.orderFlow,
    buyPressure: flowAnalysis.buyPressure,
    sellPressure: flowAnalysis.sellPressure,
  };

  // ---- Confluence & Regime ----
  const confluenceScore = calculateConfluence(partial, timeframes);
  const marketRegime = classifyRegime({ ...partial, confluenceScore }, timeframes);

  // ---- RSI Zone ----
  let rsiZone: FullAnalysis['rsiZone'] = 'NEUTRAL';
  if (rsiVal >= 80) rsiZone = 'OVERBOUGHT';
  else if (rsiVal >= 60) rsiZone = 'HIGH';
  else if (rsiVal <= 20) rsiZone = 'OVERSOLD';
  else if (rsiVal <= 40) rsiZone = 'LOW';

  // ---- MFI Zone ----
  let mfiZone: FullAnalysis['mfiZone'] = 'NEUTRAL';
  if (mfiVal >= 80) mfiZone = 'OVERBOUGHT';
  else if (mfiVal <= 20) mfiZone = 'OVERSOLD';

  // ---- Suggested SL/TP ----
  const suggestedSL = trend.includes('UP')
    ? +(price - atrVal * 2).toFixed(2)
    : +(price + atrVal * 2).toFixed(2);
  const suggestedTP = trend.includes('UP')
    ? +(price + atrVal * 3).toFixed(2)
    : +(price - atrVal * 3).toFixed(2);
  const riskRewardRatio = atrVal > 0
    ? +((Math.abs(suggestedTP - price) / Math.abs(price - suggestedSL))).toFixed(2)
    : 1.5;

  // ---- Signal Generation ----
  const { signal, confidence } = generateSignal(
    confluenceScore,
    flowAnalysis.buyPressure / 10,
    flowAnalysis.sellPressure / 10,
  );

  return {
    price,
    change1h,
    change24h,
    trend,
    trendStrength: Math.round(trendStrength),
    adx: +adxVal.toFixed(1),
    adxTrend: adxVal > 25 ? 'TRENDING' : 'RANGING',
    supertrend: { direction: lastSTDir, value: +lastSTVal.toFixed(2) },
    rsi: +rsiVal.toFixed(1),
    rsiZone,
    macd: {
      macd: +lastMacd.toFixed(4),
      signal: +lastSignal.toFixed(4),
      histogram: +lastHist.toFixed(4),
      crossover: (prevHist !== undefined && prevHist <= 0 && lastHist > 0) ? 'BULLISH' :
                 (prevHist !== undefined && prevHist >= 0 && lastHist < 0) ? 'BEARISH' : null,
    },
    stochastic: {
      k: +stochK.toFixed(1),
      d: +stochD.toFixed(1),
      zone: stochK > 80 ? 'OVERBOUGHT' : stochK < 20 ? 'OVERSOLD' : 'NEUTRAL',
    },
    cci: +cciVal.toFixed(1),
    roc: +rocVal.toFixed(2),
    atr: +atrVal.toFixed(2),
    atrPct: +atrPct.toFixed(2),
    bollingerBands: {
      upper: +lastBBUpper.toFixed(2),
      middle: +lastBBMiddle.toFixed(2),
      lower: +lastBBLower.toFixed(2),
      percentB: +lastPercentB.toFixed(3),
      bandwidth: +lastBandwidth.toFixed(3),
      squeeze: bbSqueeze,
    },
    keltnerChannels: {
      upper: +lastKeltner.upper.toFixed(2),
      middle: +lastKeltner.middle.toFixed(2),
      lower: +lastKeltner.lower.toFixed(2),
    },
    obv: +obvVal.toFixed(0),
    obvTrend,
    vwap: +vwapVal.toFixed(2),
    mfi: +mfiVal.toFixed(1),
    mfiZone,
    volumeRatio: +volumeRatio.toFixed(2),
    volumeTrend,
    support: +support.toFixed(2),
    resistance: +resistance.toFixed(2),
    pivotPoints: {
      pp: +pivotPoints.pp.toFixed(2),
      r1: +pivotPoints.r1.toFixed(2),
      r2: +pivotPoints.r2.toFixed(2),
      r3: +pivotPoints.r3.toFixed(2),
      s1: +pivotPoints.s1.toFixed(2),
      s2: +pivotPoints.s2.toFixed(2),
      s3: +pivotPoints.s3.toFixed(2),
    },
    higherHighs: structure.higherHighs,
    lowerLows: structure.lowerLows,
    patterns,
    orderFlow: flowAnalysis.orderFlow,
    buyPressure: flowAnalysis.buyPressure,
    sellPressure: flowAnalysis.sellPressure,
    timeframes,
    confluenceScore: +confluenceScore.toFixed(3),
    marketRegime,
    signal,
    confidence: +confidence.toFixed(2),
    suggestedSL,
    suggestedTP,
    riskRewardRatio,
  };
}

/** Create empty analysis for insufficient data */
function createEmptyAnalysis(price: number): FullAnalysis {
  return {
    price,
    change1h: 0, change24h: 0,
    trend: 'NEUTRAL', trendStrength: 0,
    adx: 0, adxTrend: 'RANGING',
    supertrend: { direction: 'UP', value: price },
    rsi: 50, rsiZone: 'NEUTRAL',
    macd: { macd: 0, signal: 0, histogram: 0, crossover: null },
    stochastic: { k: 50, d: 50, zone: 'NEUTRAL' },
    cci: 0, roc: 0,
    atr: 0, atrPct: 0,
    bollingerBands: { upper: price, middle: price, lower: price, percentB: 0.5, bandwidth: 0, squeeze: false },
    keltnerChannels: { upper: price, middle: price, lower: price },
    obv: 0, obvTrend: 'FLAT',
    vwap: price, mfi: 50, mfiZone: 'NEUTRAL',
    volumeRatio: 1, volumeTrend: 'NORMAL',
    support: price, resistance: price,
    pivotPoints: { pp: price, r1: price, r2: price, r3: price, s1: price, s2: price, s3: price },
    higherHighs: false, lowerLows: false,
    patterns: [],
    orderFlow: 'NEUTRAL', buyPressure: 50, sellPressure: 50,
    timeframes: {
      '5m': { trend: 'NEUTRAL', rsi: 50, macd: { macd: 0, signal: 0 }, volume: 'NORMAL' },
      '15m': { trend: 'NEUTRAL', rsi: 50, macd: { macd: 0, signal: 0 }, volume: 'NORMAL' },
      '1h': { trend: 'NEUTRAL', rsi: 50, macd: { macd: 0, signal: 0 }, volume: 'NORMAL' },
      '4h': { trend: 'NEUTRAL', rsi: 50, macd: { macd: 0, signal: 0 }, volume: 'NORMAL' },
    },
    confluenceScore: 0,
    marketRegime: 'RANGING',
    signal: 'HOLD', confidence: 0.3,
    suggestedSL: 0, suggestedTP: 0, riskRewardRatio: 1.5,
  };
}

// ============================================
// UTILITY EXPORTS (for strategies/ML)
// ============================================

export {
  sma, ema, wma, dema, tema, hullMA, vwma,
  calcRSI, calcStochastic, calcStochRSI, calcCCI, calcWilliamsR, calcMACD, calcROC,
  calcATR, calcBollingerBands, calcKeltnerChannels, calcDonchianChannels, calcStdDev,
  calcADX, calcSuperTrend, calcParabolicSAR, calcIchimoku, calcAroon,
  calcOBV, calcVWAP, calcVolumeProfile, calcMFI, calcADLine,
  calcTRIX, calcUltimateOscillator,
  detectPatterns, findSupportResistance, checkStructure, analyzeOrderFlow, analyzeTimeframe,
};
