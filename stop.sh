#!/usr/bin/env bash
# ============================================
# RECO-TRADING - Stop Script
# ============================================
# Gracefully stops all running services
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[STOP]${NC} Stopping RECO-Trading services..."

# Stop web server
if [ -f ".web.pid" ]; then
  WEB_PID=$(cat .web.pid)
  if kill -0 "$WEB_PID" 2>/dev/null; then
    echo -e "${YELLOW}[STOP]${NC} Stopping web server (PID: $WEB_PID)..."
    kill -TERM "$WEB_PID" 2>/dev/null || kill -9 "$WEB_PID" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Web server stopped"
  else
    echo -e "${YELLOW}[STOP]${NC} Web server process not found (already stopped)"
  fi
  rm -f .web.pid
else
  # Fallback: kill by port
  if lsof -ti:3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}[STOP]${NC} Killing process on port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Port 3000 cleared"
  fi
fi

# Stop trading engine
if [ -f ".trading.pid" ]; then
  TRADING_PID=$(cat .trading.pid)
  if kill -0 "$TRADING_PID" 2>/dev/null; then
    echo -e "${YELLOW}[STOP]${NC} Stopping trading engine (PID: $TRADING_PID)..."
    kill -TERM "$TRADING_PID" 2>/dev/null || kill -9 "$TRADING_PID" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Trading engine stopped"
  else
    echo -e "${YELLOW}[STOP]${NC} Trading engine process not found (already stopped)"
  fi
  rm -f .trading.pid
else
  # Fallback: kill by port
  if lsof -ti:9000 > /dev/null 2>&1; then
    echo -e "${YELLOW}[STOP]${NC} Killing process on port 9000..."
    lsof -ti:9000 | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Port 9000 cleared"
  fi
fi

echo -e "${GREEN}✓${NC} All services stopped"
