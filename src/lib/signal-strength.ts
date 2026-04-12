// ============================================
// RECO-TRADING - Signal Strength Evaluator
// ============================================
// Evaluates the strength of a trading signal
// to determine burst mode activation
// ============================================

export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG' | 'EXTREME';

export interface SignalStrengthResult {
  level: SignalStrength;
  score: number;              // 0-100
  recommendedTrades: number;  // how many trades to execute
  totalExposurePct: number;   // % of balance to expose
  riskPerTrade: number;       // % of balance per individual trade
  shouldTriggerBurst: boolean;
  reasons: string[];
}

export function evaluateSignalStrength(params: {
  ensembleConfidence: number;
  mlConfidence: number;
  confluenceScore: number;
  marketConfidence: number;
  adx: number;
  volumeRatio: number;
  atrPct: number;
  alignedTimeframes: number;
}): SignalStrengthResult {
  // Weighting: ensemble 30%, ML 20%, confluence 20%, market 15%,
  //            ADX 5%, volume 5%, ATR 3%, TF alignment 2%
  const score = Math.min(100, Math.max(0, (
    params.ensembleConfidence * 30 +
    params.mlConfidence * 20 +
    (params.confluenceScore / 100) * 20 +
    params.marketConfidence * 15 +
    Math.min(params.adx / 50, 1) * 5 +
    Math.min(params.volumeRatio / 3, 1) * 5 +
    (params.atrPct >= 0.3 && params.atrPct <= 3 ? 3 : 0) +
    (params.alignedTimeframes / 4) * 2
  )));

  let level: SignalStrength;
  let recommendedTrades: number;
  let totalExposurePct: number;
  let riskPerTrade: number;

  if (score >= 90) {
    level = 'EXTREME';
    recommendedTrades = 15;
    totalExposurePct = 15;
    riskPerTrade = 1.0;
  } else if (score >= 78) {
    level = 'VERY_STRONG';
    recommendedTrades = 10;
    totalExposurePct = 10;
    riskPerTrade = 1.0;
  } else if (score >= 65) {
    level = 'STRONG';
    recommendedTrades = 5;
    totalExposurePct = 6;
    riskPerTrade = 1.2;
  } else if (score >= 50) {
    level = 'MODERATE';
    recommendedTrades = 2;
    totalExposurePct = 3;
    riskPerTrade = 1.5;
  } else {
    level = 'WEAK';
    recommendedTrades = 1;
    totalExposurePct = 1.5;
    riskPerTrade = 1.5;
  }

  return {
    level,
    score,
    recommendedTrades,
    totalExposurePct,
    riskPerTrade,
    shouldTriggerBurst: score >= 65,
    reasons: [
      `Ensemble: ${(params.ensembleConfidence * 100).toFixed(0)}%`,
      `ML: ${(params.mlConfidence * 100).toFixed(0)}%`,
      `Confluence: ${params.confluenceScore.toFixed(1)}`,
      `Market: ${(params.marketConfidence * 100).toFixed(0)}%`,
      `ADX: ${params.adx.toFixed(1)}`,
      `Volume: ${params.volumeRatio.toFixed(1)}x`,
    ],
  };
}
