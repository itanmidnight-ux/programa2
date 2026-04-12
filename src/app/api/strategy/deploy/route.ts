// ============================================
// STRATEGY DEPLOY API endpoint
// POST /api/strategy/deploy - Deploy/activate a strategy
// GET  /api/strategy/deploy - List deployed strategies
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/strategy/deploy - List deployed strategies
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get('pair');

    const where: Record<string, any> = {
      isDeployed: true,
    };
    if (pair) where.pair = pair;

    const strategies = await db.strategyValidation.findMany({
      where,
      orderBy: { deployedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ strategies, count: strategies.length });
  } catch (error: any) {
    console.error('Error listing deployed strategies:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list strategies' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/strategy/deploy - Deploy a strategy (activate model)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Deploy by strategy validation ID
    if (body.validationId) {
      const validation = await db.strategyValidation.findUnique({
        where: { id: body.validationId },
      });

      if (!validation) {
        return NextResponse.json(
          { error: 'Strategy validation not found' },
          { status: 404 }
        );
      }

      await db.strategyValidation.update({
        where: { id: body.validationId },
        data: {
          isDeployed: true,
          deployedAt: new Date(),
        },
      });

      // Also activate the associated model
      if (validation.modelId) {
        await db.aIModel.update({
          where: { id: validation.modelId },
          data: {
            isActive: true,
            deployedAt: new Date(),
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Strategy ${validation.name} deployed`,
      });
    }

    // Activate model directly by pair/timeframe
    const pair = body.pair?.toUpperCase();
    const timeframe = body.timeframe?.toLowerCase();

    if (!pair || !timeframe) {
      return NextResponse.json(
        { error: 'Missing required fields: pair, timeframe OR validationId' },
        { status: 400 }
      );
    }

    // Find latest model for this pair/timeframe
    const model = await db.aIModel.findFirst({
      where: { pair, timeframe },
      orderBy: { version: 'desc' },
    });

    if (!model) {
      return NextResponse.json(
        { error: `No model found for ${pair}/${timeframe}` },
        { status: 404 }
      );
    }

    await db.aIModel.update({
      where: { id: model.id },
      data: {
        isActive: true,
        deployedAt: new Date(),
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({
      success: true,
      message: `Model ${model.name} deployed and activated`,
      modelId: model.id,
    });

  } catch (error: any) {
    console.error('Error deploying strategy:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to deploy strategy' },
      { status: 500 }
    );
  }
}
