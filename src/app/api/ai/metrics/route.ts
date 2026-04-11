// ============================================
// AI METRICS API endpoint
// GET /api/ai/metrics - Get model metrics and accuracy
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getModelAccuracy } from '@/lib/ai/ai-predictor';

/**
 * GET /api/ai/metrics - Get metrics for models
 * Query params: pair, timeframe, days
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get('pair');
    const timeframe = searchParams.get('timeframe');
    const days = parseInt(searchParams.get('days') || '7');

    // Get all models
    const where: Record<string, any> = {};
    if (pair) where.pair = pair;
    if (timeframe) where.timeframe = timeframe;

    const models = await db.aIModel.findMany({
      where,
      orderBy: { trainedAt: 'desc' },
      take: 100,
    });

    // Get accuracy for each model
    const modelsWithMetrics = await Promise.all(
      models.map(async (model) => {
        try {
          const accuracy = await getModelAccuracy(
            model.pair,
            model.timeframe,
            days
          );

          return {
            id: model.id,
            name: model.name,
            pair: model.pair,
            timeframe: model.timeframe,
            version: model.version,
            status: model.status,
            isActive: model.isActive,
            trainingAccuracy: model.trainingAccuracy,
            validationAccuracy: model.validationAccuracy,
            testAccuracy: model.testAccuracy,
            featureCount: model.featureCount,
            trainedAt: model.trainedAt,
            deployedAt: model.deployedAt,
            // Prediction accuracy metrics
            predictionAccuracy: accuracy.accuracy,
            totalPredictions: accuracy.totalPredictions,
            correctPredictions: accuracy.correctPredictions,
          };
        } catch (error) {
          console.warn(`Error getting accuracy for ${model.name}:`, error);
          return {
            id: model.id,
            name: model.name,
            pair: model.pair,
            timeframe: model.timeframe,
            version: model.version,
            status: model.status,
            isActive: model.isActive,
            trainingAccuracy: model.trainingAccuracy,
            validationAccuracy: model.validationAccuracy,
            testAccuracy: model.testAccuracy,
            featureCount: model.featureCount,
            trainedAt: model.trainedAt,
            deployedAt: model.deployedAt,
            predictionAccuracy: 0,
            totalPredictions: 0,
            correctPredictions: 0,
          };
        }
      })
    );

    // Get prediction stats summary
    const predictionStats = await db.aIPrediction.groupBy({
      by: ['prediction'],
      _count: true,
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
    });

    // Get recent predictions count
    const recentPredictionsCount = await db.aIPrediction.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
    });

    return NextResponse.json({
      models: modelsWithMetrics,
      modelCount: modelsWithMetrics.length,
      predictionStats,
      recentPredictionsCount,
      period: `${days} days`,
    });

  } catch (error: any) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
