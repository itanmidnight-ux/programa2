#!/usr/bin/env bash
set -euo pipefail

# RECO-TRADING installer
# Goal: one-command setup on Linux/Termux

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[install]${NC} $*"; }
ok() { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err() { echo -e "${RED}[error]${NC} $*"; }

OS_KIND="unknown"
PKG_INSTALL=""
PKG_UPDATE=""

is_termux() {
  [[ -n "${PREFIX:-}" && "${PREFIX:-}" == *"com.termux"* ]]
}

detect_os() {
  if is_termux || command -v pkg >/dev/null 2>&1; then
    OS_KIND="termux"
    PKG_UPDATE="pkg update -y"
    PKG_INSTALL="pkg install -y"
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    OS_KIND="debian"
    PKG_UPDATE="sudo apt-get update -y"
    PKG_INSTALL="sudo apt-get install -y"
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    OS_KIND="fedora"
    PKG_UPDATE="sudo dnf makecache"
    PKG_INSTALL="sudo dnf install -y"
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    OS_KIND="rhel"
    PKG_UPDATE="sudo yum makecache"
    PKG_INSTALL="sudo yum install -y"
    return
  fi
  if command -v pacman >/dev/null 2>&1; then
    OS_KIND="arch"
    PKG_UPDATE="sudo pacman -Sy"
    PKG_INSTALL="sudo pacman --noconfirm -S"
    return
  fi
  if command -v apk >/dev/null 2>&1; then
    OS_KIND="alpine"
    PKG_UPDATE="sudo apk update"
    PKG_INSTALL="sudo apk add"
    return
  fi
}

install_base_packages() {
  if [[ -z "$PKG_INSTALL" ]]; then
    warn "No package manager auto-detected. Skipping OS package install."
    return
  fi

  log "Detected environment: $OS_KIND"
  eval "$PKG_UPDATE" || true

  case "$OS_KIND" in
    termux)
      eval "$PKG_INSTALL curl git openssl jq sqlite nodejs-lts" || true
      ;;
    debian)
      eval "$PKG_INSTALL curl git openssl jq sqlite3 ca-certificates lsof" || true
      eval "$PKG_INSTALL nodejs npm" || true
      ;;
    fedora|rhel)
      eval "$PKG_INSTALL curl git openssl jq sqlite ca-certificates lsof nodejs npm" || true
      ;;
    arch)
      eval "$PKG_INSTALL curl git openssl jq sqlite ca-certificates lsof nodejs npm" || true
      ;;
    alpine)
      eval "$PKG_INSTALL curl git openssl jq sqlite ca-certificates lsof nodejs npm" || true
      ;;
  esac
}

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    ok "Bun found: $(bun --version)"
    return
  fi

  log "Installing Bun runtime..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    err "Bun installation failed."
    exit 1
  fi
  ok "Bun installed: $(bun --version)"
}

update_or_add_env() {
  local key="$1"
  local value="$2"
  local file="$3"

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

setup_env() {
  local db_dir="$ROOT_DIR/data"
  local db_file="$db_dir/reco_trading.db"
  local db_url="file:$db_file"
  mkdir -p "$db_dir" "$ROOT_DIR/logs"

  if [[ ! -f .env ]]; then
    log "Creating .env with safe defaults (Weltrade-first)..."
    local session_secret
    session_secret=$(openssl rand -hex 32 2>/dev/null || echo "reco-secret-$(date +%s)")

    cat > .env <<EOF
DATABASE_URL=$db_url

BROKER_ACTIVE=weltrade_mt5
TRADING_SYMBOL=XAU_USD
PRIMARY_TIMEFRAME=5m
CONFIRMATION_TIMEFRAME=15m

WELTRADE_MT5_LOGIN=
WELTRADE_MT5_PASSWORD=
WELTRADE_MT5_SERVER=
WELTRADE_MT5_IS_DEMO=true
WELTRADE_MT5_BRIDGE_URL=http://127.0.0.1:5001
WELTRADE_MT5_TIMEOUT_MS=10000

OANDA_ACCOUNT_ID=
OANDA_API_TOKEN=
OANDA_IS_DEMO=true

RISK_PER_TRADE=1.0
MAX_DAILY_LOSS=3.0
MAX_DRAWDOWN=10.0
MAX_TRADES_PER_DAY=120
MIN_CONFIDENCE=0.25

INITIAL_CAPITAL=1000.0
CAPITAL_MODE=MEDIUM

DASHBOARD_PORT=3000
NEXTAUTH_SECRET=$session_secret
NEXTAUTH_URL=http://localhost:3000
EOF
    chmod 600 .env || true
    ok ".env created"
  else
    log "Updating critical .env keys without deleting your config..."
    update_or_add_env "DATABASE_URL" "$db_url" .env
    update_or_add_env "BROKER_ACTIVE" "weltrade_mt5" .env
    update_or_add_env "TRADING_SYMBOL" "XAU_USD" .env
    update_or_add_env "WELTRADE_MT5_BRIDGE_URL" "http://127.0.0.1:5001" .env
    update_or_add_env "WELTRADE_MT5_TIMEOUT_MS" "10000" .env
    ok ".env normalized"
  fi
}

install_app_deps() {
  log "Installing app dependencies..."
  bun install
  ok "Dependencies installed"
}

setup_db() {
  log "Setting up Prisma and database..."
  bunx prisma generate
  bunx prisma db push --skip-generate
  ok "Database ready"
}

build_app() {
  log "Building production bundle..."
  rm -rf .next || true
  bun run build
  ok "Build completed"
}

main() {
  log "Starting automated installation in: $ROOT_DIR"
  detect_os
  install_base_packages
  ensure_bun
  setup_env
  install_app_deps
  setup_db
  build_app

  echo ""
  ok "Installation complete."
  echo "Next step: ./run.sh"
  echo "Then open: http://localhost:3000"
  echo "Set Weltrade credentials in Dashboard > Settings."
}

main "$@"
