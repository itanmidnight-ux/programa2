#!/usr/bin/env bash
# ============================================
# RECO-TRADING - Health Check
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

EXIT_CODE=0

echo -e "${CYAN}==============================================${NC}"
echo -e "${CYAN}  RECO-TRADING HEALTH CHECK${NC}"
echo -e "${CYAN}==============================================${NC}"
echo ""

echo -e "${BLUE}[1/6]${NC} Web Server (:3000)..."
if curl -sf "http://localhost:3000" > /dev/null 2>&1; then
  echo -e "  ${GREEN}OK${NC} Web server is up"
else
  echo -e "  ${RED}FAIL${NC} Web server is down"
  EXIT_CODE=1
fi

echo -e "${BLUE}[2/6]${NC} Trading Engine (:9000)..."
if curl -sf "http://localhost:9000/health" > /dev/null 2>&1; then
  echo -e "  ${GREEN}OK${NC} Trading engine is up"
else
  echo -e "  ${YELLOW}WARN${NC} Trading engine not running (optional)"
fi

echo -e "${BLUE}[3/6]${NC} Database..."
if [ -f "data/reco_trading.db" ]; then
  DB_SIZE=$(du -h "data/reco_trading.db" 2>/dev/null | cut -f1)
  echo -e "  ${GREEN}OK${NC} Database exists ($DB_SIZE)"
else
  echo -e "  ${RED}FAIL${NC} Database missing"
  EXIT_CODE=1
fi

echo -e "${BLUE}[4/6]${NC} Dependencies..."
if [ -d "node_modules" ]; then
  echo -e "  ${GREEN}OK${NC} node_modules installed"
else
  echo -e "  ${RED}FAIL${NC} node_modules missing (run ./install.sh)"
  EXIT_CODE=1
fi

echo -e "${BLUE}[5/6]${NC} Bun Runtime..."
if command -v bun &>/dev/null; then
  BUN_VERSION=$(bun --version)
  echo -e "  ${GREEN}OK${NC} Bun: $BUN_VERSION"
else
  echo -e "  ${RED}FAIL${NC} Bun not installed"
  EXIT_CODE=1
fi

echo -e "${BLUE}[6/6]${NC} Configuration..."
if [ -f ".env" ]; then
  echo -e "  ${GREEN}OK${NC} .env exists"

  BROKER_ACTIVE_VAL=$(grep "^BROKER_ACTIVE=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
  if [ -z "$BROKER_ACTIVE_VAL" ]; then
    echo -e "  ${YELLOW}WARN${NC} BROKER_ACTIVE not set (defaulting to oanda)"
  else
    echo -e "  ${GREEN}OK${NC} Active broker: ${BROKER_ACTIVE_VAL}"
  fi

  if grep -q "OANDA_ACCOUNT_ID=your_" .env 2>/dev/null || grep -q "OANDA_API_TOKEN=your_" .env 2>/dev/null; then
    echo -e "  ${YELLOW}WARN${NC} OANDA credentials not configured"
  else
    echo -e "  ${GREEN}OK${NC} OANDA credentials configured"
  fi

  if grep -q "OANDA_IS_DEMO=true" .env 2>/dev/null || grep -q "WELTRADE_MT5_IS_DEMO=true" .env 2>/dev/null; then
    echo -e "  ${YELLOW}WARN${NC} Mode: DEMO"
  else
    echo -e "  ${GREEN}OK${NC} Mode: LIVE"
  fi
else
  echo -e "  ${RED}FAIL${NC} .env missing (run ./install.sh)"
  EXIT_CODE=1
fi

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}All checks passed.${NC}"
else
  echo -e "${RED}Some checks failed.${NC}"
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo "  - Run ./install.sh"
  echo "  - Run ./run.sh"
  echo "  - Review logs in ./logs"
fi

exit $EXIT_CODE
