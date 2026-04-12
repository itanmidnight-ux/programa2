#!/usr/bin/env bash
# ==========================================
# RECO-TRADING - System Test
# ==========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${CYAN}==============================================${NC}"
echo -e "${CYAN}  RECO-TRADING SYSTEM TEST${NC}"
echo -e "${CYAN}==============================================${NC}"
echo ""

echo -e "${BLUE}[TEST 1/6]${NC} Environment..."
if [ ! -f ".env" ]; then
  echo -e "  ${RED}FAIL${NC} .env missing"
  ERRORS=$((ERRORS + 1))
else
  echo -e "  ${GREEN}PASS${NC} .env exists"

  if grep -q "OANDA_ACCOUNT_ID=your_" .env 2>/dev/null || grep -q "OANDA_ACCOUNT_ID=$" .env 2>/dev/null; then
    echo -e "  ${RED}FAIL${NC} OANDA credentials not configured"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  ${GREEN}PASS${NC} OANDA credentials configured"
  fi

  ACTIVE_BROKER=$(grep "^BROKER_ACTIVE=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  if [ -z "$ACTIVE_BROKER" ]; then
    echo -e "  ${YELLOW}WARN${NC} BROKER_ACTIVE not set (default oanda)"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${GREEN}PASS${NC} BROKER_ACTIVE=$ACTIVE_BROKER"
  fi

  SYMBOL=$(grep "^TRADING_SYMBOL=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  if echo "$SYMBOL" | grep -q "_"; then
    echo -e "  ${GREEN}PASS${NC} Trading symbol format is valid: $SYMBOL"
  else
    echo -e "  ${YELLOW}WARN${NC} TRADING_SYMBOL should be format like XAU_USD"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

echo ""
echo -e "${BLUE}[TEST 2/6]${NC} Database..."
if [ -f "data/reco_trading.db" ]; then
  DB_SIZE=$(du -h "data/reco_trading.db" | cut -f1)
  echo -e "  ${GREEN}PASS${NC} DB exists ($DB_SIZE)"
else
  echo -e "  ${RED}FAIL${NC} DB missing"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo -e "${BLUE}[TEST 3/6]${NC} Dependencies..."
if [ -d "node_modules" ]; then
  echo -e "  ${GREEN}PASS${NC} node_modules installed"
else
  echo -e "  ${RED}FAIL${NC} node_modules missing"
  ERRORS=$((ERRORS + 1))
fi

if command -v bun &>/dev/null; then
  echo -e "  ${GREEN}PASS${NC} bun $(bun --version)"
else
  echo -e "  ${YELLOW}WARN${NC} bun not found (npm mode may still work)"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo -e "${BLUE}[TEST 4/6]${NC} Broker endpoint..."
if grep -q "OANDA_IS_DEMO=true" .env 2>/dev/null; then
  BROKER_HEALTH_URL="https://api-fxpractice.oanda.com/v3/accounts"
else
  BROKER_HEALTH_URL="https://api-fxtrade.oanda.com/v3/accounts"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BROKER_HEALTH_URL}" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "405" ] || [ "$HTTP_CODE" = "200" ]; then
  echo -e "  ${GREEN}PASS${NC} Broker endpoint reachable (HTTP $HTTP_CODE)"
else
  echo -e "  ${YELLOW}WARN${NC} Broker endpoint check returned HTTP $HTTP_CODE"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo -e "${BLUE}[TEST 5/6]${NC} App routes..."
if curl -sf "http://localhost:3000/api/health" > /dev/null 2>&1; then
  echo -e "  ${GREEN}PASS${NC} /api/health reachable"
else
  echo -e "  ${YELLOW}WARN${NC} /api/health not reachable (is app running?)"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo -e "${BLUE}[TEST 6/6]${NC} Type safety..."
if npx tsc --noEmit > /dev/null 2>&1; then
  echo -e "  ${GREEN}PASS${NC} TypeScript check passed"
else
  echo -e "  ${RED}FAIL${NC} TypeScript check failed"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo -e "${CYAN}==============================================${NC}"
echo -e "Errors:   ${RED}${ERRORS}${NC}"
echo -e "Warnings: ${YELLOW}${WARNINGS}${NC}"
echo -e "${CYAN}==============================================${NC}"

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
exit 0
