// ============================================
// AI PREDICTOR - Real-Time Prediction Engine
// ============================================
// Uses trained models to predict price movements
// and integrates predictions with trading strategies

import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import { db } from '@/lib/db';
import { getKlines } from '@/lib/binance';
import { extractFeatures } from './ai-model-trainer';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface PredictionInput {
  pair: string;
  timeframe: string;
  modelVersion?: number;
}

export interface AIPredictionResult {
  pair: string;
  timeframe: string;
  candleTime: Date;

  // Prediction
  prediction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;           // 0-1
  probabilityBuy: number;
  probabilitySell: number;
  probabilityHold: number;

  // Expected
  expectedReturn: number;       // Expected return %
  riskScore: number;            // 0-1

  // Metadata
  modelId: string;
  modelVersion: number;
  features: number[];
  timestamp: Date;
}

export interface CachedModel {
  model: tf.Sequential;
  scaleParams: {
    mean: number[];
    std: number[];
  };
  pair: string;
  timeframe: string;
  version: number;
  lastUsed: Date;
}

// ============================================
// MODEL CACHE
// ============================================

const modelCache = new Map<string, CachedModel>();
const MAX_CACHE_SIZE = 10;
const MODEL_CACHE_TTL = 3600000; // 1 hour

function getCacheKey(pair: string, timeframe: string, version?: number): string {
  return `${pair}_${timeframe}_v${version || 'latest'}`;
}

function cleanupModelCache() {
  const now = Date.now();
  const expired = Array.from(modelCache.entries())
    .filter(([_, cached]) => now - cached.lastUsed.getTime() > MODEL_CACHE_TTL)
    .map(([key, _]) => key);

  expired.forEach(key => {
    const cached = modelCache.get(key);
    if (cached) {
      cached.model.dispose();
      modelCache.delete(key);
    }
  });

  // If cache is too large, remove least recently used
  if (modelCache.size > MAX_CACHE_SIZE) {
    const sorted = Array.from(modelCache.entries())
      .sort((a, b) => a[1].lastUsed.getTime() - b[1].lastUsed.getTime());

    for (let i = 0; i < sorted.length - MAX_CACHE_SIZE; i++) {
      const [key, cached] = sorted[i];
      cached.model.dispose();
      modelCache.delete(key);
    }
  }
}

// ============================================
// LOAD MODELS
// ============================================

/**
 * Loads a model from cache or database
 */
async function loadOrGetModel(
  pair: string,
  timeframe: string,
  version?: number
): Promise<CachedModel> {
  const cacheKey = getCacheKey(pair, timeframe, version);

  // Check cache first
  if (modelCache.has(cacheKey)) {
    const cached = modelCache.get(cacheKey)!;
    cached.lastUsed = new Date();
    return cached;
  }

  // Clean cache if needed
  cleanupModelCache();

  // Load from DB
  console.log(`🔍 Loading model ${cacheKey}...`);

  const dbModel = await db.aIModel.findFirst({
    where: {
      pair,
      timeframe,
      isActive: true,
      ...(version && { version }),
    },
    orderBy: version ? { version: 'desc' } : { trainedAt: 'desc' },
  });

  if (!dbModel) {
    throw new Error(`No active model found for ${pair}/${timeframe}`);
  }

  // Load model from disk
  let model: tf.Sequential;
  try {
    const modelPath = `file://${dbModel.modelPath}/model.json`;
    model = await tf.loadLayersModel(modelPath) as tf.Sequential;
  } catch (error) {
    throw new Error(`Error loading model from ${dbModel.modelPath}: ${error}`);
  }

  // Load scale params
  let scaleParams = {
    mean: new Array(20).fill(0),
    std: new Array(20).fill(1),
  };

  try {
    const scaleParamsPath = dbModel.modelPath.replace('file://', '') + '_scaleParams.json';
    if (fs.existsSync(scaleParamsPath)) {
      const params = JSON.parse(fs.readFileSync(scaleParamsPath, 'utf-8'));
      scaleParams = {
        mean: params.mean || scaleParams.mean,
        std: params.std || scaleParams.std,
      };
    }
  } catch (error) {
    console.warn(`Could not load scale params, using defaults: ${error}`);
  }

  const cached: CachedModel = {
    model,
    scaleParams,
    pair,
    timeframe,
    version: dbModel.version,
    lastUsed: new Date(),
  };

  modelCache.set(cacheKey, cached);

  return cached;
}

// ============================================
// DATA PREPARATION FOR PREDICTION
// ============================================

/**
 * Gets current market features for prediction
 */
async function getFeaturesForPrediction(
  pair: string,
  timeframe: string
): Promise<{ features: number[]; candleTime: Date }> {
  // Get current candles (need at least 100 for feature extraction)
  const candles = await getKlines(pair, timeframe, 100);

  if (!candles || candles.length < 20) {
    throw new Error(`Not enough candles for ${pair}/${timeframe}`);
  }

  // Extract features
  const allFeatures = extractFeatures(candles);
  const features = allFeatures[allFeatures.length - 1]; // Use latest features

  // Get candle time
  const lastCandle = candles[candles.length - 1];
  const candleTime = new Date(lastCandle.time);

  return { features, candleTime };
}

/**
 * Normalizes features using saved scale parameters
 */
function normalizeFeatures(
  features: number[],
  scaleParams: { mean: number[]; std: number[] }
): number[] {
  return features.map((feature, i) => {
    const mean = scaleParams.mean[i] || 0;
    const std = scaleParams.std[i] || 1;
    return (feature - mean) / std;
  });
}

// ============================================
// PREDICTION
// ============================================

/**
 * Makes a prediction using the AI model
 */
export async function predictTrade(
  input: PredictionInput
): Promise<AIPredictionResult> {
  try {
    console.log(`🤖 Predicting for ${input.pair}/${input.timeframe}...`);

    // 1. Load model
    const cached = await loadOrGetModel(input.pair, input.timeframe, input.modelVersion);

    // 2. Get current features
    const { features, candleTime } = await getFeaturesForPrediction(input.pair, input.timeframe);

    // 3. Normalize features
    const normalizedFeatures = normalizeFeatures(features, cached.scaleParams);

    // 4. Make prediction
    const inputTensor = tf.tensor2d([normalizedFeatures]);
    const outputTensor = cached.model.predict(inputTensor) as tf.Tensor;
    const predictions = outputTensor.dataSync();

    const probabilityBuy = predictions[0];
    const probabilitySell = predictions[1];
    const probabilityHold = predictions[2];

    // Determine action
    let prediction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    const confidence = Math.max(probabilityBuy, probabilitySell, probabilityHold);

    if (probabilityBuy > probabilitySell && probabilityBuy > probabilityHold && probabilityBuy > 0.45) {
      prediction = 'BUY';
    } else if (probabilitySell > probabilityBuy && probabilitySell > probabilityHold && probabilitySell > 0.45) {
      prediction = 'SELL';
    } else {
      prediction = 'HOLD';
    }

    // Calculate risk and expected return
    const riskScore = Math.abs(probabilityBuy - probabilitySell) < 0.1 ? 0.7 : 0.3;
    const expectedReturn = (probabilityBuy - probabilitySell) * 0.5; // 0.5% per point of difference

    // Save prediction to DB
    const dbModel = await db.aIModel.findFirst({
      where: {
        pair: input.pair,
        timeframe: input.timeframe,
        isActive: true,
        version: cached.version,
      },
    });

    if (dbModel) {
      await db.aIPrediction.create({
        data: {
          modelId: dbModel.id,
          pair: input.pair,
          timeframe: input.timeframe,
          candleTime,
          prediction,
          confidence,
          probabilityBuy,
          probabilitySell,
          probabilityHold,
          expectedReturn,
          features: JSON.stringify(features),
        },
      });
    }

    // Cleanup tensors
    inputTensor.dispose();
    outputTensor.dispose();

    console.log(`✓ Prediction: ${prediction} (confidence: ${(confidence * 100).toFixed(2)}%)`);

    return {
      pair: input.pair,
      timeframe: input.timeframe,
      candleTime,
      prediction,
      confidence,
      probabilityBuy,
      probabilitySell,
      probabilityHold,
      expectedReturn,
      riskScore,
      modelId: dbModel?.id || '',
      modelVersion: cached.version,
      features,
      timestamp: new Date(),
    };

  } catch (error) {
    console.error(`❌ Error making prediction: ${error}`);
    throw error;
  }
}

// ============================================
// BATCH PREDICTIONS
// ============================================

/**
 * Makes predictions for multiple pairs/timeframes simultaneously
 */
export async function predictMultiple(
  inputs: PredictionInput[]
): Promise<AIPredictionResult[]> {
  const predictions = await Promise.all(
    inputs.map(input =>
      predictTrade(input).catch(error => {
        console.warn(`Prediction failed for ${input.pair}/${input.timeframe}: ${error}`);
        return null;
      })
    )
  );

  return predictions.filter((p): p is AIPredictionResult => p !== null);
}

/**
 * Predicts for all active strategies
 */
export async function predictAllActiveStrategies(): Promise<AIPredictionResult[]> {
  try {
    // Get all active models
    const activeModels = await db.aIModel.findMany({
      where: { isActive: true },
    });

    const inputs = activeModels.map(m => ({
      pair: m.pair,
      timeframe: m.timeframe,
    }));

    return await predictMultiple(inputs);

  } catch (error) {
    console.error(`Error predicting all strategies: ${error}`);
    return [];
  }
}

// ============================================
// PREDICTION ANALYSIS
// ============================================

/**
 * Gets historical accuracy of a model
 */
export async function getModelAccuracy(
  pair: string,
  timeframe: string,
  days: number = 7
): Promise<{
  accuracy: number;
  totalPredictions: number;
  correctPredictions: number;
  windowStart: Date;
  windowEnd: Date;
}> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - days);
  const windowEnd = new Date();

  const predictions = await db.aIPrediction.findMany({
    where: {
      pair,
      timeframe,
      createdAt: { gte: windowStart, lte: windowEnd },
      isCorrect: { not: null },
    },
  });

  const correctPredictions = predictions.filter(p => p.isCorrect === true).length;
  const accuracy = predictions.length > 0 ? correctPredictions / predictions.length : 0;

  return {
    accuracy,
    totalPredictions: predictions.length,
    correctPredictions,
    windowStart,
    windowEnd,
  };
}

/**
 * Compares prediction vs actual result
 */
export async function resolvePredictions(
  pair: string,
  timeframe: string,
  candleTime: Date
): Promise<void> {
  try {
    // Get next candle to compare
    const currentCandles = await getKlines(pair, timeframe, 2);

    if (currentCandles.length < 2) return;

    const previousCandle = currentCandles[currentCandles.length - 2];
    const currentCandle = currentCandles[currentCandles.length - 1];

    const priceChange = currentCandle.close - previousCandle.close;
    const actualResult = priceChange > 0 ? 'UP' : priceChange < 0 ? 'DOWN' : 'FLAT';

    // Update unresolved predictions
    const unresolvedPredictions = await db.aIPrediction.findMany({
      where: {
        pair,
        timeframe,
        resolvedAt: null,
      },
    });

    for (const prediction of unresolvedPredictions) {
      const isCorrect =
        (prediction.prediction === 'BUY' && actualResult === 'UP') ||
        (prediction.prediction === 'SELL' && actualResult === 'DOWN') ||
        (prediction.prediction === 'HOLD' && actualResult === 'FLAT');

      await db.aIPrediction.update({
        where: { id: prediction.id },
        data: {
          actualResult,
          isCorrect,
          actualReturn: (priceChange / previousCandle.close) * 100,
          resolvedAt: new Date(),
        },
      });
    }

  } catch (error) {
    console.warn(`Error resolving predictions: ${error}`);
  }
}

// ============================================
// ENSEMBLE PREDICTIONS
// ============================================

/**
 * Combines predictions from multiple timeframes for higher confidence
 */
export async function getEnsemblePrediction(
  pair: string,
  timeframes: string[] = ['1m', '5m', '15m']
): Promise<{
  prediction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  buyScore: number;
  sellScore: number;
  details: AIPredictionResult[];
}> {
  try {
    const predictions = await Promise.all(
      timeframes.map(tf => predictTrade({ pair, timeframe: tf }))
    );

    let buyVotes = 0, sellVotes = 0, holdVotes = 0;
    let totalConfidence = 0;

    for (const pred of predictions) {
      if (pred.prediction === 'BUY') buyVotes += pred.confidence;
      else if (pred.prediction === 'SELL') sellVotes += pred.confidence;
      else holdVotes += pred.confidence;

      totalConfidence += pred.confidence;
    }

    // Normalize votes
    buyVotes /= predictions.length;
    sellVotes /= predictions.length;
    holdVotes /= predictions.length;

    // Determine ensemble prediction
    let prediction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    const confidence = Math.max(buyVotes, sellVotes, holdVotes);

    if (buyVotes > sellVotes && buyVotes > holdVotes && buyVotes > 0.4) {
      prediction = 'BUY';
    } else if (sellVotes > buyVotes && sellVotes > holdVotes && sellVotes > 0.4) {
      prediction = 'SELL';
    }

    return {
      prediction,
      confidence,
      buyScore: buyVotes,
      sellScore: sellVotes,
      details: predictions,
    };

  } catch (error) {
    console.error(`Error in ensemble prediction: ${error}`);
    return {
      prediction: 'HOLD',
      confidence: 0,
      buyScore: 0,
      sellScore: 0,
      details: [],
    };
  }
}

// ============================================
// RETRAINING CHECK
// ============================================

/**
 * Checks if it's time to retrain a model
 */
export async function shouldRetrain(pair: string, timeframe: string): Promise<boolean> {
  const model = await db.aIModel.findFirst({
    where: { pair, timeframe, isActive: true },
    orderBy: { trainedAt: 'desc' },
  });

  if (!model) return true; // Train if no model exists

  // Retrain if:
  // 1. More than 30 days since last training
  const daysSinceTraining = Math.floor(
    (Date.now() - (model.trainedAt?.getTime() || 0)) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceTraining > 30) return true;

  // 2. Accuracy dropped significantly
  const recentAccuracy = await getModelAccuracy(pair, timeframe, 7);
  if (recentAccuracy.accuracy < 0.5) return true;

  // 3. Enough new predictions available
  const predictionCount = await db.aIPrediction.count({
    where: {
      pair,
      timeframe,
      createdAt: {
        gte: model.trainedAt || new Date(0),
      },
    },
  });

  if (predictionCount > 10000) return true;

  return false;
}

// ============================================
// RESOURCE CLEANUP
// ============================================

/**
 * Disposes all cached models
 */
export function disposeAllModels(): void {
  modelCache.forEach(cached => {
    try {
      cached.model.dispose();
    } catch (error) {
      console.warn(`Error disposing model: ${error}`);
    }
  });
  modelCache.clear();
  console.log('✓ All models disposed from memory');
}

export default {
  predictTrade,
  predictMultiple,
  predictAllActiveStrategies,
  getModelAccuracy,
  resolvePredictions,
  getEnsemblePrediction,
  shouldRetrain,
  disposeAllModels,
};
