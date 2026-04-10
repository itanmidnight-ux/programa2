# RECO-TRADING - Security Guide

## Overview

This document describes the security measures implemented in the RECO-Trading crypto dashboard and provides guidelines for secure deployment.

## Security Architecture

### 1. API Key Management

**Dual Credential System:**
- The application stores **separate API keys** for testnet and real accounts
- Keys are loaded from `.env` at startup and can be updated via the Settings UI
- Keys are **never exposed** in API responses
- Switching between testnet/real mode uses the correct key set automatically

**Rules:**
- NEVER commit `.env` files to version control
- ALWAYS use different API keys for testnet and real accounts
- NEVER share your API secret
- Restrict API key permissions on Binance (enable only what's needed)

### 2. Authentication

- Set `APP_API_KEY` in `.env` to enable authentication on sensitive endpoints
- Authentication uses **Bearer token only** (no query parameters)
- Protected endpoints: `/api/execute`, `/api/credentials`, `/api/config/mode`, `/api/config/settings`, `/api/stop-trade`, `/api/stop-loss`
- Generate a key: `openssl rand -hex 32`

### 3. Rate Limiting

| Route | Limit | Window |
|-------|-------|--------|
| Trade execution | 10 req | 1 min |
| Engine control | 20 req | 1 min |
| Credential changes | 5 req | 1 min |
| Settings changes | 10 req | 1 min |
| Other API routes | 60 req | 1 min |

- IPs exceeding limits are temporarily blocked (15 min after 10 violations)

### 4. CSRF Protection

- Origin header validation on all non-GET requests
- Content-Type enforcement (application/json required)
- Dynamic origin matching (no hardcoded domains)

### 5. Security Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` (restricts resource loading)
- `Strict-Transport-Security` (enforce HTTPS in production)
- `X-Powered-By: Next.js` header is **removed**

### 6. Input Validation

- All API routes validate input types and ranges
- Trading pairs are sanitized (alphanumeric only)
- Numeric values have min/max bounds
- String lengths are capped
- Intervals are validated against allowed values
- Body size limits per route (prevents large payloads)

### 7. Request Body Size Limits

| Route | Max Size |
|-------|----------|
| Execute | 10 KB |
| Engine | 2 KB |
| Credentials | 4 KB |
| Settings | 50 KB |
| Profiles | 100 KB |
| Alerts | 10 KB |
| Default | 100 KB |

## Deployment Checklist

### Before Going Live

- [ ] Set `APP_API_KEY` to a strong random value
- [ ] Set `DRY_RUN=true` for initial testing
- [ ] Remove or restrict `DASHBOARD_AUTH_ENABLED`
- [ ] Set `BINANCE_TESTNET=true` initially
- [ ] Verify `.env` is in `.gitignore`
- [ ] Test all endpoints with authentication enabled
- [ ] Review audit logs after configuration changes

### Switching to Real Trading

- [ ] Verify testnet mode works correctly
- [ ] Set `DRY_RUN=false`
- [ ] Set `BINANCE_TESTNET=false`
- [ ] Add real API keys with **trading-only** permissions
- [ ] Enable IP restrictions on Binance API keys
- [ ] Start with minimum capital
- [ ] Monitor first 24h closely

### API Key Permissions (Binance)

For the real account, restrict API key permissions to:
- **Enable Reading** ✅
- **Enable Spot & Margin Trading** ✅ (only if trading)
- **Enable Withdrawals** ❌ NEVER enable
- **Enable Internal Transfer** ❌
- **Enable Futures** ❌ (unless using futures)

## Files to Protect

These files are already in `.gitignore` but double-check:
- `.env` - Contains all API keys and secrets
- `*.db` - Contains trade data and positions
- `*.log` - May contain sensitive operation logs
- `data/` - Database directory

## Incident Response

If you suspect a security breach:
1. **Immediately** rotate all API keys on Binance
2. Stop the trading engine: POST `/api/engine` with `{ action: "stop" }`
3. Review `ConfigChange` table for unauthorized changes
4. Review `SystemLog` table for suspicious activity
5. Check rate limit violation logs in console
6. Change `APP_API_KEY` and redeploy
