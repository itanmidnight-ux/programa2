// ============================================
// SECURITY LAYER - Safe Logger & Utilities
// ============================================

import crypto from "crypto";

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
type LogLevel = typeof LOG_LEVELS[number];

const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL || 'INFO') as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(CURRENT_LOG_LEVEL);
}

const SENSITIVE_PATTERNS = [
  /api[_-]?key/gi,
  /api[_-]?secret/gi,
  /secret/gi,
  /password/gi,
  /token/gi,
  /authorization/gi,
  /bearer/gi,
  /signature/gi,
];

function sanitizeForLog(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    let sanitized = data;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForLog(item));
  }
  
  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const isSensitive = SENSITIVE_PATTERNS.some(p => p.test(key));
      sanitized[key] = isSensitive ? '[REDACTED]' : sanitizeForLog(value);
    }
    return sanitized;
  }
  
  return data;
}

export function createLogger(context: string) {
  return {
    debug(message: string, data?: unknown) {
      if (!shouldLog('DEBUG')) return;
      const sanitized = data ? sanitizeForLog(data) : undefined;
      console.log(`[DEBUG] [${context}] ${message}`, sanitized || '');
    },
    info(message: string, data?: unknown) {
      if (!shouldLog('INFO')) return;
      const sanitized = data ? sanitizeForLog(data) : undefined;
      console.log(`[INFO] [${context}] ${message}`, sanitized || '');
    },
    warn(message: string, data?: unknown) {
      if (!shouldLog('WARN')) return;
      const sanitized = data ? sanitizeForLog(data) : undefined;
      console.log(`[WARN] [${context}] ${message}`, sanitized || '');
    },
    error(message: string, error?: unknown) {
      if (!shouldLog('ERROR')) return;
      const sanitized = error ? sanitizeForLog(error) : undefined;
      console.log(`[ERROR] [${context}] ${message}`, sanitized || '');
    },
  };
}

export const logger = {
  auth: createLogger('AUTH'),
  api: createLogger('API'),
  exec: createLogger('EXEC'),
  trade: createLogger('TRADE'),
  risk: createLogger('RISK'),
  system: createLogger('SYSTEM'),
};

// ============================================
// SECURE CREDENTIAL STORAGE
// ============================================
// SECURE CREDENTIAL STORAGE (AES-256-GCM)
// ============================================

// Generate a stable encryption key from machine-specific data
// Priority: 1. Env var MASTER_ENCRYPTION_KEY, 2. Derived stable key
function getEncryptionKey(): Buffer {
  // Option 1: Use environment variable if set (RECOMMENDED for production)
  const envKey = process.env.MASTER_ENCRYPTION_KEY;
  if (envKey && envKey.length >= 16) {
    // Use first 32 chars of env key, derive with salt for extra security
    return crypto.scryptSync(envKey.slice(0, 32), 'reco-credential-v1', 32);
  }
  
  // Option 2: Generate stable key based on file path (works across restarts)
  // Use the database file path as a seed - it's always the same
  const dbPath = process.env.DATABASE_URL || '/home/kali/Downloads/real/data/reco_trading.db';
  return crypto.scryptSync(dbPath, 'reco-credential-key-v1', 32);
}

const IV_LENGTH = 16;

export function encryptCredential(plainText: string): string {
  if (!plainText) return '';
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

export function decryptCredential(encryptedText: string): string {
  if (!encryptedText) return '';
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // Not encrypted format, return as-is (backwards compatibility)
      return encryptedText;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[Security] Decryption failed, returning empty:', error);
    return '';
  }
}

// Aliases for backward compatibility
const encrypt = encryptCredential;
const decrypt = decryptCredential;

// ============================================
// TIMING-SAFE COMPARISON
// ============================================

export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  if (bufA.length !== bufB.length) {
    bufA.fill(0);
    bufB.fill(0);
    crypto.randomFillSync(bufA);
    crypto.randomFillSync(bufB);
    return false;
  }
  
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return a === b;
  }
}

// ============================================
// INPUT VALIDATION (Simple Schema)
// ============================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function validateString(value: unknown, field: string, minLen = 1, maxLen = 1000): ValidationResult<string> {
  if (typeof value !== 'string') {
    return { success: false, error: `${field} must be a string` };
  }
  if (value.length < minLen || value.length > maxLen) {
    return { success: false, error: `${field} length must be ${minLen}-${maxLen}` };
  }
  return { success: true, data: value };
}

export function validateNumber(value: unknown, field: string, min?: number, max?: number): ValidationResult<number> {
  if (typeof value !== 'number' || isNaN(value)) {
    return { success: false, error: `${field} must be a valid number` };
  }
  if (min !== undefined && value < min) {
    return { success: false, error: `${field} must be >= ${min}` };
  }
  if (max !== undefined && value > max) {
    return { success: false, error: `${field} must be <= ${max}` };
  }
  return { success: true, data: value };
}

export function validateBoolean(value: unknown, field: string): ValidationResult<boolean> {
  if (typeof value !== 'boolean') {
    return { success: false, error: `${field} must be a boolean` };
  }
  return { success: true, data: value };
}

// ============================================
// RATE LIMITING
// ============================================

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  blockedUntil: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_CONFIG = {
  maxAttempts: 5,
  windowMs: 60000,
  blockDurationMs: 300000,
};

export function checkRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  if (!entry) {
    rateLimitStore.set(identifier, { attempts: 1, firstAttempt: now, blockedUntil: 0 });
    return { allowed: true };
  }
  
  if (entry.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  
  if (now - entry.firstAttempt > RATE_LIMIT_CONFIG.windowMs) {
    rateLimitStore.set(identifier, { attempts: 1, firstAttempt: now, blockedUntil: 0 });
    return { allowed: true };
  }
  
  if (entry.attempts >= RATE_LIMIT_CONFIG.maxAttempts) {
    entry.blockedUntil = now + RATE_LIMIT_CONFIG.blockDurationMs;
    rateLimitStore.set(identifier, entry);
    logger.auth.warn('Rate limit exceeded', { identifier });
    return { allowed: false, retryAfter: Math.ceil(RATE_LIMIT_CONFIG.blockDurationMs / 1000) };
  }
  
  entry.attempts++;
  rateLimitStore.set(identifier, entry);
  return { allowed: true };
}

export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

// ============================================
// CIRCUIT BREAKER
// ============================================

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold = 5,
    private resetTimeoutMs = 30000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        logger.system.warn('Circuit breaker: HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
        logger.system.info('Circuit breaker: CLOSED');
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
        logger.system.error('Circuit breaker: OPEN', { failures: this.failures });
      }
      
      throw error;
    }
  }
  
  getState(): string {
    return this.state;
  }
  
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
  }
}

export const BrokerCircuitBreaker = new CircuitBreaker(5, 60000);

// ============================================
// SECURE STATE MANAGEMENT
// ============================================

interface SecureState {
  credentials: { apiKey: string; apiSecret: string } | null;
  serverTimeOffset: number;
  serverTimeOffsetExpiry: number;
}

class SecureStateManager {
  private state: SecureState = {
    credentials: null,
    serverTimeOffset: 0,
    serverTimeOffsetExpiry: 0,
  };
  
  private encryptionEnabled = false;
  
  enableEncryption(encryptionKey?: string): void {
    if (encryptionKey) {
      this.encryptionEnabled = true;
    }
  }
  
  setCredentials(apiKey: string, apiSecret: string): void {
    if (this.encryptionEnabled) {
      this.state.credentials = {
        apiKey: encrypt(apiKey),
        apiSecret: encrypt(apiSecret),
      };
    } else {
      this.state.credentials = { apiKey, apiSecret };
    }
    logger.auth.info('Credentials stored securely');
  }
  
  getCredentials(): { apiKey: string; apiSecret: string } | null {
    if (!this.state.credentials) return null;
    
    if (this.encryptionEnabled) {
      return {
        apiKey: decrypt(this.state.credentials.apiKey),
        apiSecret: decrypt(this.state.credentials.apiSecret),
      };
    }
    
    return this.state.credentials;
  }
  
  clearCredentials(): void {
    this.state.credentials = null;
    logger.auth.info('Credentials cleared');
  }
  
  setServerTimeOffset(offset: number, expiry: number): void {
    this.state.serverTimeOffset = offset;
    this.state.serverTimeOffsetExpiry = expiry;
  }
  
  getServerTimeOffset(): { offset: number; valid: boolean } {
    const now = Date.now();
    return {
      offset: this.state.serverTimeOffset,
      valid: this.state.serverTimeOffsetExpiry > now,
    };
  }
}

export const secureState = new SecureStateManager();

// ============================================
// RETRY WITH EXPONENTIAL BACKOFF
// ============================================

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (onRetry && attempt < cfg.maxRetries) {
        onRetry(attempt, lastError);
      }
      
      if (attempt < cfg.maxRetries) {
        const delay = Math.min(
          cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
          cfg.maxDelayMs
        );
        logger.api.warn(`Retry attempt ${attempt}/${cfg.maxRetries} after ${delay}ms`, { error: lastError.message });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// ============================================
// SAFE ASYNC HANDLING
// ============================================

export function safeAsync<T>(
  promise: Promise<T>,
  onError?: (error: Error) => void
): Promise<{ success: boolean; data?: T; error?: string }> {
  return promise
    .then(data => ({ success: true, data }))
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      logger.system.error('Async operation failed', { error: message });
      if (onError) onError(error instanceof Error ? error : new Error(message));
      return { success: false, error: message };
    });
}

export function createSafeInterval(
  callback: () => void,
  intervalMs: number,
  onError?: (error: Error) => void
): { start: () => void; stop: () => void } {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  
  const wrappedCallback = () => {
    try {
      callback();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.system.error('Interval callback failed', { error: message });
      if (onError) onError(error instanceof Error ? error : new Error(message));
    }
  };
  
  return {
    start: () => {
      if (!intervalId) {
        intervalId = setInterval(wrappedCallback, intervalMs);
      }
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
