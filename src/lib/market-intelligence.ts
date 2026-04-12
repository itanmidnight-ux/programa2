// ============================================
// RECO-TRADING - Market Intelligence Module
// ============================================
// Inspired by the reference reco-trading repo.
// Provides volatility regime classification,
// dynamic threshold adaptation, and confidence
// scoring with conflict detection — all designed
// to let the bot ACTUALLY TRADE while still
// protecting against dangerous conditions.
// ============================================

import type { FullAnalysis } from './analysis-engine';

// ---- Types ----

export type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH';
export type MarketRegime = 'STABLE' | 'RANGING' | 'VOLATILE' | 'TRENDING' | 'MODERATE';

export interface RegimeDecision {
  regime: VolatilityRegime;
  atrRatio: number;
  allowTrade: boolean;
  sizeMultiplier: number;
  reason: string;
}

export interface AdaptedThresholds {
  adxMin: number;
  confidenceMin: number;
  rsiBuy: number;
  rsiSell: number;
  volumeMin: number;
  sizeMultiplier: number;
  regime: MarketRegime;
  allowScalping: boolean;
}

export interface ConfidenceVote {
  trend: number;
  momentum: number;
  volume: number;
  structure: number;
  orderFlow: number;
  volatility: number;
}

export interface ConfidenceResult {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  buyScore: number;
  sellScore: number;
  conflictPenalty: number;
  grade: 'EXCEPTIONAL' | 'STRONG' | 'ACTIONABLE' | 'WEAK' | 'VERY_WEAK';
  factorsAgreeing: number;
}

// ---- Volatility Regime Filter ----
// ATR/price ratio determines if market is tradeable.
// Ported from reference: regime_filter.py

const ATR_RATIOS = {
  LOW_THRESHOLD: 0.003,    // ATR/price < 0.3% → dead market
  NORMAL_LOW: 0.003,       // 0.3% – 1.8% → normal
  NORMAL_HIGH: 0.018,
  HIGH_THRESHOLD: 0.018,   // > 1.8% → volatile but tradeable
} as const;

export function classifyVolatilityRegime(atr: number, price: number): RegimeDecision {
  const atrRatio = price > 0 ? atr / price : 0;

  if (atrRatio < ATR_RATIOS.LOW_THRESHOLD) {
    return {
      regime: 'LOW',
      atrRatio,
      allowTrade: false,
      sizeMultiplier: 0,
      reason: `ATR/price ${((atrRatio) * 100).toFixed(3)}% — mercado sin movimiento, no operable`,
    };
  }

  if (atrRatio > ATR_RATIOS.HIGH_THRESHOLD) {
    return {
      regime: 'HIGH',
      atrRatio,
      allowTrade: true,
      sizeMultiplier: 0.60,
      reason: `ATR/price ${((atrRatio) * 100).toFixed(3)}% — volatilidad alta, tamaño reducido`,
    };
  }

  return {
    regime: 'NORMAL',
    atrRatio,
    allowTrade: true,
    sizeMultiplier: 1.0,
    reason: `ATR/price ${((atrRatio) * 100).toFixed(3)}% — volatilidad normal`,
  };
}

// ---- Market Regime Adaptation ----
// Dynamically adjusts trading thresholds based on detected market regime.
// Ported from reference: market_adaptation.py

export function detectMarketRegime(analysis: FullAnalysis): MarketRegime {
  const { adx, atrPct, marketRegime, trend } = analysis;

  // Use existing regime from analysis as primary signal
  // but refine it with ADX and ATR data
  if (adx > 30 && (trend === 'STRONG_UP' || trend === 'STRONG_DOWN')) {
    return 'TRENDING';
  }

  if (atrPct > 2.5) {
    return 'VOLATILE';
  }

  if (adx < 15 && atrPct < 1.0) {
    return 'STABLE';
  }

  if (adx < 20) {
    return 'RANGING';
  }

  return 'MODERATE';
}

export function getAdaptedThresholds(analysis: FullAnalysis): AdaptedThresholds {
  const regime = detectMarketRegime(analysis);

  switch (regime) {
    case 'STABLE':
      return {
        adxMin: 10,
        confidenceMin: 0.30,
        rsiBuy: 48,
        rsiSell: 52,
        volumeMin: 0.60,
        sizeMultiplier: 1.0,
        regime: 'STABLE',
        allowScalping: true,
      };
    case 'RANGING':
      return {
        adxMin: 12,
        confidenceMin: 0.32,
        rsiBuy: 45,
        rsiSell: 55,
        volumeMin: 0.65,
        sizeMultiplier: 0.90,
        regime: 'RANGING',
        allowScalping: true,
      };
    case 'VOLATILE':
      return {
        adxMin: 20,
        confidenceMin: 0.55,
        rsiBuy: 40,
        rsiSell: 60,
        volumeMin: 0.80,
        sizeMultiplier: 0.65,
        regime: 'VOLATILE',
        allowScalping: false,
      };
    case 'TRENDING':
      return {
        adxMin: 15,
        confidenceMin: 0.35,
        rsiBuy: 42,
        rsiSell: 58,
        volumeMin: 0.70,
        sizeMultiplier: 1.10,
        regime: 'TRENDING',
        allowScalping: false,
      };
    case 'MODERATE':
    default:
      return {
        adxMin: 14,
        confidenceMin: 0.35,
        rsiBuy: 45,
        rsiSell: 55,
        volumeMin: 0.70,
        sizeMultiplier: 1.0,
        regime: 'MODERATE',
        allowScalping: true,
      };
  }
}

// ---- Confidence Model with Conflict Detection ----
// Weighted voting with conflict penalty.
// Ported from reference: confidence_model.py

const FACTOR_WEIGHTS = {
  trend: 0.30,
  momentum: 0.20,
  orderFlow: 0.20,
  structure: 0.14,
  volume: 0.08,
  volatility: 0.08,
} as const;

export function computeConfidenceVote(analysis: FullAnalysis): ConfidenceVote {
  const vote: ConfidenceVote = { trend: 0, momentum: 0, volume: 0, structure: 0, orderFlow: 0, volatility: 0 };

  // --- Trend (30%) ---
  // EMA direction + ADX strength
  if (analysis.trend === 'STRONG_UP') vote.trend = 1.0;
  else if (analysis.trend === 'UP') vote.trend = 0.7;
  else if (analysis.trend === 'STRONG_DOWN') vote.trend = -1.0;
  else if (analysis.trend === 'DOWN') vote.trend = -0.7;
  // ADX modulation: stronger trend = higher conviction
  if (analysis.adx > 25) vote.trend *= 1.2;
  else if (analysis.adx < 15) vote.trend *= 0.5;

  // --- Momentum (20%) ---
  // RSI + MACD
  const rsiMid = 50;
  const rsiDev = (analysis.rsi - rsiMid) / 50; // -1 to 1
  vote.momentum = rsiDev * 0.6; // RSI contributes 60%
  if (analysis.macd.histogram > 0) vote.momentum += 0.2;
  else if (analysis.macd.histogram < 0) vote.momentum -= 0.2;
  if (analysis.macd.crossover === 'BULLISH') vote.momentum += 0.2;
  else if (analysis.macd.crossover === 'BEARISH') vote.momentum -= 0.2;

  // --- Volume (8%) ---
  if (analysis.volumeRatio > 1.5) vote.volume = 0.8;
  else if (analysis.volumeRatio > 1.0) vote.volume = 0.3;
  else if (analysis.volumeRatio < 0.5) vote.volume = -0.5;
  // Volume direction awareness
  if (analysis.volumeTrend === 'INCREASING') vote.volume *= 1.3;

  // --- Structure (14%) ---
  // Higher highs/lows pattern
  if (analysis.higherHighs && analysis.lowerLows) vote.structure = 0.8;
  else if (analysis.higherHighs) vote.structure = 0.4;
  else if (analysis.lowerLows) vote.structure = -0.4;
  // SuperTrend confirmation
  if (analysis.supertrend.direction === 'UP') vote.structure += 0.2;
  else if (analysis.supertrend.direction === 'DOWN') vote.structure -= 0.2;

  // --- Order Flow (20%) ---
  // Buy/sell pressure normalized
  const pressureNet = (analysis.buyPressure - analysis.sellPressure) / 100; // -1 to 1
  vote.orderFlow = pressureNet;
  if (analysis.orderFlow === 'STRONG_BUY') vote.orderFlow += 0.3;
  else if (analysis.orderFlow === 'STRONG_SELL') vote.orderFlow -= 0.3;

  // --- Volatility (8%) ---
  // Ideal range: moderate ATR → favorable, extreme → unfavorable
  if (analysis.atrPct >= 0.3 && analysis.atrPct <= 1.8) vote.volatility = 0.5;
  else if (analysis.atrPct > 1.8 && analysis.atrPct <= 3.0) vote.volatility = 0.2;
  else if (analysis.atrPct > 3.0) vote.volatility = -0.5;
  else if (analysis.atrPct < 0.3) vote.volatility = -0.8;

  // Clamp all values to [-1, 1]
  for (const key of Object.keys(vote) as (keyof ConfidenceVote)[]) {
    vote[key] = Math.max(-1, Math.min(1, vote[key]));
  }

  return vote;
}

export function calculateConfidence(vote: ConfidenceVote): ConfidenceResult {
  // Weighted scores
  let buyScore = 0;
  let sellScore = 0;

  for (const [factor, weight] of Object.entries(FACTOR_WEIGHTS)) {
    const val = vote[factor as keyof ConfidenceVote];
    if (val > 0) buyScore += val * weight;
    else if (val < 0) sellScore += Math.abs(val) * weight;
  }

  // Conflict penalty: 50% of opposing score subtracted from dominant side
  const conflictPenalty = Math.min(buyScore, sellScore) * 0.5;
  const adjustedBuy = buyScore - conflictPenalty;
  const adjustedSell = sellScore - conflictPenalty;

  // Count how many factors agree on a direction
  let factorsAgreeing = 0;
  for (const val of Object.values(vote)) {
    if (val > 0.1) factorsAgreeing++;
    else if (val < -0.1) factorsAgreeing--;
  }

  // Determine direction and confidence
  let direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  let confidence: number;

  if (adjustedBuy > 0.05 && adjustedBuy > adjustedSell) {
    direction = 'LONG';
    confidence = Math.min(0.95, adjustedBuy * 1.5);
  } else if (adjustedSell > 0.05 && adjustedSell > adjustedBuy) {
    direction = 'SHORT';
    confidence = Math.min(0.95, adjustedSell * 1.5);
  } else {
    direction = 'NEUTRAL';
    confidence = 0.15;
  }

  // Minimum 2 factors must agree (from reference: min_factors_agreement)
  const absFactors = Math.abs(factorsAgreeing);
  if (absFactors < 2) {
    direction = 'NEUTRAL';
    confidence = 0.15;
  }

  // Grade
  let grade: ConfidenceResult['grade'];
  if (confidence >= 0.85) grade = 'EXCEPTIONAL';
  else if (confidence >= 0.75) grade = 'STRONG';
  else if (confidence >= 0.55) grade = 'ACTIONABLE';
  else if (confidence >= 0.35) grade = 'WEAK';
  else grade = 'VERY_WEAK';

  return {
    direction,
    confidence: +confidence.toFixed(3),
    buyScore: +adjustedBuy.toFixed(3),
    sellScore: +adjustedSell.toFixed(3),
    conflictPenalty: +conflictPenalty.toFixed(3),
    grade,
    factorsAgreeing: absFactors,
  };
}

// ---- Confluence Score ----
// Multi-timeframe alignment check.
// Ported from reference: confluence.py

export function computeConfluence(
  analysis5m: FullAnalysis,
  analysis15m?: FullAnalysis | null,
): { score: number; aligned: boolean; dominantSide: string; notes: string[] } {
  const notes: string[] = [];
  let alignmentScore = 0;
  let maxScore = 0;

  if (!analysis15m) {
    // No 15m data — use only 5m analysis with reduced weight
    return {
      score: 0.6,
      aligned: false,
      dominantSide: 'NONE',
      notes: ['Sin datos de 15m, confluencia parcial'],
    };
  }

  // 1. Trend alignment (weight: 30%)
  maxScore += 30;
  const trend5m = analysis5m.trend.includes('UP') ? 'LONG' : analysis5m.trend.includes('DOWN') ? 'SHORT' : 'NEUTRAL';
  const trend15m = analysis15m.trend.includes('UP') ? 'LONG' : analysis15m.trend.includes('DOWN') ? 'SHORT' : 'NEUTRAL';
  if (trend5m === trend15m && trend5m !== 'NEUTRAL') {
    alignmentScore += 30;
    notes.push(`Tendencia alineada: ${trend5m} (5m+15m)`);
  } else if (trend5m !== 'NEUTRAL' && trend15m !== 'NEUTRAL') {
    notes.push(`Tendencia divergente: 5m=${trend5m}, 15m=${trend15m}`);
  }

  // 2. RSI alignment (weight: 25%)
  maxScore += 25;
  const rsi5mBullish = analysis5m.rsi < 50;
  const rsi15mBullish = analysis15m.rsi < 50;
  if (rsi5mBullish === rsi15mBullish) {
    alignmentScore += 25;
    notes.push(`RSI alineado: ${rsi5mBullish ? 'alcista' : 'bajista'}`);
  } else {
    notes.push(`RSI divergente: 5m=${analysis5m.rsi.toFixed(0)}, 15m=${analysis15m.rsi.toFixed(0)}`);
  }

  // 3. Momentum alignment (weight: 25%)
  maxScore += 25;
  const mom5mBullish = analysis5m.macd.histogram > 0;
  const mom15mBullish = analysis15m.macd.histogram > 0;
  if (mom5mBullish === mom15mBullish) {
    alignmentScore += 25;
    notes.push(`Momentum (MACD) alineado`);
  }

  // 4. Volatility compatibility (weight: 20%)
  maxScore += 20;
  const atrDiff = Math.abs(analysis5m.atrPct - analysis15m.atrPct);
  if (atrDiff < 0.5) {
    alignmentScore += 20;
    notes.push('Volatilidad compatible entre timeframes');
  } else {
    alignmentScore += 10;
    notes.push('Volatilidad divergente entre timeframes');
  }

  const score = maxScore > 0 ? alignmentScore / maxScore : 0.5;
  const aligned = score >= 0.65;

  // Determine dominant side
  let dominantSide = 'NONE';
  if (trend5m === 'LONG' || trend15m === 'LONG') dominantSide = 'LONG';
  if (trend5m === 'SHORT' || trend15m === 'SHORT') dominantSide = 'SHORT';
  if (trend5m === trend15m && trend5m !== 'NEUTRAL') dominantSide = trend5m;

  return { score, aligned, dominantSide, notes };
}

// ---- Main Entry Point ----
// Combines all market intelligence into a single evaluation.

export interface MarketIntelligenceResult {
  volatilityRegime: RegimeDecision;
  adaptedThresholds: AdaptedThresholds;
  confidence: ConfidenceResult;
  confluence: { score: number; aligned: boolean; notes: string[] };
  shouldTrade: boolean;
  blockReasons: string[];
  sizeMultiplier: number;
  effectiveMinConfidence: number;
}

export function evaluateMarket(
  analysis: FullAnalysis,
  analysis15m?: FullAnalysis | null,
): MarketIntelligenceResult {
  const blockReasons: string[] = [];
  let sizeMultiplier = 1.0;

  // 1. Volatility regime
  const volatilityRegime = classifyVolatilityRegime(analysis.atr, analysis.price);
  if (!volatilityRegime.allowTrade) {
    blockReasons.push(volatilityRegime.reason);
  }
  sizeMultiplier *= volatilityRegime.sizeMultiplier;

  // 2. Market adaptation thresholds
  const adaptedThresholds = getAdaptedThresholds(analysis);
  sizeMultiplier *= adaptedThresholds.sizeMultiplier;

  // 3. Confidence with conflict detection
  const vote = computeConfidenceVote(analysis);
  const confidence = calculateConfidence(vote);

  // 4. Confluence
  const confluence = computeConfluence(analysis, analysis15m);

  // 5. Determine if we should trade
  // Only block for CRITICAL reasons (dead market), not for suboptimal conditions
  let shouldTrade = blockReasons.length === 0;

  // Even with LOW confidence, don't block — just reduce size
  // This is the key difference from the old system: we TRADE with lower confidence
  // instead of blocking entirely
  const effectiveMinConfidence = adaptedThresholds.confidenceMin;

  if (confidence.direction === 'NEUTRAL' && confidence.confidence < 0.20) {
    // Very weak neutral — skip but don't block
    shouldTrade = false;
    blockReasons.push(`Señal muy débil (confianza: ${confidence.confidence.toFixed(2)})`);
  }

  // If confidence is weak, reduce size but still allow
  if (confidence.confidence < 0.40 && confidence.confidence >= 0.20) {
    sizeMultiplier *= 0.6;
  }

  // Confluence bonus/penalty
  if (confluence.aligned) {
    sizeMultiplier *= 1.08; // +8% for aligned timeframes
  } else if (confluence.score < 0.4) {
    sizeMultiplier *= 0.85; // -15% for divergent timeframes
  }

  return {
    volatilityRegime,
    adaptedThresholds,
    confidence,
    confluence,
    shouldTrade,
    blockReasons,
    sizeMultiplier: Math.min(1.5, Math.max(0.1, sizeMultiplier)),
    effectiveMinConfidence,
  };
}
