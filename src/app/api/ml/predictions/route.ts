import { NextResponse } from "next/server";
import { getKlines } from "@/lib/broker-manager";
import { predict } from "@/lib/ml-predictor";
import { db } from "@/lib/db";

export async function GET() {
  const startTime = Date.now();
  try {
    const pair = (process.env.TRADING_SYMBOL || "XAU_USD").replace("/", "_").toUpperCase();

    let candles5m: any[] = [];
    try {
      candles5m = await getKlines(pair, "5m", 200);
    } catch {
      // use fallback below
    }

    if (candles5m.length < 20) {
      return NextResponse.json({
        prediction: {
          direction: "HOLD",
          confidence: 0,
          model_type: "LSTM + Gradient Boosting Ensemble",
          features: {},
          market_regime: "UNKNOWN",
          regime_confidence: 0,
          timestamp: new Date().toISOString(),
        },
        accuracy: {
          accuracy_7d: 0,
          accuracy_30d: 0,
          total_predictions: 0,
          correct_predictions: 0,
          recent_accuracy: 0,
        },
        history: [],
        feature_importance: {},
        status: "INSUFFICIENT_DATA",
        api_latency_ms: Date.now() - startTime,
      });
    }

    const result = predict(candles5m);

    let dbHistory: any[] = [];
    let totalPredictions = 0;
    let correctPredictions = 0;
    try {
      const predictions = await db.mLPrediction.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      totalPredictions = await db.mLPrediction.count();
      correctPredictions = await db.mLPrediction.count({
        where: { correct: true },
      });
      dbHistory = predictions.map((p) => ({
        time: Math.floor(p.createdAt.getTime() / 1000),
        prediction: p.direction,
        actual: p.actualResult || "PENDING",
        correct: p.correct ?? false,
        confidence: p.confidence,
      }));
    } catch {
      // ignore db history errors
    }

    const history = dbHistory.length > 0 ? dbHistory : result.history;

    let accuracy7d = result.accuracy.accuracy_7d;
    let accuracy30d = result.accuracy.accuracy_30d;
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentPredictions = await db.mLPrediction.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
          correct: { not: null },
        },
      });
      if (recentPredictions.length > 0) {
        accuracy7d = recentPredictions.filter((p) => p.correct).length / recentPredictions.length;
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const monthPredictions = await db.mLPrediction.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          correct: { not: null },
        },
      });
      if (monthPredictions.length > 0) {
        accuracy30d = monthPredictions.filter((p) => p.correct).length / monthPredictions.length;
      }
    } catch {
      // ignore
    }

    try {
      await db.mLPrediction.create({
        data: {
          pair,
          direction: result.prediction.direction,
          confidence: result.prediction.confidence,
          modelType: result.prediction.model_type,
          features: JSON.stringify(result.prediction.features),
          marketRegime: result.prediction.market_regime,
        },
      });
    } catch {
      // ignore write failure
    }

    return NextResponse.json({
      prediction: result.prediction,
      accuracy: {
        accuracy_7d: +accuracy7d.toFixed(3),
        accuracy_30d: +accuracy30d.toFixed(3),
        total_predictions: totalPredictions || result.accuracy.total_predictions,
        correct_predictions: correctPredictions || result.accuracy.correct_predictions,
        recent_accuracy: result.accuracy.recent_accuracy,
      },
      history,
      feature_importance: result.featureImportance,
      status: "ACTIVE",
      api_latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, status: "ERROR", api_latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
