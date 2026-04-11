// ============================================
// RECO-TRADING - OANDA Credentials API
// ============================================
// GET  /api/config/credentials  - Get credential status
// PUT  /api/config/credentials  - Save credentials
// POST /api/config/credentials  - Validate credentials
// ============================================

import { NextResponse } from "next/server";
import {
  getOandaCredentials,
  hasOandaCredentials,
  setOandaCredentials,
  saveOandaCredentials,
  loadOandaCredentials,
  validateOandaCredentials,
  getOandaCredentialStatus,
} from "@/lib/oanda-credentials";

// ============================================
// GET - Return credential status (NO secrets)
// ============================================

export async function GET() {
  try {
    // Try to load from DB first
    await loadOandaCredentials();

    const status = getOandaCredentialStatus();

    return NextResponse.json({
      broker: "OANDA",
      configured: status.configured,
      accountIdPrefix: status.accountIdPrefix,
      isDemo: status.isDemo,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, configured: false },
      { status: 500 }
    );
  }
}

// ============================================
// PUT - Save credentials
// ============================================

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { accountId, apiToken, isDemo } = body;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { success: false, message: "Account ID and API Token are required" },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const trimmedAccountId = accountId.trim();
    const trimmedApiToken = apiToken.trim();
    const demoMode = isDemo !== false; // Default to demo

    // Store in memory
    setOandaCredentials(trimmedAccountId, trimmedApiToken, demoMode);

    // Encrypt and save to DB
    const result = await saveOandaCredentials();

    return NextResponse.json({
      success: result.success,
      message: result.message,
      broker: "OANDA",
      accountIdPrefix: trimmedAccountId.slice(0, 6),
      isDemo: demoMode,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// ============================================
// POST - Validate credentials
// ============================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accountId, apiToken, isDemo } = body;

    // Use provided credentials or fall back to stored ones
    const currentCreds = getOandaCredentials();
    const testAccountId = accountId || currentCreds.accountId;
    const testApiToken = apiToken || currentCreds.apiToken;
    const testIsDemo = isDemo !== undefined ? isDemo : currentCreds.isDemo;

    const result = await validateOandaCredentials(
      testAccountId,
      testApiToken,
      testIsDemo
    );

    // If valid and new credentials were provided, save them
    if (result.valid && accountId && apiToken) {
      setOandaCredentials(testAccountId, testApiToken, testIsDemo);
      await saveOandaCredentials();
    }

    return NextResponse.json({
      success: result.valid,
      message: result.message,
      balance: result.balance,
      broker: "OANDA",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
