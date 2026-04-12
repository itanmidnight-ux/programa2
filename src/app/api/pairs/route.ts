// ============================================
// /api/pairs - Multi-Pair Management API
// ============================================
// GET  /api/pairs          - Get all pairs + active pair
// POST /api/pairs          - Set active pair, add/remove from watchlist
// ============================================

import { NextResponse } from "next/server";
import { multiPairManager } from "@/lib/multi-pair-manager";
import { formatPair, unformatPair } from "@/lib/format-utils";

const DEFAULT_PAIRS = ["XAU_USD", "EUR_USD", "GBP_USD", "USD_JPY", "WTI_USD", "US30_USD"];
const POPULAR_PAIRS = ["XAU_USD", "EUR_USD", "NAS100_USD", "SPX500_USD", "WTI_USD"];

export async function GET() {
  try {
    // Ensure the manager is actively fetching prices before returning data
    multiPairManager.start();
    const summary = multiPairManager.getSummary();
    return NextResponse.json({
      ...summary,
      defaultPairs: DEFAULT_PAIRS.map(formatPair),
      popularPairs: POPULAR_PAIRS.map(formatPair),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, pairs: [], activePair: "XAU_USD" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, symbol } = body;

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "Symbol is required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "setActive": {
        multiPairManager.setActivePair(symbol);
        const updated = multiPairManager.getSummary();
        return NextResponse.json({
          success: true,
          message: `Active pair set to ${unformatPair(symbol)}`,
          ...updated,
        });
      }

      case "add": {
        multiPairManager.addToWatchlist(symbol);
        const updated = multiPairManager.getSummary();
        return NextResponse.json({
          success: true,
          message: `${unformatPair(symbol)} added to watchlist`,
          ...updated,
        });
      }

      case "remove": {
        const removed = multiPairManager.removeFromWatchlist(symbol);
        if (!removed) {
          return NextResponse.json({
            success: false,
            error: "Cannot remove active pair",
          });
        }
        const updated = multiPairManager.getSummary();
        return NextResponse.json({
          success: true,
          message: `${unformatPair(symbol)} removed from watchlist`,
          ...updated,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}. Use: setActive, add, remove` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
