"use client";

import { motion } from "framer-motion";
import { BrainCircuit, Target, CheckCircle2, XCircle, Activity, TrendingUp, Cpu, BarChart3 } from "lucide-react";
import { useTradingStore } from "@/lib/trading-store";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" as const } }),
};

function ConfidenceGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = value * 100;
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.04] p-4">
      <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">{label}</div>
      <div className="relative w-20 h-20 mx-auto mb-2">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={`${2 * Math.PI * 40 * (1 - value)}`}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-bold font-mono" style={{ color }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

export function MLPanel() {
  const { snapshot, mlData } = useTradingStore();
  const ml = mlData;

  const predColor = ml.last_prediction === "BUY" ? "#10b981" : ml.last_prediction === "SELL" ? "#ef4444" : "#f59e0b";

  return (
    <div className="space-y-4 p-4 lg:p-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-purple-400" />
          ML / AI Intelligence
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Machine learning model status and predictions</p>
      </div>

      {/* Status + Prediction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
          className="glass-card rounded-xl p-5 border-l-2" style={{ borderLeftColor: "#8b5cf6" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <Cpu className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Model Status</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
                <span className="text-xs text-emerald-400 font-medium">{ml.status}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Model Type</span>
              <span className="text-gray-300 text-xs">{ml.model_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Features Used</span>
              <span className="font-mono text-white">{ml.features_used}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total Predictions</span>
              <span className="font-mono text-white">{ml.total_predictions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Correct</span>
              <span className="font-mono text-emerald-400">{ml.correct_predictions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Last Trained</span>
              <span className="font-mono text-gray-400 text-xs">{new Date(ml.last_trained).toLocaleTimeString()}</span>
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}
          className="glass-card rounded-xl p-5" style={{ borderLeftColor: predColor, borderLeftWidth: 2 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${predColor}20` }}>
              <Target className="h-5 w-5" style={{ color: predColor }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Last Prediction</h3>
              <span className="text-2xl font-bold font-mono" style={{ color: predColor }}>{ml.last_prediction}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <ConfidenceGauge value={ml.confidence} label="Confidence" color={predColor} />
            <ConfidenceGauge value={ml.accuracy_7d} label="7d Accuracy" color="#3b82f6" />
            <ConfidenceGauge value={ml.accuracy_30d} label="30d Accuracy" color="#f59e0b" />
          </div>
        </motion.div>
      </div>

      {/* Market Regime */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}
        className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-300">Market Regime Detection</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Detected Regime</div>
            <div className="text-xl font-bold font-mono text-purple-400">{ml.market_regime}</div>
          </div>
          <div className="flex-1 bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Regime Confidence</div>
            <div className="flex items-center gap-2">
              <Progress value={ml.regime_confidence * 100} className="flex-1 h-2" />
              <span className="text-sm font-mono font-bold text-white">{(ml.regime_confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="flex-1 bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Confluence Score</div>
            <div className="flex items-center gap-2">
              <Progress value={snapshot.confluence_score * 100} className="flex-1 h-2" />
              <span className="text-sm font-mono font-bold text-white">{(snapshot.confluence_score * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Signal Quality */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}
        className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-yellow-400" />
          <h3 className="text-sm font-semibold text-gray-300">Signal Quality Analysis</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(ml.signal_quality).map(([key, val]) => {
            const numVal = val as number;
            return (
              <div key={key} className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04] text-center">
                <div className={cn("text-lg font-bold font-mono", numVal >= 0.7 ? "text-emerald-400" : numVal >= 0.55 ? "text-yellow-400" : "text-red-400")}>
                  {(numVal * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5 capitalize">{key} accuracy</div>
                <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", numVal >= 0.7 ? "bg-emerald-500" : numVal >= 0.55 ? "bg-yellow-500" : "bg-red-500")}
                    style={{ width: `${numVal * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Prediction History */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}
        className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-gray-300">Recent Predictions</h3>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
          {ml.prediction_history.map((pred, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.03] text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono text-gray-500">{new Date(pred.time * 1000).toLocaleTimeString()}</span>
                <span className={cn("font-bold", pred.prediction === "BUY" ? "text-emerald-400" : pred.prediction === "SELL" ? "text-red-400" : "text-yellow-400")}>
                  {pred.prediction}
                </span>
                <span className="text-gray-500">→</span>
                <span className="text-gray-400">{pred.actual}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">{(pred.confidence * 100).toFixed(0)}%</span>
                {pred.correct ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
