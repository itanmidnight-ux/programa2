'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Zap, Target, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BurstGroup {
  id: number;
  pair: string;
  side: string;
  signalStrength: number;
  totalTrades: number;
  totalPnl: number;
  totalPnlPct: number;
  status: string;
  trades?: any[];
}

interface BurstTrade {
  id: number;
  pair: string;
  side: string;
  entryPrice: number;
  pnl: number;
  status: string;
  tradeGroupId: number | null;
  waveNumber: number | null;
  signalStrength: number | null;
}

export function BurstPanel() {
  const [activeBursts, setActiveBursts] = useState<BurstGroup[]>([]);
  const [closedBursts, setClosedBursts] = useState<BurstGroup[]>([]);
  const [burstTrades, setBurstTrades] = useState<BurstTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBurstData = async () => {
      try {
        const res = await fetch('/api/burst');
        const data = await res.json();
        if (data.success) {
          setActiveBursts(data.activeBursts);
          setClosedBursts(data.closedBursts);
          setBurstTrades(data.burstTrades);
        }
      } catch (err) {
        console.error('[BurstPanel] Failed to fetch burst data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBurstData();
    const interval = setInterval(fetchBurstData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalBurstPnl = burstTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const burstWins = burstTrades.filter(t => (t.pnl || 0) > 0).length;
  const burstWinRate = burstTrades.length > 0 ? (burstWins / burstTrades.length) * 100 : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Loading burst data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Burst Summary */}
      <Card className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-400">
            <Zap className="w-5 h-5" />
            Burst Trading Mode
            <Badge variant={activeBursts.length > 0 ? 'destructive' : 'secondary'}>
              {activeBursts.length > 0 ? 'ACTIVE' : 'IDLE'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Active Bursts</p>
              <p className="text-2xl font-bold text-purple-400">{activeBursts.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Burst Trades</p>
              <p className="text-2xl font-bold">{burstTrades.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Burst PnL</p>
              <p className={`text-2xl font-bold ${totalBurstPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${totalBurstPnl.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold text-yellow-400">
                {burstWins} / {burstTrades.length} ({burstWinRate.toFixed(0)}%)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Bursts */}
      {activeBursts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active Bursts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeBursts.map(burst => (
              <motion.div
                key={burst.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {burst.side === 'LONG' ? (
                      <TrendingUp className="w-4 h-4 text-green-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-medium">Burst #{burst.id}</span>
                    <Badge variant="outline">{burst.side}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">
                      {burst.trades?.filter(t => t.status === 'CLOSED').length || 0}/{burst.totalTrades}
                    </span>
                  </div>
                </div>
                <Progress
                  value={((burst.trades?.filter(t => t.status === 'CLOSED').length || 0) / burst.totalTrades) * 100}
                  className="h-2"
                />
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>Signal: {burst.signalStrength.toFixed(0)}</span>
                  <span>PnL: ${burst.totalPnl.toFixed(2)}</span>
                  <span>{burst.pair}</span>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Burst History */}
      {closedBursts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Burst History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {closedBursts.slice(0, 20).map(burst => (
                <div
                  key={burst.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span>Burst #{burst.id}</span>
                    <Badge variant="outline" className="text-xs">
                      {burst.totalTrades} trades
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={burst.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                      ${burst.totalPnl.toFixed(2)}
                    </span>
                    <span>{burst.totalPnlPct.toFixed(2)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {burstTrades.length === 0 && activeBursts.length === 0 && (
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              No burst trades yet. Burst mode activates automatically when signal strength &gt;= 65.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
