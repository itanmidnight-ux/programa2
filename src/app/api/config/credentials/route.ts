import { NextResponse } from 'next/server';
import {
  getActiveBroker,
  getBrokerCredentials,
  getBrokerCredentialStatus,
  loadBrokerCredentials,
  saveBrokerCredentials,
  setActiveBroker,
  setBrokerCredentials,
  validateBrokerCredentials,
  initializeActiveBroker,
} from '@/lib/broker-credentials';
import { normalizeBrokerProvider } from '@/lib/broker-provider';

function parseBroker(request: Request, bodyBroker?: string): string | null {
  const url = new URL(request.url);
  const brokerQ = url.searchParams.get('broker');
  const raw = bodyBroker || brokerQ;
  if (!raw) return null;
  return normalizeBrokerProvider(raw);
}

export async function GET(request: Request) {
  try {
    const active = await getActiveBroker();
    const broker = normalizeBrokerProvider(parseBroker(request) || active);
    await loadBrokerCredentials(broker);
    const status = getBrokerCredentialStatus(broker);

    return NextResponse.json({
      broker,
      activeBroker: active,
      configured: status.configured,
      accountIdPrefix: status.accountIdPrefix,
      isDemo: status.isDemo,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, configured: false }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const broker = normalizeBrokerProvider(parseBroker(request, body.broker) || await getActiveBroker());
    const { accountId, apiToken, isDemo, extra, makeActive } = body;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { success: false, message: 'accountId and apiToken are required' },
        { status: 400 }
      );
    }

    setBrokerCredentials(broker, String(accountId).trim(), String(apiToken).trim(), isDemo !== false, extra);
    const result = await saveBrokerCredentials(broker);

    if (result.success && makeActive !== false) {
      await setActiveBroker(broker);
      await initializeActiveBroker();
    }

    const status = getBrokerCredentialStatus(broker);
    return NextResponse.json({
      success: result.success,
      message: result.message,
      broker,
      accountIdPrefix: status.accountIdPrefix,
      isDemo: status.isDemo,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const broker = normalizeBrokerProvider(parseBroker(request, body.broker) || await getActiveBroker());
    const current = getBrokerCredentials(broker);

    const accountId = body.accountId || current.accountId;
    const apiToken = body.apiToken || current.apiToken;
    const isDemo = body.isDemo !== undefined ? !!body.isDemo : current.isDemo;
    const extra = { ...(current.extra || {}), ...(body.extra || {}) };

    const validation = await validateBrokerCredentials(broker, { accountId, apiToken, isDemo, extra });

    if (validation.valid && body.accountId && body.apiToken) {
      setBrokerCredentials(broker, accountId, apiToken, isDemo, extra);
      await saveBrokerCredentials(broker);
      if (body.makeActive !== false) {
        await setActiveBroker(broker);
        await initializeActiveBroker();
      }
    }

    return NextResponse.json({
      success: validation.valid,
      message: validation.message,
      balance: validation.balance,
      broker,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
