// ============================================
// /api/pairs/prices - Fast Batch Price API
// ============================================
// GET /api/pairs/prices - Get all pair prices
// Uses batch API for maximum speed
// Returns Record<string, PairData> format
// ============================================

import { NextResponse } from "next/server";
import { multiPairManager } from "@/lib/multi-pair-manager";
import { wsPriceManager, formatPair } from "@/lib/binance";

export async function GET() {
  try {
    // Ensure the manager is actively fetching prices
    multiPairManager.start();

    const activePairInfo = multiPairManager.getActivePair();
    const activePair = activePairInfo?.symbol || "BTCUSDT";

    // Try WebSocket prices first (fastest)
    const wsPrices = wsPriceManager.getAllPrices();

    if (wsPrices.size > 0) {
      const pairs: Record<string, any> = {};
      for (const [_key, update] of wsPrices) {
        // Use update.symbol which has correct case from Binance (e.g. "BTCUSDT"),
        // not the Map key which is lowercased (e.g. "btcusdt")
        const sym = update.symbol;
        pairs[sym] = {
          symbol: sym,
          display: formatPair(sym),
          price: update.price,
          change24h: update.change24h,
          high24h: update.high24h,
          low24h: update.low24h,
          volume24h: update.volume24h,
          active: sym === activePair,
          lastUpdate: Date.now(),
        };
      }
      return NextResponse.json({ prices: pairs, source: "websocket", timestamp: Date.now() });
    }

    // Fallback to manager data
    const allPairs = multiPairManager.getAllPairs();
    const prices: Record<string, any> = {};
    for (const pair of allPairs) {
      prices[pair.symbol] = {
        symbol: pair.symbol,
        display: formatPair(pair.symbol),
        price: pair.price,
        change24h: pair.change24h,
        high24h: pair.high24h,
        low24h: pair.low24h,
        volume24h: pair.volume24h,
        active: pair.symbol === activePair,
        lastUpdate: pair.lastUpdate,
      };
    }

    return NextResponse.json({ prices, source: "manager", timestamp: Date.now() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, prices: {}, source: "error" },
      { status: 500 }
    );
  }
}
