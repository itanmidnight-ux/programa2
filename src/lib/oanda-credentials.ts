// ============================================
// RECO-TRADING - OANDA Credential Manager
// ============================================
// Manages OANDA account credentials (Account ID + API Token)
// Uses the same AES-256-GCM encryption as the previous
// Binance credential system for consistency.
// ============================================

import { encryptCredential, decryptCredential } from './security';
import { getSetting, setSetting } from './settings-manager';
import { getOandaBroker } from './oanda-adapter';

// AppSetting keys
const OANDA_ACCOUNT_ID_KEY = 'oanda_account_id';
const OANDA_API_TOKEN_KEY = 'oanda_api_token';
const OANDA_IS_DEMO_KEY = 'oanda_is_demo';

// ============================================
// Credential State (in-memory)
// ============================================

interface OandaCredentials {
  accountId: string;
  apiToken: string;
  isDemo: boolean;
}

let _credentials: OandaCredentials = {
  accountId: process.env.OANDA_ACCOUNT_ID || '',
  apiToken: process.env.OANDA_API_TOKEN || '',
  isDemo: process.env.OANDA_IS_DEMO !== 'false',
};

// ============================================
// Public API
// ============================================

/** Get current OANDA credentials */
export function getOandaCredentials(): OandaCredentials {
  return { ..._credentials };
}

/** Check if credentials are configured */
export function hasOandaCredentials(): boolean {
  return !!(_credentials.accountId && _credentials.apiToken);
}

/** Set credentials in memory */
export function setOandaCredentials(accountId: string, apiToken: string, isDemo: boolean): void {
  _credentials = { accountId, apiToken, isDemo };
  console.log(`[OANDA-CRED] Credentials updated. Account: ${accountId.slice(0, 6)}..., Demo: ${isDemo}`);
}

/** Save credentials to database (encrypted) */
export async function saveOandaCredentials(): Promise<{ success: boolean; message: string }> {
  try {
    if (!_credentials.accountId || !_credentials.apiToken) {
      return { success: false, message: 'Account ID and API Token required' };
    }

    const encryptedToken = encryptCredential(_credentials.apiToken);
    const encryptedAccountId = encryptCredential(_credentials.accountId);

    await setSetting(OANDA_ACCOUNT_ID_KEY, encryptedAccountId, 'api');
    await setSetting(OANDA_API_TOKEN_KEY, encryptedToken, 'api');
    await setSetting(OANDA_IS_DEMO_KEY, _credentials.isDemo ? 'true' : 'false', 'api');

    // Also update the broker instance
    const broker = getOandaBroker();
    broker.setCredentials(_credentials.accountId, _credentials.apiToken, _credentials.isDemo);

    return { success: true, message: 'Credentials saved successfully' };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to save credentials',
    };
  }
}

/** Load credentials from database (decrypted) */
export async function loadOandaCredentials(): Promise<boolean> {
  try {
    const encryptedAccountId = await getSetting(OANDA_ACCOUNT_ID_KEY);
    const encryptedToken = await getSetting(OANDA_API_TOKEN_KEY);
    const isDemoStr = await getSetting(OANDA_IS_DEMO_KEY);

    if (encryptedAccountId && encryptedToken) {
      const accountId = decryptCredential(encryptedAccountId);
      const apiToken = decryptCredential(encryptedToken);
      const isDemo = isDemoStr === 'true';

      if (accountId && apiToken) {
        _credentials = { accountId, apiToken, isDemo };

        // Also update the broker instance
        const broker = getOandaBroker();
        broker.setCredentials(accountId, apiToken, isDemo);

        console.log(`[OANDA-CRED] Loaded from DB. Account: ${accountId.slice(0, 6)}..., Demo: ${isDemo}`);
        return true;
      }
    }

    // Fallback to env vars
    if (_credentials.accountId && _credentials.apiToken) {
      const broker = getOandaBroker();
      broker.setCredentials(_credentials.accountId, _credentials.apiToken, _credentials.isDemo);
      console.log('[OANDA-CRED] Using credentials from .env');
      return true;
    }

    console.log('[OANDA-CRED] No credentials found');
    return false;
  } catch (err) {
    console.error('[OANDA-CRED] Failed to load credentials:', err);
    return false;
  }
}

/** Validate credentials by connecting to OANDA */
export async function validateOandaCredentials(
  accountId?: string,
  apiToken?: string,
  isDemo?: boolean
): Promise<{ valid: boolean; message: string; balance?: number }> {
  try {
    const cred = {
      accountId: accountId || _credentials.accountId,
      apiToken: apiToken || _credentials.apiToken,
      isDemo: isDemo !== undefined ? isDemo : _credentials.isDemo,
    };

    if (!cred.accountId || !cred.apiToken) {
      return { valid: false, message: 'Account ID and API Token required' };
    }

    const broker = getOandaBroker();
    broker.setCredentials(cred.accountId, cred.apiToken, cred.isDemo);
    const result = await broker.validateCredentials();

    if (result.valid) {
      // Get balance
      const balance = await broker.getBalance();
      return { valid: true, message: result.message, balance };
    }

    return { valid: false, message: result.message };
  } catch (err) {
    return {
      valid: false,
      message: err instanceof Error ? err.message : 'Validation failed',
    };
  }
}

/** Get credential status (for UI - no secrets exposed) */
export function getOandaCredentialStatus(): {
  configured: boolean;
  accountIdPrefix: string | null;
  isDemo: boolean;
} {
  if (!_credentials.apiToken || !_credentials.accountId) {
    return { configured: false, accountIdPrefix: null, isDemo: _credentials.isDemo };
  }

  return {
    configured: true,
    accountIdPrefix: _credentials.accountId.slice(0, 6),
    isDemo: _credentials.isDemo,
  };
}
