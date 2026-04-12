"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { useTradingStore, type Trade } from "@/lib/trading-store";
import { formatPrice, formatCurrency, formatPercent, formatTimestamp, pnlColor, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";


type FilterTab = "all" | "open" | "closed" | "winners" | "losers";

const tabs: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "winners", label: "Winners" },
  { id: "losers", label: "Losers" },
];

function TradeRow({ trade, onSelect }: { trade: Trade; onSelect: () => void }) {
  const { closeTrade } = useTradingStore();
  const isWin = trade.pnl > 0;

  return (
    <tr className={cn(
      "border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer",
      isWin ? "hover:bg-emerald-500/[0.03]" : trade.pnl < 0 ? "hover:bg-red-500/[0.03]" : ""
    )} onClick={onSelect}>
      <td className="px-3 py-2.5 text-xs text-gray-500 font-mono whitespace-nowrap">{formatTimestamp(trade.time)}</td>
      <td className="px-3 py-2.5 text-xs text-gray-300 font-medium">{trade.pair}</td>
      <td className="px-3 py-2.5">
        <span className={cn("text-xs font-bold", trade.side === "LONG" ? "text-emerald-400" : "text-red-400")}>{trade.side}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-300 font-mono">{formatPrice(trade.entry)}</td>
      <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">
        {trade.status === "CLOSED" ? formatPrice(trade.exit) : "—"}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{trade.size}</td>
      <td className="px-3 py-2.5">
        <span className={cn("text-xs font-bold font-mono", pnlColor(trade.pnl))}>
          {trade.pnl >= 0 ? "+" : ""}{formatCurrency(trade.pnl)}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={cn(
          "text-[10px] font-semibold px-2 py-0.5 rounded border",
          trade.status === "OPEN" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
          isWin ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
          "bg-red-500/10 text-red-400 border-red-500/20"
        )}>{trade.status}</span>
      </td>
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        {trade.status === "OPEN" && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => closeTrade(trade.id)}>
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}

export function TradesPanel() {
  const { trades } = useTradingStore();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"time" | "pnl">("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  const filtered = useMemo(() => {
    let result = [...trades];
    if (activeTab === "open") result = result.filter((t) => t.status === "OPEN");
    else if (activeTab === "closed") result = result.filter((t) => t.status === "CLOSED");
    else if (activeTab === "winners") result = result.filter((t) => t.pnl > 0);
    else if (activeTab === "losers") result = result.filter((t) => t.pnl < 0);
    if (search) result = result.filter((t) => t.pair.toLowerCase().includes(search.toLowerCase()) || t.side.toLowerCase().includes(search.toLowerCase()));
    result.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return result;
  }, [trades, activeTab, search, sortField, sortDir]);

  const totalPnl = filtered.reduce((s, t) => s + t.pnl, 0);

  const toggleSort = (field: "time" | "pnl") => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const renderSortIcon = (field: "time" | "pnl") => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 text-gray-600" />;
    return sortDir === "desc" ? <ChevronDown className="h-3 w-3 text-blue-400" /> : <ChevronUp className="h-3 w-3 text-blue-400" />;
  };

  return (
    <div className="space-y-4 p-4 lg:p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Trade History</h2>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length} trades · Total PNL: <span className={cn("font-mono font-bold", pnlColor(totalPnl))}>{totalPnl >= 0 ? "+" : ""}{formatCurrency(totalPnl)}</span></p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <Input
            placeholder="Search pair, side..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-white/[0.04] border-white/[0.08] text-sm"
          />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              activeTab === tab.id
                ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                : "text-gray-500 hover:text-gray-300 border border-transparent"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium cursor-pointer select-none" onClick={() => toggleSort("time")}>
                  <span className="flex items-center gap-1">Time {renderSortIcon("time")}</span>
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium">Pair</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium">Side</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium">Entry</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium">Exit</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium">Size</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium cursor-pointer select-none" onClick={() => toggleSort("pnl")}>
                  <span className="flex items-center gap-1">PNL {renderSortIcon("pnl")}</span>
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium">Status</th>
                <th className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.map((trade) => (
                  <motion.tr
                    key={trade.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <TradeRow trade={trade} onSelect={() => setSelectedTrade(trade)} />
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-600 text-sm">No trades found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade Detail Modal */}
      <Dialog open={!!selectedTrade} onOpenChange={() => setSelectedTrade(null)}>
        <DialogContent className="bg-[#111827] border-white/[0.08] text-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Trade #{selectedTrade?.id} Details</DialogTitle>
          </DialogHeader>
          {selectedTrade && (
            <div className="space-y-3 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pair</span>
                <span className="font-medium">{selectedTrade.pair}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Side</span>
                <span className={cn("font-bold", selectedTrade.side === "LONG" ? "text-emerald-400" : "text-red-400")}>{selectedTrade.side}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Entry Price</span>
                <span className="font-mono">{formatPrice(selectedTrade.entry)}</span>
              </div>
              {selectedTrade.status === "CLOSED" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Exit Price</span>
                  <span className="font-mono">{formatPrice(selectedTrade.exit)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Size</span>
                <span className="font-mono">{selectedTrade.size}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">PNL</span>
                <span className={cn("font-bold font-mono", pnlColor(selectedTrade.pnl))}>
                  {selectedTrade.pnl >= 0 ? "+" : ""}{formatCurrency(selectedTrade.pnl)} ({formatPercent(selectedTrade.pnl_pct)})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Confidence</span>
                <span className="font-mono">{(selectedTrade.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
                <div className="bg-white/[0.03] rounded-lg p-2">
                  <div className="text-[10px] text-gray-600 uppercase">Stop Loss</div>
                  <div className="font-mono text-red-400 text-sm mt-0.5">{formatPrice(selectedTrade.sl)}</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-2">
                  <div className="text-[10px] text-gray-600 uppercase">Take Profit</div>
                  <div className="font-mono text-emerald-400 text-sm mt-0.5">{formatPrice(selectedTrade.tp)}</div>
                </div>
              </div>
              <div className="flex justify-between text-sm pt-1">
                <span className="text-gray-500">Opened</span>
                <span className="font-mono text-xs text-gray-400">{formatTimestamp(selectedTrade.time)}</span>
              </div>
              {selectedTrade.close_time && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Closed</span>
                  <span className="font-mono text-xs text-gray-400">{formatTimestamp(selectedTrade.close_time)}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
