import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { automation } from '@/lib/automation';
import { getActiveBroker, getBrokerCredentials, loadBrokerCredentials } from '@/lib/broker-credentials';
import type { BrokerProvider } from '@/lib/broker-provider';
import {
  closePosition as brokerClosePosition,
  getTickerPrice,
  isBrokerConnected,
  placeMarketOrder,
} from '@/lib/broker-manager';

interface ExecuteRequest {
  action: 'buy' | 'sell' | 'close' | 'close_all';
  pair?: string;
  quantity?: number;
  price?: number;
  confidence?: number;
  confirmLive?: boolean;
}

const MAX_QUANTITY = parseFloat(process.env.MAX_QUANTITY || '100');
const MIN_QUANTITY = 0.0001;

function sanitizePair(pair: string): string {
  return pair.replace(/[^A-Za-z0-9/_-]/g, '').replace('/', '_').toUpperCase().slice(0, 20);
}

async function isWeltradeBridgeHealthy(): Promise<boolean> {
  const baseUrl = process.env.WELTRADE_MT5_BRIDGE_URL || 'http://127.0.0.1:5001';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const body: ExecuteRequest = await request.json();
    const { action, pair: inputPair, quantity: inputQty, price: inputPrice, confidence: inputConfidence, confirmLive } = body;

    if (!action || !['buy', 'sell', 'close', 'close_all'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use: buy, sell, close, or close_all' },
        { status: 400 }
      );
    }

    const activeBroker: BrokerProvider = await getActiveBroker().catch(() => 'oanda' as BrokerProvider);
    await loadBrokerCredentials(activeBroker).catch(() => false);
    const creds = getBrokerCredentials(activeBroker);
    const pair = sanitizePair(inputPair || process.env.TRADING_SYMBOL || 'XAU_USD');
    const connected = isBrokerConnected();

    if ((action === 'buy' || action === 'sell') && activeBroker === 'weltrade_mt5' && connected) {
      const bridgeHealthy = await isWeltradeBridgeHealthy();
      if (!bridgeHealthy) {
        return NextResponse.json(
          { success: false, error: 'Weltrade MT5 bridge is offline. Start bridge service and retry.' },
          { status: 503 }
        );
      }
    }

    if ((action === 'buy' || action === 'sell') && creds && !creds.isDemo && confirmLive !== true) {
      return NextResponse.json(
        { success: false, error: 'Live trading confirmation required. Send confirmLive=true to execute.' },
        { status: 400 }
      );
    }

    if (action === 'close_all') {
      const openPositions = await db.position.findMany({ include: { trade: true } });
      if (openPositions.length === 0) {
        return NextResponse.json({ success: false, error: 'No open positions to close' }, { status: 404 });
      }

      let closedCount = 0;
      let totalPnl = 0;
      const brokerErrors: string[] = [];

      for (const pos of openPositions) {
        const marketPrice = inputPrice || await getTickerPrice(pos.pair).catch(() => pos.currentPrice);
        const isLong = pos.side === 'LONG';
        const pnl = isLong
          ? (marketPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - marketPrice) * pos.quantity;
        const pnlPct = pos.entryPrice > 0
          ? ((isLong ? marketPrice - pos.entryPrice : pos.entryPrice - marketPrice) / pos.entryPrice) * 100
          : 0;

        if (connected) {
          const brokerClose = await brokerClosePosition(pos.pair, pos.quantity).catch((err) => ({
            success: false,
            error: err instanceof Error ? err.message : 'close failed',
          }));
          if (!brokerClose?.success) {
            brokerErrors.push(`${pos.pair}: ${brokerClose?.error || 'close failed'}`);
          }
        }

        await db.trade.update({
          where: { id: pos.tradeId },
          data: {
            exitPrice: marketPrice,
            pnl: +pnl.toFixed(2),
            pnlPercent: +pnlPct.toFixed(2),
            status: 'CLOSED',
            exitReason: pnl >= 0 ? 'MANUAL' : 'STOP_LOSS',
            closedAt: new Date(),
          },
        });
        await db.position.delete({ where: { id: pos.id } });

        closedCount += 1;
        totalPnl += pnl;
      }

      await db.systemLog.create({
        data: {
          level: brokerErrors.length > 0 ? 'WARNING' : 'INFO',
          source: 'execute',
          message: `Closed all positions (${closedCount}). Total PnL ${totalPnl.toFixed(2)}${brokerErrors.length > 0 ? ` | Broker warnings: ${brokerErrors.join(' | ')}` : ''}`,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Closed ${closedCount} positions`,
        closedCount,
        totalPnl: +totalPnl.toFixed(2),
        brokerWarnings: brokerErrors,
        api_latency_ms: Date.now() - startTime,
      });
    }

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
