// ============================================
// STRATEGY BACKTEST API endpoint
// POST /api/strategy/backtest - Run backtest
// GET  /api/strategy/backtest - List backtest results
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runBacktest, saveBacktestResult } from '@/lib/ai/backtest-engine';

const VALID_PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'MATICUSDT', 'LTCUSDT', 'UNIUSDT', 'NEARUSDT', 'ATOMUSDT', 'FILUSDT', 'INJUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'BNBUSDT'];
const VALID_TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];

/**
 * GET /api/strategy/backtest - List backtest results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get('pair');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    const where: Record<string, any> = {};
    if (pair) where.pair = pair;

    const results = await db.strategyValidation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ results, count: results.length });
  } catch (error: any) {
    console.error('Error listing backtests:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list backtests' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/strategy/backtest - Run a backtest
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
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

    // Parse dates
    const startDate = body.startDate ? new Date(body.startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Default 90 days ago
    const endDate = body.endDate ? new Date(body.endDate) : new Date();
    const initialCapital = Math.min(Math.max(body.initialCapital || 10000, 100), 1000000);
    const riskPerTrade = Math.min(Math.max(body.riskPerTrade || 1, 0.1), 10);
    const takerFee = body.takerFee || 0.0004;
    const slippage = body.slippage || 0.0005;
    const maxDrawdown = Math.min(Math.max(body.maxDrawdown || 15, 5), 50);

    // Run backtest
    console.log(`🚀 Starting backtest for ${pair}/${timeframe}...`);

    const result = await runBacktest({
      pair,
      timeframe,
      startDate,
      endDate,
      initialCapital,
      riskPerTrade,
      takerFee,
      slippage,
      maxDrawdown,
    });

    // Save to database
    await saveBacktestResult(result);

    return NextResponse.json({
      success: true,
      result: {
        ...result,
        trades: result.trades.slice(0, 100), // Limit trades in response
        equityCurve: result.equityCurve.slice(-100), // Last 100 points
      },
      message: `Backtest completed for ${pair}/${timeframe}`,
    });

  } catch (error: any) {
    console.error('Error running backtest:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run backtest' },
      { status: 500 }
    );
  }
}
