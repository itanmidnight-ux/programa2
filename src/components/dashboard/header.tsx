"use client";

import { Activity, Wifi, WifiOff, Bell, Menu, ChevronDown, Search, TrendingUp, TrendingDown, X } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useTradingStore, type PairData } from "@/lib/trading-store";
import { formatPrice, formatPercent, signalBgColor } from "@/lib/utils";
import { formatPair } from "@/lib/format-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Core market list for selector (broker-neutral labels)
const DASHBOARD_MARKETS = [
  { symbol: "XAU_USD", display: "XAU/USD", category: "Metal" },
  { symbol: "XAG_USD", display: "XAG/USD", category: "Metal" },
  { symbol: "EUR_USD", display: "EUR/USD", category: "Forex" },
  { symbol: "GBP_USD", display: "GBP/USD", category: "Forex" },
  { symbol: "USD_JPY", display: "USD/JPY", category: "Forex" },
  { symbol: "WTI_USD", display: "WTI/USD", category: "Energy" },
  { symbol: "US30_USD", display: "US30", category: "Index" },
  { symbol: "NAS100_USD", display: "NAS100", category: "Index" },
];

export function Header() {
  const {
    snapshot, connected, toggleSidebar,
    selectedPair, pairPrices, setSelectedPair, pairSearchOpen, setPairSearchOpen,
  } = useTradingStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isChanging, setIsChanging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isUp = snapshot.change_24h >= 0;

  // Get current pair data
  const currentPairData: PairData | undefined = pairPrices[selectedPair];
  const selectedMarket = DASHBOARD_MARKETS.find((m) => m.symbol === selectedPair);
  const pairDisplayName = selectedMarket?.display || formatPair(selectedPair);
  const brokerLabel = snapshot?.broker
    ? String(snapshot.broker).replace(/_/g, " ").toUpperCase()
    : "BROKER";

  // Filter markets by search
  const filteredMarkets = searchTerm.length > 0
    ? DASHBOARD_MARKETS.filter((m) =>
        m.display.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.category.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : DASHBOARD_MARKETS;

  const handlePairChange = useCallback((symbol: string) => {
    setIsChanging(true);
    setSelectedPair(symbol);
    setPairSearchOpen(false);
    setSearchTerm("");
    setTimeout(() => setIsChanging(false), 300);
  }, [setSelectedPair, setPairSearchOpen]);

  useEffect(() => {
    if (pairSearchOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [pairSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPairSearchOpen(false);
        setSearchTerm("");
      }
    };
    if (pairSearchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [pairSearchOpen, setPairSearchOpen]);

  return (
    <header className="h-14 border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-md flex items-center px-4 gap-3 sticky top-0 z-30">
      <Button variant="ghost" size="icon" className="lg:hidden text-gray-400 hover:text-white" onClick={toggleSidebar}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setPairSearchOpen(!pairSearchOpen)}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all border
            ${isChanging ? "border-blue-500/30 bg-blue-500/5" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"}
          `}
        >
          <span className="text-sm font-bold text-white">{pairDisplayName}</span>
          <span className="text-xs font-mono text-gray-400">
            {currentPairData?.price ? formatPrice(currentPairData.price) : formatPrice(snapshot.price)}
          </span>
          {currentPairData?.change24h !== undefined ? (
            <span className={`text-xs font-mono font-medium flex items-center gap-0.5 ${currentPairData.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {currentPairData.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {formatPercent(currentPairData.change24h)}
            </span>
          ) : (
            <span className={`text-xs font-mono font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {formatPercent(snapshot.change_24h)}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-gray-500 transition-transform ${pairSearchOpen ? "rotate-180" : ""}`} />
        </button>

        {pairSearchOpen && (
          <div className="absolute top-full left-0 mt-2 w-80 bg-[#151b28] border border-white/[0.1] rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="p-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] rounded-lg">
                <Search className="h-3.5 w-3.5 text-gray-500" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search pairs..."
                  className="bg-transparent text-sm text-white placeholder-gray-500 outline-none w-full"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")}>
                    <X className="h-3.5 w-3.5 text-gray-500 hover:text-white" />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              {filteredMarkets.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">
                  No markets found for &quot;{searchTerm}&quot;
                </div>
              ) : (
                filteredMarkets.map((market) => {
                  const marketData = pairPrices[market.symbol];
                  return (
                    <button
                      key={market.symbol}
                      onClick={() => handlePairChange(market.symbol)}
                      className={`
                        w-full flex items-center justify-between px-3 py-2.5 transition-all text-left
                        ${market.symbol === selectedPair
                          ? "bg-blue-500/10 border-l-2 border-blue-500"
                          : "hover:bg-white/[0.04] border-l-2 border-transparent"}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${market.symbol === selectedPair ? "text-blue-400" : "text-gray-400"}`}>
                          {market.symbol === selectedPair ? "●" : ""}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-white">{market.display}</div>
                          <div className="text-[10px] text-gray-500">{market.category}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono text-white">
                          {marketData?.price ? formatPrice(marketData.price) : "-"}
                        </div>
                        {marketData?.change24h !== undefined ? (
                          <div className={`text-[10px] font-mono font-medium ${marketData.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {marketData.change24h >= 0 ? "+" : ""}{marketData.change24h.toFixed(2)}%
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-600">-</div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-3 py-2 border-t border-white/[0.06] bg-white/[0.02]">
              <div className="text-[10px] text-gray-600">
                {filteredMarkets.length} markets | Feed: {brokerLabel}
              </div>
            </div>
          </div>
        )}
      </div>

      <Badge variant="outline" className={signalBgColor(snapshot.signal)}>
        {snapshot.signal}
      </Badge>

      <div className="flex-1" />

      <div className="hidden sm:flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Activity className="h-3 w-3" />
          <span>Conf:</span>
          <span className="font-mono text-white">{(snapshot.confidence * 100).toFixed(0)}%</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="font-medium">{snapshot.status}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {connected ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-400" />
          )}
          <span className={`text-xs ${connected ? "text-emerald-400" : "text-red-400"}`}>
            {connected ? "Live" : "Demo"}
          </span>
        </div>

        <div className="text-xs text-gray-500 font-mono">
          {snapshot.api_latency_ms}ms
        </div>

        <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white h-8 w-8">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
