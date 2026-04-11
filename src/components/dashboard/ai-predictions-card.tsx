"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, TrendingUp, BarChart3, Loader2, RefreshCw } from 'lucide-react';

interface Prediction {
  id: string;
  pair: string;
  timeframe: string;
  prediction: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  expectedReturn: number;
  probabilityBuy: number;
  probabilitySell: number;
  probabilityHold: number;
  createdAt: string;
  model?: {
    name: string;
    version: number;
    status: string;
  };
}

export function AIPredictionsCard() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  async function fetchPredictions() {
    try {
      setLoading(true);
      const response = await fetch('/api/ai/predict?limit=20');

      if (!response.ok) throw new Error('Failed to fetch predictions');

      const data = await response.json();
      setPredictions(data.predictions || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Prediction error:', err);
    } finally {
      setLoading(false);
    }
  }

  const getPredictionColor = (prediction: string) => {
    switch (prediction) {
      case 'BUY':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'SELL':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getIcon = (prediction: string) => {
    switch (prediction) {
      case 'BUY':
        return <ArrowUp className="w-3.5 h-3.5" />;
      case 'SELL':
        return <ArrowDown className="w-3.5 h-3.5" />;
      default:
        return <TrendingUp className="w-3.5 h-3.5" />;
    }
  };

  return (
    <Card className="col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5" />
              AI Predictions
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time predictions from trained models
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchPredictions}
            disabled={loading}
            className="h-8 w-8"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg mb-3 text-sm">
            Error: {error}
          </div>
        )}

        {loading && predictions.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading predictions...
          </div>
        ) : predictions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No predictions available. Train and deploy models first.
          </div>
        ) : (
          <div className="space-y-2">
            {predictions.slice(0, 10).map((pred) => (
              <div
                key={pred.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition"
              >
                {/* Pair and Timeframe */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {pred.pair}/{pred.timeframe}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(pred.createdAt).toLocaleTimeString()}
                  </div>
                </div>

                {/* Prediction Badge */}
                <div className="flex items-center gap-2 mx-3">
                  <Badge className={`${getPredictionColor(pred.prediction)} border text-xs`}>
                    <span className="flex items-center gap-1">
                      {getIcon(pred.prediction)}
                      {pred.prediction}
                    </span>
                  </Badge>
                </div>

                {/* Confidence */}
                <div className="w-16 text-right">
                  <div className="text-sm font-semibold">
                    {(pred.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${pred.confidence * 100}%` }}
                    />
                  </div>
                </div>

                {/* Expected Return */}
                <div className="w-16 text-right ml-2">
                  <div
                    className={`text-sm font-semibold ${
                      pred.expectedReturn > 0
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}
                  >
                    {pred.expectedReturn > 0 ? '+' : ''}
                    {(pred.expectedReturn * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {predictions.length > 0 && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            {predictions.length} predictions • Updated {new Date().toLocaleTimeString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
