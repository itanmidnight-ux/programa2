import { NextResponse } from 'next/server';
import { getActiveSymbol, getSupportedSymbols } from '@/lib/broker-manager';
import { automation } from '@/lib/automation';

export async function GET() {
  try {
    const symbols = await getSupportedSymbols();
    const active = getActiveSymbol();
    return NextResponse.json({
      pairs: symbols,
      activePair: active,
      defaultPairs: symbols,
      popularPairs: symbols.slice(0, 8),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, pairs: ['XAU_USD'], activePair: 'XAU_USD' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, symbol } = body;
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    }
    const clean = String(symbol).replace('/', '_').toUpperCase();

    if (action === 'setActive') {
      await automation.getExecutionEngine().setPair(clean);
      return NextResponse.json({
        success: true,
        message: `Active pair set to ${clean}`,
        activePair: clean,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action. Use: setActive' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
