// ============================================
// RECO-TRADING - ML Dynamic Trainer v1.0
// ============================================
// Descarga datos del broker y entrena el modelo ML en tiempo real
// Soporta entrenamiento incremental y re-entrenamiento completo
// ============================================

import { getKlines } from './broker-manager';
import { Candle } from './analysis-engine';
import { calculateRSI, calculateEMA, calculateATR, MarketRegime } from './scalping-engine';

export interface MLCandleFeature {
  time: number;
  pair: string;
  rsi: number;
  emaDiff: number;
  emaDiffMomentum: number;
  atrPercent: number;
  volumeRatio: number;
  priceMomentum: number;
  regime: number;
  label: number;  // 1 = price went up next 3 candles, 0 = down or flat
}

export interface TrainingResult {
  success: boolean;
  samples: number;
  accuracy: number;
  weights: MLWeights;
  timestamp: number;
  pairs: string[];
  timeframe: string;
  error?: string;
}

export interface MLWeights {
  intercept: number;
  rsi: number;
  emaDiff: number;
  atrPercent: number;
  volumeRatio: number;
  spreadPercent: number;
  priceMomentum: number;
  regime: number;
  rsiMomentum: number;
}

const DEFAULT_WEIGHTS: MLWeights = {
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

const TRAINED_WEIGHTS_KEY = 'reco_ml_trained_weights';
const TRAINING_STATS_KEY = 'reco_ml_training_stats';
const POPULAR_PAIRS = ['XAU_USD', 'XAG_USD', 'EUR_USD', 'GBP_USD', 'USD_JPY', 'WTI_USD', 'US30_USD', 'NAS100_USD'];

let currentWeights: MLWeights = { ...DEFAULT_WEIGHTS };
let isTraining = false;
let lastTrainingTime = 0;

export function getCurrentWeights(): MLWeights {
  return { ...currentWeights };
}

export function setCurrentWeights(weights: MLWeights): void {
  currentWeights = { ...weights };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TRAINED_WEIGHTS_KEY, JSON.stringify(weights));
    }
  } catch { /* ignore storage errors */ }
}

export function loadSavedWeights(): MLWeights {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(TRAINED_WEIGHTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.intercept === 'number') {
          currentWeights = parsed;
          console.log('[ML] Loaded saved weights from localStorage');
          return parsed;
        }
      }
    }
  } catch { /* ignore errors */ }
  return DEFAULT_WEIGHTS;
}

async function fetchHistoricalData(
  pair: string,
  timeframe: string,
  candles: number
): Promise<Candle[]> {
  try {
    const data = await getKlines(pair, timeframe, candles);
    return data.map(k => ({
      time: k.time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
    }));
  } catch (error) {
    console.warn(`[ML] Failed to fetch ${pair} ${timeframe}: ${error}`);
    return [];
  }
}

function extractFeatures(candles: Candle[], idx: number): MLCandleFeature | null {
  if (idx < 25 || idx >= candles.length - 3) return null;

  const slice = candles.slice(0, idx + 1);
  const closes = slice.map(c => c.close);
  const currentPrice = closes[closes.length - 1];

  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const rsiValues = calculateRSI(closes, 14);
  const atrValues = calculateATR(slice, 14);

  if (ema9.length < 2 || rsiValues.length < 2 || atrValues.length < 2) return null;

  const ema9Val = ema9[ema9.length - 1];
  const ema21Val = ema21[ema21.length - 1];
  const rsiVal = rsiValues[rsiValues.length - 1];
  const rsiPrev = rsiValues[rsiValues.length - 2];
  const atrVal = atrValues[atrValues.length - 1];
  const atrPercent = (atrVal / currentPrice) * 100;

  const emaDiff = (ema9Val - ema21Val) / ema21Val;
  const emaDiffPrev = (ema9[ema9.length - 2] - ema21[ema21.length - 2]) / ema21[ema21.length - 2];
  const emaDiffMomentum = emaDiff - emaDiffPrev;

  let priceMomentum = 0;
  if (closes.length >= 4) {
    const last3 = closes.slice(-3);
    priceMomentum = (last3[2] - last3[0]) / last3[0];
  }

  const avgVolume = slice.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
  const volumeRatio = slice[slice.length - 1].volume / avgVolume;

  const futureClose = candles[idx + 3].close;
  const label = futureClose > currentPrice ? 1 : 0;

  let regimeNum = 0;
  if (ema9Val > ema21Val && ema21Val > currentPrice * 0.99) regimeNum = 1;
  else if (ema9Val < ema21Val && ema21Val < currentPrice * 1.01) regimeNum = 2;

  return {
    time: candles[idx].time,
    pair: '',
    rsi: rsiVal,
    emaDiff,
    emaDiffMomentum,
    atrPercent,
    volumeRatio,
    priceMomentum,
    regime: regimeNum,
    label,
  };
}

export async function trainModel(
  pairs: string[] = POPULAR_PAIRS.slice(0, 5),
  timeframe: string = '5m',
  candlesPerPair: number = 200,
  minSamples: number = 50
): Promise<TrainingResult> {
  if (isTraining) {
    return { success: false, samples: 0, accuracy: 0, weights: currentWeights, timestamp: lastTrainingTime, pairs: [], timeframe: '', error: 'Training already in progress' };
  }

  isTraining = true;
  console.log(`[ML] Starting training with ${pairs.length} pairs, ${candlesPerPair} candles each...`);

  const allFeatures: MLCandleFeature[] = [];

  try {
    for (const pair of pairs) {
      const candles = await fetchHistoricalData(pair, timeframe, candlesPerPair);
      if (candles.length < 30) continue;

      for (let i = 25; i < candles.length - 3; i++) {
        const feature = extractFeatures(candles, i);
        if (feature) {
          feature.pair = pair;
          allFeatures.push(feature);
        }
      }
    }

    if (allFeatures.length < minSamples) {
      isTraining = false;
      return { success: false, samples: allFeatures.length, accuracy: 0, weights: currentWeights, timestamp: lastTrainingTime, pairs, timeframe, error: `Insufficient samples: ${allFeatures.length} < ${minSamples}` };
    }

    const newWeights = logisticRegressionTrain(allFeatures);
    const accuracy = evaluateModel(allFeatures, newWeights);

    currentWeights = newWeights;
    setCurrentWeights(newWeights);
    lastTrainingTime = Date.now();

    console.log(`[ML] Training complete! Samples: ${allFeatures.length}, Accuracy: ${(accuracy * 100).toFixed(1)}%`);

    saveTrainingStats({
      samples: allFeatures.length,
      accuracy,
      timestamp: lastTrainingTime,
      pairs,
      timeframe,
    });

    isTraining = false;
    return { success: true, samples: allFeatures.length, accuracy, weights: newWeights, timestamp: lastTrainingTime, pairs, timeframe };
  } catch (error) {
    isTraining = false;
    return { success: false, samples: allFeatures.length, accuracy: 0, weights: currentWeights, timestamp: lastTrainingTime, pairs: [], timeframe: '', error: String(error) };
  }
}

function logisticRegressionTrain(features: MLCandleFeature[]): MLWeights {
  const learningRate = 0.01;
  const iterations = 100;
  
  let weights: MLWeights = { ...DEFAULT_WEIGHTS };
  const labels = features.map(f => f.label);
  
  for (let iter = 0; iter < iterations; iter++) {
    const gradients = { intercept: 0, rsi: 0, emaDiff: 0, atrPercent: 0, volumeRatio: 0, spreadPercent: 0, priceMomentum: 0, regime: 0, rsiMomentum: 0 };
    let totalError = 0;

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const x = [
        1,
        f.rsi / 100,
        f.emaDiff * 10,
        f.atrPercent,
        f.volumeRatio,
        0.05,
        f.priceMomentum * 100,
        f.regime / 2,
        f.emaDiffMomentum * 10,
      ];
      
      const w = [weights.intercept, weights.rsi, weights.emaDiff, weights.atrPercent, weights.volumeRatio, weights.spreadPercent, weights.priceMomentum, weights.regime, weights.rsiMomentum];
      
      let z = 0;
      for (let j = 0; j < x.length; j++) {
        z += x[j] * w[j];
      }
      
      const pred = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
      const error = pred - labels[i];
      totalError += Math.abs(error);

      gradients.intercept += error * x[0];
      gradients.rsi += error * x[1];
      gradients.emaDiff += error * x[2];
      gradients.atrPercent += error * x[3];
      gradients.volumeRatio += error * x[4];
      gradients.spreadPercent += error * x[5];
      gradients.priceMomentum += error * x[6];
      gradients.regime += error * x[7];
      gradients.rsiMomentum += error * x[8];
    }

    const n = features.length;
    weights.intercept -= learningRate * gradients.intercept / n;
    weights.rsi -= learningRate * gradients.rsi / n;
    weights.emaDiff -= learningRate * gradients.emaDiff / n;
    weights.atrPercent -= learningRate * gradients.atrPercent / n;
    weights.volumeRatio -= learningRate * gradients.volumeRatio / n;
    weights.spreadPercent -= learningRate * gradients.spreadPercent / n;
    weights.priceMomentum -= learningRate * gradients.priceMomentum / n;
    weights.regime -= learningRate * gradients.regime / n;
    weights.rsiMomentum -= learningRate * gradients.rsiMomentum / n;
  }

  return weights;
}

function evaluateModel(features: MLCandleFeature[], weights: MLWeights): number {
  let correct = 0;
  for (const f of features) {
    const x = [1, f.rsi / 100, f.emaDiff * 10, f.atrPercent, f.volumeRatio, 0.05, f.priceMomentum * 100, f.regime / 2, f.emaDiffMomentum * 10];
    const w = [weights.intercept, weights.rsi, weights.emaDiff, weights.atrPercent, weights.volumeRatio, weights.spreadPercent, weights.priceMomentum, weights.regime, weights.rsiMomentum];
    
    let z = 0;
    for (let j = 0; j < x.length; j++) {
      z += x[j] * w[j];
    }
    
    const pred = z > 0 ? 1 : 0;
    if (pred === f.label) correct++;
  }
  return correct / features.length;
}

export function predictWithTrainedModel(features: {
  rsi: number;
  emaDiff: number;
  emaDiffMomentum: number;
  atrPercent: number;
  volumeRatio: number;
  spreadPercent: number;
  priceMomentum: number;
  regime: number;
}): { probability: number; confidence: number } {
  const w = currentWeights;
  const x = [1, features.rsi / 100, features.emaDiff * 10, features.atrPercent, features.volumeRatio, features.spreadPercent, features.priceMomentum * 100, features.regime / 2, features.emaDiffMomentum * 10];
  const weights = [w.intercept, w.rsi, w.emaDiff, w.atrPercent, w.volumeRatio, w.spreadPercent, w.priceMomentum, w.regime, w.rsiMomentum];
  
  let z = 0;
  for (let j = 0; j < x.length; j++) {
    z += x[j] * weights[j];
  }
  
  const probability = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
  const confidence = Math.abs(probability - 0.5) * 2;
  
  return { probability, confidence: Math.min(1, confidence) };
}

interface TrainingStats {
  samples: number;
  accuracy: number;
  timestamp: number;
  pairs: string[];
  timeframe: string;
}

function saveTrainingStats(stats: TrainingStats): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TRAINING_STATS_KEY, JSON.stringify(stats));
    }
  } catch { /* ignore */ }
}

export function getTrainingStats(): TrainingStats | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(TRAINING_STATS_KEY);
      if (saved) return JSON.parse(saved);
    }
  } catch { /* ignore */ }
  return null;
}

export function resetToDefaultWeights(): void {
  currentWeights = { ...DEFAULT_WEIGHTS };
  setCurrentWeights(DEFAULT_WEIGHTS);
  console.log('[ML] Weights reset to defaults');
}

export function isModelTrained(): boolean {
  const stats = getTrainingStats();
  return stats !== null && stats.samples > 0;
}

export function getTrainingStatus(): { isTraining: boolean; lastTraining: number; isTrained: boolean; samples: number; accuracy: number } {
  const stats = getTrainingStats();
  return {
    isTraining,
    lastTraining: lastTrainingTime,
    isTrained: isModelTrained(),
    samples: stats?.samples || 0,
    accuracy: stats?.accuracy || 0,
  };
}

export async function quickRetrain(): Promise<TrainingResult> {
  return trainModel(POPULAR_PAIRS.slice(0, 3), '5m', 150, 30);
}

export async function fullRetrain(): Promise<TrainingResult> {
  return trainModel(POPULAR_PAIRS, '1m', 300, 100);
}
