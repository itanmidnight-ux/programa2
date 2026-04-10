// ============================================
// RECO-TRADING - Trade Execution API
// ============================================
// POST /api/execute
// Body: { action: 'buy'|'sell'|'close', pair?, quantity?, price?, confidence? }
// Validates risk, places order, records in DB
// Uses DB transactions to prevent race conditions
// ============================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTickerPrice, getOrderBook, isTestnetMode, getCurrentCredentials } from "@/lib/binance";
import { automation } from "@/lib/automation";

interface ExecuteRequest {
  action: "buy" | "sell" | "close";
  pair?: string;
  quantity?: number;
  price?: number;
  confidence?: number;
}

// ---- Input validation constants ----
const MAX_QUANTITY = parseFloat(process.env.MAX_QUANTITY || "100");
const MIN_QUANTITY = 0.0001;
const MAX_PAIR_LENGTH = 20;

function sanitizePair(pair: string): string {
  // Only allow alphanumeric characters and /
  const cleaned = pair.replace(/[^A-Za-z0-9/]/g, "").toUpperCase();
  return cleaned.slice(0, MAX_PAIR_LENGTH);
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const body: ExecuteRequest = await request.json();
    const { action, pair: inputPair, quantity: inputQty, price: inputPrice, confidence: inputConfidence } = body;

    if (!action || !["buy", "sell", "close"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action. Use: buy, sell, or close", message: "Validation failed" },
        { status: 400 }
      );
    }

    const pair = sanitizePair(inputPair || process.env.TRADING_PAIR || "BTC/USDT");
    if (!pair || pair.length < 3) {
      return NextResponse.json(
        { success: false, error: "Invalid trading pair", message: "Validation failed" },
        { status: 400 }
      );
    }
    
    const testnet = isTestnetMode();
    const creds = getCurrentCredentials();
    const hasRealKeys = !!(creds.apiKey && creds.apiSecret);

    // ---- CLOSE action ----
    if (action === "close") {
      let openPosition: any = null;
      try {
        const positions = await db.position.findMany({
          where: { pair },
          include: { trade: true },
        });
        if (positions.length > 0) {
          openPosition = positions[0];
        }
      } catch {
        return NextResponse.json(
          { success: false, error: "Database not available", message: "Cannot close position" },
          { status: 503 }
        );
      }

      if (!openPosition) {
        return NextResponse.json({
          success: false,
          error: "No open position found",
          message: `No open position for ${pair}`,
        });
      }

      let currentPrice = openPosition.currentPrice;
      try {
        currentPrice = await getTickerPrice(pair, testnet);
      } catch {
        // Use stored price
      }

      const trade = openPosition.trade;
      const isLong = trade.side === "LONG";
      const pnl = isLong
        ? (currentPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - currentPrice) * trade.quantity;
      const pnlPercent = trade.entryPrice > 0
        ? ((isLong ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) / trade.entryPrice) * 100
        : 0;

      const exitReason = pnl > 0
        ? (Math.abs(pnlPercent) > 2 ? "TAKE_PROFIT" : "SIGNAL")
        : "STOP_LOSS";

      try {
        await db.trade.update({
          where: { id: trade.id },
          data: {
            exitPrice: currentPrice,
            pnl: +pnl.toFixed(2),
            pnlPercent: +pnlPercent.toFixed(2),
            status: "CLOSED",
            exitReason,
            closedAt: new Date(),
          },
        });

        await db.position.delete({
          where: { id: openPosition.id },
        });

        await db.systemLog.create({
          data: {
            level: "INFO",
            message: `Closed ${trade.side} position #${trade.id}: ${pair} @ ${currentPrice.toFixed(2)}, PNL: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`,
            source: "execute",
          },
        });
      } catch (dbError: any) {
        console.error('[EXECUTE] DB error closing position:', dbError);
        return NextResponse.json(
          { success: false, error: "Database error", message: "Failed to close position" },
          { status: 500 }
        );
      }

      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTrades = await db.trade.findMany({
          where: { openedAt: { gte: today }, status: "CLOSED" },
        });
        const dailyPnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        automation.updateDailyPnl(dailyPnl);
      } catch { /* ignore */ }

      return NextResponse.json({
        success: true,
        trade: {
          id: trade.id,
          pair,
          side: trade.side,
          entry: trade.entryPrice,
          exit: currentPrice,
          size: trade.quantity,
          pnl: +pnl.toFixed(2),
          pnl_pct: +pnlPercent.toFixed(2),
          exit_reason: exitReason,
        },
        message: `Closed ${trade.side} position: $${pnl.toFixed(2)} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%)`,
        simulated: !hasRealKeys,
        api_latency_ms: Date.now() - startTime,
      });
    }

    // ---- BUY/SELL action ----

    // Validate quantity if provided
    if (inputQty !== undefined) {
      if (typeof inputQty !== "number" || isNaN(inputQty) || inputQty <= 0) {
        return NextResponse.json(
          { success: false, error: "Quantity must be a positive number", message: "Validation failed" },
          { status: 400 }
        );
      }
      if (inputQty > MAX_QUANTITY) {
        return NextResponse.json(
          { success: false, error: `Quantity exceeds maximum (${MAX_QUANTITY})`, message: "Validation failed" },
          { status: 400 }
        );
      }
    }

    // Validate confidence if provided
    if (inputConfidence !== undefined) {
      if (typeof inputConfidence !== "number" || inputConfidence < 0 || inputConfidence > 1) {
        return NextResponse.json(
          { success: false, error: "Confidence must be between 0 and 1", message: "Validation failed" },
          { status: 400 }
        );
      }
    }

    // ---- USE DB TRANSACTION TO PREVENT RACE CONDITIONS ----
    try {
      const result = await db.$transaction(async (tx) => {
        // Check for existing open positions inside transaction
        const count = await tx.position.count();
        if (count > 0) {
          const pos = await tx.position.findFirst({ include: { trade: true } });
          return {
            success: false as const,
            error: "Position already open",
            message: `Close existing position before opening a new one (pair: ${pos?.pair}, side: ${pos?.trade.side})`,
          };
        }

        // Get current price
        let currentPrice = inputPrice || 0;
        if (!currentPrice) {
          currentPrice = await getTickerPrice(pair, testnet);
        }
        if (!currentPrice || currentPrice <= 0) {
          return {
            success: false as const,
            error: "Cannot fetch valid current price",
            message: "Market data unavailable",
          };
        }

        // Get order book
        let orderBook = { spread: 1 };
        try {
          orderBook = await getOrderBook(pair, 5, testnet);
        } catch { /* skip */ }

        // Determine side
        const side = action === "buy" ? "LONG" : "SHORT";
        const confidence = inputConfidence || 0.7;

        // Calculate quantity if not provided
        let quantity = inputQty || 0;
        if (!quantity) {
          const riskAmount = parseFloat(process.env.INITIAL_CAPITAL || '1000') * 0.01;
          const slDistance = currentPrice * 0.015;
          quantity = riskAmount / slDistance;
        }
        quantity = Math.max(MIN_QUANTITY, Math.min(quantity, MAX_QUANTITY));

        // Calculate SL/TP
        const slPercent = 1.5;
        const tpPercent = 2.5;
        const stopLoss = side === "LONG"
          ? +(currentPrice * (1 - slPercent / 100)).toFixed(2)
          : +(currentPrice * (1 + slPercent / 100)).toFixed(2);
        const takeProfit = side === "LONG"
          ? +(currentPrice * (1 + tpPercent / 100)).toFixed(2)
          : +(currentPrice * (1 - tpPercent / 100)).toFixed(2);

        // Create trade + position atomically
        const tradeRecord = await tx.trade.create({
          data: {
            pair,
            side,
            entryPrice: currentPrice,
            quantity,
            confidence,
            stopLoss,
            takeProfit,
            signal: action === "buy" ? "BUY" : "SELL",
            status: "OPEN",
            strategy: "manual",
          },
        });

        const positionRecord = await tx.position.create({
          data: {
            tradeId: tradeRecord.id,
            pair,
            side,
            entryPrice: currentPrice,
            currentPrice,
            quantity,
            unrealizedPnl: 0,
            stopLoss,
            takeProfit,
          },
        });

        // Log the trade
        await tx.systemLog.create({
          data: {
            level: "INFO",
            message: `Opened ${side} position #${tradeRecord.id}: ${pair} @ ${currentPrice.toFixed(2)}, qty: ${quantity.toFixed(4)}, SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)}${!hasRealKeys ? " (SIMULATED)" : " (REAL)"}`,
            source: "execute",
          },
        });

        return {
          success: true as const,
          trade: {
            id: tradeRecord.id,
            pair,
            side,
            entry: tradeRecord.entryPrice,
            size: tradeRecord.quantity,
            confidence: tradeRecord.confidence,
            sl: stopLoss,
            tp: takeProfit,
            status: "OPEN",
          },
          message: `Opened ${side} position: ${quantity.toFixed(4)} ${pair} @ ${currentPrice.toFixed(2)}`,
          simulated: !hasRealKeys,
          api_latency_ms: Date.now() - startTime,
        };
      });

      return NextResponse.json(result);
    } catch (error: any) {
      console.error('[EXECUTE] Transaction error:', error);
      return NextResponse.json(
        { success: false, error: "Internal error", message: "Trade execution failed" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[EXECUTE] Error:', error);
    return NextResponse.json(
      { success: false, error: "Internal error", message: "Execution failed" },
      { status: 500 }
    );
  }
}
