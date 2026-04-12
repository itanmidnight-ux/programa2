// ============================================
// AI PREDICTION API endpoint
// POST /api/ai/predict - Make predictions
// GET  /api/ai/predict - Get recent predictions
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { predictTrade, predictAllActiveStrategies, getEnsemblePrediction } from '@/lib/ai/ai-predictor';

const VALID_PAIRS = ['XAU_USD', 'XAG_USD', 'EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CHF', 'WTI_USD', 'BCO_USD', 'US30_USD', 'SPX500_USD', 'NAS100_USD'];
const VALID_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];

/**
 * GET /api/ai/predict - Get recent predictions
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get('pair');
    const timeframe = searchParams.get('timeframe');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    const where: Record<string, any> = {};
    if (pair) where.pair = pair;
    if (timeframe) where.timeframe = timeframe;

    const predictions = await db.aIPrediction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        model: {
          select: {
            name: true,
            version: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({ predictions, count: predictions.length });
  } catch (error: any) {
    console.error('Error fetching predictions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch predictions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai/predict - Make predictions
 * Body: { pair, timeframe } for single prediction
 * Body: { mode: 'all' } for all active strategies
 * Body: { mode: 'ensemble', pair, timeframes: [...] } for ensemble
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Mode: predict all active strategies
    if (body.mode === 'all') {
      const predictions = await predictAllActiveStrategies();
      return NextResponse.json({
        predictions,
        count: predictions.length,
        message: `Made ${predictions.length} predictions`,
      });
    }

    // Mode: ensemble prediction
    if (body.mode === 'ensemble') {
      const pair = body.pair?.toUpperCase();
      const timeframes = body.timeframes || ['1m', '5m', '15m'];

      if (!pair) {
        return NextResponse.json(
          { error: 'Missing required field: pair' },
          { status: 400 }
        );
      }

      const result = await getEnsemblePrediction(pair, timeframes);
      return NextResponse.json(result);
    }

    // Single prediction
    const pair = body.pair?.toUpperCase();
    const timeframe = body.timeframe?.toLowerCase();

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

    const prediction = await predictTrade({ pair, timeframe });

    return NextResponse.json({
      prediction,
      message: `Prediction made for ${pair}/${timeframe}`,
    });

  } catch (error: any) {
    console.error('Error making prediction:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to make prediction' },
      { status: 500 }
    );
  }
}
