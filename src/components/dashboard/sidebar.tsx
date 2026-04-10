"use client";

import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  ShieldAlert,
  ShieldCheck,
  BrainCircuit,
  Settings,
  ScrollText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTradingStore, type NavItem } from "@/lib/trading-store";

const navItems: { id: NavItem; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "trades", label: "Trades", icon: <ArrowLeftRight className="h-4 w-4" /> },
  { id: "charts", label: "Charts", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "risk", label: "Risk", icon: <ShieldAlert className="h-4 w-4" /> },
  { id: "smart-stops", label: "Smart Stops", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "ml", label: "ML / AI", icon: <BrainCircuit className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  { id: "logs", label: "Logs", icon: <ScrollText className="h-4 w-4" /> },
];

export function Sidebar() {
  const { activeNav, setActiveNav, sidebarOpen, toggleSidebar } = useTradingStore();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-56 bg-[#0d1117] border-r border-white/[0.06] flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-bold text-white tracking-tight">Reco-Trading</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Bot Dashboard</p>
          </div>
          <button onClick={toggleSidebar} className="lg:hidden text-gray-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setActiveNav(item.id);
                  if (sidebarOpen) toggleSidebar();
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent"
                )}
              >
                <span className={cn(isActive && "text-blue-400")}>{item.icon}</span>
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400"
                  />
                )}
              </motion.button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
            <span className="text-xs text-gray-500">System Online</span>
          </div>
        </div>
      </aside>
    </>
  );
}
