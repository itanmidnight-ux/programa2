"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createChart, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTradingStore, type CandleData, type PairCandlesData } from "@/lib/trading-store";

type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h";
const timeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "4h"];

function toUnixSec(t: number): number {
  return t > 1_000_000_000_000 ? Math.floor(t / 1000) : Math.floor(t);
}

function formatNyTime(sec: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(sec * 1000));
}

function rollingMA(candles: CandleData[], period: number) {
  const out: Array<{ time: number; value: number }> = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += candles[j].close;
    out.push({ time: toUnixSec(candles[i].time), value: +(s / period).toFixed(3) });
  }
  return out;
}

export function ChartsPanel() {
  const { selectedPair, pairCandles, setPairCandles, pairPrices } = useTradingStore();
  const [activeTf, setActiveTf] = useState<Timeframe>("5m");
  const [showMA, setShowMA] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<CandleData | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volSeriesRef = useRef<any>(null);
  const ma7Ref = useRef<any>(null);
  const ma25Ref = useRef<any>(null);

  const currentPairData = pairPrices[selectedPair];
  const pairDisplay = selectedPair.replace("_", "/");
  const pairPrice = currentPairData?.price || 0;
  const pairChange = currentPairData?.change24h || 0;

  const fetchCandles = useCallback(async () => {
    if (!selectedPair) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pairs/candles?symbol=${selectedPair}&interval=${activeTf}&limit=220`);
      if (!res.ok) {
        setError("Failed to load market candles");
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data?.candles)) {
        setError("Invalid candle payload");
        return;
      }
      const candleData: PairCandlesData = {
        symbol: data.symbol,
        interval: data.interval,
        candles: data.candles,
        indicators: data.indicators || { ma7: null, ma25: null, ma99: null, rsi: 50, volume_avg: 0 },
        lastFetch: data.timestamp,
      };
      setPairCandles(candleData);
    } catch {
      setError("Network error while fetching candles");
    } finally {
      setIsLoading(false);
    }
  }, [selectedPair, activeTf, setPairCandles]);

  useEffect(() => {
    fetchCandles();
  }, [fetchCandles]);

  useEffect(() => {
    const id = setInterval(fetchCandles, 15000);
    return () => clearInterval(id);
  }, [fetchCandles]);

  const candles = useMemo(() => (pairCandles?.candles || []).slice(-180), [pairCandles]);
  const lastCandle = hover || candles[candles.length - 1] || null;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "#0b1220" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: {
        borderColor: "rgba(148,163,184,0.15)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        timeFormatter: (time: any) => formatNyTime(Number(time)),
      },
      autoSize: true,
    } as any);

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
      priceLineVisible: true,
      lastValueVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.24 } });

    const ma7 = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
    const ma25 = chart.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 2, lastValueVisible: false, priceLineVisible: false });

    chart.subscribeCrosshairMove((param: any) => {
      if (!param?.seriesData) {
        setHover(null);
        return;
      }
      const c = param.seriesData.get(candleSeries);
      if (!c) {
        setHover(null);
        return;
      }
      setHover({
        time: Number(param.time || 0),
        open: Number(c.open || 0),
        high: Number(c.high || 0),
        low: Number(c.low || 0),
        close: Number(c.close || 0),
        volume: 0,
      });
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volSeriesRef.current = volumeSeries;
    ma7Ref.current = ma7;
    ma25Ref.current = ma25;

    const ro = new ResizeObserver(() => {
      if (!chartContainerRef.current) return;
      chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight });
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      ma7Ref.current = null;
      ma25Ref.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volSeriesRef.current) return;

    const candleData = candles.map((c) => ({
      time: toUnixSec(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map((c) => ({
      time: toUnixSec(c.time),
      value: c.volume,
      color: c.close >= c.open ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)",
    }));

    candleSeriesRef.current.setData(candleData);
    volSeriesRef.current.setData(volumeData);

    if (showMA && ma7Ref.current && ma25Ref.current) {
      ma7Ref.current.setData(rollingMA(candles, 7));
      ma25Ref.current.setData(rollingMA(candles, 25));
    } else {
      ma7Ref.current?.setData([]);
      ma25Ref.current?.setData([]);
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, showMA]);

  const rsi = pairCandles?.indicators?.rsi || 50;
  const isUp = pairChange >= 0;

  return (
    <div className="space-y-4 p-4 lg:p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-white">{pairDisplay}</h2>
            {pairPrice > 0 && (
              <span className="text-lg font-mono font-semibold text-white">
                ${pairPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            <span className={cn("text-sm font-mono font-medium px-2 py-0.5 rounded", isUp ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10")}>
              {isUp ? "+" : ""}{pairChange.toFixed(2)}%
            </span>
            <span className="text-xs text-gray-500">
              NY: {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date())}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>{candles.length} candles</span>
            <span>·</span>
            <span>{activeTf}</span>
            <span>·</span>
            <span className={cn(rsi > 70 ? "text-red-400" : rsi < 30 ? "text-emerald-400" : "text-gray-400")}>RSI: {rsi.toFixed(1)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTf(tf)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                activeTf === tf
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                  : "text-gray-500 hover:text-gray-300 border border-transparent hover:bg-white/[0.04]"
              )}
            >
              {tf}
            </button>
          ))}
          <button
            onClick={() => setShowMA((v) => !v)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
              showMA ? "bg-purple-500/15 text-purple-400 border-purple-500/20" : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-white/[0.04]"
            )}
          >
            MA
          </button>
          <button
            onClick={fetchCandles}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all border text-gray-500 hover:text-gray-300 border-transparent hover:bg-white/[0.04]"
            title="Refresh"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "↻"}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card rounded-xl p-4 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {isLoading && candles.length === 0 && (
        <div className="glass-card rounded-xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
          <p className="text-sm text-gray-400">Loading chart...</p>
        </div>
      )}

      {!isLoading && candles.length > 0 && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-[11px] font-mono">
            <div className="rounded-md bg-white/[0.03] px-2 py-1"><span className="text-gray-500">O</span> <span className="text-white">{lastCandle?.open?.toFixed(2) || "-"}</span></div>
            <div className="rounded-md bg-white/[0.03] px-2 py-1"><span className="text-gray-500">H</span> <span className="text-emerald-400">{lastCandle?.high?.toFixed(2) || "-"}</span></div>
            <div className="rounded-md bg-white/[0.03] px-2 py-1"><span className="text-gray-500">L</span> <span className="text-red-400">{lastCandle?.low?.toFixed(2) || "-"}</span></div>
            <div className="rounded-md bg-white/[0.03] px-2 py-1"><span className="text-gray-500">C</span> <span className="text-cyan-300">{lastCandle?.close?.toFixed(2) || "-"}</span></div>
            <div className="rounded-md bg-white/[0.03] px-2 py-1"><span className="text-gray-500">RSI</span> <span className="text-yellow-300">{rsi.toFixed(1)}</span></div>
            <div className="rounded-md bg-white/[0.03] px-2 py-1"><span className="text-gray-500">TZ</span> <span className="text-gray-300">US / NY</span></div>
          </div>

          <div className="relative h-[440px] lg:h-[560px] rounded-lg overflow-hidden border border-white/[0.06]">
            <div ref={chartContainerRef} className="absolute inset-0" />
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] bg-yellow-500 inline-block" />MA7</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-[2px] bg-purple-500 inline-block" />MA25</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-[6px] bg-emerald-500/40 inline-block" />Vol Up</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-[6px] bg-red-500/40 inline-block" />Vol Down</span>
          </div>
        </div>
      )}
    </div>
  );
}
