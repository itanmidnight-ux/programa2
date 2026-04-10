"use client";

import { motion } from "framer-motion";
import {
  TrendingUp, Minus, DollarSign, Wallet,
  Activity, Target, Zap, BarChart3, AlertTriangle, CheckCircle2, XCircle,
  ArrowUpRight, ArrowDownRight, Server, Database, Clock, Gauge,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { useTradingStore } from "@/lib/trading-store";
import { formatPrice, formatCurrency, formatPercent, formatVolume, pnlColor, signalBgColor, cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.4, ease: "easeOut" as const } }),
};

function MetricCard({ label, value, subValue, icon, color, delay = 0 }: {
  label: string; value: string; subValue?: string; icon: React.ReactNode; color?: string; delay?: number;
}) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" custom={delay}
      className="glass-card rounded-xl p-4 hover:border-white/[0.1] transition-all duration-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</span>
        <span className={cn("text-gray-500", color)}>{icon}</span>
      </div>
      <div className={cn("text-xl font-bold font-mono", color || "text-white")}>{value}</div>
      {subValue && <div className={cn("text-xs mt-1 font-mono", subValue.startsWith("+") ? "text-emerald-400" : subValue.startsWith("-") ? "text-red-400" : "text-gray-500")}>{subValue}</div>}
    </motion.div>
  );
}

function WinRateGauge({ winRate, wins, losses }: { winRate: number; wins: number; losses: number }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (winRate / 100) * circumference;
  const color = winRate >= 60 ? "#10b981" : winRate >= 45 ? "#f59e0b" : "#ef4444";

  return (
    <div className="glass-card rounded-xl p-4 flex items-center gap-4">
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold font-mono" style={{ color }}>{winRate.toFixed(1)}%</span>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Win Rate</div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-gray-400">Wins: <span className="text-emerald-400 font-mono font-bold">{wins}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-gray-400">Losses: <span className="text-red-400 font-mono font-bold">{losses}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OverviewPanel() {
  const { snapshot } = useTradingStore();
  const s = snapshot;
  const isUp = s.change_24h >= 0;
  const equityData = s.candles_5m.slice(-60).map((c, i) => ({
    idx: i,
    val: c.close,
  }));

  return (
    <div className="space-y-4 p-4 lg:p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
      {/* Hero: Price + Signal */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="glass-card rounded-xl p-5 border border-white/[0.06]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-3xl lg:text-4xl font-bold font-mono text-white">
                {formatPrice(s.price)}
              </h2>
              <span className={`flex items-center gap-0.5 text-sm font-mono font-semibold px-2 py-0.5 rounded ${isUp ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"}`}>
                {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {formatPercent(s.change_24h)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <span>Vol 24h: {formatVolume(s.volume_24h)}</span>
              <span className="text-white/20">|</span>
              <span>Spread: {s.spread}</span>
              <span className="text-white/20">|</span>
              <span>Vol Ratio: {s.volume_ratio}x</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn("px-4 py-2 rounded-lg border text-center", signalBgColor(s.signal))}>
              <div className="text-xl font-bold">{s.signal}</div>
              <div className="text-[10px] uppercase tracking-widest opacity-70 mt-0.5">Signal</div>
            </div>
            <div className="text-center px-3">
              <div className="text-xl font-bold font-mono text-white">{(s.confidence * 100).toFixed(0)}%</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Confidence</div>
            </div>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-gray-600 mb-1">
            <span>Signal Confidence</span>
            <span>{(s.confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${s.confidence * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" as const }}
              className={cn("h-full rounded-full", s.confidence > 0.7 ? "bg-emerald-500" : s.confidence > 0.5 ? "bg-yellow-500" : "bg-red-500")}
            />
          </div>
        </div>
      </motion.div>

      {/* Account Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Total Equity" value={formatCurrency(s.total_equity)} icon={<DollarSign className="h-4 w-4" />} color="text-white" delay={1} />
        <MetricCard label="Balance" value={formatCurrency(s.balance)} icon={<Wallet className="h-4 w-4" />} color="text-blue-400" delay={2} />
        <MetricCard label="Daily PNL" value={formatCurrency(s.daily_pnl)} icon={<Activity className="h-4 w-4" />} color={s.daily_pnl >= 0 ? "text-emerald-400" : "text-red-400"} delay={3} />
        <MetricCard label="Session PNL" value={formatCurrency(s.session_pnl)} icon={<TrendingUp className="h-4 w-4" />} color={s.session_pnl >= 0 ? "text-emerald-400" : "text-red-400"} delay={4} />
        <MetricCard label="Unrealized PNL" value={formatCurrency(s.unrealized_pnl)} icon={<Zap className="h-4 w-4" />} color={pnlColor(s.unrealized_pnl)} delay={5} />
      </div>

      {/* Performance Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WinRateGauge winRate={s.win_rate} wins={s.wins} losses={s.losses} />
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Total Trades" value={s.total_trades.toString()} icon={<BarChart3 className="h-4 w-4" />} delay={6} />
          <MetricCard label="Wins / Losses" value={`${s.wins} / ${s.losses}`} icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} delay={7} />
          <MetricCard label="Avg Win" value={`+${formatCurrency(s.avg_win)}`} subValue="" icon={<ArrowUpRight className="h-4 w-4 text-emerald-400" />} delay={8} />
          <MetricCard label="Avg Loss" value={`-${formatCurrency(s.avg_loss)}`} icon={<ArrowDownRight className="h-4 w-4 text-red-400" />} delay={9} />
          <MetricCard label="Profit Factor" value={s.profit_factor.toFixed(2)} icon={<Target className="h-4 w-4" />} color={s.profit_factor >= 1.5 ? "text-emerald-400" : "text-yellow-400"} delay={10} />
          <MetricCard label="Expectancy" value={`$${s.expectancy.toFixed(2)}`} icon={<Gauge className="h-4 w-4" />} delay={11} />
        </div>
      </div>

      {/* Capital Manager + Open Position + Equity Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Capital Manager */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={12}
          className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-gray-300">Capital Manager</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Mode</span>
              <span className={cn("font-mono font-semibold",
                s.capital_manager.capital_mode === "AGGRESSIVE" ? "text-red-400" :
                s.capital_manager.capital_mode === "CONSERVATIVE" ? "text-blue-400" : "text-yellow-400"
              )}>{s.capital_manager.capital_mode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Market</span>
              <span className="font-mono text-gray-300">{s.capital_manager.market_condition}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Risk/Trade</span>
              <span className="font-mono text-gray-300">{(s.capital_manager.effective_params.risk_per_trade * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Win Streak</span>
              <span className="font-mono text-emerald-400">{s.capital_manager.win_streak} <span className="text-gray-600">/</span> <span className="text-red-400">{s.capital_manager.loss_streak}</span></span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">Drawdown</span>
                <span className={s.capital_manager.current_drawdown_pct > 5 ? "text-red-400" : "text-gray-400"}>{s.capital_manager.current_drawdown_pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-red-500/70 transition-all duration-500"
                  style={{ width: `${Math.min((s.capital_manager.current_drawdown_pct / 15) * 100, 100)}%` }} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Open Position */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={13}
          className={cn("glass-card rounded-xl p-4", s.has_open_position ? "border-l-2" : "")}
          style={s.has_open_position ? { borderLeftColor: s.open_position_side === "LONG" ? "#10b981" : "#ef4444" } : undefined}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-300">Open Position</h3>
          </div>
          {s.has_open_position && s.open_positions[0] ? (
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Side</span>
                <span className={cn("font-bold font-mono", s.open_positions[0].side === "LONG" ? "text-emerald-400" : "text-red-400")}>
                  {s.open_positions[0].side}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Size</span>
                <span className="font-mono text-gray-300">{s.open_positions[0].size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Entry</span>
                <span className="font-mono text-gray-300">{formatPrice(s.open_positions[0].entry)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Current</span>
                <span className="font-mono text-white">{formatPrice(s.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">PNL</span>
                <span className={cn("font-bold font-mono", pnlColor(s.open_positions[0].pnl))}>
                  {s.open_positions[0].pnl >= 0 ? "+" : ""}{formatCurrency(s.open_positions[0].pnl)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
                <div>
                  <div className="text-[10px] text-gray-600 uppercase">SL</div>
                  <div className="font-mono text-red-400 text-xs">{formatPrice(s.open_positions[0].sl)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-600 uppercase">TP</div>
                  <div className="font-mono text-emerald-400 text-xs">{formatPrice(s.open_positions[0].tp)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-gray-600">
              <Minus className="h-6 w-6 mb-2" />
              <span className="text-sm">No Open Position</span>
            </div>
          )}
        </motion.div>

        {/* Mini Equity Curve */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={14}
          className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-gray-300">Price (5m)</h3>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={["dataMin - 50", "dataMax + 50"]} hide />
                <Area type="monotone" dataKey="val" stroke={isUp ? "#10b981" : "#ef4444"} fill="url(#equityGrad)" strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Signal Analysis + System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signals */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={15}
          className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-gray-300">Signal Analysis</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(s.signals).map(([key, val]) => (
              <div key={key} className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-2.5 text-center">
                <div className={cn("text-xs font-bold", signalBgColor(val).split(" ")[1] || "text-gray-400")}>{val}</div>
                <div className="text-[10px] text-gray-600 mt-0.5 capitalize">{key.replace("_", " ")}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Timeframe Analysis</div>
            <div className="flex gap-2">
              {s.timeframe_analysis && Object.entries(s.timeframe_analysis).map(([tf, val]) => (
                <div key={tf} className="flex-1 rounded-lg bg-white/[0.03] border border-white/[0.04] p-2 text-center">
                  <div className="text-[10px] text-gray-600">{tf}</div>
                  <div className={cn("text-xs font-bold", val === "BULLISH" ? "text-emerald-400" : val === "BEARISH" ? "text-red-400" : "text-yellow-400")}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* System Status */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={16}
          className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Server className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-300">System Status</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Server className="h-3.5 w-3.5" />
                <span>Exchange</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", s.exchange_status === "CONNECTED" ? "bg-emerald-400" : "bg-red-400")} />
                <span className={cn("font-mono text-xs", s.exchange_status === "CONNECTED" ? "text-emerald-400" : "text-red-400")}>
                  {s.exchange_status}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Database className="h-3.5 w-3.5" />
                <span>Database</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", s.database_status === "CONNECTED" ? "bg-emerald-400" : "bg-red-400")} />
                <span className={cn("font-mono text-xs", s.database_status === "CONNECTED" ? "text-emerald-400" : "text-red-400")}>
                  {s.database_status}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                <span>API Latency</span>
              </div>
              <span className={cn("font-mono text-xs", s.api_latency_ms < 100 ? "text-emerald-400" : s.api_latency_ms < 200 ? "text-yellow-400" : "text-red-400")}>
                {s.api_latency_ms}ms
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Gauge className="h-3.5 w-3.5" />
                <span>RSI</span>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={s.rsi} className="w-16 h-1.5" />
                <span className={cn("font-mono text-xs", s.rsi > 70 ? "text-red-400" : s.rsi < 30 ? "text-emerald-400" : "text-gray-300")}>
                  {s.rsi.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <Activity className="h-3.5 w-3.5" />
                <span>ADX (Trend)</span>
              </div>
              <span className={cn("font-mono text-xs", s.adx > 25 ? "text-emerald-400" : "text-gray-400")}>
                {s.adx.toFixed(1)} {s.adx > 25 ? "(trending)" : "(ranging)"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>ATR</span>
              </div>
              <span className="font-mono text-xs text-gray-300">{s.atr.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-400">
                <XCircle className="h-3.5 w-3.5" />
                <span>Market Regime</span>
              </div>
              <span className="font-mono text-xs text-purple-400">{s.market_regime}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
