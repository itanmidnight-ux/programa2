#!/usr/bin/env bash
# ============================================
# RECO-TRADING - Complete System Runner
# ============================================
# Starts EVERYTHING automatically:
# 1. Web server (dashboard)
# 2. Trading engine (automation)
# 3. Health monitoring
#
# Just run: ./run.sh
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export DATABASE_URL="file:$SCRIPT_DIR/data/reco_trading.db"
mkdir -p "$SCRIPT_DIR/data" "$SCRIPT_DIR/logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

FORCE_BUILD=false
if [[ "$1" == "--build" ]] || [[ "$1" == "-b" ]]; then
  FORCE_BUILD=true
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       RECO-TRADING - STARTING SYSTEM         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ---- Step 1: Check Bun ----
if ! command -v bun &>/dev/null; then
    echo -e "${BLUE}[1/4]${NC} Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
else
    echo -e "${GREEN}✓${NC} [1/4] Bun: $(bun --version)"
fi

# ---- Step 2: Dependencies ----
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} [2/4] Dependencies: installed"
else
    echo -e "${BLUE}[2/4]${NC} Installing dependencies..."
    bun install
    echo -e "${GREEN}✓${NC} Dependencies installed"
fi

# ---- Step 3: Build ----
# Clean build caches and lock files to prevent stale/corrupt builds
echo -e "${BLUE}[3/4]${NC} Preparing build environment..."
rm -rf .next/lock .next/cache 2>/dev/null || true

if [ "$FORCE_BUILD" = "true" ]; then
    echo -e "${BLUE}  →${NC} Force rebuilding..."
    rm -rf .next
    bun run build
elif [ -d ".next/standalone" ] && [ -f ".next/standalone/server.js" ]; then
    echo -e "${GREEN}✓${NC} [3/4] Build: ready"
else
    echo -e "${BLUE}  →${NC} Building..."
    bun run build
fi

# ---- Step 4: Kill existing processes ----
echo -e "${BLUE}[4/4]${NC} Preparing environment..."
if lsof -ti:3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}  →${NC} Killing process on port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# ---- Start the server ----
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ✓ SERVER STARTING${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

export PORT=3000
export NODE_ENV=production

# Start server in background
bun run start > server.log 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > .web.pid
echo -e "${GREEN}✓${NC} Web server started (PID: $SERVER_PID)"

# ---- Wait for server to be ready ----
echo -e "${BLUE}  →${NC} Waiting for server to initialize..."
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf "http://localhost:3000" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Server ready after ${WAITED}s"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${RED}✗${NC} Server failed to start. Check server.log for errors."
    exit 1
fi

# ---- Start the trading engine automatically ----
echo ""
echo -e "${BLUE}  →${NC} Starting trading engine..."
ENGINE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/engine \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}' 2>/dev/null)

if echo "$ENGINE_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓${NC} Trading engine: STARTED"
else
    echo -e "${YELLOW}⚠${NC} Trading engine: response: $ENGINE_RESPONSE"
fi

# ---- Summary ----
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}  ✓ ALL SYSTEMS RUNNING${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Dashboard:     ${BLUE}http://localhost:3000${NC}"
echo -e "  Trading:       ${GREEN}ACTIVE${NC} (auto-started)"
echo -e "  Tick Interval: ${YELLOW}3 seconds${NC}"
echo -e "  Server PID:    $SERVER_PID"
echo ""
echo -e "${BLUE}Commands:${NC}"
echo -e "  Monitor logs:  ${CYAN}tail -f server.log | grep -E '(ENGINE|Trade)'${NC}"
echo -e "  Stop all:      ${CYAN}./stop.sh${NC}"
echo -e "  Health check:  ${CYAN}./health-check.sh${NC}"
echo ""
echo -e "${YELLOW}The trading engine is now running automatically!${NC}"
echo ""

# Keep script running and show logs
tail -f server.log 2>&1 | grep --line-buffered -E "(ENGINE|Trade|WS|Smart Order|Error|Tick)"
