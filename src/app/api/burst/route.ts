import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Get burst status
export async function GET() {
  try {
    const activeBursts = await db.tradeGroup.findMany({
      where: { status: 'ACTIVE' },
      include: {
        trades: {
          include: {
            positions: true,
          },
        },
      },
    });

    const closedBursts = await db.tradeGroup.findMany({
      where: { status: 'CLOSED' },
      orderBy: { closeTime: 'desc' },
      take: 20,
    });

    const allTrades = await db.trade.findMany({
      where: { tradeGroupId: { not: null } },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      activeBursts,
      closedBursts,
      burstTrades: allTrades,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown error',
    }, { status: 500 });
  }
}

// POST - Configure burst mode
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      enable,
      maxTradesPerBurst,
      minSignalStrength,
      delayBetweenTradesMs,
      maxTotalExposurePct,
    } = body;

    // Store config in DB
    await db.appSetting.upsert({
      where: { key: 'burst_config' },
      update: {
        value: JSON.stringify({
          enableBurstMode: enable ?? true,
          maxTradesPerBurst: maxTradesPerBurst ?? 15,
          minSignalStrength: minSignalStrength ?? 65,
          delayBetweenTradesMs: delayBetweenTradesMs ?? 200,
          maxTotalExposurePct: maxTotalExposurePct ?? 15,
        }),
        section: 'burst',
      },
      create: {
        key: 'burst_config',
        value: JSON.stringify({
          enableBurstMode: enable ?? true,
          maxTradesPerBurst: maxTradesPerBurst ?? 15,
          minSignalStrength: minSignalStrength ?? 65,
          delayBetweenTradesMs: delayBetweenTradesMs ?? 200,
          maxTotalExposurePct: maxTotalExposurePct ?? 15,
        }),
        section: 'burst',
      },
    });

    return NextResponse.json({
      success: true,
      message: `Burst mode ${enable ? 'enabled' : 'disabled'}`,
      config: {
        enableBurstMode: enable ?? true,
        maxTradesPerBurst: maxTradesPerBurst ?? 15,
        minSignalStrength: minSignalStrength ?? 65,
        delayBetweenTradesMs: delayBetweenTradesMs ?? 200,
        maxTotalExposurePct: maxTotalExposurePct ?? 15,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown error',
    }, { status: 500 });
  }
}
