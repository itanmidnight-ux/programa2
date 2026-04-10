// ============================================
// RECO-TRADING - Market Analysis API
// ============================================
// GET /api/market/analysis?pair=BTC/USDT
// Returns full technical analysis with all
// indicators across multiple timeframes
// ============================================

import { NextResponse } from "next/server";
import { getKlines, getOrderBook, get24hTicker, isTestnetMode } from "@/lib/binance";
import { analyzeSignals } from "@/lib/signal-engine";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FullAnalysis {
  pair: string;
  timestamp: string;
  price: number;
  change_24h: number;
  volume_24h: number;
  spread: number;
  bid: number;
  ask: number;
  bidVolume: number;
  askVolume: number;
  signal: string;
  confidence: number;
  trend: string;
  momentum: string;
  volume: string;
  volatility: string;
  structure: string;
  orderFlow: string;
  rsi: number;
  adx: number;
  atr: number;
  volumeRatio: number;
  confluenceScore: number;
  marketRegime: string;
  timeframeAnalysis: Record<string, string>;
  signals: Record<string, string>;
  candles: {
    "5m": Candle[];
    "15m": Candle[];
    "1h": Candle[];
    "4h": Candle[];
  };
  orderBook: {
    bid: number;
    ask: number;
    spread: number;
    bidVolume: number;
    askVolume: number;
  };
  api_latency_ms: number;
}

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get("pair") || process.env.TRADING_PAIR || "BTC/USDT";
    const testnet = isTestnetMode();

    // Fetch data from Binance
    let klines5m: Candle[] = [];
    let klines15m: Candle[] = [];
    let klines1h: Candle[] = [];
    let klines4h: Candle[] = [];
    let orderBookData: any = null;
    let tickerData: any = null;

    try {
      [klines5m, klines15m, klines1h, klines4h, orderBookData, tickerData] = await Promise.all([
        getKlines(pair, "5m", 200, testnet).catch(() => []),
        getKlines(pair, "15m", 200, testnet).catch(() => []),
        getKlines(pair, "1h", 200, testnet).catch(() => []),
        getKlines(pair, "4h", 200, testnet).catch(() => []),
        getOrderBook(pair, 10, testnet).catch(() => null),
        get24hTicker(pair, testnet).catch(() => null),
      ]);
    } catch {
      // Binance not available
    }

    if (klines5m.length === 0) {
      return NextResponse.json({
        error: "Unable to fetch market data",
        notice: "Binance API unavailable or no data returned. Check API keys and network.",
        api_latency_ms: Date.now() - startTime,
      }, { status: 503 });
    }

    const currentPrice = klines5m[klines5m.length - 1]?.close || 0;
    const spread = orderBookData?.spread || 0;

    // Run analysis on multiple timeframes
    const analysis5m = analyzeSignals(klines5m, klines15m, klines1h, spread);

    // Also run analysis on 15m for secondary signal
    let analysis15m: ReturnType<typeof analyzeSignals> | undefined;
    if (klines15m.length > 50) {
      try {
        analysis15m = analyzeSignals(klines15m, klines1h, klines4h, spread);
      } catch {
        // Skip 15m analysis
      }
    }

    // Run analysis on 1h for higher timeframe bias
    let analysis1h: ReturnType<typeof analyzeSignals> | undefined;
    if (klines1h.length > 50) {
      try {
        analysis1h = analyzeSignals(klines1h, klines4h, undefined, spread);
      } catch {
        // Skip 1h analysis
      }
    }

    const result: FullAnalysis = {
      pair,
      timestamp: new Date().toISOString(),
      price: +currentPrice.toFixed(2),
      change_24h: tickerData ? +parseFloat(tickerData.priceChangePercent).toFixed(2) : 0,
      volume_24h: tickerData ? +parseFloat(tickerData.quoteVolume).toFixed(2) : 0,
      spread: orderBookData?.spread || 0,
      bid: orderBookData?.bid || 0,
      ask: orderBookData?.ask || 0,
      bidVolume: orderBookData?.bidVolume || 0,
      askVolume: orderBookData?.askVolume || 0,
      signal: analysis5m.signal,
      confidence: analysis5m.confidence,
      trend: analysis5m.trend,
      momentum: analysis5m.momentum,
      volume: analysis5m.volume,
      volatility: analysis5m.volatility,
      structure: analysis5m.structure,
      orderFlow: analysis5m.orderFlow,
      rsi: analysis5m.rsi,
      adx: analysis5m.adx,
      atr: analysis5m.atr,
      volumeRatio: analysis5m.volumeRatio,
      confluenceScore: analysis5m.confluenceScore,
      marketRegime: analysis5m.marketRegime,
      timeframeAnalysis: {
        "5m": analysis5m.trend,
        "15m": analysis15m?.trend || analysis5m.timeframeAnalysis["15m"] || "NEUTRAL",
        "1h": analysis1h?.trend || analysis5m.timeframeAnalysis["1h"] || "NEUTRAL",
        "4h": klines4h.length > 0 ? (klines4h[klines4h.length - 1].close > klines4h[Math.max(0, klines4h.length - 20)].close ? "BULLISH" : "BEARISH") : "NEUTRAL",
      },
      signals: {
        trend: analysis5m.trend,
        momentum: analysis5m.momentum,
        volume: analysis5m.volume,
        volatility: analysis5m.volatility,
        structure: analysis5m.structure,
        order_flow: analysis5m.orderFlow,
      },
      candles: {
        "5m": klines5m,
        "15m": klines15m,
        "1h": klines1h,
        "4h": klines4h,
      },
      orderBook: orderBookData || { bid: 0, ask: 0, spread: 0, bidVolume: 0, askVolume: 0 },
      api_latency_ms: Date.now() - startTime,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, api_latency_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
