// ============================================
// RECO-TRADING - Trades API
// ============================================
// GET  /api/trades  - List trades (filtered)
// POST /api/trades  - Create manual trade record (requires risk validation)
// ============================================
// SECURITY: POST requires valid input, rate-limited by middleware
// ============================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ---- Input validation ----
const VALID_SIDES = ["LONG", "SHORT"];
const VALID_SIGNALS = ["BUY", "SELL", "HOLD"];
const VALID_STATUSES = ["OPEN", "CLOSED", "CANCELLED"];
const MAX_STRING_LENGTH = 50;
const MAX_LIMIT = 500;
const MIN_LIMIT = 1;

function sanitizeString(input: unknown, maxLength = MAX_STRING_LENGTH): string {
  if (typeof input !== "string") return "";
  return input.slice(0, maxLength).replace(/[^A-Za-z0-9_\-\/\s]/g, "").trim();
}

function validateNumber(input: unknown, minVal?: number, maxVal?: number): number | null {
  if (typeof input !== "number" || isNaN(input)) return null;
  if (minVal !== undefined && input < minVal) return null;
  if (maxVal !== undefined && input > maxVal) return null;
  return input;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = parseInt(searchParams.get("limit") || "200");
    const status = searchParams.get("status") || "";
    const pair = sanitizeString(searchParams.get("pair") || "XAU_USD");

    // Validate limit
    const limit = Math.min(Math.max(limitRaw, MIN_LIMIT), MAX_LIMIT);

    const where: Record<string, unknown> = {};
    if (status && status !== "all") {
      const upperStatus = status.toUpperCase();
      if (VALID_STATUSES.includes(upperStatus)) {
        where.status = upperStatus;
      }
    }
    if (pair) where.pair = pair;

    const trades = await db.trade.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const formatted = trades.map((t) => ({
      id: t.id,
      pair: t.pair,
      side: t.side,
      entry: t.entryPrice,
      exit: t.exitPrice || 0,
      size: t.quantity,
      pnl: t.pnl,
      pnl_pct: t.pnlPercent,
      status: t.status,
      time: Math.floor(t.openedAt.getTime() / 1000),
      close_time: t.closedAt ? Math.floor(t.closedAt.getTime() / 1000) : null,
      confidence: t.confidence,
      sl: t.stopLoss || 0,
      tp: t.takeProfit || 0,
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("Trades API error:", error);
    return NextResponse.json({ error: "Database not available", trades: [] }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pair, side, entry, size, confidence, sl, tp, signal } = body;

    // ---- Validate all inputs ----
    const sanitizedPair = sanitizeString(pair, 20);
    if (!sanitizedPair || sanitizedPair.length < 3) {
      return NextResponse.json(
        { error: "Invalid or missing trading pair" },
        { status: 400 }
      );
    }

    const upperSide = (side || "").toUpperCase();
    if (!VALID_SIDES.includes(upperSide)) {
      return NextResponse.json(
        { error: `Invalid side. Must be one of: ${VALID_SIDES.join(", ")}` },
        { status: 400 }
      );
    }

    const entryPrice = validateNumber(entry, 0.000001, 99999999);
    if (entryPrice === null) {
      return NextResponse.json(
        { error: "Invalid entry price. Must be a positive number." },
        { status: 400 }
      );
    }

    const quantity = validateNumber(size, 0.000001, parseFloat(process.env.MAX_QUANTITY || "100"));
    if (quantity === null) {
      return NextResponse.json(
        { error: `Invalid size. Must be between 0.000001 and ${process.env.MAX_QUANTITY || 100}.` },
        { status: 400 }
      );
    }

    const conf = validateNumber(confidence, 0, 1) ?? 0;
    const stopLoss = validateNumber(sl, 0, 99999999) ?? null;
    const takeProfit = validateNumber(tp, 0, 99999999) ?? null;
    const upperSignal = VALID_SIGNALS.includes((signal || "").toUpperCase())
      ? (signal || "").toUpperCase()
      : "HOLD";

    const trade = await db.trade.create({
      data: {
        pair: sanitizedPair,
        side: upperSide,
        entryPrice,
        quantity,
        confidence: conf,
        stopLoss,
        takeProfit,
        signal: upperSignal,
        status: "OPEN",
      },
    });

    // Log the manual trade creation
    await db.systemLog.create({
      data: {
        level: "INFO",
        message: `Manual trade #${trade.id} created: ${upperSide} ${sanitizedPair} @ ${entryPrice}, qty: ${quantity}`,
        source: "api",
      },
    });

    return NextResponse.json({ success: true, trade });
  } catch (error: any) {
    console.error("Trade creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
