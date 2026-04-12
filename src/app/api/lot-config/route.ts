import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Get lot config
export async function GET() {
  try {
    const setting = await db.appSetting.findUnique({
      where: { key: 'lot_config' },
    });

    if (!setting) {
      return NextResponse.json({
        success: true,
        config: {
          mode: 'PERCENTAGE',
          fixedLotSize: 0.10,
          riskPerTradePct: 1.0,
          kellyFraction: 0.25,
          minLotSize: 0.01,
          maxLotSize: 10.0,
          maxTotalExposurePct: 30,
        },
      });
    }

    return NextResponse.json({
      success: true,
      config: JSON.parse(setting.value),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown error',
    }, { status: 500 });
  }
}

// POST - Save lot config
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      mode,
      fixedLotSize,
      riskPerTradePct,
      kellyFraction,
      minLotSize,
      maxLotSize,
      maxTotalExposurePct,
    } = body;

    const config = {
      mode: mode || 'PERCENTAGE',
      fixedLotSize: fixedLotSize ?? 0.10,
      riskPerTradePct: riskPerTradePct ?? 1.0,
      kellyFraction: kellyFraction ?? 0.25,
      minLotSize: minLotSize ?? 0.01,
      maxLotSize: maxLotSize ?? 10.0,
      maxTotalExposurePct: maxTotalExposurePct ?? 30,
    };

    await db.appSetting.upsert({
      where: { key: 'lot_config' },
      update: {
        value: JSON.stringify(config),
        section: 'trading',
        description: 'Lot management configuration (MT5 style)',
      },
      create: {
        key: 'lot_config',
        value: JSON.stringify(config),
        section: 'trading',
        description: 'Lot management configuration (MT5 style)',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Lot config saved',
      config,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown error',
    }, { status: 500 });
  }
}
