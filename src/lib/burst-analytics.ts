// ============================================
// RECO-TRADING - Burst Analytics
// ============================================
// Analytics and reporting for burst trading
// ============================================

import { db } from '@/lib/db';

export interface BurstAnalytics {
  totalBursts: number;
  activeBursts: number;
  closedBursts: number;
  totalBurstTrades: number;
  totalBurstPnl: number;
  avgTradesPerBurst: number;
  avgWinRate: number;
  bestBurst: { id: number; pnl: number };
  worstBurst: { id: number; pnl: number };
  avgDuration: number;
  signalStrengthVsPnl: { strength: number; pnl: number }[];
}

export async function getBurstAnalytics(): Promise<BurstAnalytics> {
  const allBursts = await db.tradeGroup.findMany({
    include: {
      trades: true,
    },
  });

  const activeBursts = allBursts.filter(b => b.status === 'ACTIVE');
  const closedBursts = allBursts.filter(b => b.status === 'CLOSED');

  const totalBurstTrades = allBursts.reduce((sum, b) => sum + b.totalTrades, 0);
  const totalBurstPnl = allBursts.reduce((sum, b) => sum + b.totalPnl, 0);

  const avgTradesPerBurst = allBursts.length > 0
    ? totalBurstTrades / allBursts.length
    : 0;

  const winRates = closedBursts.map(b => {
    const wins = b.trades.filter(t => (t.pnl || 0) > 0).length;
    return b.trades.length > 0 ? (wins / b.trades.length) * 100 : 0;
  });

  const avgWinRate = winRates.length > 0
    ? winRates.reduce((a, b) => a + b, 0) / winRates.length
    : 0;

  const sortedByPnl = [...closedBursts].sort((a, b) => b.totalPnl - a.totalPnl);

  const signalStrengthVsPnl = allBursts.map(b => ({
    strength: b.signalStrength,
    pnl: b.totalPnl,
  }));

  return {
    totalBursts: allBursts.length,
    activeBursts: activeBursts.length,
    closedBursts: closedBursts.length,
    totalBurstTrades,
    totalBurstPnl,
    avgTradesPerBurst,
    avgWinRate,
    bestBurst: sortedByPnl[0]
      ? { id: sortedByPnl[0].id, pnl: sortedByPnl[0].totalPnl }
      : { id: 0, pnl: 0 },
    worstBurst: sortedByPnl[sortedByPnl.length - 1]
      ? { id: sortedByPnl[sortedByPnl.length - 1].id, pnl: sortedByPnl[sortedByPnl.length - 1].totalPnl }
      : { id: 0, pnl: 0 },
    avgDuration: closedBursts.filter(b => b.duration != null).length > 0
      ? closedBursts.filter(b => b.duration != null).reduce((sum, b) => sum + (b.duration || 0), 0) / closedBursts.filter(b => b.duration != null).length
      : 0,
    signalStrengthVsPnl,
  };
}
