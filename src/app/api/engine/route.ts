// ============================================
// RECO-TRADING - Engine Control API
// ============================================
// GET  /api/engine  - Get engine status + metrics
// POST /api/engine  - Control engine (start/stop/tick)
// ============================================

import { NextResponse } from "next/server";
import { automation } from "@/lib/automation";
import { db } from "@/lib/db";

export async function GET() {
  const startTime = Date.now();
  try {
    const metrics = automation.getMetrics();
    const status = automation.getStatus();

    // Fetch today's trade count from DB
    let tradesToday = 0;
    let dailyPnl = 0;
    let hasOpenPosition = false;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTrades = await db.trade.findMany({
        where: { openedAt: { gte: today } },
      });
      tradesToday = todayTrades.length;
      dailyPnl = todayTrades
        .filter(t => t.status === "CLOSED")
        .reduce((sum, t) => sum + t.pnl, 0);
      const openPositions = await db.position.count();
      hasOpenPosition = openPositions > 0;
    } catch {
      // DB not ready, use automation defaults
    }

    const apiLatency = Date.now() - startTime;

    return NextResponse.json({
      state: status.running ? "RUNNING" : "STOPPED",
      running: metrics.running,
      lastTick: metrics.lastTick,
      tradesToday,
      dailyPnl: +dailyPnl.toFixed(2),
      currentPosition: hasOpenPosition,
      uptime: metrics.uptime,
      nextTickIn: metrics.nextTickIn,
      api_latency_ms: apiLatency,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, state: "ERROR", running: false, api_latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const { action } = body;

    if (!action || !["start", "stop", "tick"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "Invalid action. Use: start, stop, or tick" },
        { status: 400 }
      );
    }

    let result: { success: boolean; message: string };

    switch (action) {
      case "start":
        await automation.start();
        result = { success: true, message: "Engine started" };
        break;
      case "stop":
        automation.stop();
        result = { success: true, message: "Engine stopped" };
        break;
      case "tick":
        const tickResult = await automation.tick();
        result = { success: true, message: `Tick completed: ${tickResult.action}` };
        break;
      default:
        return NextResponse.json(
          { success: false, message: "Unknown action" },
          { status: 400 }
        );
    }

    const metrics = automation.getMetrics();
    const status = automation.getStatus();

    return NextResponse.json({
      ...result,
      state: status.running ? "RUNNING" : "STOPPED",
      metrics,
      api_latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message, api_latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
