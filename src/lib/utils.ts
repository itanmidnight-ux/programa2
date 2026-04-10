import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPrice(value: number): string {
  if (value >= 1000) return formatCurrency(value, 2);
  if (value >= 1) return formatCurrency(value, 4);
  return formatCurrency(value, 6);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatVolume(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function pnlColor(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-gray-400";
}

export function signalColor(signal: string): string {
  switch (signal?.toUpperCase()) {
    case "BUY":
    case "LONG":
    case "STRONG_BUY":
      return "text-emerald-400";
    case "SELL":
    case "SHORT":
    case "STRONG_SELL":
      return "text-red-400";
    default:
      return "text-yellow-400";
  }
}

export function signalBgColor(signal: string): string {
  switch (signal?.toUpperCase()) {
    case "BUY":
    case "LONG":
    case "STRONG_BUY":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "SELL":
    case "SHORT":
    case "STRONG_SELL":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  }
}

export function statusColor(status: string): string {
  switch (status?.toUpperCase()) {
    case "RUNNING":
    case "CONNECTED":
    case "ACTIVE":
      return "text-emerald-400";
    case "STOPPED":
    case "DISCONNECTED":
    case "INACTIVE":
      return "text-red-400";
    default:
      return "text-yellow-400";
  }
}

export function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
