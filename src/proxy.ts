// ============================================
// RECO-TRADING - Security Proxy
// ============================================
// Provides comprehensive security for all API routes:
// 1. CSRF protection (Origin header validation)
// 2. Rate limiting on sensitive routes (in-memory)
// 3. API authentication (Bearer token only, NO query params)
// 4. Request body size limits
// 5. Security headers
// 6. IP-based blocking for repeated violations
// ============================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ---- Rate Limiter (in-memory, per IP) ----
const rateLimitMap = new Map<string, { count: number; resetTime: number; violations: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = {
  execute: 10,    // max 10 trade executions per minute
  engine: 20,     // max 20 engine actions per minute
  credentials: 5, // max 5 credential changes per minute
  settings: 10,   // max 10 settings changes per minute
  default: 300,   // max 300 requests per minute for other routes (dashboard polls frequently)
};

// ---- Body Size Limits per route (bytes) ----
const BODY_SIZE_LIMITS: Record<string, number> = {
  execute: 10_240,       // 10KB - trade requests are small
  engine: 2_048,         // 2KB - just { action: "start" }
  credentials: 4_096,    // 4KB - API keys
  settings: 50_000,      // 50KB - batch settings
  profiles: 100_000,     // 100KB - profile with settings
  alerts: 10_000,        // 10KB - alert rules
  default: 100_000,      // 100KB default
};

// ---- Blocked IPs (exceeded violation threshold) ----
const blockedIps = new Map<string, number>(); // IP -> blocked until timestamp
const MAX_VIOLATIONS = 10; // block after 10 violations
const BLOCK_DURATION = 15 * 60_000; // 15 minutes

/** Check if an IP is a local/loopback address (never rate-limit or block these) */
function isLocalIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  // Exact matches
  if (['127.0.0.1', '::1', 'localhost', 'unknown', ''].includes(normalized)) return true;
  // IPv4 loopback range: 127.0.0.0/8
  if (normalized.startsWith('127.') || normalized.startsWith('::ffff:127.')) return true;
  // IPv6 loopback variants
  if (normalized === '::ffff:127.0.0.1' || normalized === '0:0:0:0:0:0:0:1') return true;
  return false;
}

function checkRateLimit(ip: string, route: string): { allowed: boolean; remaining: number } {
  // Never rate-limit or block local IPs
  if (isLocalIp(ip)) {
    return { allowed: true, remaining: 999 };
  }

  // Check if IP is blocked
  const blockedUntil = blockedIps.get(ip);
  if (blockedUntil && Date.now() < blockedUntil) {
    return { allowed: false, remaining: 0 };
  }
  // Clear expired block
  if (blockedUntil && Date.now() >= blockedUntil) {
    blockedIps.delete(ip);
  }

  const key = `${ip}:${route}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW, violations: entry?.violations || 0 });
    return { allowed: true, remaining: RATE_LIMIT_MAX[route as keyof typeof RATE_LIMIT_MAX] || RATE_LIMIT_MAX.default - 1 };
  }

  const max = RATE_LIMIT_MAX[route as keyof typeof RATE_LIMIT_MAX] || RATE_LIMIT_MAX.default;
  if (entry.count >= max) {
    // Track violation
    entry.violations++;
    if (entry.violations >= MAX_VIOLATIONS) {
      blockedIps.set(ip, now + BLOCK_DURATION);
      console.warn(`[SECURITY] IP ${ip} blocked for ${BLOCK_DURATION / 60000} minutes due to ${entry.violations} violations`);
    }
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}

// Cleanup old rate limit and blocked IP entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
  for (const [ip, blockedUntil] of blockedIps.entries()) {
    if (now >= blockedUntil) {
      blockedIps.delete(ip);
    }
  }
}, 5 * 60_000);

// ---- Determine route category ----
function getRouteCategory(pathname: string): string {
  if (pathname.includes('/execute')) return 'execute';
  if (pathname.includes('/engine')) return 'engine';
  if (pathname.includes('/credentials')) return 'credentials';
  if (pathname.includes('/config/settings')) return 'settings';
  return 'default';
}

// ---- Get body size limit for route ----
function getBodySizeLimit(pathname: string): number {
  for (const [route, limit] of Object.entries(BODY_SIZE_LIMITS)) {
    if (pathname.includes(route)) return limit;
  }
  return BODY_SIZE_LIMITS.default;
}

// ---- API Key authentication (Bearer token ONLY) ----
// SECURITY: Removed query parameter auth to prevent:
// - API key leakage in browser history
// - API key leakage in server access logs
// - API key leakage in referrer headers
function validateAuth(request: NextRequest): boolean {
  const apiKey = process.env.APP_API_KEY;
  if (!apiKey) {
    // No API key configured = development mode, allow all
    return true;
  }

  // ONLY accept Bearer token in Authorization header
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const expectedPrefix = `Bearer ${apiKey}`;
  // Timing-safe comparison would be ideal but for middleware this is acceptable
  return authHeader === expectedPrefix;
}

// ---- Validate origin for CSRF protection ----
function isOriginAllowed(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return true; // Allow if headers missing (API clients)

  const allowedPatterns = [
    new RegExp(`^https?://${host.replace(/\./g, '\\.')}$`),
    new RegExp(`^https?://localhost(:\\d+)?$`),
    new RegExp(`^https?://127\\.0\\.0\\.1(:\\d+)?$`),
  ];

  return allowedPatterns.some(pattern => pattern.test(origin));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-API routes and static files
  if (!pathname.startsWith('/api/') || pathname.includes('/_next') || pathname.includes('/static')) {
    return NextResponse.next();
  }

  // Skip read-only GET/HEAD/OPTIONS requests for body checks and CSRF
  const method = request.method;
  const isReadOnly = ['GET', 'HEAD', 'OPTIONS'].includes(method);

  // ---- Block known bad IPs ----
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   request.headers.get('x-real-ip')?.trim() ||
                   'unknown';

  // Never rate-limit or block local IPs (allowlist at top of security check)
  if (isLocalIp(clientIp)) {
    // Still add security headers for local requests
    const response = NextResponse.next();
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    return response;
  }

  const blockedUntil = blockedIps.get(clientIp);
  if (blockedUntil && Date.now() < blockedUntil) {
    return NextResponse.json(
      { error: 'Access denied. Too many violations.' },
      { status: 403 }
    );
  }

  // ---- CSRF Protection (for non-read-only requests) ----
  if (!isReadOnly) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    if (origin && host && !isOriginAllowed(origin, host)) {
      console.warn(`[SECURITY] CSRF blocked: origin=${origin}, host=${host}, ip=${clientIp}`);
      return NextResponse.json(
        { error: 'Forbidden: Invalid origin' },
        { status: 403 }
      );
    }

    // Validate Content-Type for JSON endpoints
    // Note: DELETE requests are not included here — they don't require a JSON body
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const contentType = request.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return NextResponse.json(
          { error: 'Content-Type must be application/json' },
          { status: 415 }
        );
      }
    }

    // ---- Body Size Check ----
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      const limit = getBodySizeLimit(pathname);
      if (size > limit) {
        return NextResponse.json(
          { error: `Request body too large. Maximum: ${Math.round(limit / 1024)}KB` },
          { status: 413 }
        );
      }
    }
  }

  // ---- Rate Limiting ----
  const category = getRouteCategory(pathname);
  const rateCheck = checkRateLimit(clientIp, category);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // ---- Authentication for sensitive mutating endpoints ----
  const sensitiveRoutes = ['/execute', '/credentials', '/config/mode', '/config/settings', '/stop-trade', '/stop-loss'];
  const isSensitive = sensitiveRoutes.some(r => pathname.includes(r)) && !isReadOnly;

  if (isSensitive && !validateAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized. Invalid or missing API key.' },
      { status: 401 }
    );
  }

  // ---- Add security headers to all API responses ----
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-RateLimit-Remaining', String(rateCheck.remaining));
  // Cache-Control: no-store for API responses (prevent caching of sensitive data)
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
