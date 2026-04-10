// ============================================
// /api/config/credentials - Manage Dual API Keys
// ============================================
// GET  /api/config/credentials  - Get credential status (NO secrets exposed)
// PUT  /api/config/credentials  - Update credentials for a mode
// POST /api/config/credentials/validate - Validate credentials for a mode
// ============================================

import { NextResponse } from "next/server";
import { 
  getCredentialsForMode, 
  setCredentials, 
  validateCredentials, 
  hasCredentials,
  isTestnetMode 
} from "@/lib/binance";
import { setSetting, getSetting } from "@/lib/settings-manager";
import { encryptCredential, decryptCredential } from "@/lib/security";

// ---- GET: Return credential status (without exposing secrets) ----
export async function GET() {
  try {
    const testnetCreds = getCredentialsForMode(true);
    const realCreds = getCredentialsForMode(false);
    const currentTestnet = isTestnetMode();

    return NextResponse.json({
      currentMode: currentTestnet ? "testnet" : "real",
      testnet: {
        configured: hasCredentials(true),
      },
      real: {
        configured: hasCredentials(false),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ---- PUT: Update credentials for a specific mode ----
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { mode, apiKey, apiSecret } = body;

    if (!["testnet", "real"].includes(mode)) {
      return NextResponse.json(
        { error: "mode must be 'testnet' or 'real'" },
        { status: 400 }
      );
    }

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { error: "apiKey is required" },
        { status: 400 }
      );
    }

    if (!apiSecret || typeof apiSecret !== "string") {
      return NextResponse.json(
        { error: "apiSecret is required" },
        { status: 400 }
      );
    }

    const isTestnet = mode === "testnet";
    const trimmedKey = apiKey.trim();
    const trimmedSecret = apiSecret.trim();
    
    // Set the credentials in memory
    setCredentials(isTestnet, trimmedKey, trimmedSecret);

    // ENCRYPT and save to database for persistence across restarts
    const keyName = isTestnet ? 'testnet_api_key' : 'real_api_key';
    const secretName = isTestnet ? 'testnet_api_secret' : 'real_api_secret';
    
    const encryptedKey = encryptCredential(trimmedKey);
    const encryptedSecret = encryptCredential(trimmedSecret);
    
    await setSetting(keyName, encryptedKey, 'api');
    await setSetting(secretName, encryptedSecret, 'api');
    
    console.log(`[CREDENTIALS] Saved ENCRYPTED ${mode} API keys to database`);

    return NextResponse.json({
      success: true,
      mode,
      message: `API credentials updated for ${mode} mode`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ---- POST: Validate credentials for a specific mode ----
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode, apiKey, apiSecret } = body;

    if (!["testnet", "real"].includes(mode)) {
      return NextResponse.json(
        { error: "mode must be 'testnet' or 'real'" },
        { status: 400 }
      );
    }

    const isTestnet = mode === "testnet";
    
    // Use provided credentials or fall back to stored ones
    const key = apiKey || getCredentialsForMode(isTestnet).apiKey;
    const secret = apiSecret || getCredentialsForMode(isTestnet).apiSecret;

    if (!key || !secret) {
      return NextResponse.json({
        valid: false,
        error: `No credentials available for ${mode} mode. Please enter your API key and secret.`,
      });
    }

    const result = await validateCredentials(key, secret, isTestnet);

    // If valid and new credentials were provided, encrypt and save them
    if (result.valid && apiKey && apiSecret) {
      setCredentials(isTestnet, apiKey.trim(), apiSecret.trim());
      
      // Also encrypt and save to database
      const keyName = isTestnet ? 'testnet_api_key' : 'real_api_key';
      const secretName = isTestnet ? 'testnet_api_secret' : 'real_api_secret';
      await setSetting(keyName, encryptCredential(apiKey.trim()), 'api');
      await setSetting(secretName, encryptCredential(apiSecret.trim()), 'api');
      
      console.log(`[CREDENTIALS] Validated and saved ENCRYPTED ${mode} credentials`);
    }

    return NextResponse.json({
      ...result,
      mode,
      message: result.valid 
        ? `Credentials valid for ${mode} mode` 
        : `Invalid credentials for ${mode}: ${result.error}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
