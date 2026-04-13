"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useTradingStore,
  type RiskMetricsState,
  type MLDataState,
  type PairData,
} from "@/lib/trading-store";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { OverviewPanel } from "@/components/dashboard/overview-panel";
import { TradesPanel } from "@/components/dashboard/trades-panel";
import { ChartsPanel } from "@/components/dashboard/charts-panel";
import { RiskPanel } from "@/components/dashboard/risk-panel";
import { MLPanel } from "@/components/dashboard/ml-panel";
import { SettingsPanel } from "@/components/dashboard/settings-panel";
import { SmartStopsPanel } from "@/components/dashboard/smart-stop-panel";
import { LogsPanel } from "@/components/dashboard/logs-panel";
import { formatPair } from "@/lib/format-utils";

function DashboardContent() {
  const store = useTradingStore();
  const {
    activeNav,
    setSnapshot,
    setTrades,
    setLogs,
    setConnected,
    setEngineStatus,
    setEngineUptime,
    setEngineLastTick,
    setRiskMetrics,
    setMLData,
    setSmartStopStatus,
    setSmartStopTradeStatus,
    setMarketAnalysis,
    selectedPair,
    setPairPrices,
  } = store;

  const snapshotRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tradesRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const riskRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mlRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smartStopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smartStopTradeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairsRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch real snapshot from API (now pair-aware)
  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/snapshot?pair=${selectedPair}`);
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
        setConnected(true);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
  }, [setSnapshot, setConnected, selectedPair]);

  // Fetch real trades from database
  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch("/api/trades?limit=200");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTrades(data);
        }
      }
    } catch { /* silent */ }
  }, [setTrades]);

  // Fetch real logs from database
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs?limit=100");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLogs(data);
        }
      }
    } catch { /* silent */ }
  }, [setLogs]);

  // Fetch risk metrics from /api/risk
  const fetchRisk = useCallback(async () => {
    try {
      const res = await fetch("/api/risk");
      if (res.ok) {
        const data = await res.json();
        if (data.riskMetrics) {
          setRiskMetrics(data.riskMetrics as RiskMetricsState);
        }
      }
    } catch { /* silent */ }
  }, [setRiskMetrics]);

  // Fetch ML predictions from /api/ml/predictions
  const fetchML = useCallback(async () => {
    try {
      const res = await fetch("/api/ml/predictions");
      if (res.ok) {
        const data = await res.json();
        if (data.prediction) {
          const mlData: Partial<MLDataState> = {
            status: data.status || "ACTIVE",
            model_type: data.prediction.model_type || "Ensemble",
            last_prediction: data.prediction.direction || "HOLD",
            confidence: data.prediction.confidence || 0,
            accuracy_7d: data.accuracy?.accuracy_7d || 0,
            accuracy_30d: data.accuracy?.accuracy_30d || 0,
            total_predictions: data.accuracy?.total_predictions || 0,
            correct_predictions: data.accuracy?.correct_predictions || 0,
            features_used: Object.keys(data.feature_importance || {}).length || 47,
            last_trained: data.prediction?.timestamp || new Date().toISOString(),
            market_regime: data.prediction?.market_regime || "UNKNOWN",
            regime_confidence: data.prediction?.regime_confidence || 0,
            prediction_history: (data.history || []).map((h: any) => ({
              time: h.time,
              prediction: h.prediction,
              actual: h.actual,
              correct: h.correct,
              confidence: h.confidence,
            })),
            signal_quality: {
              trend_accuracy: data.feature_importance?.trend_ema_cross
                ? +(0.55 + data.feature_importance.trend_ema_cross * 0.4).toFixed(3)
                : 0,
              momentum_accuracy: data.feature_importance?.momentum_5
                ? +(0.5 + data.feature_importance.momentum_5 * 0.5).toFixed(3)
                : 0,
              volume_accuracy: data.feature_importance?.volume_ratio
                ? +(0.5 + data.feature_importance.volume_ratio * 0.6).toFixed(3)
                : 0,
              volatility_accuracy: data.feature_importance?.atr_percent
                ? +(0.5 + data.feature_importance.atr_percent * 0.3).toFixed(3)
                : 0,
              structure_accuracy: 0,
            },
          };
          setMLData(mlData as MLDataState);
        }
      }
    } catch { /* silent */ }
  }, [setMLData]);

  // Fetch engine status from /api/engine
  const fetchEngine = useCallback(async () => {
    try {
      const res = await fetch("/api/engine");
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setEngineStatus(data.state);
        }
        if (typeof data.uptime === "number") {
          setEngineUptime(data.uptime);
        }
        if (data.lastTick) {
          setEngineLastTick(data.lastTick);
        }
      }
    } catch { /* silent */ }
  }, [setEngineStatus, setEngineUptime, setEngineLastTick]);

  // Fetch smart stop loss status
  const fetchSmartStopStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stop-loss");
      if (res.ok) {
        const data = await res.json();
        setSmartStopStatus(data);
      }
    } catch { /* silent */ }
  }, [setSmartStopStatus]);

  // Fetch smart stop trade status
  const fetchSmartStopTradeStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stop-trade");
      if (res.ok) {
        const data = await res.json();
        setSmartStopTradeStatus(data);
      }
    } catch { /* silent */ }
  }, [setSmartStopTradeStatus]);

  // Fetch market analysis from /api/market/analysis
  const fetchAnalysis = useCallback(async () => {
    try {
      const res = await fetch("/api/market/analysis");
      if (res.ok) {
        const data = await res.json();
        if (data.signal) {
          setMarketAnalysis(data);
        }
      }
    } catch { /* silent */ }
  }, [setMarketAnalysis]);

  // Fetch all pair prices (fast batch) from /api/pairs
  const fetchPairPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/pairs");
      if (res.ok) {
        const data = await res.json();
        if (data.pairs && Array.isArray(data.pairs)) {
          const prices: Record<string, PairData> = {};
          for (const p of data.pairs) {
            prices[p.symbol] = {
              symbol: p.symbol,
              display: p.display || formatPair(p.symbol),
              price: p.price || 0,
              change24h: p.change24h || 0,
              high24h: p.high24h || 0,
              low24h: p.low24h || 0,
              volume24h: p.volume24h || 0,
              active: p.active || false,
              lastUpdate: p.lastUpdate || 0,
            };
          }
          setPairPrices(prices);

          // Update selected pair if it was changed server-side
          if (data.activePair) {
            // Sync selected pair with server
            const current = useTradingStore.getState().selectedPair;
            if (current !== data.activePair && data.activePair) {
              useTradingStore.getState().setSelectedPair(data.activePair);
            }
          }
        }
      } else {
        console.warn(`[PAIRS] /api/pairs returned ${res.status}`);
      }
    } catch (err) {
      console.warn('[PAIRS] Failed to fetch pair prices:', err);
    }
  }, [setPairPrices]);

  // Initial load + polling
  useEffect(() => {
    // Immediate first fetch
    fetchSnapshot();
    fetchTrades();
    fetchLogs();
    fetchRisk();
    fetchML();
    fetchEngine();
    fetchSmartStopStatus();
    fetchSmartStopTradeStatus();
    fetchAnalysis();
    fetchPairPrices();

    // Snapshot every 3 seconds
    snapshotRef.current = setInterval(fetchSnapshot, 3000);

    // Trades and logs every 10 seconds
    tradesRef.current = setInterval(() => {
      fetchTrades();
      fetchLogs();
    }, 10000);

    // Risk metrics every 5 seconds
    riskRef.current = setInterval(fetchRisk, 5000);

    // ML predictions every 10 seconds
    mlRef.current = setInterval(fetchML, 10000);

    // Engine status every 3 seconds
    engineRef.current = setInterval(fetchEngine, 3000);

    // Smart stop loss every 3 seconds
    smartStopRef.current = setInterval(fetchSmartStopStatus, 3000);

    // Smart stop trade every 5 seconds
    smartStopTradeRef.current = setInterval(fetchSmartStopTradeStatus, 5000);

    // Market analysis every 15 seconds
    analysisRef.current = setInterval(fetchAnalysis, 15000);

    // Pair prices every 5 seconds (fast batch)
    pairsRef.current = setInterval(fetchPairPrices, 5000);

    return () => {
      if (snapshotRef.current) clearInterval(snapshotRef.current);
      if (tradesRef.current) clearInterval(tradesRef.current);
      if (riskRef.current) clearInterval(riskRef.current);
      if (mlRef.current) clearInterval(mlRef.current);
      if (engineRef.current) clearInterval(engineRef.current);
      if (smartStopRef.current) clearInterval(smartStopRef.current);
      if (smartStopTradeRef.current) clearInterval(smartStopTradeRef.current);
      if (analysisRef.current) clearInterval(analysisRef.current);
      if (pairsRef.current) clearInterval(pairsRef.current);
    };
  }, [fetchSnapshot, fetchTrades, fetchLogs, fetchRisk, fetchML, fetchEngine, fetchSmartStopStatus, fetchSmartStopTradeStatus, fetchAnalysis, fetchPairPrices]);

  const panelVariants = {
    initial: { opacity: 0, x: 8 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
    exit: { opacity: 0, x: -8, transition: { duration: 0.15 } },
  };

  const renderPanel = () => {
    switch (activeNav) {
      case "overview":
        return <OverviewPanel />;
      case "trades":
        return <TradesPanel />;
      case "charts":
        return <ChartsPanel />;
      case "risk":
        return <RiskPanel />;
      case "ml":
        return <MLPanel />;
      case "smart-stops":
        return <SmartStopsPanel />;
      case "settings":
        return <SettingsPanel />;
      case "logs":
        return <LogsPanel />;
      default:
        return <OverviewPanel />;
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0e17] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeNav}
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full overflow-hidden"
            >
              {renderPanel()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function Page() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-screen w-screen bg-[#0a0e17] flex items-center justify-center text-gray-400">
        Loading dashboard...
      </div>
    );
  }

  return <DashboardContent />;
}
