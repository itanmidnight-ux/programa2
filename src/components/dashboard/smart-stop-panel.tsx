"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Target,
  Lock,
  Play,
  Pause,
  RotateCcw,
  BarChart3,
  AlertTriangle,
  Zap,
  ChevronRight,
  Timer,
} from "lucide-react";
import { useTradingStore } from "@/lib/trading-store";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.4, ease: "easeOut" as const },
  }),
};

// ---- Score Bar Component ----
function ScoreBar({ label, value, delay }: { label: string; value: number; delay: number }) {
  const color =
    value >= 70 ? "text-emerald-400" : value >= 40 ? "text-yellow-400" : "text-red-400";
  const barColor =
    value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" custom={delay} className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className={cn("font-mono font-semibold", color)}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" as const }}
          className={cn("h-full rounded-full", barColor)}
        />
      </div>
    </motion.div>
  );
}

// ---- Phase Indicator ----
function PhaseIndicator({ phase, phaseName, delay }: { phase: number; phaseName: string; delay: number }) {
  const phaseColors = [
    "bg-gray-600",     // Phase 0 - no trailing
    "bg-blue-500",     // Phase 1 - conservative
    "bg-purple-500",   // Phase 2 - moderate
    "bg-yellow-500",   // Phase 3 - tight
    "bg-emerald-500",  // Phase 4 - maximum lock
  ];
  const phaseLabels = ["Idle", "Phase 1", "Phase 2", "Phase 3", "Phase 4"];

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" custom={delay} className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-purple-400" />
        <h3 className="text-sm font-semibold text-gray-300">Stop Loss Phase</h3>
      </div>
      {/* Phase bar */}
      <div className="flex gap-1.5 mb-3">
        {phaseLabels.map((label, i) => (
          <div key={i} className="flex-1">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-500",
                i <= phase ? phaseColors[phase] : "bg-white/[0.06]"
              )}
            />
            <div className="text-[9px] text-gray-600 mt-1 text-center">{label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={cn(
          "text-sm font-semibold",
          phase === 0 ? "text-gray-500" : phase >= 4 ? "text-emerald-400" : "text-purple-400"
        )}>
          {phaseName}
        </span>
        {phase > 0 && (
          <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
            Active
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ---- Status Badge ----
function StatusBadge({ active, activeLabel, inactiveLabel, activeColor }: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  activeColor?: string;
}) {
  return (
    <span className={cn(
      "text-xs font-bold px-3 py-1.5 rounded-lg border",
      active
        ? cn("bg-emerald-500/10 text-emerald-400 border-emerald-500/20", activeColor && `text-${activeColor}-400 border-${activeColor}-500/20 bg-${activeColor}-500/10`)
        : "bg-white/[0.04] text-gray-500 border-white/[0.06]"
    )}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

// ---- Info Row ----
function InfoRow({ label, value, valueColor, delay }: {
  label: string; value: string | number; valueColor?: string; delay: number;
}) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" custom={delay}
      className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={cn("text-xs font-mono font-medium", valueColor || "text-gray-300")}>
        {value || "—"}
      </span>
    </motion.div>
  );
}

export function SmartStopsPanel() {
  const { smartStopStatus, smartStopTradeStatus, setSmartStopStatus, setSmartStopTradeStatus } =
    useTradingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch smart stop loss status
  const fetchSmartStopStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stop-loss");
      if (res.ok) {
        const data = await res.json();
        setSmartStopStatus(data);
      }
    } catch {
      /* silent */
    }
  }, [setSmartStopStatus]);

  // Fetch smart stop trade status
  const fetchSmartStopTradeStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stop-trade");
      if (res.ok) {
        const data = await res.json();
        setSmartStopTradeStatus(data);
      }
    } catch {
      /* silent */
    }
  }, [setSmartStopTradeStatus]);

  // Manual pause/resume/reset actions
  const handleAction = useCallback(
    async (endpoint: string, action: string) => {
      setIsSubmitting(true);
      try {
        await fetch(`/api/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        // Re-fetch both
        await Promise.all([fetchSmartStopStatus(), fetchSmartStopTradeStatus()]);
      } catch {
        /* silent */
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchSmartStopStatus, fetchSmartStopTradeStatus]
  );

  // Initial fetch + polling (handled via parent page.tsx useEffect)

  const ssl = smartStopStatus;
  const sst = smartStopTradeStatus;

  return (
    <div className="space-y-4 p-4 lg:p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
      {/* ===== SECTION: SMART STOP LOSS ===== */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-purple-400" />
          <h2 className="text-lg font-bold text-white">Smart Stop Loss</h2>
          {ssl?.hasPosition ? (
            <StatusBadge active activeLabel="POSITION OPEN" inactiveLabel="NO POSITION" />
          ) : (
            <StatusBadge active={false} activeLabel="" inactiveLabel="NO POSITION" />
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Phase indicator */}
        <PhaseIndicator
          phase={ssl?.phase ?? 0}
          phaseName={ssl?.phaseName ?? "No Trailing"}
          delay={1}
        />

        {/* Stop Status Details */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}
          className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-300">Stop Details</h3>
          </div>
          <div className="space-y-0.5">
            <InfoRow label="Trailing Stop" delay={3}
              value={ssl?.trailingActive ? "Active" : "Inactive"}
              valueColor={ssl?.trailingActive ? "text-emerald-400" : "text-gray-600"} />
            <InfoRow label="Break-Even" delay={4}
              value={ssl?.breakEvenActive ? "Active" : "Inactive"}
              valueColor={ssl?.breakEvenActive ? "text-emerald-400" : "text-gray-600"} />
            <InfoRow label="Profit" delay={5}
              value={ssl?.profitPct != null ? `${ssl.profitPct.toFixed(2)}%` : "—"}
              valueColor={(ssl?.profitPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
            <InfoRow label="Time Open" delay={6}
              value={ssl?.timeOpen ? `${ssl.timeOpen.toFixed(1)} min` : "—"} />
            <InfoRow label="Time Stop" delay={7}
              value={ssl?.timeStopAt ? `${ssl.timeStopAt} min` : "—"} />
            <InfoRow label="Next Profit Lock" delay={8}
              value={ssl?.nextProfitLock ? `@ ${ssl.nextProfitLock}%` : "None"}
              valueColor={ssl?.nextProfitLock ? "text-yellow-400" : "text-gray-600"} />
          </div>
        </motion.div>

        {/* Price / SL / TP Distances */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={9}
          className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-gray-300">Price Levels</h3>
          </div>
          {ssl?.hasPosition ? (
            <div className="space-y-0.5">
              <InfoRow label="Entry Price" delay={10}
                value={`$${(ssl.entryPrice ?? 0).toFixed(2)}`} />
              <InfoRow label="Current Price" delay={11}
                value={`$${(ssl.currentPrice ?? 0).toFixed(2)}`}
                valueColor="text-white font-bold" />
              <InfoRow label="Current SL" delay={12}
                value={`$${(ssl.currentSL ?? 0).toFixed(2)}`}
                valueColor="text-red-400" />
              <InfoRow label="Initial SL" delay={13}
                value={`$${(ssl.initialSL ?? 0).toFixed(2)}`}
                valueColor="text-red-400/60" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-gray-600">
              <Minus className="h-5 w-5 mb-1" />
              <span className="text-xs">No open position</span>
            </div>
          )}
        </motion.div>

        {/* Config Preview */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={14}
          className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-4 w-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-gray-300">Phase Config</h3>
          </div>
          <div className="space-y-1">
            {ssl?.config
              ? [
                  { label: "Phase 1 Trigger", val: `${ssl.config.phase1.profitPct}%`, trail: `${ssl.config.phase1.trailATR}x ATR` },
                  { label: "Phase 2 Trigger", val: `${ssl.config.phase2.profitPct}%`, trail: `${ssl.config.phase2.trailATR}x ATR` },
                  { label: "Phase 3 Trigger", val: `${ssl.config.phase3.profitPct}%`, trail: `${ssl.config.phase3.trailATR}x ATR` },
                  { label: "Phase 4 Trigger", val: `${ssl.config.phase4.profitPct}%`, trail: `${ssl.config.phase4.trailATR}x ATR` },
                ].map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1">
                    <span className="text-gray-500">{p.label}</span>
                    <div className="flex gap-3">
                      <span className="font-mono text-gray-300">{p.val}</span>
                      <span className="font-mono text-gray-600">Trail: {p.trail}</span>
                    </div>
                  </div>
                ))
              : Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-4 bg-white/[0.03] rounded animate-pulse" />
                ))}
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/[0.06] mt-1">
              <span className="text-gray-500">Break-Even @</span>
              <span className="font-mono text-yellow-400">
                {ssl?.config?.breakEvenTriggerPct ?? 0.8}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Max Hold</span>
              <span className="font-mono text-gray-300">
                {ssl?.config?.maxHoldingMinutes ?? 360} min
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Reset button */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={15}
        className="flex justify-end">
        <button
          disabled={isSubmitting}
          onClick={() => handleAction("stop-loss", "reset")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-gray-400
            bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:text-white
            transition-all duration-200 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Stop Loss
        </button>
      </motion.div>

      {/* ===== SECTION DIVIDER ===== */}
      <div className="border-t border-white/[0.06] my-2" />

      {/* ===== SECTION: SMART STOP TRADE ===== */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={16}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="h-5 w-5 text-yellow-400" />
          <h2 className="text-lg font-bold text-white">Smart Stop Trade</h2>
          <StatusBadge
            active={!sst?.isPaused}
            activeLabel="TRADING"
            inactiveLabel="PAUSED"
            activeColor="emerald"
          />
        </div>
      </motion.div>

      {/* Pause Reason Banner */}
      {sst?.isPaused && sst?.pauseReason && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="rounded-xl p-4 border border-red-500/20 bg-red-500/5 mb-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">
              {sst.pauseReason.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Trading is currently paused. The system will automatically resume when conditions improve
            {sst.autoResumeCountdown > 0 && (
              <span className="text-yellow-400 ml-1">
                (~{sst.autoResumeCountdown} min)
              </span>
            )}
            .
          </p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score Bars */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={17}
          className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-300">Condition Scores</h3>
          </div>
          <div className="space-y-3">
            <ScoreBar label="Volatility" value={sst?.volatilityScore ?? 0} delay={18} />
            <ScoreBar label="Signal Quality" value={sst?.signalQualityScore ?? 0} delay={19} />
            <ScoreBar label="Performance" value={sst?.performanceScore ?? 0} delay={20} />
            <ScoreBar label="Timing" value={sst?.timingScore ?? 0} delay={21} />
            <ScoreBar label="Regime" value={sst?.regimeScore ?? 0} delay={22} />
          </div>
        </motion.div>

        {/* Overall Score + Metrics */}
        <div className="space-y-4">
          {/* Overall Score Gauge */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={23}
            className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-gray-300">Overall Composite</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={
                      (sst?.overallScore ?? 0) >= 70
                        ? "#10b981"
                        : (sst?.overallScore ?? 0) >= 40
                          ? "#f59e0b"
                          : "#ef4444"
                    }
                    strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 - ((sst?.overallScore ?? 0) / 100) * 2 * Math.PI * 40}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.8s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn(
                    "text-lg font-bold font-mono",
                    (sst?.overallScore ?? 0) >= 70
                      ? "text-emerald-400"
                      : (sst?.overallScore ?? 0) >= 40
                        ? "text-yellow-400"
                        : "text-red-400"
                  )}>
                    {sst?.overallScore ?? 0}
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                <InfoRow label="Position Size" delay={24}
                  value={`${(sst?.positionSizeMultiplier ?? 1).toFixed(2)}x`}
                  valueColor={(sst?.positionSizeMultiplier ?? 1) >= 0.8 ? "text-emerald-400" : "text-yellow-400"} />
                <InfoRow label="Consec. Losses" delay={25}
                  value={`${sst?.consecutiveLosses ?? 0} / ${sst?.config?.maxConsecutiveLosses ?? 5}`}
                  valueColor={(sst?.consecutiveLosses ?? 0) >= 3 ? "text-red-400" : "text-gray-300"} />
                <InfoRow label="Daily PnL" delay={26}
                  value={`${(sst?.dailyPnlPct ?? 0) >= 0 ? "+" : ""}${(sst?.dailyPnlPct ?? 0).toFixed(2)}%`}
                  valueColor={(sst?.dailyPnlPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
                <InfoRow label="Drawdown" delay={27}
                  value={`${(sst?.currentDrawdownPct ?? 0).toFixed(2)}%`}
                  valueColor={(sst?.currentDrawdownPct ?? 0) > 5 ? "text-red-400" : "text-gray-300"} />
              </div>
            </div>
          </motion.div>

          {/* Limits & Cooldowns */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={28}
            className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="h-4 w-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-gray-300">Limits & Cooldowns</h3>
            </div>
            <div className="space-y-0.5">
              <InfoRow label="Daily Loss Limit" delay={29}
                value={`${sst?.config?.maxDailyLossPct ?? 3}%`} />
              <InfoRow label="Max Drawdown" delay={30}
                value={`${sst?.config?.maxDrawdownPct ?? 8}%`} />
              <InfoRow label="Auto-Resume" delay={31}
                value={`${sst?.config?.autoResumeAfterMinutes ?? 15} min`} />
              <InfoRow label="Pause Cooldown" delay={32}
                value={`${sst?.config?.pauseCooldownMinutes ?? 5} min`} />
              <InfoRow label="Total Pauses" delay={33}
                value={sst?.pauseCount ?? 0} />
              <InfoRow label="Total Paused Time" delay={34}
                value={sst?.totalPausedTime ? `${sst.totalPausedTime} min` : "0 min"} />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Action Buttons */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={35}
        className="flex gap-3 justify-end">
        {!sst?.isPaused ? (
          <button
            disabled={isSubmitting}
            onClick={() => handleAction("stop-trade", "pause")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-yellow-400
              bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20
              transition-all duration-200 disabled:opacity-50"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause Trading
          </button>
        ) : (
          <button
            disabled={isSubmitting}
            onClick={() => handleAction("stop-trade", "resume")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-emerald-400
              bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20
              transition-all duration-200 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            Resume Trading
          </button>
        )}
        <button
          disabled={isSubmitting}
          onClick={() => handleAction("stop-trade", "reset_daily")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-gray-400
            bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:text-white
            transition-all duration-200 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Daily
        </button>
      </motion.div>
    </div>
  );
}
