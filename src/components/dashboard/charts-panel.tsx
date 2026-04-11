"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { useTradingStore, type CandleData, type PairCandlesData } from "@/lib/trading-store";
import { formatSymbolPrice } from "@/lib/format-utils";
import { formatTime, cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h";

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1h", "4h"];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isUp = d.close >= d.open;
  return (
    <div className="bg-[#1a2332] border border-white/[0.1] rounded-lg p-3 text-xs shadow-xl">
      <div className="text-gray-500 mb-1.5 font-mono">{new Date(d.time * 1000).toLocaleString()}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="text-gray-500">Open</div>
        <div className="font-mono text-white">{d.open.toFixed(2)}</div>
        <div className="text-gray-500">High</div>
        <div className="font-mono text-emerald-400">{d.high.toFixed(2)}</div>
        <div className="text-gray-500">Low</div>
        <div className="font-mono text-red-400">{d.low.toFixed(2)}</div>
        <div className="text-gray-500">Close</div>
        <div className={cn("font-mono", isUp ? "text-emerald-400" : "text-red-400")}>{d.close.toFixed(2)}</div>
        <div className="text-gray-500">Volume</div>
        <div className="font-mono text-blue-400">{d.volume.toFixed(2)}</div>
      </div>
    </div>
  );
};

export function ChartsPanel() {
  const { selectedPair, pairCandles, setPairCandles, pairPrices } = useTradingStore();
  const [activeTf, setActiveTf] = useState<Timeframe>("5m");
  const [showMA, setShowMA] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get current pair display name and price
  const currentPairData = pairPrices[selectedPair];
  const pairDisplay = selectedPair.replace("_", "/");
  const pairPrice = currentPairData?.price || 0;
  const pairChange = currentPairData?.change24h || 0;

  // Fetch candles for the selected pair when it changes
  const fetchCandles = useCallback(async () => {
    if (!selectedPair) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pairs/candles?symbol=${selectedPair}&interval=${activeTf}&limit=200`);
      if (res.ok) {
        const data = await res.json();
        if (data.candles && Array.isArray(data.candles)) {
          const candleData: PairCandlesData = {
            symbol: data.symbol,
            interval: data.interval,
            candles: data.candles,
            indicators: data.indicators || { ma7: null, ma25: null, ma99: null, rsi: 50, volume_avg: 0 },
            lastFetch: data.timestamp,
          };
          setPairCandles(candleData);
        }
      } else {
        setError("Failed to fetch candles");
      }
    } catch {
      setError("Network error fetching candles");
    } finally {
      setIsLoading(false);
    }
  }, [selectedPair, activeTf, setPairCandles]);

  // Fetch candles when pair or timeframe changes
  useEffect(() => {
    fetchCandles();
  }, [fetchCandles]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchCandles, 15000);
    return () => clearInterval(interval);
  }, [fetchCandles]);

  const candles = useMemo(() => {
    if (!pairCandles?.candles) return [];
    return pairCandles.candles.slice(-100);
  }, [pairCandles]);

  // Calculate MAs
  const ma7 = useMemo(() => {
    return candles.map((c, i) => {
      if (i < 7) return { ...c, ma7: null };
      const sum = candles.slice(i - 7, i).reduce((s, x) => s + x.close, 0) / 7;
      return { ...c, ma7: +sum.toFixed(2) };
    });
  }, [candles]);

  const ma25 = useMemo(() => {
    return ma7.map((c, i) => {
      if (i < 25) return { ...c, ma25: null };
      const sum = candles.slice(i - 25, i).reduce((s, x) => s + x.close, 0) / 25;
      return { ...c, ma25: +sum.toFixed(2) };
    });
  }, [ma7, candles]);

  const allPrices = candles.flatMap((c) => [c.high, c.low]);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
  const padding = (maxPrice - minPrice) * 0.1 || 1;

  const maxVol = candles.length > 0 ? Math.max(...candles.map((c) => c.volume)) : 1;

  const rsi = pairCandles?.indicators?.rsi || 50;

  return (
    <div className="space-y-4 p-4 lg:p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{pairDisplay}</h2>
            {pairPrice > 0 && (
              <span className="text-lg font-mono font-semibold text-white">${pairPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            )}
            {pairChange !== 0 && (
              <span className={`text-sm font-mono font-medium px-2 py-0.5 rounded ${pairChange >= 0 ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
                {pairChange >= 0 ? "+" : ""}{pairChange.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-gray-500">{candles.length} candles · {activeTf}</p>
            {pairCandles?.indicators && (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono ${rsi > 70 ? "text-red-400" : rsi < 30 ? "text-emerald-400" : "text-gray-400"}`}>
                  RSI: {rsi.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="w-px h-5 bg-white/[0.08] mx-1" />
          <button
            onClick={() => setShowMA(!showMA)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
              showMA
                ? "bg-purple-500/15 text-purple-400 border-purple-500/20"
                : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-white/[0.04]"
            )}
          >
            MA
          </button>
          <button
            onClick={fetchCandles}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
              "text-gray-500 hover:text-gray-300 border-transparent hover:bg-white/[0.04]"
            )}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "↻"}
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card rounded-xl p-4 border border-red-500/20">
          <p className="text-xs text-red-400">{error}</p>
          <button onClick={fetchCandles} className="text-xs text-blue-400 hover:underline mt-1">Retry</button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && candles.length === 0 && (
        <div className="glass-card rounded-xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
          <p className="text-sm text-gray-400">Loading {pairDisplay} chart...</p>
        </div>
      )}

      {/* Chart */}
      {!isLoading && candles.length === 0 && !error && (
        <div className="glass-card rounded-xl p-12 flex flex-col items-center justify-center gap-3">
          <p className="text-sm text-gray-400">No candle data available</p>
          <button onClick={fetchCandles} className="text-xs text-blue-400 hover:underline">Load chart</button>
        </div>
      )}

      {candles.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <div className="h-[400px] lg:h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={ma25} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatTime}
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickLine={false}
                  minTickGap={60}
                />
                <YAxis
                  domain={[minPrice - padding, maxPrice + padding]}
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  tickLine={false}
                  tickFormatter={(v: number) => v.toFixed(0)}
                  yAxisId="price"
                  width={60}
                />
                <YAxis
                  domain={[0, maxVol * 1.5]}
                  tick={false}
                  axisLine={false}
                  tickLine={false}
                  yAxisId="volume"
                  orientation="right"
                  width={0}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Candlestick representation using bars */}
                <Bar yAxisId="price" dataKey="close" isAnimationActive={false} barSize={4}>
                  {ma25.map((entry, index) => {
                    const isUp = entry.close >= entry.open;
                    const diff = Math.abs(entry.close - entry.open);
                    const h = diff > 0 ? (diff / (maxPrice - minPrice + padding)) * 400 : 1;
                    return (
                      <Cell
                        key={`candle-${index}`}
                        fill={isUp ? "#10b981" : "#ef4444"}
                        opacity={isUp ? 0.9 : 0.9}
                        height={h}
                      />
                    );
                  })}
                </Bar>
                {/* Volume */}
                <Bar yAxisId="volume" dataKey="volume" isAnimationActive={false} barSize={4} opacity={0.15} fill="#3b82f6" />
                {/* MAs */}
                {showMA && (
                  <>
                    <Line yAxisId="price" type="monotone" dataKey="ma7" stroke="#f59e0b" dot={false} strokeWidth={1} isAnimationActive={false} connectNulls />
                    <Line yAxisId="price" type="monotone" dataKey="ma25" stroke="#8b5cf6" dot={false} strokeWidth={1} isAnimationActive={false} connectNulls />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.06]">
            {showMA && (
              <>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-0.5 bg-yellow-500 rounded" />
                  <span className="text-gray-500">MA 7</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-0.5 bg-purple-500 rounded" />
                  <span className="text-gray-500">MA 25</span>
                </div>
              </>
            )}
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-0.5 bg-emerald-500 rounded" />
              <span className="text-gray-500">Bullish</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-0.5 bg-red-500 rounded" />
              <span className="text-gray-500">Bearish</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-2 bg-blue-500/30 rounded-sm" />
              <span className="text-gray-500">Volume</span>
            </div>
            <div className="flex-1" />
            <span className="text-[10px] text-gray-600">{pairDisplay} · {activeTf} · {candles.length} candles</span>
          </div>
        </div>
      )}
    </div>
  );
}
