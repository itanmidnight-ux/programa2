#!/usr/bin/env bash
# ============================================
# RECO-TRADING - Health Check
# ============================================
# Verifies all services are running correctly
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

EXIT_CODE=0

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       RECO-TRADING HEALTH CHECK              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Check 1: Web Server
echo -e "${BLUE}[1/6]${NC} Web Server (:3000)..."
if curl -sf "http://localhost:3000" > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Web server: UP"
else
  echo -e "  ${RED}✗${NC} Web server: DOWN"
  EXIT_CODE=1
fi

# Check 2: Trading Engine (if running on separate port)
echo -e "${BLUE}[2/6]${NC} Trading Engine (:9000)..."
if curl -sf "http://localhost:9000/health" > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Trading engine: UP"
else
  echo -e "  ${YELLOW}⚠${NC} Trading engine: NOT RUNNING (optional)"
fi

# Check 3: Database
echo -e "${BLUE}[3/6]${NC} Database..."
if [ -f "data/reco_trading.db" ]; then
  DB_SIZE=$(du -h "data/reco_trading.db" 2>/dev/null | cut -f1)
  echo -e "  ${GREEN}✓${NC} Database: EXISTS ($DB_SIZE)"
else
  echo -e "  ${RED}✗${NC} Database: MISSING"
  EXIT_CODE=1
fi

# Check 4: Dependencies
echo -e "${BLUE}[4/6]${NC} Dependencies..."
if [ -d "node_modules" ]; then
  echo -e "  ${GREEN}✓${NC} node_modules: INSTALLED"
else
  echo -e "  ${RED}✗${NC} node_modules: MISSING (run ./install.sh)"
  EXIT_CODE=1
fi

# Check 5: Bun Runtime
echo -e "${BLUE}[5/6]${NC} Bun Runtime..."
if command -v bun &>/dev/null; then
  BUN_VERSION=$(bun --version)
  echo -e "  ${GREEN}✓${NC} Bun: $BUN_VERSION"
else
  echo -e "  ${RED}✗${NC} Bun: NOT INSTALLED"
  EXIT_CODE=1
fi

# Check 6: Configuration
echo -e "${BLUE}[6/6]${NC} Configuration..."
if [ -f ".env" ]; then
  echo -e "  ${GREEN}✓${NC} .env: EXISTS"
  
  # Check for API keys
  if grep -q "BINANCE_API_KEY=your_" .env 2>/dev/null; then
    echo -e "  ${YELLOW}⚠${NC} Binance API keys: NOT CONFIGURED (using defaults)"
  else
    echo -e "  ${GREEN}✓${NC} Binance API keys: CONFIGURED"
  fi
  
  # Check testnet mode
  if grep -q "BINANCE_TESTNET=true" .env 2>/dev/null; then
    echo -e "  ${YELLOW}⚠${NC} Mode: TESTNET (fake money)"
  else
    echo -e "  ${GREEN}✓${NC} Mode: PRODUCTION (real money)"
  fi
else
  echo -e "  ${RED}✗${NC} .env: MISSING (run ./install.sh)"
  EXIT_CODE=1
fi

# Summary
echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✓ ALL SYSTEMS OPERATIONAL                   ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
else
  echo -e "${RED}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ✗ SOME CHECKS FAILED                        ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo "  - Run ./install.sh to install missing dependencies"
  echo "  - Run ./run.sh to start services"
  echo "  - Run ./stop.sh to stop all services"
fi

exit $EXIT_CODE
