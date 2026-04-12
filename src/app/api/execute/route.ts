import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { automation } from '@/lib/automation';
import {
  closePosition as brokerClosePosition,
  getTickerPrice,
  isBrokerConnected,
  placeMarketOrder,
} from '@/lib/broker-manager';

interface ExecuteRequest {
  action: 'buy' | 'sell' | 'close';
  pair?: string;
  quantity?: number;
  price?: number;
  confidence?: number;
}

const MAX_QUANTITY = parseFloat(process.env.MAX_QUANTITY || '100');
const MIN_QUANTITY = 0.0001;

function sanitizePair(pair: string): string {
  return pair.replace(/[^A-Za-z0-9/_-]/g, '').replace('/', '_').toUpperCase().slice(0, 20);
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const body: ExecuteRequest = await request.json();
    const { action, pair: inputPair, quantity: inputQty, price: inputPrice, confidence: inputConfidence } = body;

    if (!action || !['buy', 'sell', 'close'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use: buy, sell, or close' },
        { status: 400 }
      );
    }

    const pair = sanitizePair(inputPair || process.env.TRADING_SYMBOL || 'XAU_USD');
    const connected = isBrokerConnected();

    if (action === 'close') {
      const openPosition = await db.position.findFirst({ where: { pair }, include: { trade: true } });
      if (!openPosition) {
        return NextResponse.json({ success: false, error: `No open position for ${pair}` }, { status: 404 });
      }

      const marketPrice = inputPrice || await getTickerPrice(pair).catch(() => openPosition.currentPrice);
      const isLong = openPosition.side === 'LONG';
      const pnl = isLong
        ? (marketPrice - openPosition.entryPrice) * openPosition.quantity
        : (openPosition.entryPrice - marketPrice) * openPosition.quantity;
      const pnlPct = openPosition.entryPrice > 0
        ? ((isLong ? marketPrice - openPosition.entryPrice : openPosition.entryPrice - marketPrice) / openPosition.entryPrice) * 100
        : 0;

      // Best effort broker-side close
      if (connected) {
        await brokerClosePosition(pair, openPosition.quantity).catch(() => null);
      }

      await db.trade.update({
        where: { id: openPosition.tradeId },
        data: {
          exitPrice: marketPrice,
          pnl: +pnl.toFixed(2),
          pnlPercent: +pnlPct.toFixed(2),
          status: 'CLOSED',
          exitReason: pnl >= 0 ? 'MANUAL' : 'STOP_LOSS',
          closedAt: new Date(),
        },
      });
      await db.position.delete({ where: { id: openPosition.id } });
      await db.systemLog.create({
        data: {
          level: 'INFO',
          source: 'execute',
          message: `Closed ${openPosition.side} ${pair} @ ${marketPrice.toFixed(2)} PnL ${pnl.toFixed(2)}`,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Position closed (${pair})`,
        pnl: +pnl.toFixed(2),
        pnl_pct: +pnlPct.toFixed(2),
        brokerExecuted: connected,
        api_latency_ms: Date.now() - startTime,
      });
    }

    if (inputQty !== undefined && (typeof inputQty !== 'number' || inputQty <= 0 || inputQty > MAX_QUANTITY)) {
      return NextResponse.json(
        { success: false, error: `Quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}` },
        { status: 400 }
      );
    }
    if (inputConfidence !== undefined && (typeof inputConfidence !== 'number' || inputConfidence < 0 || inputConfidence > 1)) {
      return NextResponse.json({ success: false, error: 'confidence must be between 0 and 1' }, { status: 400 });
    }

    const existing = await db.position.count({ where: { pair } });
    if (existing > 0) {
      return NextResponse.json({ success: false, error: `Position already open for ${pair}` }, { status: 409 });
    }

    const currentPrice = inputPrice || await getTickerPrice(pair);
    if (!currentPrice || currentPrice <= 0) {
      return NextResponse.json({ success: false, error: 'Cannot fetch valid market price' }, { status: 503 });
    }

    let quantity = inputQty || 0;
    if (!quantity) {
      const riskAmount = parseFloat(process.env.INITIAL_CAPITAL || '1000') * 0.01;
      const slDistance = currentPrice * 0.015;
      quantity = riskAmount / slDistance;
    }
    quantity = Math.max(MIN_QUANTITY, Math.min(quantity, MAX_QUANTITY));
    const side = action === 'buy' ? 'LONG' : 'SHORT';

    const slPercent = 1.5;
    const tpPercent = 2.5;
    const stopLoss = side === 'LONG'
      ? +(currentPrice * (1 - slPercent / 100)).toFixed(2)
      : +(currentPrice * (1 + slPercent / 100)).toFixed(2);
    const takeProfit = side === 'LONG'
      ? +(currentPrice * (1 + tpPercent / 100)).toFixed(2)
      : +(currentPrice * (1 - tpPercent / 100)).toFixed(2);

    let externalId: string | undefined = undefined;
    let brokerError: string | undefined = undefined;
    if (connected) {
      const orderSide = side === 'LONG' ? 'BUY' : 'SELL';
      const brokerResult = await placeMarketOrder(pair, orderSide, quantity);
      if (!brokerResult.success) {
        brokerError = brokerResult.error || 'Broker rejected order';
      } else {
        externalId = brokerResult.orderId;
      }
    }

    if (connected && brokerError) {
      return NextResponse.json({ success: false, error: brokerError }, { status: 502 });
    }

    const tradeRecord = await db.trade.create({
      data: {
        externalId,
        pair,
        side,
        entryPrice: currentPrice,
        quantity,
        confidence: inputConfidence || 0.7,
        stopLoss,
        takeProfit,
        signal: action === 'buy' ? 'BUY' : 'SELL',
        status: 'OPEN',
        strategy: 'manual',
      },
    });

    await db.position.create({
      data: {
        tradeId: tradeRecord.id,
        pair,
        side,
        entryPrice: currentPrice,
        currentPrice,
        quantity,
        unrealizedPnl: 0,
        stopLoss,
        takeProfit,
      },
    });

    await db.systemLog.create({
      data: {
        level: 'INFO',
        source: 'execute',
        message: `Opened ${side} ${pair} qty=${quantity.toFixed(4)} @ ${currentPrice.toFixed(2)}${connected ? '' : ' (paper)'}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Opened ${side} position on ${pair}`,
      trade: {
        id: tradeRecord.id,
        pair,
        side,
        entry: tradeRecord.entryPrice,
        size: tradeRecord.quantity,
        sl: stopLoss,
        tp: takeProfit,
      },
      simulated: !connected,
      api_latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('[EXECUTE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Execution failed' },
      { status: 500 }
    );
  }
}
