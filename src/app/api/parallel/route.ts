// ============================================
// RECO-TRADING - Parallel Engine API
// ============================================
// GET  /api/parallel  - Get portfolio status
// POST /api/parallel  - Control parallel engine
// ============================================

import { NextResponse } from "next/server";
import { parallelEngine, type PortfolioStatus } from "@/lib/parallel-engine";

export async function GET() {
  const startTime = Date.now();
  try {
    const status = parallelEngine.getStatus();
    const config = parallelEngine.getConfig();

    const apiLatency = Date.now() - startTime;

    const pairsSummary = Array.from(status.pairs.values()).map(p => ({
      pair: p.pair,
      status: p.status,
      hasPosition: p.hasPosition,
      positionSide: p.positionSide,
      positionPnl: p.positionPnl,
      lastSignal: p.lastSignal,
      lastTick: p.lastTick,
    }));

    return NextResponse.json({
      running: status.running,
      totalPairs: config.pairs.length,
      activePairs: status.activePairs,
      totalPositions: status.totalPositions,
      totalTradesToday: status.totalTradesToday,
      dailyPnl: +status.dailyPnl.toFixed(2),
      portfolioRisk: +status.portfolioRisk.toFixed(2),
      maxPositions: config.maxConcurrentPositions,
      canOpenPosition: parallelEngine.canOpenNewPosition(),
      pairs: pairsSummary,
      api_latency_ms: apiLatency,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, running: false, api_latency_ms: Date.now() - Date.now() },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'start':
        parallelEngine.start();
        return NextResponse.json({
          success: true,
          message: 'Parallel engine started',
          state: 'RUNNING'
        });

      case 'stop':
        parallelEngine.stop();
        return NextResponse.json({
          success: true,
          message: 'Parallel engine stopped',
          state: 'STOPPED'
        });

      case 'addPair':
        const { pair } = body;
        if (pair) {
          parallelEngine.addPair(pair);
          return NextResponse.json({
            success: true,
            message: `Added pair ${pair}`,
            pairs: parallelEngine.getConfig().pairs
          });
        }
        return NextResponse.json({ error: 'Pair not specified' }, { status: 400 });

      case 'removePair':
        const { pair: removePair } = body;
        if (removePair) {
          parallelEngine.removePair(removePair);
          return NextResponse.json({
            success: true,
            message: `Removed pair ${removePair}`,
            pairs: parallelEngine.getConfig().pairs
          });
        }
        return NextResponse.json({ error: 'Pair not specified' }, { status: 400 });

      case 'setMaxPositions':
        const { maxPositions } = body;
        if (maxPositions && maxPositions > 0) {
          parallelEngine.setMaxPositions(maxPositions);
          return NextResponse.json({
            success: true,
            message: `Max positions set to ${maxPositions}`
          });
        }
        return NextResponse.json({ error: 'maxPositions not specified' }, { status: 400 });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}