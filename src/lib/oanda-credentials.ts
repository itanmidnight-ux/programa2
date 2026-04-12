// Backward-compatible OANDA credential wrapper.
// New source of truth is broker-credentials.ts

import {
  getBrokerCredentials,
  setBrokerCredentials,
  saveBrokerCredentials,
  loadBrokerCredentials,
  validateBrokerCredentials,
  getBrokerCredentialStatus,
} from '@/lib/broker-credentials';

export function getOandaCredentials(): { accountId: string; apiToken: string; isDemo: boolean } {
  const c = getBrokerCredentials('oanda');
  return { accountId: c.accountId, apiToken: c.apiToken, isDemo: c.isDemo };
}

export function hasOandaCredentials(): boolean {
  const c = getBrokerCredentials('oanda');
  return !!(c.accountId && c.apiToken);
}

export function setOandaCredentials(accountId: string, apiToken: string, isDemo: boolean): void {
  setBrokerCredentials('oanda', accountId, apiToken, isDemo);
}

export async function saveOandaCredentials(): Promise<{ success: boolean; message: string }> {
  return saveBrokerCredentials('oanda');
}

export async function loadOandaCredentials(): Promise<boolean> {
  return loadBrokerCredentials('oanda');
}

export async function validateOandaCredentials(
  accountId?: string,
  apiToken?: string,
  isDemo?: boolean
): Promise<{ valid: boolean; message: string; balance?: number }> {
  return validateBrokerCredentials('oanda', {
    accountId,
    apiToken,
    isDemo,
  });
}

export function getOandaCredentialStatus(): {
  configured: boolean;
  accountIdPrefix: string | null;
  isDemo: boolean;
} {
  const s = getBrokerCredentialStatus('oanda');
  return {
    configured: s.configured,
    accountIdPrefix: s.accountIdPrefix,
    isDemo: s.isDemo,
  };
}
