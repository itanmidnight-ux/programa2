#!/usr/bin/env bash
# ============================================
# RECO-TRADING DASHBOARD - Development Server
# ============================================
# PORTABLE: Detects project location automatically.
# DATABASE_URL is set dynamically so it always
# works no matter where the project folder is.
# ============================================
set -e

# ---- Detect project location ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- Set DATABASE_URL dynamically ----
export DATABASE_URL="file:$SCRIPT_DIR/data/reco_trading.db"
mkdir -p "$SCRIPT_DIR/data" "$SCRIPT_DIR/logs"

if ! command -v bun &>/dev/null; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

echo "Installing dependencies..."
bun install

echo "Starting development server on port 3000..."
echo "Dashboard: http://localhost:3000"
exec bun run dev
