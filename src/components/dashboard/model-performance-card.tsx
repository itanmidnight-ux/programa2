"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface ModelMetric {
  id: string;
  name: string;
  pair: string;
  timeframe: string;
  version: number;
  status: string;
  isActive: boolean;
  trainingAccuracy: number;
  validationAccuracy: number;
  testAccuracy: number;
  predictionAccuracy?: number;
  totalPredictions?: number;
  trainedAt: string | null;
  deployedAt: string | null;
}

export function ModelPerformanceCard() {
  const [models, setModels] = useState<ModelMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 300000); // Every 5 minutes
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    try {
      setLoading(true);
      const response = await fetch('/api/ai/metrics?days=7');
      
      if (!response.ok) throw new Error('Failed to fetch metrics');

      const data = await response.json();
      setModels(data.models || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Metrics error:', err);
    } finally {
      setLoading(false);
    }
  }

  const getStatusIcon = (status: string, isActive: boolean) => {
    if (isActive) {
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    }
    if (status === 'TRAINING') {
      return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
    }
    return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (isActive) {
      return <Badge className="bg-green-500/20 text-green-400 text-xs">Active</Badge>;
    }
    if (status === 'TRAINING') {
      return <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Training</Badge>;
    }
    return <Badge variant="outline" className="text-xs">{status}</Badge>;
  };

  return (
    <Card className="col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="w-5 h-5" />
              Model Performance
            </CardTitle>
            <CardDescription className="text-xs">
              Accuracy and metrics of AI models
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchMetrics}
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

        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading metrics...
          </div>
        ) : models.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No models trained yet. Train your first model to see performance metrics.
          </div>
        ) : (
          <div className="space-y-3">
            {models.slice(0, 8).map((model) => (
              <div key={model.id} className="p-3 border rounded-lg hover:bg-accent/50 transition">
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate flex items-center gap-2">
                      {getStatusIcon(model.status, model.isActive)}
                      {model.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      v{model.version} • {model.pair}/{model.timeframe}
                    </div>
                  </div>
                  <div className="ml-2">
                    {getStatusBadge(model.status, model.isActive)}
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {/* Training Accuracy */}
                  <div>
                    <div className="text-xs text-muted-foreground">Training</div>
                    <div className="font-bold text-sm text-blue-400">
                      {(model.trainingAccuracy * 100).toFixed(1)}%
                    </div>
                    <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${model.trainingAccuracy * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Test Accuracy */}
                  <div>
                    <div className="text-xs text-muted-foreground">Test</div>
                    <div className="font-bold text-sm text-purple-400">
                      {(model.testAccuracy * 100).toFixed(1)}%
                    </div>
                    <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-purple-500"
                        style={{ width: `${model.testAccuracy * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Prediction Accuracy */}
                  <div>
                    <div className="text-xs text-muted-foreground">Live</div>
                    <div className="font-bold text-sm text-green-400">
                      {model.predictionAccuracy
                        ? `${(model.predictionAccuracy * 100).toFixed(1)}%`
                        : 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {model.totalPredictions || 0} preds
                    </div>
                  </div>
                </div>

                {/* Trained Date */}
                {model.trainedAt && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Trained: {new Date(model.trainedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {models.length > 0 && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            Showing {Math.min(models.length, 8)} of {models.length} models
          </div>
        )}
      </CardContent>
    </Card>
  );
}
