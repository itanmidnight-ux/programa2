// ============================================
// /api/pairs/candles - Get candles for specific pair
// ============================================
// GET /api/pairs/candles?symbol=XAU_USD&interval=5m&limit=200
// Returns candlestick data for the requested pair
// Uses broker-manager unified market data
// ============================================

import { NextResponse } from "next/server";
import { getKlines } from "@/lib/broker-manager";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "XAU_USD")
    .replace("/", "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toUpperCase();
  const interval = searchParams.get("interval") || "5m";
  const validIntervals = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"];
  const safeInterval = validIntervals.includes(interval) ? interval : "5m";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "200"), 1), 1000);
  try {
    const candles = await getKlines(symbol, safeInterval, limit);

    if (!candles || candles.length === 0) {
      return NextResponse.json({
        symbol,
        interval,
        candles: [],
        indicators: { ma7: null, ma25: null, ma99: null, rsi: 50, volume_avg: 0 },
        count: 0,
        timestamp: Date.now(),
        warning: `No candle data returned for ${symbol}. The pair may not be available on the configured broker.`,
      });
    }

    // Calculate basic indicators for the candles
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const ma7 = closes.length >= 7 ? closes.slice(-7).reduce((a, b) => a + b, 0) / 7 : null;
    const ma25 = closes.length >= 25 ? closes.slice(-25).reduce((a, b) => a + b, 0) / 25 : null;
    const ma99 = closes.length >= 99 ? closes.slice(-99).reduce((a, b) => a + b, 0) / 99 : null;

    // RSI calculation (14 period)
    let rsi = 50;
    if (closes.length >= 15) {
      let gains = 0, losses = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }

    return NextResponse.json({
      symbol,
      interval: safeInterval,
      candles,
      indicators: {
        ma7: ma7 ? +ma7.toFixed(2) : null,
        ma25: ma25 ? +ma25.toFixed(2) : null,
        ma99: ma99 ? +ma99.toFixed(2) : null,
        rsi: +rsi.toFixed(2),
        volume_avg: volumes.length > 0 ? +(volumes.reduce((a, b) => a + b, 0) / volumes.length).toFixed(2) : 0,
      },
      count: candles.length,
      timestamp: Date.now(),
      source: "broker-manager",
    });
  } catch (error: any) {
    const errorMsg = error.message || "Unknown error";
    
    return NextResponse.json(
      { 
        error: errorMsg, 
        symbol, 
        interval,
        candles: [], 
        count: 0,
        hint: "If this error persists, confirm OANDA credentials and symbol availability.",
        mode: "broker",
      },
      { status: 500 }
    );
  }
}
