'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Target } from 'lucide-react';

const QUICK_LOTS = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00];

export function QuickTradePanel() {
  const [symbol, setSymbol] = useState('EURUSD');
  const [lotSize, setLotSize] = useState('0.10');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');

  const symbols = [
    { value: 'EURUSD', label: 'EUR/USD', spread: '0.02' },
    { value: 'GBPUSD', label: 'GBP/USD', spread: '0.06' },
    { value: 'USDJPY', label: 'USD/JPY', spread: '0.05' },
    { value: 'XAUUSD', label: 'XAU/USD', spread: '0.10' },
    { value: 'US30', label: 'US30', spread: '1.0' },
    { value: 'NAS100', label: 'NAS100', spread: '0.8' },
  ];

  const selected = symbols.find(s => s.value === symbol);
  const mockBid = 1.08542;
  const mockAsk = 1.08544;

  const handleBuy = async () => {
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side: 'BUY',
          lotSize: parseFloat(lotSize),
          stopLoss: sl ? parseFloat(sl) : undefined,
          takeProfit: tp ? parseFloat(tp) : undefined,
        }),
      });
      const data = await res.json();
      console.log('[QuickTrade] Buy order:', data);
    } catch (err) {
      console.error('[QuickTrade] Buy failed:', err);
    }
  };

  const handleSell = async () => {
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side: 'SELL',
          lotSize: parseFloat(lotSize),
          stopLoss: sl ? parseFloat(sl) : undefined,
          takeProfit: tp ? parseFloat(tp) : undefined,
        }),
      });
      const data = await res.json();
      console.log('[QuickTrade] Sell order:', data);
    } catch (err) {
      console.error('[QuickTrade] Sell failed:', err);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>Ejecutar Orden</span>
          <Badge variant="outline" className="text-xs">Manual</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Symbol Selector */}
        <div className="space-y-1">
          <Label>Símbolo</Label>
          <div className="grid grid-cols-3 gap-1">
            {symbols.map(s => (
              <Button
                key={s.value}
                variant={symbol === s.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSymbol(s.value)}
                className="text-xs"
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Price Display */}
        <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
          <div>
            <p className="text-xs text-muted-foreground">Bid</p>
            <p className="font-mono font-bold text-red-400">{mockBid.toFixed(5)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Spread</p>
            <p className="font-mono">{selected?.spread} pips</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Ask</p>
            <p className="font-mono font-bold text-green-400">{mockAsk.toFixed(5)}</p>
          </div>
        </div>

        {/* Lot Size */}
        <div className="space-y-1">
          <Label>Volumen (Lotes)</Label>
          <div className="grid grid-cols-6 gap-1 mb-1">
            {QUICK_LOTS.map(lot => (
              <Button
                key={lot}
                variant={lotSize === lot.toString() ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLotSize(lot.toString())}
                className="text-xs h-7"
              >
                {lot.toFixed(2)}
              </Button>
            ))}
          </div>
          <Input
            type="number"
            value={lotSize}
            onChange={e => setLotSize(e.target.value)}
            step="0.01"
            min="0.01"
          />
        </div>

        {/* SL / TP */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-red-400">
              <Target className="w-3 h-3" />
              Stop Loss
            </Label>
            <Input
              type="number"
              value={sl}
              onChange={e => setSl(e.target.value)}
              placeholder="Opcional"
              step="0.00001"
            />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-green-400">
              <Target className="w-3 h-3" />
              Take Profit
            </Label>
            <Input
              type="number"
              value={tp}
              onChange={e => setTp(e.target.value)}
              placeholder="Opcional"
              step="0.00001"
            />
          </div>
        </div>

        {/* Buy/Sell Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={handleBuy}
            className="bg-green-600 hover:bg-green-700 text-white h-12"
          >
            <TrendingUp className="w-5 h-5 mr-2" />
            <div className="text-left">
              <div className="text-xs opacity-80">COMPRAR</div>
              <div className="font-bold">{mockAsk.toFixed(5)}</div>
            </div>
          </Button>
          <Button
            onClick={handleSell}
            className="bg-red-600 hover:bg-red-700 text-white h-12"
          >
            <TrendingDown className="w-5 h-5 mr-2" />
            <div className="text-left">
              <div className="text-xs opacity-80">VENDER</div>
              <div className="font-bold">{mockBid.toFixed(5)}</div>
            </div>
          </Button>
        </div>

        {/* Info */}
        <p className="text-xs text-muted-foreground text-center">
          {parseFloat(lotSize).toFixed(2)} lotes = {(parseFloat(lotSize) * 100000).toFixed(0)} unidades
          • Pip value: ${(parseFloat(lotSize) * 10).toFixed(2)}
        </p>
      </CardContent>
    </Card>
  );
}
