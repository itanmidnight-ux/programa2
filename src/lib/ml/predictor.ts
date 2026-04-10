// ============================================
// RECO-TRADING - ML Prediction System
// ============================================
// Pure TypeScript machine learning with:
// - Linear Regression Model
// - Polynomial Regression Model
// - Exponential Smoothing Predictor
// - Pattern Matching Model
// - Ensemble Model with dynamic weight adjustment
// - Feature extraction (47+ features)
// - Market regime classification
// ============================================

import type { Candle, FullAnalysis } from '@/lib/analysis-engine';

// ---- Types ----

export interface MLPrediction {
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  predictedChange: number;
  timeframe: string;
  modelType: string;
  features: Record<string, number>;
  marketRegime: string;
}

export interface MLModel {
  name: string;
  predict(features: number[]): number;
  train(data: number[][]): void;
  accuracy: number;
}

interface MLPredictionResult {
  prediction: MLPrediction;
  timestamp: number;
  actualResult?: 'UP' | 'DOWN' | 'FLAT';
  correct?: boolean;
}

interface FeatureDefinition {
  name: string;
  extract: (analysis: FullAnalysis, candles: Candle[]) => number;
}

// ============================================
// FEATURE EXTRACTION (47+ features)
// ============================================

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  // Price features (8)
  { name: 'price', extract: (a) => a.price },
  { name: 'price_change_1h', extract: (a) => a.change1h },
  { name: 'price_change_24h', extract: (a) => a.change24h },
  { name: 'price_to_sma20', extract: (a, c) => {
    const sma = c.slice(-20).reduce((s, x) => s + x.close, 0) / Math.min(20, c.length);
    return sma > 0 ? a.price / sma - 1 : 0;
  }},
  { name: 'price_to_sma50', extract: (a, c) => {
    const sma = c.slice(-50).reduce((s, x) => s + x.close, 0) / Math.min(50, c.length);
    return sma > 0 ? a.price / sma - 1 : 0;
  }},
  { name: 'price_to_vwap', extract: (a) => a.vwap > 0 ? a.price / a.vwap - 1 : 0 },
  { name: 'price_to_support', extract: (a) => a.support > 0 ? (a.price - a.support) / a.support : 0 },
  { name: 'price_to_resistance', extract: (a) => a.resistance > 0 ? (a.resistance - a.price) / a.resistance : 0 },

  // Trend features (6)
  { name: 'trend_strength', extract: (a) => a.trendStrength / 100 },
  { name: 'adx', extract: (a) => a.adx / 100 },
  { name: 'supertrend_dir', extract: (a) => a.supertrend.direction === 'UP' ? 1 : -1 },
  { name: 'supertrend_dist', extract: (a) => a.price > 0 ? (a.supertrend.value - a.price) / a.price : 0 },
  { name: 'higher_highs', extract: (a) => a.higherHighs ? 1 : 0 },
  { name: 'lower_lows', extract: (a) => a.lowerLows ? 1 : 0 },

  // Momentum features (8)
  { name: 'rsi', extract: (a) => a.rsi / 100 },
  { name: 'rsi_overbought', extract: (a) => a.rsi > 70 ? 1 : 0 },
  { name: 'rsi_oversold', extract: (a) => a.rsi < 30 ? 1 : 0 },
  { name: 'macd', extract: (a) => a.price > 0 ? a.macd.macd / a.price * 10000 : 0 },
  { name: 'macd_signal', extract: (a) => a.price > 0 ? a.macd.signal / a.price * 10000 : 0 },
  { name: 'macd_hist', extract: (a) => a.price > 0 ? a.macd.histogram / a.price * 10000 : 0 },
  { name: 'macd_cross_bull', extract: (a) => a.macd.crossover === 'BULLISH' ? 1 : 0 },
  { name: 'macd_cross_bear', extract: (a) => a.macd.crossover === 'BEARISH' ? 1 : 0 },

  // Stochastic & Oscillator features (5)
  { name: 'stoch_k', extract: (a) => a.stochastic.k / 100 },
  { name: 'stoch_d', extract: (a) => a.stochastic.d / 100 },
  { name: 'cci', extract: (a) => Math.max(-500, Math.min(500, a.cci)) / 500 },
  { name: 'roc', extract: (a) => Math.max(-10, Math.min(10, a.roc)) / 10 },
  { name: 'mfi', extract: (a) => a.mfi / 100 },

  // Volatility features (6)
  { name: 'atr_pct', extract: (a) => a.atrPct / 5 },
  { name: 'bb_percent_b', extract: (a) => a.bollingerBands.percentB },
  { name: 'bb_bandwidth', extract: (a) => a.bollingerBands.bandwidth / 10 },
  { name: 'bb_squeeze', extract: (a) => a.bollingerBands.squeeze ? 1 : 0 },
  { name: 'keltner_pos', extract: (a) => {
    const range = a.keltnerChannels.upper - a.keltnerChannels.lower;
    return range > 0 ? (a.price - a.keltnerChannels.lower) / range - 0.5 : 0;
  }},
  { name: 'volatility_regime', extract: (a) => a.atrPct > 2.5 ? 1 : a.atrPct < 0.5 ? -1 : 0 },

  // Volume features (7)
  { name: 'obv_trend', extract: (a) => a.obvTrend === 'RISING' ? 1 : a.obvTrend === 'FALLING' ? -1 : 0 },
  { name: 'volume_ratio', extract: (a) => Math.min(a.volumeRatio, 5) / 5 },
  { name: 'volume_trend', extract: (a) => a.volumeTrend === 'INCREASING' ? 1 : a.volumeTrend === 'DECREASING' ? -1 : 0 },
  { name: 'buy_pressure', extract: (a) => a.buyPressure / 100 },
  { name: 'sell_pressure', extract: (a) => a.sellPressure / 100 },
  { name: 'order_flow_score', extract: (a) => {
    const scores: Record<string, number> = { STRONG_BUY: 1, BUY: 0.5, NEUTRAL: 0, SELL: -0.5, STRONG_SELL: -1 };
    return scores[a.orderFlow] || 0;
  }},
  { name: 'mfi_zone', extract: (a) => a.mfiZone === 'OVERBOUGHT' ? 1 : a.mfiZone === 'OVERSOLD' ? -1 : 0 },

  // Structure features (3)
  { name: 'confluence', extract: (a) => a.confluenceScore },
  { name: 'bb_position', extract: (a, c) => {
    if (c.length < 20) return 0.5;
    const avgRange = c.slice(-20).reduce((s, x) => s + (x.high - x.low), 0) / 20;
    return avgRange > 0 ? (a.price - a.bollingerBands.lower) / (a.bollingerBands.upper - a.bollingerBands.lower) : 0.5;
  }},
  { name: 'pivot_position', extract: (a) => {
    const range = a.pivotPoints.r2 - a.pivotPoints.s2;
    return range > 0 ? (a.price - a.pivotPoints.s2) / range : 0.5;
  }},

  // Multi-timeframe features (4)
  { name: 'tf5m_trend', extract: (a) => a.timeframes['5m'].trend === 'BULLISH' ? 1 : a.timeframes['5m'].trend === 'BEARISH' ? -1 : 0 },
  { name: 'tf15m_trend', extract: (a) => a.timeframes['15m'].trend === 'BULLISH' ? 1 : a.timeframes['15m'].trend === 'BEARISH' ? -1 : 0 },
  { name: 'tf1h_trend', extract: (a) => a.timeframes['1h'].trend === 'BULLISH' ? 1 : a.timeframes['1h'].trend === 'BEARISH' ? -1 : 0 },
  { name: 'tf4h_trend', extract: (a) => a.timeframes['4h'].trend === 'BULLISH' ? 1 : a.timeframes['4h'].trend === 'BEARISH' ? -1 : 0 },
];

// ============================================
// ML MODEL 1: Linear Regression
// ============================================

class LinearRegressionModel implements MLModel {
  name = 'LinearRegression';
  weights: number[] = [];
  bias = 0;
  learningRate = 0.01;
  accuracy = 0.5;

  private initWeights(n: number) {
    if (this.weights.length !== n) {
      this.weights = new Array(n).fill(0).map(() => (Math.random() - 0.5) * 0.1);
      this.bias = 0;
    }
  }

  predict(features: number[]): number {
    this.initWeights(features.length);
    let sum = this.bias;
    for (let i = 0; i < features.length; i++) {
      sum += (this.weights[i] || 0) * features[i];
    }
    // Sigmoid to map to -1 to 1 range
    return 2 / (1 + Math.exp(-sum)) - 1;
  }

  train(data: number[][]): void {
    if (data.length < 5) return;
    const n = data[0].length - 1; // last column is target
    this.initWeights(n);

    const epochs = Math.min(100, data.length);
    for (let e = 0; e < epochs; e++) {
      for (const row of data) {
        const features = row.slice(0, n);
        const target = row[n];
        const prediction = this.predict(features);
        const error = target - prediction;

        for (let i = 0; i < n; i++) {
          this.weights[i] += this.learningRate * error * features[i] * 0.01;
        }
        this.bias += this.learningRate * error * 0.01;
      }
    }
  }
}

// ============================================
// ML MODEL 2: Polynomial Regression (degree 2)
// ============================================

class PolynomialRegressionModel implements MLModel {
  name = 'PolynomialRegression';
  weights: number[] = [];
  bias = 0;
  degree = 2;
  accuracy = 0.5;

  /** Transform features to polynomial space (quadratic) */
  private polyTransform(features: number[]): number[] {
    const poly: number[] = [...features];
    // Add squared terms for first 10 features (to keep dimensionality manageable)
    const numFeatures = Math.min(features.length, 10);
    for (let i = 0; i < numFeatures; i++) {
      poly.push(features[i] * features[i]);
    }
    // Add a few cross terms
    for (let i = 0; i < Math.min(5, numFeatures); i++) {
      for (let j = i + 1; j < Math.min(5, numFeatures); j++) {
        poly.push(features[i] * features[j]);
      }
    }
    return poly;
  }

  predict(features: number[]): number {
    const poly = this.polyTransform(features);
    if (this.weights.length !== poly.length) {
      this.weights = new Array(poly.length).fill(0).map(() => (Math.random() - 0.5) * 0.05);
      this.bias = 0;
    }
    let sum = this.bias;
    for (let i = 0; i < poly.length; i++) {
      sum += (this.weights[i] || 0) * poly[i];
    }
    return Math.max(-1, Math.min(1, sum * 0.5));
  }

  train(data: number[][]): void {
    if (data.length < 5) return;
    const n = data[0].length - 1;
    const transformed = data.map(row => {
      const poly = this.polyTransform(row.slice(0, n));
      poly.push(row[n]);
      return poly;
    });

    const polyN = transformed[0].length - 1;
    if (this.weights.length !== polyN) {
      this.weights = new Array(polyN).fill(0).map(() => (Math.random() - 0.5) * 0.02);
    }

    const epochs = Math.min(50, data.length);
    for (let e = 0; e < epochs; e++) {
      for (const row of transformed) {
        const features = row.slice(0, polyN);
        const target = row[polyN];
        let sum = this.bias;
        for (let i = 0; i < polyN; i++) sum += this.weights[i] * features[i];
        const error = target - Math.max(-1, Math.min(1, sum * 0.5));
        for (let i = 0; i < polyN; i++) {
          this.weights[i] += 0.005 * error * features[i];
        }
        this.bias += 0.005 * error;
      }
    }
  }
}

// ============================================
// ML MODEL 3: Exponential Smoothing Predictor
// ============================================

class ExponentialSmoothingModel implements MLModel {
  name = 'ExponentialSmoothing';
  alpha = 0.3;
  beta = 0.1;
  gamma = 0.1;
  seasonPeriod = 12;
  accuracy = 0.5;

  private prices: number[] = [];
  private smoothed: number[] = [];
  private trend: number[] = [];
  private seasonality: number[] = [];

  predict(features: number[]): number {
    // Use first feature (price) and recent history
    const currentPrice = features[0];
    if (this.smoothed.length < 2) return 0;

    const lastSmoothed = this.smoothed[this.smoothed.length - 1];
    const lastTrend = this.trend[this.trend.length - 1];
    const seasonIdx = this.prices.length % this.seasonPeriod;
    const seasonal = this.seasonality[seasonIdx] || 0;

    const forecast = lastSmoothed + lastTrend + seasonal;
    const predictedChange = (forecast - currentPrice) / currentPrice;

    return Math.max(-1, Math.min(1, predictedChange * 100));
  }

  train(data: number[][]): void {
    if (data.length < 5) return;
    this.prices = data.map(row => row[0]);

    // Initialize
    this.smoothed = [this.prices[0]];
    this.trend = [0];
    this.seasonality = new Array(this.seasonPeriod).fill(0);

    for (let i = 1; i < this.prices.length; i++) {
      const sIdx = i % this.seasonPeriod;
      const newSmoothed = this.alpha * (this.prices[i] - this.seasonality[sIdx])
        + (1 - this.alpha) * (this.smoothed[i - 1] + this.trend[i - 1]);
      const newTrend = this.beta * (newSmoothed - this.smoothed[i - 1])
        + (1 - this.beta) * this.trend[i - 1];
      const newSeason = this.gamma * (this.prices[i] - newSmoothed)
        + (1 - this.gamma) * this.seasonality[sIdx];

      this.smoothed.push(newSmoothed);
      this.trend.push(newTrend);
      this.seasonality[sIdx] = newSeason;
    }
  }
}

// ============================================
// ML MODEL 4: Pattern Matching Model
// ============================================

class PatternMatchingModel implements MLModel {
  name = 'PatternMatching';
  accuracy = 0.5;
  private patternLibrary: Array<{ features: number[]; outcome: number; weight: number }> = [];
  private maxPatterns = 500;

  predict(features: number[]): number {
    if (this.patternLibrary.length < 5) return 0;

    // Find k-nearest neighbors
    const k = Math.min(10, this.patternLibrary.length);
    let totalWeight = 0;
    let weightedOutcome = 0;

    const distances = this.patternLibrary.map((p, idx) => {
      let dist = 0;
      const numFeatures = Math.min(features.length, p.features.length);
      for (let i = 0; i < numFeatures; i++) {
        dist += (features[i] - p.features[i]) ** 2;
      }
      return { idx, dist: Math.sqrt(dist) };
    }).sort((a, b) => a.dist - b.dist);

    for (let i = 0; i < k; i++) {
      const p = this.patternLibrary[distances[i].idx];
      const similarity = 1 / (1 + distances[i].dist);
      weightedOutcome += p.outcome * similarity * p.weight;
      totalWeight += similarity * p.weight;
    }

    return totalWeight > 0 ? Math.max(-1, Math.min(1, weightedOutcome / totalWeight)) : 0;
  }

  train(data: number[][]): void {
    for (const row of data) {
      const features = row.slice(0, -1);
      const outcome = row[row.length - 1];
      this.patternLibrary.push({ features, outcome, weight: 1 });
    }

    // Trim to max size
    if (this.patternLibrary.length > this.maxPatterns) {
      this.patternLibrary = this.patternLibrary.slice(-this.maxPatterns);
    }
  }
}

// ============================================
// ML MODEL 5: Ensemble Model
// ============================================

class EnsembleModel implements MLModel {
  name = 'Ensemble';
  accuracy = 0.5;
  private modelWeights: Record<string, number> = {};
  private predictions: Record<string, number> = {};

  setModelWeight(name: string, weight: number) {
    this.modelWeights[name] = weight;
  }

  setModelPrediction(name: string, prediction: number) {
    this.predictions[name] = prediction;
  }

  predict(features: number[]): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [name, prediction] of Object.entries(this.predictions)) {
      const weight = this.modelWeights[name] || 1;
      weightedSum += prediction * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  train(data: number[][]): void {
    // Ensemble doesn't train directly; weights are adjusted based on accuracy
  }
}

// ============================================
// MAIN PREDICTOR CLASS
// ============================================

export class MLPredictor {
  models: MLModel[] = [];
  ensembleModel: EnsembleModel;
  currentRegime = 'UNKNOWN';
  predictionHistory: MLPredictionResult[] = [];
  private featureNames: string[] = [];
  private modelWeights: Map<string, number> = new Map();
  private regimeBuffer: string[] = [];
  private modelPredictionLog: Array<{ modelName: string; prediction: number; actualOutcome: number }> = [];

  constructor() {
    const linear = new LinearRegressionModel();
    const poly = new PolynomialRegressionModel();
    const expSmooth = new ExponentialSmoothingModel();
    const pattern = new PatternMatchingModel();
    const ensemble = new EnsembleModel();

    this.models = [linear, poly, expSmooth, pattern];
    this.ensembleModel = ensemble;

    // Initial equal weights
    this.models.forEach(m => {
      this.modelWeights.set(m.name, 1.0);
      this.ensembleModel.setModelWeight(m.name, 1.0);
    });

    this.featureNames = FEATURE_DEFINITIONS.map(f => f.name);
  }

  /** Extract 47+ features from analysis and candles */
  extractFeatures(analysis: FullAnalysis, candles: Candle[]): number[] {
    return FEATURE_DEFINITIONS.map(def => {
      try {
        const val = def.extract(analysis, candles);
        return isFinite(val) ? val : 0;
      } catch {
        return 0;
      }
    });
  }

  /** Get feature importance based on weight magnitudes */
  getFeatureImportance(): Record<string, number> {
    const linearModel = this.models[0] as LinearRegressionModel;
    const importance: Record<string, number> = {};
    const maxWeight = Math.max(...linearModel.weights.map(w => Math.abs(w)), 0.001);

    for (let i = 0; i < this.featureNames.length; i++) {
      const name = this.featureNames[i];
      const weight = Math.abs(linearModel.weights[i] || 0);
      importance[name] = +(weight / maxWeight).toFixed(4);
    }
    return importance;
  }

  /** Classify market regime using simple clustering */
  classifyRegime(analysis: FullAnalysis, candles: Candle[]): string {
    const features = this.extractFeatures(analysis, candles);

    // Simple rule-based regime classification using feature thresholds
    const adxVal = features[this.featureNames.indexOf('adx')] * 100;
    const atrPct = features[this.featureNames.indexOf('atr_pct')] * 5;
    const trendStr = features[this.featureNames.indexOf('trend_strength')];
    const bbSqueeze = features[this.featureNames.indexOf('bb_squeeze')];
    const confluence = features[this.featureNames.indexOf('confluence')];

    let regime = 'RANGING';

    if (adxVal > 30 && trendStr > 0.6) {
      regime = analysis.trend.includes('UP') ? 'TRENDING_UP' : 'TRENDING_DOWN';
    } else if (atrPct > 3) {
      regime = 'VOLATILE';
    } else if (bbSqueeze > 0.5 && confluence > 0.6) {
      regime = 'BREAKOUT';
    } else if (atrPct < 0.5) {
      regime = 'RANGING';
    }

    // Smooth regime with buffer to avoid rapid switching
    this.regimeBuffer.push(regime);
    if (this.regimeBuffer.length > 5) this.regimeBuffer.shift();

    // Return most common regime in buffer
    const counts: Record<string, number> = {};
    for (const r of this.regimeBuffer) {
      counts[r] = (counts[r] || 0) + 1;
    }
    let maxCount = 0;
    let dominant = regime;
    for (const [r, count] of Object.entries(counts)) {
      if (count > maxCount) { maxCount = count; dominant = r; }
    }

    this.currentRegime = dominant;
    return dominant;
  }

  /** Get ensemble prediction from all models */
  predict(analysis: FullAnalysis, candles: Candle[]): MLPrediction {
    const features = this.extractFeatures(analysis, candles);
    const regime = this.classifyRegime(analysis, candles);

    // Prepare feature record for output
    const featureRecord: Record<string, number> = {};
    for (let i = 0; i < this.featureNames.length; i++) {
      featureRecord[this.featureNames[i]] = +features[i].toFixed(4);
    }

    // Get individual model predictions
    const predictions: Record<string, number> = {};
    for (const model of this.models) {
      try {
        const pred = model.predict(features);
        predictions[model.name] = pred;
        this.ensembleModel.setModelPrediction(model.name, pred);
      } catch {
        predictions[model.name] = 0;
      }
    }

    // Save model predictions for accuracy tracking
    for (const model of this.models) {
      this.modelPredictionLog.push({
        modelName: model.name,
        prediction: predictions[model.name] || 0,
        actualOutcome: 0, // will be filled when resolved
      });
    }
    if (this.modelPredictionLog.length > 2000) {
      this.modelPredictionLog = this.modelPredictionLog.slice(-1000);
    }

    // Get ensemble prediction
    const ensemblePred = this.ensembleModel.predict(features);

    // Convert to direction
    let direction: 'BUY' | 'SELL' | 'HOLD';
    if (ensemblePred > 0.15) direction = 'BUY';
    else if (ensemblePred < -0.15) direction = 'SELL';
    else direction = 'HOLD';

    // Confidence based on agreement and magnitude
    const predValues = Object.values(predictions);
    const avgMag = predValues.reduce((s, v) => s + Math.abs(v), 0) / predValues.length;
    const signAgreement = predValues.filter(v =>
      (ensemblePred > 0 && v > 0) || (ensemblePred < 0 && v < 0) || Math.abs(v) < 0.05
    ).length / predValues.length;

    let confidence = Math.min(0.9, avgMag * signAgreement * 1.5 + 0.3);
    if (direction === 'HOLD') confidence = Math.max(0.2, confidence * 0.5);

    // Predicted change percentage
    const predictedChange = +(ensemblePred * 2).toFixed(3);

    const prediction: MLPrediction = {
      direction,
      confidence: +confidence.toFixed(2),
      predictedChange,
      timeframe: '5m',
      modelType: 'ensemble',
      features: featureRecord,
      marketRegime: regime,
    };

    // Store in history
    this.predictionHistory.push({
      prediction,
      timestamp: Date.now(),
    });

    // Keep history manageable
    if (this.predictionHistory.length > 1000) {
      this.predictionHistory = this.predictionHistory.slice(-500);
    }

    return prediction;
  }

  /** Save prediction to database */
  static async savePrediction(pair: string, prediction: MLPrediction): Promise<number | null> {
    try {
      const { db } = await import('@/lib/db');
      const record = await db.mLPrediction.create({
        data: {
          pair,
          direction: prediction.direction,
          confidence: prediction.confidence,
          modelType: prediction.modelType,
          features: JSON.stringify(prediction.features),
          marketRegime: prediction.marketRegime,
        },
      });
      return record.id;
    } catch (err) {
      console.error('[ML] Failed to save prediction:', err);
      return null;
    }
  }

  /** Update model accuracy based on actual outcome */
  updateAccuracy(prediction: MLPrediction, actualMove: number): void {
    let actualResult: 'UP' | 'DOWN' | 'FLAT';
    if (actualMove > 0.1) actualResult = 'UP';
    else if (actualMove < -0.1) actualResult = 'DOWN';
    else actualResult = 'FLAT';

    let correct = false;
    if (
      (prediction.direction === 'BUY' && actualResult === 'UP') ||
      (prediction.direction === 'SELL' && actualResult === 'DOWN') ||
      (prediction.direction === 'HOLD' && actualResult === 'FLAT')
    ) {
      correct = true;
    }

    // Update history entry
    const lastUnresolved = [...this.predictionHistory].reverse().find(p => !p.actualResult);
    if (lastUnresolved) {
      lastUnresolved.actualResult = actualResult;
      lastUnresolved.correct = correct;
    }

    // Update the most recent unresolved prediction log entries
    const unresolved = this.modelPredictionLog.filter(p => p.actualOutcome === 0);
    const actualNum = actualMove > 0.1 ? 1 : actualMove < -0.1 ? -1 : 0;
    for (let i = Math.max(0, unresolved.length - 4); i < unresolved.length; i++) {
      unresolved[i].actualOutcome = actualNum;
    }

    // Calculate per-model accuracy
    for (const model of this.models) {
      const modelLogs = this.modelPredictionLog.filter(p =>
        p.modelName === model.name && p.actualOutcome !== 0
      );
      if (modelLogs.length >= 5) {
        const correct = modelLogs.filter(p => {
          const predictedDir = p.prediction > 0.05 ? 1 : p.prediction < -0.05 ? -1 : 0;
          return predictedDir === p.actualOutcome || (predictedDir === 0 && p.actualOutcome === 0);
        }).length;
        model.accuracy = +(correct / modelLogs.length).toFixed(3);
        // Update ensemble weights based on individual accuracy
        const weight = Math.max(0.2, Math.min(3.0, model.accuracy * 2));
        this.modelWeights.set(model.name, weight);
        this.ensembleModel.setModelWeight(model.name, weight);
      }
    }

    // Update model weights based on recent accuracy
    this.adjustWeights();

    // Update individual model accuracy
    this.updateModelAccuracies();
  }

  /** Adjust model weights based on recent prediction performance */
  private adjustWeights(): void {
    const recentResults = this.predictionHistory
      .filter(p => p.correct !== undefined)
      .slice(-50);

    if (recentResults.length < 10) return;

    // Track how often each model's direction aligned with correct outcomes
    // We use the ensemble direction to retroactively evaluate
    const correctRate = recentResults.filter(r => r.correct).length / recentResults.length;

    // Adjust learning rate based on overall accuracy
    const learningRate = correctRate > 0.6 ? 0.05 : 0.15;

    // Slightly adjust individual model weights using per-model directional accuracy
    const veryRecent = recentResults.slice(-10);
    const recentCorrectRate = veryRecent.filter(r => r.correct).length / veryRecent.length;

    for (const model of this.models) {
      // Use per-model directional accuracy from the log (already set in updateAccuracy)
      const currentWeight = this.modelWeights.get(model.name) || 1;
      let newWeight = model.accuracy * 2; // weight directly from per-model accuracy

      // Apply a small nudge based on recent overall trend
      if (recentCorrectRate > 0.6) {
        // Accuracy improving - slightly converge toward mean
        newWeight += (1.5 - newWeight) * learningRate * 0.3;
      } else if (recentCorrectRate < 0.4) {
        // Accuracy declining - slightly diversify
        newWeight += (Math.random() - 0.5) * learningRate * 0.5;
      }

      newWeight = Math.max(0.2, Math.min(3.0, newWeight));
      this.modelWeights.set(model.name, newWeight);
      this.ensembleModel.setModelWeight(model.name, newWeight);
    }
  }

  /** Update accuracy metrics for each model */
  private updateModelAccuracies(): void {
    const results = this.predictionHistory.filter(p => p.correct !== undefined);
    if (results.length < 5) return;

    const overallAcc = results.filter(r => r.correct).length / results.length;
    this.ensembleModel.accuracy = +overallAcc.toFixed(3);

    // Individual model accuracy already set from modelPredictionLog in updateAccuracy()
    // Only override if per-model log doesn't have enough data yet
    for (const model of this.models) {
      const modelLogs = this.modelPredictionLog.filter(p =>
        p.modelName === model.name && p.actualOutcome !== 0
      );
      if (modelLogs.length < 5) {
        model.accuracy = +overallAcc.toFixed(3);
      }
    }
  }

  /** Get accuracy metrics for the predictor */
  getAccuracyMetrics(): {
    overall: number;
    buy: number;
    sell: number;
    hold: number;
    regimeAccuracy: Record<string, number>;
  } {
    const results = this.predictionHistory.filter(p => p.correct !== undefined);
    if (results.length === 0) {
      return { overall: 0.5, buy: 0.5, sell: 0.5, hold: 0.5, regimeAccuracy: {} };
    }

    const overall = results.filter(r => r.correct).length / results.length;

    const buyResults = results.filter(r => r.prediction.direction === 'BUY');
    const sellResults = results.filter(r => r.prediction.direction === 'SELL');
    const holdResults = results.filter(r => r.prediction.direction === 'HOLD');

    const buy = buyResults.length > 0 ? buyResults.filter(r => r.correct).length / buyResults.length : 0.5;
    const sell = sellResults.length > 0 ? sellResults.filter(r => r.correct).length / sellResults.length : 0.5;
    const hold = holdResults.length > 0 ? holdResults.filter(r => r.correct).length / holdResults.length : 0.5;

    // Regime-specific accuracy
    const regimeAccuracy: Record<string, number> = {};
    const regimes = [...new Set(results.map(r => r.prediction.marketRegime))];
    for (const regime of regimes) {
      const regimeResults = results.filter(r => r.prediction.marketRegime === regime);
      regimeAccuracy[regime] = regimeResults.length > 0
        ? regimeResults.filter(r => r.correct).length / regimeResults.length
        : 0.5;
    }

    return {
      overall: +overall.toFixed(3),
      buy: +buy.toFixed(3),
      sell: +sell.toFixed(3),
      hold: +hold.toFixed(3),
      regimeAccuracy: Object.fromEntries(
        Object.entries(regimeAccuracy).map(([k, v]) => [k, +v.toFixed(3)])
      ),
    };
  }
}
