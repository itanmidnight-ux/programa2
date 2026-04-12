// ============================================
// AI TRAINING API endpoint
// POST /api/ai/train - Start training a new AI model
// GET  /api/ai/train - List trained models
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { trainCompleteModel, FEATURE_NAMES } from '@/lib/ai/ai-model-trainer';

const VALID_PAIRS = ['XAU_USD', 'XAG_USD', 'EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CHF', 'WTI_USD', 'BCO_USD', 'US30_USD', 'SPX500_USD', 'NAS100_USD'];
const VALID_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];

/**
 * GET /api/ai/train - List all trained models
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get('pair');
    const timeframe = searchParams.get('timeframe');
    const status = searchParams.get('status');

    const where: Record<string, any> = {};
    if (pair) where.pair = pair;
    if (timeframe) where.timeframe = timeframe;
    if (status) where.status = status;

    const models = await db.aIModel.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ models, count: models.length });
  } catch (error: any) {
    console.error('Error listing models:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list models' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai/train - Train a new AI model
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const pair = body.pair?.toUpperCase();
    const timeframe = body.timeframe?.toLowerCase();
    const epochs = Math.min(Math.max(body.epochs || 100, 10), 500); // Clamp between 10-500
    const lookbackDays = Math.min(Math.max(body.lookbackDays || 180, 30), 365);

    if (!pair || !timeframe) {
      return NextResponse.json(
        { error: 'Missing required fields: pair, timeframe' },
        { status: 400 }
      );
    }

    if (!VALID_PAIRS.includes(pair)) {
      return NextResponse.json(
        { error: `Invalid pair. Valid pairs: ${VALID_PAIRS.join(', ')}` },
        { status: 400 }
      );
    }

    if (!VALID_TIMEFRAMES.includes(timeframe)) {
      return NextResponse.json(
        { error: `Invalid timeframe. Valid timeframes: ${VALID_TIMEFRAMES.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if already training
    const existingTraining = await db.aIModel.findFirst({
      where: {
        pair,
        timeframe,
        status: 'TRAINING',
      },
    });

    if (existingTraining) {
      return NextResponse.json(
        { error: 'Model already training for this pair/timeframe' },
        { status: 409 }
      );
    }

    // Start training (run in background for API responsiveness)
    console.log(`🚀 Starting training for ${pair}/${timeframe}...`);

    // Note: In production, you'd want to run this in a job queue
    // For now, we run synchronously (may timeout on long trainings)
    const result = await trainCompleteModel({
      pair,
      timeframe,
      lookbackDays,
      batchSize: 32,
      epochs,
      learningRate: 0.001,
      validationSplit: 0.2,
      testSplit: 0.2,
      earlyStoppingPatience: 10,
    });

    return NextResponse.json({
      success: true,
      message: `Model trained for ${pair}/${timeframe}`,
      metrics: result.metrics,
      modelPath: result.modelPath,
    });

  } catch (error: any) {
    console.error('Error training model:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to train model' },
      { status: 500 }
    );
  }
}
