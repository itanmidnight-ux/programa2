"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ScrollText, Trash2, Pause, Play, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { useTradingStore, type LogEntry } from "@/lib/trading-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type LogLevel = "ALL" | "INFO" | "WARNING" | "ERROR";

const levelConfig: Record<string, { color: string; icon: React.ReactNode; bg: string }> = {
  INFO: { color: "text-blue-400", icon: <Info className="h-3 w-3" />, bg: "bg-blue-500/10" },
  WARNING: { color: "text-yellow-400", icon: <AlertTriangle className="h-3 w-3" />, bg: "bg-yellow-500/10" },
  ERROR: { color: "text-red-400", icon: <AlertCircle className="h-3 w-3" />, bg: "bg-red-500/10" },
};

export function LogsPanel() {
  const { logs, addLog, clearLogs } = useTradingStore();
  const [filter, setFilter] = useState<LogLevel>("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Logs are now fetched from the API via page.tsx polling.
  // No auto-generation needed.

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  }, []);

  const filtered = filter === "ALL" ? logs : logs.filter((l) => l.level === filter);
  const counts = {
    ALL: logs.length,
    INFO: logs.filter((l) => l.level === "INFO").length,
    WARNING: logs.filter((l) => l.level === "WARNING").length,
    ERROR: logs.filter((l) => l.level === "ERROR").length,
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 lg:px-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-gray-400" />
            System Logs
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length} log entries</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5">
            {(["ALL", "INFO", "WARNING", "ERROR"] as LogLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all relative",
                  filter === level
                    ? "bg-blue-500/15 text-blue-400"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                {level}
                <span className="ml-1 text-[9px] opacity-60">{counts[level]}</span>
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-white/[0.08]" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-white"
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-red-400"
            onClick={clearLogs}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Log List */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar px-4 lg:px-6 pb-4 font-mono text-xs"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-600">
            <ScrollText className="h-8 w-8 mb-3" />
            <span className="text-sm">No logs</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((log, i) => {
              const config = levelConfig[log.level] || levelConfig.INFO;
              return (
                <motion.div
                  key={`${log.timestamp}-${i}`}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-white/[0.02] transition-colors group",
                    config.bg
                  )}
                >
                  <span className="text-gray-600 whitespace-nowrap flex-shrink-0 select-none">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={cn("flex-shrink-0 flex items-center gap-1", config.color)}>
                    {config.icon}
                    <span className="font-semibold w-14">[{log.level}]</span>
                  </span>
                  <span className="text-gray-300 break-all">{log.message}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && (
        <Button
          onClick={() => {
            setAutoScroll(true);
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
          }}
          className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full h-8 w-8 shadow-lg"
          size="icon"
        >
          <span className="text-lg">↓</span>
        </Button>
      )}
    </div>
  );
}
