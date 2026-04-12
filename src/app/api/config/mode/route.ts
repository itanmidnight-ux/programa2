// ============================================
// /api/config/mode - Switch OANDA account mode
// ============================================

import { NextResponse } from "next/server";
import {
  getOandaCredentials,
  setOandaCredentials,
  saveOandaCredentials,
  validateOandaCredentials,
  hasOandaCredentials,
} from "@/lib/oanda-credentials";
import { setSetting } from "@/lib/settings-manager";

export async function GET() {
  try {
    const creds = getOandaCredentials();
    const isDemo = creds.isDemo;

    return NextResponse.json({
      mode: isDemo ? "demo" : "live",
      demo: isDemo,
      baseUrl: isDemo ? "https://api-fxpractice.oanda.com" : "https://api-fxtrade.oanda.com",
      message: isDemo
        ? "Running on OANDA Demo"
        : "Running on OANDA Live (REAL MONEY)",
      credentialsStatus: {
        configured: hasOandaCredentials(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const demo = typeof body.demo === "boolean" ? body.demo : body.testnet;

    if (typeof demo !== "boolean") {
      return NextResponse.json(
        { error: "demo boolean field is required" },
        { status: 400 }
      );
    }

    const creds = getOandaCredentials();
    if (!creds.accountId || !creds.apiToken) {
      return NextResponse.json(
        { success: false, error: "No OANDA credentials configured", requiresCredentials: true },
        { status: 400 }
      );
    }

    const validation = await validateOandaCredentials(creds.accountId, creds.apiToken, demo);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: `Credential validation failed: ${validation.message}` },
        { status: 400 }
      );
    }

    setOandaCredentials(creds.accountId, creds.apiToken, demo);
    await saveOandaCredentials();
    await setSetting("oanda_is_demo", demo ? "true" : "false", "api");

    return NextResponse.json({
      success: true,
      mode: demo ? "demo" : "live",
      message: demo
        ? "Switched to OANDA Demo account"
        : "Switched to OANDA Live account - REAL MONEY",
      balance: validation.balance ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
