"use client";

import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck, AlertTriangle, TrendingDown, Zap, Lock, Target, BarChart3, Activity } from "lucide-react";
import { useTradingStore } from "@/lib/trading-store";
import { formatNumber, cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" as const } }),
};

function RiskBar({ label, value, max, unit = "%", warnThreshold = 80, dangerThreshold = 95, delay = 0 }: {
  label: string; value: number; max: number; unit?: string; warnThreshold?: number; dangerThreshold?: number; delay?: number;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= dangerThreshold ? "bg-red-500" : pct >= warnThreshold ? "bg-yellow-500" : "bg-emerald-500";

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" custom={delay}
      className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</span>
        <span className={cn("text-sm font-mono font-bold", pct >= dangerThreshold ? "text-red-400" : pct >= warnThreshold ? "text-yellow-400" : "text-emerald-400")}>
          {formatNumber(value)}{unit} <span className="text-gray-600">/ {formatNumber(max)}{unit}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" as const }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
      <div className="text-[10px] text-gray-600 mt-1 text-right">{pct.toFixed(1)}% utilized</div>
    </motion.div>
  );
}

export function RiskPanel() {
  const { snapshot, riskMetrics } = useTradingStore();
  const rm = riskMetrics;

  return (
    <div className="space-y-4 p-4 lg:p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-400" />
          Risk Management
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Monitor risk metrics and protection systems</p>
      </div>

      {/* Risk Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RiskBar label="Daily Loss Utilization" value={rm.daily_loss_used} max={rm.daily_loss_limit} unit="$" warnThreshold={70} dangerThreshold={90} delay={0} />
        <RiskBar label="Current Drawdown" value={rm.current_drawdown} max={rm.max_drawdown} delay={1} />
        <RiskBar label="Position Size" value={rm.position_size_pct} max={rm.max_position_size} delay={2} />
        <RiskBar label="Margin Used" value={rm.margin_used} max={100} delay={3} />
      </div>

      {/* Risk Parameters */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}
        className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-300">Risk Parameters</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Risk/Trade", value: `${rm.risk_per_trade}%`, icon: <Target className="h-3.5 w-3.5" /> },
            { label: "Risk/Reward", value: rm.risk_reward_ratio, icon: <BarChart3 className="h-3.5 w-3.5" /> },
            { label: "Sharpe Ratio", value: rm.sharpe_ratio, icon: <Activity className="h-3.5 w-3.5" /> },
            { label: "Sortino Ratio", value: rm.sortino_ratio, icon: <Zap className="h-3.5 w-3.5" /> },
          ].map((item) => (
            <div key={item.label} className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
              <div className="flex items-center gap-1.5 text-gray-600 mb-1">
                {item.icon}
                <span className="text-[10px] uppercase tracking-wider">{item.label}</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">{item.value}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Smart Stop Stats */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
        className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-gray-300">Smart Stop System</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active Stops", value: snapshot.smart_stop_stats.active_stops, color: "text-blue-400" },
            { label: "Trails Activated", value: snapshot.smart_stop_stats.trails_activated, color: "text-emerald-400" },
            { label: "Break-Evens Hit", value: snapshot.smart_stop_stats.break_evens_hit, color: "text-yellow-400" },
            { label: "Profit Locks", value: snapshot.smart_stop_stats.profit_locks, color: "text-purple-400" },
          ].map((item) => (
            <div key={item.label} className="text-center bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
              <div className={cn("text-2xl font-bold font-mono", item.color)}>{item.value}</div>
              <div className="text-[10px] text-gray-600 mt-1 uppercase tracking-wider">{item.label}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Trade Stats */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}
        className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4 text-yellow-400" />
          <h3 className="text-sm font-semibold text-gray-300">Trade Statistics</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Risk Exposure", value: `${rm.total_risk_exposure}%`, color: rm.total_risk_exposure > 5 ? "text-red-400" : "text-gray-300" },
            { label: "Max Consec. Loss", value: rm.max_consecutive_losses, color: "text-red-400" },
            { label: "Avg Hold Time", value: rm.avg_holding_time, color: "text-gray-300" },
            { label: "Best Trade", value: `+$${rm.best_trade}`, color: "text-emerald-400" },
            { label: "Worst Trade", value: `-$${Math.abs(Number(rm.worst_trade))}`, color: "text-red-400" },
            { label: "Total Exposure", value: `${rm.margin_used}%`, color: "text-blue-400" },
          ].map((item) => (
            <div key={item.label} className="bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.04]">
              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">{item.label}</div>
              <div className={cn("text-sm font-bold font-mono", item.color)}>{item.value}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
