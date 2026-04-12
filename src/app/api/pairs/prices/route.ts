// ============================================
// /api/pairs/prices - Fast Batch Price API
// ============================================
// GET /api/pairs/prices - Get all pair prices
// Uses batch API for maximum speed
// Returns Record<string, PairData> format
// ============================================

import { NextResponse } from "next/server";
import { multiPairManager } from "@/lib/multi-pair-manager";
import { formatPair } from "@/lib/format-utils";

export async function GET() {
  try {
    // Ensure the manager is actively fetching prices
    multiPairManager.start();

    const activePairInfo = multiPairManager.getActivePair();
    const activePair = activePairInfo?.symbol || "XAU_USD";

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
