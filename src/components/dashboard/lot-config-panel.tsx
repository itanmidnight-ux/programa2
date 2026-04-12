'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Settings, DollarSign, Percent, Brain } from 'lucide-react';

type LotMode = 'FIXED' | 'PERCENTAGE' | 'KELLY';

export function LotConfigPanel() {
  const [mode, setMode] = useState<LotMode>('PERCENTAGE');
  const [fixedLotSize, setFixedLotSize] = useState('0.10');
  const [riskPerTrade, setRiskPerTrade] = useState('1.0');
  const [kellyFraction, setKellyFraction] = useState('25');
  const [maxLotSize, setMaxLotSize] = useState('10.0');
  const [maxExposure, setMaxExposure] = useState('30');

  const commonLots = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 2.00, 5.00];

  // Calculate preview
  const balance = 1000; // Mock balance
  const slPips = 10; // Default
  let lotSize = 0;
  let riskAmount = 0;
  let pipValue = 0;

  if (mode === 'FIXED') {
    lotSize = parseFloat(fixedLotSize);
    pipValue = lotSize * 10; // $10 per pip per standard lot
    riskAmount = pipValue * slPips;
  } else if (mode === 'PERCENTAGE') {
    riskAmount = balance * (parseFloat(riskPerTrade) / 100);
    lotSize = riskAmount / (slPips * 10);
    pipValue = lotSize * 10;
  } else {
    const kellyPct = parseFloat(kellyFraction) / 100;
    riskAmount = balance * (kellyPct * 0.05); // Conservative Kelly
    lotSize = riskAmount / (slPips * 10);
    pipValue = lotSize * 10;
  }

  const handleSave = async () => {
    try {
      await fetch('/api/lot-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          fixedLotSize: parseFloat(fixedLotSize),
          riskPerTradePct: parseFloat(riskPerTrade),
          kellyFraction: parseFloat(kellyFraction) / 100,
          maxLotSize: parseFloat(maxLotSize),
          maxTotalExposurePct: parseFloat(maxExposure),
        }),
      });
      console.log('[LotConfig] Saved successfully');
    } catch (err) {
      console.error('[LotConfig] Failed to save:', err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="w-5 h-5 text-green-400" />
          Gestión de Capital (Tipo MT5)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode Selector */}
        <div className="space-y-2">
          <Label>Modo de Inversión</Label>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={mode === 'FIXED' ? 'default' : 'outline'}
              onClick={() => setMode('FIXED')}
              className="flex items-center gap-2"
            >
              <DollarSign className="w-4 h-4" />
              Lote Fijo
            </Button>
            <Button
              variant={mode === 'PERCENTAGE' ? 'default' : 'outline'}
              onClick={() => setMode('PERCENTAGE')}
              className="flex items-center gap-2"
            >
              <Percent className="w-4 h-4" />
              % Balance
            </Button>
            <Button
              variant={mode === 'KELLY' ? 'default' : 'outline'}
              onClick={() => setMode('KELLY')}
              className="flex items-center gap-2"
            >
              <Brain className="w-4 h-4" />
              Kelly
            </Button>
          </div>
        </div>

        {/* Fixed Mode */}
        {mode === 'FIXED' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-2">
              <Label>Tamaño de Lote</Label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {commonLots.map(lot => (
                  <Button
                    key={lot}
                    variant={fixedLotSize === lot.toString() ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFixedLotSize(lot.toString())}
                  >
                    {lot.toFixed(2)}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                value={fixedLotSize}
                onChange={e => setFixedLotSize(e.target.value)}
                step="0.01"
                min="0.01"
              />
            </div>
          </motion.div>
        )}

        {/* Percentage Mode */}
        {mode === 'PERCENTAGE' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-2">
              <Label>Riesgo por Trade (%)</Label>
              <Input
                type="number"
                value={riskPerTrade}
                onChange={e => setRiskPerTrade(e.target.value)}
                step="0.1"
                min="0.1"
                max="10"
              />
            </div>
          </motion.div>
        )}

        {/* Kelly Mode */}
        {mode === 'KELLY' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-2">
              <Label>Fracción Kelly (%)</Label>
              <Select value={kellyFraction} onValueChange={setKellyFraction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25% (Conservador)</SelectItem>
                  <SelectItem value="50">50% (Moderado)</SelectItem>
                  <SelectItem value="100">100% (Agresivo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        )}

        {/* Safety Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Lote Máximo</Label>
            <Input
              type="number"
              value={maxLotSize}
              onChange={e => setMaxLotSize(e.target.value)}
              step="0.1"
            />
          </div>
          <div className="space-y-2">
            <Label>Exposición Máx (%)</Label>
            <Input
              type="number"
              value={maxExposure}
              onChange={e => setMaxExposure(e.target.value)}
              step="1"
            />
          </div>
        </div>

        {/* Preview */}
        <Card className="bg-muted/50">
          <CardContent className="p-3 space-y-1">
            <p className="text-sm font-medium">Vista Previa (Balance: ${balance.toFixed(0)})</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-muted-foreground">Lote calculado:</span>
              <span className="font-mono font-bold">{lotSize.toFixed(2)}</span>
              <span className="text-muted-foreground">Unidades:</span>
              <span className="font-mono">{(lotSize * 100000).toFixed(0)}</span>
              <span className="text-muted-foreground">Valor/pip:</span>
              <span className="font-mono">${pipValue.toFixed(2)}</span>
              <span className="text-muted-foreground">Riesgo ({slPips} pips SL):</span>
              <span className="font-mono text-red-400">${riskAmount.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} className="w-full">
          <Settings className="w-4 h-4 mr-2" />
          Guardar Configuración
        </Button>
      </CardContent>
    </Card>
  );
}
