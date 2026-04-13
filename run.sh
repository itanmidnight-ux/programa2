#!/usr/bin/env bash
set -euo pipefail

# RECO-TRADING runtime launcher
# Goal: one-command run after install.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[run]${NC} $*"; }
ok() { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err() { echo -e "${RED}[error]${NC} $*"; }

mkdir -p "$ROOT_DIR/logs" "$ROOT_DIR/data"
export DATABASE_URL="file:$ROOT_DIR/data/reco_trading.db"
export NODE_ENV=production
export PORT=3000

if [[ ! -f .env ]]; then
  err ".env missing. Run ./install.sh first."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  err "node_modules missing. Run ./install.sh first."
  exit 1
fi

if [[ ! -f .next/standalone/server.js ]]; then
  log "Build artifact missing. Building now..."
  if command -v bun >/dev/null 2>&1; then
    bun run build
  else
    npm run build
  fi
fi

# stop previous app on 3000 if any
if command -v lsof >/dev/null 2>&1; then
  if lsof -ti:3000 >/dev/null 2>&1; then
    warn "Port 3000 busy. Stopping previous process..."
    lsof -ti:3000 | xargs kill -9 || true
    sleep 1
  fi
fi

log "Starting web dashboard..."
if command -v bun >/dev/null 2>&1; then
  bun .next/standalone/server.js > logs/web.log 2>&1 &
else
  node .next/standalone/server.js > logs/web.log 2>&1 &
fi
WEB_PID=$!
echo "$WEB_PID" > .web.pid
ok "Web process started (PID: $WEB_PID)"

wait_for_url() {
  local url="$1"
  local timeout="$2"
  local t=0
  while [[ $t -lt $timeout ]]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    t=$((t + 1))
  done
  return 1
}

# preflight readiness: prevent client-side crash propagation from backend issues
if ! wait_for_url "http://127.0.0.1:3000" 60; then
  err "Dashboard not reachable on :3000"
  tail -n 80 logs/web.log || true
  exit 1
fi

if ! wait_for_url "http://127.0.0.1:3000/api/config/settings" 60; then
  err "Core settings API not ready. Preventing broken startup."
  tail -n 120 logs/web.log || true
  exit 1
fi

ok "Dashboard ready: http://localhost:3000"

# auto-start engine only if Weltrade credentials are configured
CRED_JSON=$(curl -fsS "http://127.0.0.1:3000/api/config/credentials?broker=weltrade_mt5" 2>/dev/null || echo '{}')
if echo "$CRED_JSON" | grep -q '"configured"[[:space:]]*:[[:space:]]*true'; then
  log "Weltrade credentials detected. Starting trading engine..."
  ENGINE_RES=$(curl -fsS -X POST "http://127.0.0.1:3000/api/engine" -H "Content-Type: application/json" -d '{"action":"start"}' 2>/dev/null || echo '{}')
  if echo "$ENGINE_RES" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
    ok "Trading engine started"
  else
    warn "Engine did not confirm start. Check Dashboard > Logs"
  fi
else
  warn "Weltrade credentials not configured yet."
  warn "Open Dashboard > Settings and complete: login, password, server, bridge URL."
fi

echo ""
echo "Dashboard: http://localhost:3000"
echo "Logs: tail -f logs/web.log"
echo "Stop: ./stop.sh"
echo ""

# keep foreground for operational visibility
exec tail -f logs/web.log
