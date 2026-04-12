import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveBroker, setActiveBroker } from "@/lib/broker-credentials";

// GET /api/config — Read trading configuration
export async function GET() {
  try {
    let config = await db.tradingConfig.findUnique({ where: { id: "main" } });
    if (!config) {
      config = await db.tradingConfig.create({ data: { id: "main" } });
    }
    return NextResponse.json({
      pair: config.pair,
      timeframe: config.timeframe,
      riskPerTrade: config.riskPerTrade,
      maxDailyLoss: config.maxDailyLoss,
      maxDrawdown: config.maxDrawdown,
      maxTradesPerDay: config.maxTradesPerDay,
      minConfidence: config.minConfidence,
      capitalMode: config.capitalMode,
      initialCapital: config.initialCapital,
      botEnabled: config.botEnabled,
      testnet: config.testnet,
      brokerActive: await getActiveBroker(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}

// PUT /api/config — Update trading configuration
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (body.brokerActive) {
      await setActiveBroker(body.brokerActive);
    }
    const config = await db.tradingConfig.upsert({
      where: { id: "main" },
      update: {
        ...(body.pair !== undefined && { pair: body.pair }),
        ...(body.riskPerTrade !== undefined && { riskPerTrade: body.riskPerTrade }),
        ...(body.maxDailyLoss !== undefined && { maxDailyLoss: body.maxDailyLoss }),
        ...(body.capitalMode !== undefined && { capitalMode: body.capitalMode }),
        ...(body.botEnabled !== undefined && { botEnabled: body.botEnabled }),
      },
      create: { id: "main", ...(body.pair && { pair: body.pair }) },
    });
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
