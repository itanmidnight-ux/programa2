"use client";

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Brain, Loader2 } from 'lucide-react';

interface Strategy {
  id: string;
  name: string;
  pair: string;
  timeframe: string;
  passedValidation: boolean;
  isDeployed: boolean;
  backtestWinRate: number;
  backtestProfit: number;
  backtestDrawdown: number;
  backtestSharpe: number;
  createdAt: string;
}

interface StrategySelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StrategySelectorDialog({
  open,
  onOpenChange,
}: StrategySelectorDialogProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    if (open) {
      fetchStrategies();
    }
  }, [open]);

  async function fetchStrategies() {
    setLoading(true);
    try {
      const response = await fetch('/api/strategy/backtest?limit=50');
      
      if (!response.ok) throw new Error('Failed to fetch strategies');

      const data = await response.json();
      setStrategies(data.results || []);
    } catch (error: any) {
      console.error('Fetch strategies error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deployStrategies() {
    setDeploying(true);
    try {
      const results = await Promise.all(
        selectedStrategies.map(async (validationId) => {
          const response = await fetch('/api/strategy/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ validationId }),
          });
          return response.ok;
        })
      );

      const successCount = results.filter(Boolean).length;
      
      if (successCount > 0) {
        // Refresh list
        await fetchStrategies();
        setSelectedStrategies([]);
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Deploy error:', error);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Select Strategies to Deploy
          </DialogTitle>
          <DialogDescription>
            Choose which validated strategies to activate. Only strategies that passed backtest validation are available.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading strategies...
            </div>
          ) : strategies.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No strategies available. Run backtests first.
            </div>
          ) : (
            strategies
              .filter((s) => s.passedValidation && !s.isDeployed)
              .map((strategy) => (
                <div
                  key={strategy.id}
                  className={`p-4 border rounded-lg cursor-pointer transition ${
                    selectedStrategies.includes(strategy.id)
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => {
                    setSelectedStrategies((prev) =>
                      prev.includes(strategy.id)
                        ? prev.filter((id) => id !== strategy.id)
                        : [...prev, strategy.id]
                    );
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {strategy.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {strategy.pair}/{strategy.timeframe}
                      </div>
                    </div>

                    {selectedStrategies.includes(strategy.id) && (
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    )}
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-4 mt-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Win Rate</div>
                      <div className="font-bold text-green-400">
                        {(strategy.backtestWinRate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Profit</div>
                      <div className="font-bold text-blue-400">
                        ${strategy.backtestProfit.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Sharpe</div>
                      <div className="font-bold text-purple-400">
                        {strategy.backtestSharpe.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Drawdown */}
                  <div className="mt-2 text-xs text-muted-foreground">
                    Max Drawdown: ${strategy.backtestDrawdown.toFixed(2)}
                  </div>
                </div>
              ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={deployStrategies}
            disabled={selectedStrategies.length === 0 || deploying}
          >
            {deploying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              `Deploy ${selectedStrategies.length} Strateg${selectedStrategies.length !== 1 ? 'ies' : 'y'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
