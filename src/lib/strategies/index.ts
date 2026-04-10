// ============================================
// RECO-TRADING - Strategy Framework
// ============================================
// Multi-strategy ensemble system with weighted
// consensus scoring for robust signal generation.
// ============================================

import type { Candle, FullAnalysis } from '@/lib/analysis-engine';

// ---- Types ----

export interface StrategySignal {
  name: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  reasons: string[];
  sl: number;
  tp: number;
  riskReward: number;
}

export interface EnsembleResult {
  finalSignal: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  strategySignals: StrategySignal[];
  weightedScore: number;
  reasons: string[];
  sl: number;
  tp: number;
}

export interface StrategyConfig {
  enabled: boolean;
  weight: number;
  minConfidence: number;
  params: Record<string, number>;
}

// ---- Strategy Interface ----

export interface Strategy {
  name: string;
  description: string;
  analyze(candles: Candle[], analysis: FullAnalysis, config: StrategyConfig): StrategySignal;
}

// ============================================
// STRATEGY 1: Momentum Strategy
// ============================================
// Uses RSI, MACD, ROC, Stochastic for momentum-based entries.
// Best in trending markets with clear directional momentum.

class MomentumStrategy implements Strategy {
  name = 'Momentum';
  description = 'RSI + MACD + ROC + Stochastic momentum entries';

  analyze(candles: Candle[], analysis: FullAnalysis, config: StrategyConfig): StrategySignal {
    const reasons: string[] = [];
    let bullishScore = 0;
    let bearishScore = 0;
    const totalWeight = 4;

    // RSI analysis
    if (analysis.rsi < 30) {
      bullishScore += 1.5;
      reasons.push(`RSI oversold at ${analysis.rsi.toFixed(1)}`);
    } else if (analysis.rsi < 40) {
      bullishScore += 0.5;
      reasons.push(`RSI approaching oversold (${analysis.rsi.toFixed(1)})`);
    } else if (analysis.rsi > 70) {
      bearishScore += 1.5;
      reasons.push(`RSI overbought at ${analysis.rsi.toFixed(1)}`);
    } else if (analysis.rsi > 60) {
      bearishScore += 0.5;
      reasons.push(`RSI approaching overbought (${analysis.rsi.toFixed(1)})`);
    }

    // MACD analysis
    if (analysis.macd.crossover === 'BULLISH') {
      bullishScore += 1.5;
      reasons.push('MACD bullish crossover');
    } else if (analysis.macd.crossover === 'BEARISH') {
      bearishScore += 1.5;
      reasons.push('MACD bearish crossover');
    }
    if (analysis.macd.histogram > 0) {
      bullishScore += 0.5;
    } else if (analysis.macd.histogram < 0) {
      bearishScore += 0.5;
    }

    // ROC analysis
    if (analysis.roc > 2) {
      bullishScore += 0.5;
      reasons.push(`Strong positive ROC (${analysis.roc.toFixed(2)}%)`);
    } else if (analysis.roc < -2) {
      bearishScore += 0.5;
      reasons.push(`Strong negative ROC (${analysis.roc.toFixed(2)}%)`);
    }

    // Stochastic analysis
    if (analysis.stochastic.zone === 'OVERSOLD') {
      bullishScore += 0.5;
      reasons.push('Stochastic oversold');
    } else if (analysis.stochastic.zone === 'OVERBOUGHT') {
      bearishScore += 0.5;
      reasons.push('Stochastic overbought');
    }
    // Stochastic crossover
    if (candles.length >= 3) {
      const stochK = analysis.stochastic.k;
      const stochD = analysis.stochastic.d;
      // Approximate: K crossing above D in oversold is bullish
      if (stochK > stochD && analysis.stochastic.zone === 'OVERSOLD') {
        bullishScore += 0.5;
        reasons.push('Stochastic bullish cross in oversold zone');
      } else if (stochK < stochD && analysis.stochastic.zone === 'OVERBOUGHT') {
        bearishScore += 0.5;
        reasons.push('Stochastic bearish cross in overbought zone');
      }
    }

    const net = bullishScore - bearishScore;
    const direction: 'LONG' | 'SHORT' | 'NEUTRAL' = net > 1 ? 'LONG' : net < -1 ? 'SHORT' : 'NEUTRAL';
    const confidence = Math.min(0.95, Math.abs(net) / totalWeight);

    return {
      name: this.name,
      direction,
      confidence,
      reasons,
      sl: analysis.suggestedSL,
      tp: analysis.suggestedTP,
      riskReward: analysis.riskRewardRatio,
    };
  }
}

// ============================================
// STRATEGY 2: Mean Reversion Strategy
// ============================================
// Uses Bollinger Bands, RSI extremes, mean distance for reversion trades.
// Best in ranging/sideways markets.

class MeanReversionStrategy implements Strategy {
  name = 'MeanReversion';
  description = 'Bollinger Bands + RSI extremes mean reversion';

  analyze(_candles: Candle[], analysis: FullAnalysis, config: StrategyConfig): StrategySignal {
    const reasons: string[] = [];
    let bullishScore = 0;
    let bearishScore = 0;

    const bb = analysis.bollingerBands;
    const bbRange = bb.upper - bb.lower;
    const meanDistance = bbRange > 0 ? (analysis.price - bb.middle) / bbRange : 0;

    // Price at lower band (potential bounce)
    if (analysis.price <= bb.lower * 1.005) {
      bullishScore += 2;
      reasons.push('Price at lower Bollinger Band');
    } else if (meanDistance < -0.7) {
      bullishScore += 1;
      reasons.push('Price well below BB mean');
    }

    // Price at upper band (potential drop)
    if (analysis.price >= bb.upper * 0.995) {
      bearishScore += 2;
      reasons.push('Price at upper Bollinger Band');
    } else if (meanDistance > 0.7) {
      bearishScore += 1;
      reasons.push('Price well above BB mean');
    }

    // %B analysis
    if (bb.percentB < 0.1) {
      bullishScore += 1;
      reasons.push(`BB %B extremely low (${bb.percentB.toFixed(2)})`);
    } else if (bb.percentB > 0.9) {
      bearishScore += 1;
      reasons.push(`BB %B extremely high (${bb.percentB.toFixed(2)})`);
    }

    // RSI confirmation
    if (analysis.rsi < 25) {
      bullishScore += 1.5;
      reasons.push(`RSI deeply oversold (${analysis.rsi.toFixed(1)})`);
    } else if (analysis.rsi > 75) {
      bearishScore += 1.5;
      reasons.push(`RSI deeply overbought (${analysis.rsi.toFixed(1)})`);
    }

    // BB squeeze breakout (potential expansion)
    if (bb.squeeze) {
      reasons.push('Bollinger Band squeeze detected');
      // During squeeze, prefer direction of recent momentum
      if (analysis.trend.includes('UP')) bullishScore += 0.5;
      else if (analysis.trend.includes('DOWN')) bearishScore += 0.5;
    }

    // Volume confirmation for reversion
    if (analysis.volumeRatio > 1.5) {
      if (bullishScore > bearishScore) bullishScore += 0.5;
      else bearishScore += 0.5;
      reasons.push('High volume confirms reversion signal');
    }

    const net = bullishScore - bearishScore;
    const direction: 'LONG' | 'SHORT' | 'NEUTRAL' = net > 1.5 ? 'LONG' : net < -1.5 ? 'SHORT' : 'NEUTRAL';
    const confidence = Math.min(0.9, Math.abs(net) / 6);

    // For mean reversion, SL is at the band extreme, TP at the mean
    const sl = analysis.price <= bb.lower ? +(bb.lower - bbRange * 0.2).toFixed(2) : analysis.suggestedSL;
    const tp = analysis.price <= bb.lower ? +bb.middle.toFixed(2) : analysis.price >= bb.upper ? +bb.middle.toFixed(2) : analysis.suggestedTP;

    return {
      name: this.name,
      direction,
      confidence,
      reasons,
      sl,
      tp,
      riskReward: analysis.riskRewardRatio,
    };
  }
}

// ============================================
// STRATEGY 3: Breakout Strategy
// ============================================
// Uses ATR, Keltner/Donchian Channels, volume for breakout entries.
// Best in volatile or breakout regime markets.

class BreakoutStrategy implements Strategy {
  name = 'Breakout';
  description = 'ATR + Keltner Channels + volume breakout entries';

  analyze(candles: Candle[], analysis: FullAnalysis, config: StrategyConfig): StrategySignal {
    const reasons: string[] = [];
    let bullishScore = 0;
    let bearishScore = 0;

    const keltner = analysis.keltnerChannels;

    // Price above Keltner upper channel = bullish breakout
    if (analysis.price > keltner.upper) {
      bullishScore += 2;
      reasons.push('Price broke above Keltner Channel');
    }
    // Price below Keltner lower channel = bearish breakout
    if (analysis.price < keltner.lower) {
      bearishScore += 2;
      reasons.push('Price broke below Keltner Channel');
    }

    // BB squeeze + price outside bands = high probability breakout
    if (analysis.bollingerBands.squeeze) {
      if (analysis.price > analysis.bollingerBands.upper) {
        bullishScore += 1.5;
        reasons.push('BB squeeze breakout to upside');
      } else if (analysis.price < analysis.bollingerBands.lower) {
        bearishScore += 1.5;
        reasons.push('BB squeeze breakout to downside');
      }
    }

    // ATR expansion
    if (analysis.atrPct > 2) {
      reasons.push(`High volatility (ATR ${analysis.atrPct.toFixed(2)}%)`);
      // Momentum direction decides which side
      if (analysis.trend.includes('UP')) bullishScore += 0.5;
      else if (analysis.trend.includes('DOWN')) bearishScore += 0.5;
    }

    // Volume confirmation (critical for breakouts)
    if (analysis.volumeRatio > 1.8) {
      reasons.push('Very high volume confirms breakout');
      if (bullishScore > 0) bullishScore += 1;
      if (bearishScore > 0) bearishScore += 1;
    } else if (analysis.volumeRatio < 0.8) {
      // Low volume breakout = suspect
      bullishScore *= 0.5;
      bearishScore *= 0.5;
      reasons.push('Low volume weakens breakout signal');
    }

    // Volume trend confirmation
    if (analysis.volumeTrend === 'INCREASING') {
      if (bullishScore > 0) bullishScore += 0.5;
      if (bearishScore > 0) bearishScore += 0.5;
      reasons.push('Rising volume trend supports breakout');
    }

    // Check for consolidation before breakout (narrow candles recently)
    if (candles.length >= 10) {
      const recent10 = candles.slice(-10);
      const avgRange = recent10.reduce((s, c) => s + (c.high - c.low), 0) / 10;
      const currentRange = candles[candles.length - 1].high - candles[candles.length - 1].low;
      if (currentRange > avgRange * 1.5 && analysis.volumeRatio > 1.2) {
        reasons.push('Expansion from consolidation');
        if (candles[candles.length - 1].close > candles[candles.length - 1].open) bullishScore += 0.5;
        else bearishScore += 0.5;
      }
    }

    // Market regime check
    if (analysis.marketRegime === 'BREAKOUT') {
      reasons.push('Market regime: BREAKOUT');
    }

    const net = bullishScore - bearishScore;
    const direction: 'LONG' | 'SHORT' | 'NEUTRAL' = net > 2 ? 'LONG' : net < -2 ? 'SHORT' : 'NEUTRAL';
    const confidence = Math.min(0.9, Math.abs(net) / 6);

    return {
      name: this.name,
      direction,
      confidence,
      reasons,
      sl: analysis.suggestedSL,
      tp: analysis.suggestedTP,
      riskReward: analysis.riskRewardRatio,
    };
  }
}

// ============================================
// STRATEGY 4: Trend Following Strategy
// ============================================
// Uses EMA crossovers, ADX, SuperTrend for trend trades.
// Best in clearly trending markets (high ADX).

class TrendFollowingStrategy implements Strategy {
  name = 'TrendFollowing';
  description = 'EMA crossover + ADX + SuperTrend trend following';

  analyze(candles: Candle[], analysis: FullAnalysis, config: StrategyConfig): StrategySignal {
    const reasons: string[] = [];
    let bullishScore = 0;
    let bearishScore = 0;

    // ADX check - only trade in trending markets
    if (analysis.adx < 20) {
      reasons.push(`Low ADX (${analysis.adx.toFixed(1)}) - weak trend, skipping`);
      return {
        name: this.name,
        direction: 'NEUTRAL',
        confidence: 0.1,
        reasons,
        sl: analysis.suggestedSL,
        tp: analysis.suggestedTP,
        riskReward: analysis.riskRewardRatio,
      };
    }

    // Trend direction scoring
    const trendScores: Record<string, { bull: number; bear: number }> = {
      'STRONG_UP': { bull: 3, bear: 0 },
      'UP': { bull: 2, bear: 0 },
      'NEUTRAL': { bull: 0, bear: 0 },
      'DOWN': { bull: 0, bear: 2 },
      'STRONG_DOWN': { bull: 0, bear: 3 },
    };

    const ts = trendScores[analysis.trend] || { bull: 0, bear: 0 };
    bullishScore += ts.bull;
    bearishScore += ts.bear;
    if (ts.bull > 0) reasons.push(`Trend: ${analysis.trend}`);
    if (ts.bear > 0) reasons.push(`Trend: ${analysis.trend}`);

    // ADX strength bonus
    if (analysis.adx > 40) {
      const bonus = 1;
      if (bullishScore > 0) bullishScore += bonus;
      if (bearishScore > 0) bearishScore += bonus;
      reasons.push(`Strong ADX (${analysis.adx.toFixed(1)}) confirms trend`);
    } else if (analysis.adx > 25) {
      reasons.push(`Moderate ADX (${analysis.adx.toFixed(1)})`);
    }

    // SuperTrend confirmation
    if (analysis.supertrend.direction === 'UP') {
      bullishScore += 1;
      reasons.push('SuperTrend bullish');
    } else if (analysis.supertrend.direction === 'DOWN') {
      bearishScore += 1;
      reasons.push('SuperTrend bearish');
    }

    // Higher highs / lower lows confirmation
    if (analysis.higherHighs) {
      bullishScore += 0.5;
      reasons.push('Higher highs detected');
    }
    if (analysis.lowerLows) {
      bearishScore += 0.5;
      reasons.push('Lower lows detected');
    }

    // Multi-timeframe alignment
    const tfTrends = Object.values(analysis.timeframes).map(tf => tf.trend);
    const bullishTFs = tfTrends.filter(t => t === 'BULLISH').length;
    const bearishTFs = tfTrends.filter(t => t === 'BEARISH').length;

    if (bullishTFs >= 3) {
      bullishScore += 1.5;
      reasons.push(`${bullishTFs}/4 timeframes bullish`);
    } else if (bearishTFs >= 3) {
      bearishScore += 1.5;
      reasons.push(`${bearishTFs}/4 timeframes bearish`);
    } else if (bullishTFs >= 2) {
      bullishScore += 0.5;
    } else if (bearishTFs >= 2) {
      bearishScore += 0.5;
    }

    // Volume confirmation (trend should have volume)
    if (analysis.volumeTrend === 'INCREASING') {
      if (bullishScore > 0) bullishScore += 0.5;
      if (bearishScore > 0) bearishScore += 0.5;
    }

    // MACD direction confirmation
    if (analysis.macd.histogram > 0 && bullishScore > 0) bullishScore += 0.5;
    if (analysis.macd.histogram < 0 && bearishScore > 0) bearishScore += 0.5;

    const net = bullishScore - bearishScore;
    const direction: 'LONG' | 'SHORT' | 'NEUTRAL' = net > 2 ? 'LONG' : net < -2 ? 'SHORT' : 'NEUTRAL';
    const confidence = Math.min(0.9, Math.abs(net) / 8);

    // Trend-following: use SuperTrend value for SL
    const sl = bullishScore > bearishScore
      ? +analysis.supertrend.value.toFixed(2)
      : +analysis.supertrend.value.toFixed(2);
    const tp = bullishScore > bearishScore
      ? +(analysis.price + analysis.atr * 3).toFixed(2)
      : +(analysis.price - analysis.atr * 3).toFixed(2);

    return {
      name: this.name,
      direction,
      confidence,
      reasons,
      sl,
      tp,
      riskReward: analysis.riskRewardRatio,
    };
  }
}

// ============================================
// STRATEGY 5: Scalping Strategy
// ============================================
// Quick entries based on order flow, micro-trends, spread analysis.
// Best in ranging or low-timeframe markets.

class ScalpingStrategy implements Strategy {
  name = 'Scalping';
  description = 'Order flow + micro-trends + spread scalping';

  analyze(candles: Candle[], analysis: FullAnalysis, config: StrategyConfig): StrategySignal {
    const reasons: string[] = [];
    let bullishScore = 0;
    let bearishScore = 0;

    // Order flow is the primary signal for scalping
    if (analysis.orderFlow === 'STRONG_BUY') {
      bullishScore += 2;
      reasons.push(`Strong buy order flow (${analysis.buyPressure}% buy pressure)`);
    } else if (analysis.orderFlow === 'BUY') {
      bullishScore += 1;
      reasons.push(`Buy order flow (${analysis.buyPressure}% buy pressure)`);
    } else if (analysis.orderFlow === 'STRONG_SELL') {
      bearishScore += 2;
      reasons.push(`Strong sell order flow (${analysis.sellPressure}% sell pressure)`);
    } else if (analysis.orderFlow === 'SELL') {
      bearishScore += 1;
      reasons.push(`Sell order flow (${analysis.sellPressure}% sell pressure)`);
    }

    // Micro-trend from last 3-5 candles
    if (candles.length >= 5) {
      const last5 = candles.slice(-5);
      const bullishCandles = last5.filter(c => c.close > c.open).length;
      const bearishCandles = last5.filter(c => c.close < c.open).length;

      if (bullishCandles >= 4) {
        bullishScore += 1.5;
        reasons.push('4/5 recent candles bullish');
      } else if (bearishCandles >= 4) {
        bearishScore += 1.5;
        reasons.push('4/5 recent candles bearish');
      } else if (bullishCandles >= 3) {
        bullishScore += 0.5;
      } else if (bearishCandles >= 3) {
        bearishScore += 0.5;
      }
    }

    // Volume spike (increased activity)
    if (analysis.volumeRatio > 2) {
      reasons.push('Volume spike detected');
      // Direction of price during volume spike
      if (candles.length >= 2) {
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        if (lastCandle.close > prevCandle.close) bullishScore += 1;
        else bearishScore += 1;
      }
    }

    // VWAP as dynamic S/R
    if (analysis.price > analysis.vwap * 1.001) {
      bullishScore += 0.5;
      reasons.push('Price above VWAP');
    } else if (analysis.price < analysis.vwap * 0.999) {
      bearishScore += 0.5;
      reasons.push('Price below VWAP');
    }

    // VWAP reversion scalping
    const vwapDistance = analysis.price > 0 ? ((analysis.price - analysis.vwap) / analysis.vwap) * 100 : 0;
    if (vwapDistance > 0.3) {
      bearishScore += 0.5;
      reasons.push(`Price ${vwapDistance.toFixed(2)}% above VWAP (mean reversion)`);
    } else if (vwapDistance < -0.3) {
      bullishScore += 0.5;
      reasons.push(`Price ${Math.abs(vwapDistance).toFixed(2)}% below VWAP (mean reversion)`);
    }

    // RSI quick scalping zones
    if (analysis.rsi < 35) {
      bullishScore += 0.5;
      reasons.push('Quick RSI oversold');
    } else if (analysis.rsi > 65) {
      bearishScore += 0.5;
      reasons.push('Quick RSI overbought');
    }

    // OBV trend confirmation
    if (analysis.obvTrend === 'RISING') bullishScore += 0.5;
    else if (analysis.obvTrend === 'FALLING') bearishScore += 0.5;

    // Tight stops for scalping
    const slDistance = analysis.atr * 1;
    const tpDistance = analysis.atr * 1.5;
    const sl = analysis.buyPressure > 50
      ? +(analysis.price - slDistance).toFixed(2)
      : +(analysis.price + slDistance).toFixed(2);
    const tp = analysis.buyPressure > 50
      ? +(analysis.price + tpDistance).toFixed(2)
      : +(analysis.price - tpDistance).toFixed(2);

    const net = bullishScore - bearishScore;
    const direction: 'LONG' | 'SHORT' | 'NEUTRAL' = net > 1.5 ? 'LONG' : net < -1.5 ? 'SHORT' : 'NEUTRAL';
    const confidence = Math.min(0.85, Math.abs(net) / 5);

    return {
      name: this.name,
      direction,
      confidence,
      reasons,
      sl,
      tp,
      riskReward: +(tpDistance / slDistance).toFixed(2),
    };
  }
}

// ============================================
// STRATEGY 6: Volume-Weighted Strategy
// ============================================
// Uses volume profile, OBV, MFI, and volume trend
// for volume-confirmed entries. Best when volume
// diverges from price (strong signal).
// ============================================

class VolumeWeightedStrategy implements Strategy {
  name = 'VolumeWeighted';
  description = 'Volume profile + OBV + MFI volume-confirmed entries';

  analyze(candles: Candle[], analysis: FullAnalysis, config: StrategyConfig): StrategySignal {
    const reasons: string[] = [];
    let bullishScore = 0;
    let bearishScore = 0;

    // OBV trend is the primary signal
    if (analysis.obvTrend === 'RISING') {
      bullishScore += 1.5;
      reasons.push('OBV trending up (accumulation)');
    } else if (analysis.obvTrend === 'FALLING') {
      bearishScore += 1.5;
      reasons.push('OBV trending down (distribution)');
    }

    // Volume ratio (compare with average)
    if (analysis.volumeRatio > 2.0) {
      reasons.push(`Volume spike (${analysis.volumeRatio.toFixed(1)}x average)`);
      // High volume confirms the current direction
      if (analysis.trend.includes('UP') || analysis.rsi > 50) bullishScore += 1.5;
      else if (analysis.trend.includes('DOWN') || analysis.rsi < 50) bearishScore += 1.5;
    } else if (analysis.volumeRatio > 1.3) {
      if (analysis.trend.includes('UP')) bullishScore += 0.5;
      else if (analysis.trend.includes('DOWN')) bearishScore += 0.5;
      reasons.push('Above average volume');
    } else if (analysis.volumeRatio < 0.5) {
      // Low volume = weak conviction
      bullishScore *= 0.5;
      bearishScore *= 0.5;
      reasons.push('Low volume (weak conviction)');
    }

    // MFI (Money Flow Index) - combines price and volume
    if (analysis.mfi < 20) {
      bullishScore += 1.5;
      reasons.push(`MFI oversold (${analysis.mfi.toFixed(1)})`);
    } else if (analysis.mfi > 80) {
      bearishScore += 1.5;
      reasons.push(`MFI overbought (${analysis.mfi.toFixed(1)})`);
    } else if (analysis.mfiZone === 'OVERSOLD') {
      bullishScore += 1;
      reasons.push('MFI in oversold zone');
    } else if (analysis.mfiZone === 'OVERBOUGHT') {
      bearishScore += 1;
      reasons.push('MFI in overbought zone');
    }

    // Volume trend confirmation
    if (analysis.volumeTrend === 'INCREASING') {
      if (bullishScore > 0) bullishScore += 0.5;
      if (bearishScore > 0) bearishScore += 0.5;
    } else if (analysis.volumeTrend === 'DECREASING') {
      // Decreasing volume weakens signal
      bullishScore *= 0.7;
      bearishScore *= 0.7;
    }

    // Buy/sell pressure divergence
    const pressureDiff = analysis.buyPressure - analysis.sellPressure;
    if (pressureDiff > 30) {
      bullishScore += 1;
      reasons.push(`Strong buy pressure (${analysis.buyPressure.toFixed(0)}%)`);
    } else if (pressureDiff < -30) {
      bearishScore += 1;
      reasons.push(`Strong sell pressure (${analysis.sellPressure.toFixed(0)}%)`);
    }

    // Order flow confirmation
    if (analysis.orderFlow === 'STRONG_BUY') {
      bullishScore += 1;
    } else if (analysis.orderFlow === 'STRONG_SELL') {
      bearishScore += 1;
    }

    // Volume-price divergence (strong reversal signal)
    if (candles.length >= 10) {
      const last5 = candles.slice(-5);
      const prev5 = candles.slice(-10, -5);
      const recentAvgPrice = last5.reduce((s, c) => s + c.close, 0) / 5;
      const prevAvgPrice = prev5.reduce((s, c) => s + c.close, 0) / 5;
      const recentAvgVol = last5.reduce((s, c) => s + c.volume, 0) / 5;
      const prevAvgVol = prev5.reduce((s, c) => s + c.volume, 0) / 5;

      // Price up but volume declining = bearish divergence
      if (recentAvgPrice > prevAvgPrice && recentAvgVol < prevAvgVol * 0.7) {
        bearishScore += 1;
        reasons.push('Bearish volume-price divergence');
      }
      // Price down but volume declining = bullish (selling exhausted)
      if (recentAvgPrice < prevAvgPrice && recentAvgVol < prevAvgVol * 0.7) {
        bullishScore += 1;
        reasons.push('Bullish volume-price divergence (selling exhausted)');
      }
    }

    const net = bullishScore - bearishScore;
    const direction: 'LONG' | 'SHORT' | 'NEUTRAL' = net > 1.5 ? 'LONG' : net < -1.5 ? 'SHORT' : 'NEUTRAL';
    const confidence = Math.min(0.9, Math.abs(net) / 7);

    return {
      name: this.name,
      direction,
      confidence,
      reasons,
      sl: analysis.suggestedSL,
      tp: analysis.suggestedTP,
      riskReward: analysis.riskRewardRatio,
    };
  }
}

// ============================================
// STRATEGY ENSEMBLE
// ============================================

export class StrategyEnsemble {
  strategies: Strategy[];
  private defaultConfig: Record<string, StrategyConfig>;

  constructor() {
    this.strategies = [
      new MomentumStrategy(),
      new MeanReversionStrategy(),
      new BreakoutStrategy(),
      new TrendFollowingStrategy(),
      new ScalpingStrategy(),
      new VolumeWeightedStrategy(),
    ];

    this.defaultConfig = {
      Momentum: { enabled: true, weight: 1.0, minConfidence: 0.30, params: {} },
      MeanReversion: { enabled: true, weight: 0.8, minConfidence: 0.35, params: {} },
      Breakout: { enabled: true, weight: 0.9, minConfidence: 0.35, params: {} },
      TrendFollowing: { enabled: true, weight: 1.2, minConfidence: 0.40, params: {} },
      Scalping: { enabled: true, weight: 0.6, minConfidence: 0.25, params: {} },
      VolumeWeighted: { enabled: true, weight: 1.0, minConfidence: 0.30, params: {} },
    };
  }

  /** Dynamically adjust strategy weights based on market regime */
  private adjustWeights(analysis: FullAnalysis): Record<string, StrategyConfig> {
    const weights = { ...this.defaultConfig };

    switch (analysis.marketRegime) {
      case 'TRENDING_UP':
      case 'TRENDING_DOWN':
        weights.TrendFollowing.weight = 1.8;
        weights.Momentum.weight = 1.4;
        weights.MeanReversion.weight = 0.3;
        weights.Scalping.weight = 0.4;
        weights.VolumeWeighted.weight = 1.0;
        break;
      case 'RANGING':
        weights.MeanReversion.weight = 1.5;
        weights.Scalping.weight = 1.2;
        weights.TrendFollowing.weight = 0.4;
        weights.Breakout.weight = 0.5;
        weights.VolumeWeighted.weight = 1.3;
        break;
      case 'VOLATILE':
        weights.Breakout.weight = 1.5;
        weights.Momentum.weight = 1.2;
        weights.TrendFollowing.weight = 0.6;
        weights.VolumeWeighted.weight = 1.2;
        break;
      case 'BREAKOUT':
        weights.Breakout.weight = 2.0;
        weights.Momentum.weight = 1.3;
        weights.MeanReversion.weight = 0.2;
        weights.VolumeWeighted.weight = 1.5;
        break;
      case 'REVERSAL':
        weights.MeanReversion.weight = 1.5;
        weights.Momentum.weight = 1.0;
        weights.TrendFollowing.weight = 0.5;
        weights.VolumeWeighted.weight = 1.4;
        break;
    }

    return weights;
  }

  /** Run all strategies and produce ensemble result */
  runAll(candles: Candle[], analysis: FullAnalysis, config?: any): EnsembleResult {
    const weights = this.adjustWeights(analysis);
    const strategySignals: StrategySignal[] = [];
    let totalBullWeight = 0;
    let totalBearWeight = 0;
    let totalWeight = 0;
    const allReasons: string[] = [];

    for (const strategy of this.strategies) {
      const stratConfig = weights[strategy.name] || { enabled: true, weight: 1, minConfidence: 0.3, params: {} };

      if (!stratConfig.enabled) continue;

      const signal = strategy.analyze(candles, analysis, stratConfig as StrategyConfig);

      // Filter by minimum confidence
      if (signal.confidence < stratConfig.minConfidence && signal.direction !== 'NEUTRAL') {
        signal.direction = 'NEUTRAL';
      }

      strategySignals.push(signal);
      const weight = stratConfig.weight * signal.confidence;

      if (signal.direction === 'LONG') {
        totalBullWeight += weight;
        allReasons.push(...signal.reasons.map(r => `[${strategy.name}] ${r}`));
      } else if (signal.direction === 'SHORT') {
        totalBearWeight += weight;
        allReasons.push(...signal.reasons.map(r => `[${strategy.name}] ${r}`));
      }
      totalWeight += stratConfig.weight;
    }

    // Determine final signal with dynamic thresholds
    const netScore = totalBullWeight - totalBearWeight;
    const activeSignals = strategySignals.filter(s => s.direction !== 'NEUTRAL');
    const agreeingSignals = strategySignals.filter(s =>
      s.direction !== 'NEUTRAL' &&
      ((netScore > 0 && s.direction === 'LONG') || (netScore < 0 && s.direction === 'SHORT'))
    );
    const confluenceCount = agreeingSignals.length;

    let finalSignal: 'LONG' | 'SHORT' | 'NEUTRAL';
    let confidence: number;

    // Dynamic threshold based on confluence — LOWERED to allow more trades
    // Reference: reco-trading uses 0.45 confidence min, never blocks on threshold alone
    const dynamicThreshold = confluenceCount >= 3 ? 0.01 : confluenceCount >= 2 ? 0.03 : 0.06;

    if (Math.abs(netScore) < dynamicThreshold || confluenceCount === 0) {
      finalSignal = 'NEUTRAL';
      confidence = 0.3;
    } else {
      finalSignal = netScore > 0 ? 'LONG' : 'SHORT';

      // Base confidence from score magnitude
      confidence = 0.30 + Math.abs(netScore) / totalWeight * 0.65;

      // Confluence bonus: more strategies agreeing = higher confidence
      if (confluenceCount >= 4) confidence += 0.12;
      else if (confluenceCount >= 3) confidence += 0.08;
      else if (confluenceCount >= 2) confidence += 0.04;

      // Regime bonus: in trending/breakout markets, trust signals more
      if (analysis.marketRegime === 'TRENDING_UP' || analysis.marketRegime === 'TRENDING_DOWN') {
        if (confluenceCount >= 2) confidence += 0.05;
      } else if (analysis.marketRegime === 'BREAKOUT' && confluenceCount >= 2) {
        confidence += 0.05;
      }

      confidence = Math.min(0.95, Math.max(0.30, confidence));
    }

    // Weighted average SL/TP from non-neutral signals
    let sl = analysis.suggestedSL;
    let tp = analysis.suggestedTP;
    if (activeSignals.length > 0) {
      const avgSL = activeSignals.reduce((s, sig) => s + sig.sl, 0) / activeSignals.length;
      const avgTP = activeSignals.reduce((s, sig) => s + sig.tp, 0) / activeSignals.length;
      sl = +avgSL.toFixed(2);
      tp = +avgTP.toFixed(2);
    }

    // Deduplicate reasons (keep first occurrence)
    const uniqueReasons = [...new Set(allReasons)].slice(0, 10);

    return {
      finalSignal,
      confidence: +confidence.toFixed(2),
      strategySignals,
      weightedScore: +netScore.toFixed(3),
      reasons: uniqueReasons,
      sl,
      tp,
    };
  }
}
