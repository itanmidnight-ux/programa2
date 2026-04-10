// ============================================
// /api/config/mode - Switch Account Mode
// ============================================
// GET  /api/config/mode  - Get current mode (testnet/real)
// POST /api/config/mode  - Switch between testnet and real
// POST /api/config/mode/credentials - Update credentials
// ============================================

import { NextResponse } from "next/server";
import { 
  isTestnetMode, 
  setAccountMode, 
  reconnectWebSocket, 
  getCredentialsForMode,
  setCredentials,
  validateCredentials,
  hasCredentials 
} from "@/lib/binance";
import { setSetting, getSetting } from "@/lib/settings-manager";

// ---- GET: Return current account mode ----
export async function GET() {
  try {
    const testnet = isTestnetMode();
    const creds = getCredentialsForMode(testnet);
    const otherCreds = getCredentialsForMode(!testnet);
    
    return NextResponse.json({
      mode: testnet ? "testnet" : "real",
      testnet,
      baseUrl: testnet ? "https://testnet.binance.vision" : "https://api.binance.com",
      wsUrl: testnet ? "wss://testnet.binance.vision/ws" : "wss://stream.binance.com:9443/ws",
      message: testnet
        ? "Running on Binance SPOT Testnet (testnet.binance.vision) - Capital ficticio"
        : "Running on Binance Real Account (api.binance.com) - REAL MONEY",
      // Credential status for each mode (don't expose secrets)
      credentialsStatus: {
        testnet: {
          configured: hasCredentials(true),
        },
        real: {
          configured: hasCredentials(false),
        },
      },
      // Credential status per mode (no secrets exposed)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ---- POST: Switch account mode ----
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { testnet } = body;

    if (typeof testnet !== "boolean") {
      return NextResponse.json(
        { error: "testnet boolean field is required" },
        { status: 400 }
      );
    }

    const previousMode = isTestnetMode();

    // If same mode, nothing to do
    if (previousMode === testnet) {
      return NextResponse.json({
        success: true,
        mode: testnet ? "testnet" : "real",
        changed: false,
        message: `Already in ${testnet ? "testnet" : "real"} mode`,
      });
    }

    // Check if credentials are configured for the target mode
    if (!hasCredentials(testnet)) {
      return NextResponse.json({
        success: false,
        mode: previousMode ? "testnet" : "real",
        changed: false,
        error: `No API credentials configured for ${testnet ? "TESTNET" : "REAL"} mode. Please add your ${testnet ? "testnet" : "real"} API keys in Settings first.`,
        requiresCredentials: true,
        targetMode: testnet ? "testnet" : "real",
      });
    }

    // Validate credentials for the target mode before switching
    const creds = getCredentialsForMode(testnet);
    const validation = await validateCredentials(creds.apiKey, creds.apiSecret, testnet);
    
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        mode: previousMode ? "testnet" : "real",
        changed: false,
        error: `Credential validation failed for ${testnet ? "testnet" : "real"} mode: ${validation.error}`,
        validationError: validation.error,
      });
    }

    // Switch the mode globally
    setAccountMode(testnet);

    // PERSIST the mode to database for restart persistence
    await setSetting('account_mode', testnet ? 'testnet' : 'real', 'general');
    console.log(`[MODE] Saved account mode to database: ${testnet ? 'testnet' : 'real'}`);

    // Reconnect WebSocket to the new endpoint
    reconnectWebSocket(testnet);

    // Update the execution engine with new credentials
    try {
      const { automation } = await import("@/lib/automation");
      const engine = automation.getExecutionEngine();
      engine.updateCredentials();
    } catch {
      // Engine may not be initialized, that's ok
    }

    return NextResponse.json({
      success: true,
      mode: testnet ? "testnet" : "real",
      changed: true,
      previousMode: previousMode ? "testnet" : "real",
      message: testnet
        ? "Switched to TESTNET (testnet.binance.vision) - Capital ficticio. Trades use fake money."
        : "Switched to REAL ACCOUNT (api.binance.com) - REAL MONEY. Be careful!",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
