#!/usr/bin/env bash
# ============================================
# RECO-TRADING DASHBOARD - Executor Script
# ============================================
# Smart startup: only installs/builds if needed
# Use --build flag to force rebuild
#
# PORTABLE: Detects project location automatically.
# DATABASE_URL is set dynamically so it always
# works no matter where the project folder is.
# ============================================
set -e

# ---- Detect project location ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- Set DATABASE_URL dynamically ----
# This ensures the database path is always correct
# even if the project folder was moved/renamed
export DATABASE_URL="file:$SCRIPT_DIR/data/reco_trading.db"
mkdir -p "$SCRIPT_DIR/data" "$SCRIPT_DIR/logs"

FORCE_BUILD=false
if [[ "$1" == "--build" ]] || [[ "$1" == "-b" ]]; then
  FORCE_BUILD=true
fi

echo "=============================================="
echo "  RECO-TRADING DASHBOARD"
echo "  Crypto Trading Dashboard - Next.js"
echo "=============================================="
echo ""

# ---- Step 1: Check Bun ----
if ! command -v bun &>/dev/null; then
    echo "[1/3] Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
else
    echo "[1/3] bun ready: $(bun --version)"
fi

# ---- Step 2: Dependencies (only if missing) ----
if [ -d "node_modules" ]; then
    echo "[2/3] Dependencies: already installed"
else
    echo "[2/3] Installing dependencies..."
    bun install
fi

# ---- Step 3: Build (only if needed or forced) ----
if [ "$FORCE_BUILD" = "true" ]; then
    echo "[3/3] Force rebuilding..."
    rm -rf .next
    bun run build
elif [ -d ".next/standalone" ] && [ -f ".next/standalone/server.js" ]; then
    echo "[3/3] Build: already compiled (use --build to rebuild)"
else
    echo "[3/3] Building project..."
    bun run build
fi

# ---- Start the server ----
echo ""
echo "=============================================="
echo "  Dashboard ready at: http://localhost:3000"
echo "=============================================="
echo ""

# Kill any process using port 3000
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "[CLEANUP] Killing existing process on port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Force port 3000
export PORT=3000
exec bun run start
