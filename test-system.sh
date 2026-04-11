#!/usr/bin/env bash
# ============================================
# RECO-TRADING - Complete System Test
# ============================================
# Tests all components and identifies why
# trades are not being executed
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      RECO-TRADING DIAGNOSTIC TEST                ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

ERRORS=0
WARNINGS=0

# ==========================================
# TEST 1: Environment Configuration
# ==========================================
echo -e "${BLUE}[TEST 1/8]${NC} Environment Configuration..."

if [ ! -f ".env" ]; then
  echo -e "  ${RED}✗ FAIL${NC} .env file missing"
  ERRORS=$((ERRORS + 1))
else
  echo -e "  ${GREEN}✓ PASS${NC} .env exists"
  
  # Check API keys
  if grep -q "BINANCE_API_KEY=your_" .env 2>/dev/null || grep -q "BINANCE_API_KEY=$" .env 2>/dev/null; then
    echo -e "  ${RED}✗ FAIL${NC} Binance API keys not configured"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  ${GREEN}✓ PASS${NC} API keys configured"
  fi
  
  # Check testnet
  if grep -q "BINANCE_TESTNET=true" .env 2>/dev/null; then
    echo -e "  ${YELLOW}⚠ INFO${NC} Using TESTNET (fake money)"
  fi
  
  # Check TRADING_PAIR format - should be BTCUSDT not BTC/USDT
  PAIR=$(grep "^TRADING_PAIR=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  if echo "$PAIR" | grep -q "/"; then
    echo -e "  ${YELLOW}⚠ WARN${NC} Pair format should be BTCUSDT, not BTC/USDT"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${GREEN}✓ PASS${NC} Pair format correct: $PAIR"
  fi
  
  # Check MIN_CONFIDENCE
  MIN_CONF=$(grep "^MIN_CONFIDENCE=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  if [ -n "$MIN_CONF" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} MIN_CONFIDENCE: $MIN_CONF"
    if (( $(echo "$MIN_CONF > 0.7" | bc -l 2>/dev/null || echo "0") )); then
      echo -e "  ${YELLOW}⚠ WARN${NC} MIN_CONFIDENCE too high, may block trades"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
fi

echo ""

# ==========================================
# TEST 2: Database Status
# ==========================================
echo -e "${BLUE}[TEST 2/8]${NC} Database Status..."

if [ ! -f "data/reco_trading.db" ]; then
  echo -e "  ${RED}✗ FAIL${NC} Database file not found"
  ERRORS=$((ERRORS + 1))
else
  DB_SIZE=$(du -h "data/reco_trading.db" | cut -f1)
  echo -e "  ${GREEN}✓ PASS${NC} Database exists ($DB_SIZE)"
  
  # Check tables
  TABLES=$(sqlite3 data/reco_trading.db ".tables" 2>/dev/null | wc -w || echo "0")
  echo -e "  ${GREEN}✓ PASS${NC} Tables count: $TABLES"
  
  # Check for stuck positions
  OPEN_POS=$(sqlite3 data/reco_trading.db "SELECT COUNT(*) FROM Position;" 2>/dev/null || echo "0")
  echo -e "  ${GREEN}✓ INFO${NC} Open positions in DB: $OPEN_POS"
  
  # Check trade count
  TRADE_COUNT=$(sqlite3 data/reco_trading.db "SELECT COUNT(*) FROM Trade;" 2>/dev/null || echo "0")
  echo -e "  ${GREEN}✓ INFO${NC} Total trades: $TRADE_COUNT"
  
  if [ "$TRADE_COUNT" = "0" ]; then
    echo -e "  ${YELLOW}⚠ WARN${NC} NO TRADES RECORDED - this is the problem!"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

echo ""

# ==========================================
# TEST 3: Dependencies
# ==========================================
echo -e "${BLUE}[TEST 3/8]${NC} Dependencies..."

if [ -d "node_modules" ]; then
  echo -e "  ${GREEN}✓ PASS${NC} node_modules installed"
else
  echo -e "  ${RED}✗ FAIL${NC} Run ./install.sh first"
  ERRORS=$((ERRORS + 1))
fi

if command -v bun &>/dev/null; then
  BUN_VER=$(bun --version)
  echo -e "  ${GREEN}✓ PASS${NC} Bun: $BUN_VER"
else
  echo -e "  ${RED}✗ FAIL${NC} Bun not installed"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ==========================================
# TEST 4: Network Connectivity
# ==========================================
echo -e "${BLUE}[TEST 4/8]${NC} Network Connectivity..."

if grep -q "BINANCE_TESTNET=true" .env 2>/dev/null; then
  BINANCE_URL="https://testnet.binance.vision"
else
  BINANCE_URL="https://api.binance.com"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BINANCE_URL/api/v3/ping" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "  ${GREEN}✓ PASS${NC} Binance API reachable (HTTP $HTTP_CODE)"
else
  echo -e "  ${RED}✗ FAIL${NC} Cannot reach Binance API (HTTP $HTTP_CODE)"
  ERRORS=$((ERRORS + 1))
fi

# Test WebSocket
echo -e "  ${YELLOW}⚠ INFO${NC} WebSocket test skipped (requires ws tool)"

echo ""

# ==========================================
# TEST 5: Configuration Values
# ==========================================
echo -e "${BLUE}[TEST 5/8]${NC} Configuration Analysis..."

echo -e "  ${CYAN}Current .env settings:${NC}"
grep -E "^(TRADING_PAIR|PRIMARY_TIMEFRAME|RISK_PER_TRADE|MAX_DAILY_LOSS|MAX_DRAWDOWN|MAX_TRADES_PER_DAY|MIN_CONFIDENCE|INITIAL_CAPITAL|CAPITAL_MODE)=" .env 2>/dev/null | while read line; do
  echo -e "    $line"
done

echo ""

# Check if values are reasonable
RISK=$(grep "^RISK_PER_TRADE=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
if [ -n "$RISK" ]; then
  if (( $(echo "$RISK < 0.5" | bc -l 2>/dev/null || echo "0") )); then
    echo -e "  ${YELLOW}⚠ WARN${NC} Risk per trade very low ($RISK%)"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${GREEN}✓ PASS${NC} Risk per trade: ${RISK}%"
  fi
fi

MAX_TRADES=$(grep "^MAX_TRADES_PER_DAY=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
if [ -n "$MAX_TRADES" ]; then
  echo -e "  ${GREEN}✓ PASS${NC} Max trades/day: $MAX_TRADES"
fi

echo ""

# ==========================================
# TEST 6: Code Analysis
# ==========================================
echo -e "${BLUE}[TEST 6/8]${NC} Code Analysis..."

# Check execution-engine.ts
if [ -f "src/lib/execution-engine.ts" ]; then
  echo -e "  ${GREEN}✓ PASS${NC} execution-engine.ts exists"
  
  # Check tick interval default
  if grep -q "interval: 30000" src/lib/execution-engine.ts; then
    echo -e "  ${YELLOW}⚠ WARN${NC} Default tick interval is 30s (very slow)"
    WARNINGS=$((WARNINGS + 1))
  fi
  
  # Check if dryRun is enabled
  if grep -q "dryRun: process.env.DRY_RUN === 'true'" src/lib/execution-engine.ts; then
    if grep -q "DRY_RUN=true" .env 2>/dev/null; then
      echo -e "  ${RED}✗ FAIL${NC} DRY_RUN enabled - no real trades!"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "  ${GREEN}✓ PASS${NC} DRY_RUN not enabled"
    fi
  fi
else
  echo -e "  ${RED}✗ FAIL${NC} execution-engine.ts missing"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ==========================================
# TEST 7: Process Status
# ==========================================
echo -e "${BLUE}[TEST 7/8]${NC} Process Status..."

if lsof -ti:3000 > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓ PASS${NC} Web server running on :3000"
else
  echo -e "  ${YELLOW}⚠ INFO${NC} Web server not running (start with ./run.sh)"
fi

echo ""

# ==========================================
# TEST 8: Log Analysis
# ==========================================
echo -e "${BLUE}[TEST 8/8]${NC} Recent Log Analysis..."

if [ -f "server.log" ]; then
  echo -e "  ${GREEN}✓ PASS${NC} server.log exists"
  
  # Check for trade executions
  TRADE_LOGS=$(grep -c "Trade #" server.log 2>/dev/null || echo "0")
  echo -e "  ${GREEN}✓ INFO${NC} Trade executions in log: $TRADE_LOGS"
  
  # Check for errors
  ERROR_LOGS=$(grep -c "ERROR" server.log 2>/dev/null || echo "0")
  if [ "$ERROR_LOGS" -gt 10 ]; then
    echo -e "  ${YELLOW}⚠ WARN${NC} Many errors in log: $ERROR_LOGS"
    WARNINGS=$((WARNINGS + 1))
  fi
  
  # Show last 5 lines
  echo -e "  ${CYAN}Last 5 log lines:${NC}"
  tail -5 server.log 2>/dev/null | sed 's/^/    /'
else
  echo -e "  ${YELLOW}⚠ INFO${NC} No server.log found (start the server first)"
fi

echo ""

# ==========================================
# SUMMARY
# ==========================================
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}║  ✓ ALL TESTS PASSED                            ║${NC}"
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}║  ⚠ PASSED WITH WARNINGS                        ║${NC}"
else
  echo -e "${RED}║  ✗ TESTS FAILED                                  ║${NC}"
fi
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Errors:   ${RED}$ERRORS${NC}"
echo -e "  Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}CRITICAL ISSUES FOUND:${NC}"
  echo "  1. Fix the errors above before running the trading bot"
  echo "  2. Run ./install.sh to setup dependencies"
  echo ""
fi

if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}RECOMMENDATIONS:${NC}"
  echo "  1. Review warning messages for optimization opportunities"
  echo "  2. Ensure MIN_CONFIDENCE is not too high (0.35-0.45 recommended)"
  echo "  3. Ensure DRY_RUN is not set to 'true'"
  echo ""
fi

echo -e "${BLUE}Next steps:${NC}"
echo "  - Fix any errors"
echo "  - Run: ./run.sh"
echo "  - Monitor: tail -f server.log"
echo "  - Check dashboard: http://localhost:3000"
echo ""

exit $ERRORS
