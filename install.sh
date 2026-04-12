#!/usr/bin/env bash
# ============================================
# RECO-TRADING DASHBOARD - UNIVERSAL INSTALLER
# Linux distros + Termux compatible
# ============================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)"
cd "$ROOT_DIR"

FORCE=false
DRY_RUN=false
APP_TIMEZONE="${APP_TIMEZONE:-America/New_York}"
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

IS_TERMUX=false
[[ -n "${PREFIX:-}" && "$PREFIX" == *"com.termux"* ]] && IS_TERMUX=true
IS_ROOT=false
[[ "$(id -u)" -eq 0 ]] && IS_ROOT=true
SUDO_CMD=""
if ! $IS_ROOT && ! $IS_TERMUX && command -v sudo >/dev/null 2>&1; then
  SUDO_CMD="sudo"
fi

run_cmd() {
  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} $*"
  else
    eval "$@"
  fi
}

progress() {
  local step="$1" total="$2" msg="$3"
  local pct=$(( step * 100 / total ))
  local bars=$(( pct / 4 ))
  local bar=""
  for ((i=0; i<bars; i++)); do bar+="█"; done
  printf "${CYAN}[%3d%%]${NC} %-25s %s\n" "$pct" "[$bar]" "$msg"
}

detect_pm() {
  if $IS_TERMUX; then echo "pkg"; return; fi
  for pm in apt-get dnf yum pacman apk zypper; do
    command -v "$pm" >/dev/null 2>&1 && { echo "$pm"; return; }
  done
  echo "unknown"
}

install_pkgs() {
  local pm="$1"; shift
  local pkgs=("$@")
  case "$pm" in
    pkg) run_cmd "pkg update -y >/dev/null 2>&1 || true"; run_cmd "pkg install -y ${pkgs[*]} >/dev/null 2>&1 || true" ;;
    apt-get) run_cmd "$SUDO_CMD apt-get update -y >/dev/null 2>&1 || true"; run_cmd "$SUDO_CMD apt-get install -y ${pkgs[*]} >/dev/null 2>&1 || true" ;;
    dnf) run_cmd "$SUDO_CMD dnf install -y ${pkgs[*]} >/dev/null 2>&1 || true" ;;
    yum) run_cmd "$SUDO_CMD yum install -y ${pkgs[*]} >/dev/null 2>&1 || true" ;;
    pacman) run_cmd "$SUDO_CMD pacman -Sy --noconfirm ${pkgs[*]} >/dev/null 2>&1 || true" ;;
    apk) run_cmd "$SUDO_CMD apk add --no-cache ${pkgs[*]} >/dev/null 2>&1 || true" ;;
    zypper) run_cmd "$SUDO_CMD zypper --non-interactive install ${pkgs[*]} >/dev/null 2>&1 || true" ;;
    *) echo -e "${YELLOW}⚠${NC} No package manager detected. Skipping system deps." ;;
  esac
}

configure_us_timezone_install() {
  local tz="$APP_TIMEZONE"
  echo -e "${BLUE}[INFO]${NC} Target timezone: $tz"
  if $IS_TERMUX; then
    echo -e "${YELLOW}⚠${NC} Termux detected: skipping system timezone change."
    return 0
  fi
  if ! command -v timedatectl >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} timedatectl not available. Set timezone manually if needed."
    return 0
  fi

  local current_tz
  current_tz="$(timedatectl show --property=Timezone --value 2>/dev/null || true)"
  if [[ "$current_tz" == "$tz" ]]; then
    echo -e "${GREEN}✓${NC} System timezone already in $tz"
    return 0
  fi

  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} ${SUDO_CMD} timedatectl set-timezone $tz"
    return 0
  fi

  if ${SUDO_CMD:+$SUDO_CMD }timedatectl set-timezone "$tz" >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} System timezone switched to $tz"
  else
    echo -e "${YELLOW}⚠${NC} Could not change system timezone automatically."
  fi
}

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       RECO-TRADING UNIVERSAL INSTALLER       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo -e "${BLUE}[INFO]${NC} Path: $ROOT_DIR"
echo -e "${BLUE}[INFO]${NC} Root: $IS_ROOT | Termux: $IS_TERMUX | DryRun: $DRY_RUN"

PM="$(detect_pm)"
echo -e "${BLUE}[INFO]${NC} Package manager: $PM"

TOTAL=10
progress 1 $TOTAL "Installing system dependencies"
install_pkgs "$PM" curl git openssl ca-certificates lsof procps

progress 2 $TOTAL "Prerequisite diagnostics"
for cmd in bash curl git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} Missing command: $cmd"
  fi
done

progress 3 $TOTAL "Timezone alignment (US)"
configure_us_timezone_install

progress 4 $TOTAL "Ensuring Bun runtime"
if ! command -v bun >/dev/null 2>&1; then
  run_cmd "curl -fsSL https://bun.sh/install | bash"
  if ! $DRY_RUN; then export PATH="$HOME/.bun/bin:$PATH"; fi
  for PROFILE in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc"; do
    [[ -f "$PROFILE" ]] || continue
    if ! grep -q '.bun/bin' "$PROFILE" 2>/dev/null; then
      run_cmd "echo 'export PATH=\"$HOME/.bun/bin:$PATH\"' >> $PROFILE"
    fi
  done
fi
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null 2>&1 && echo -e "${GREEN}✓${NC} Bun: $(bun --version)" || echo -e "${YELLOW}⚠${NC} Bun not yet available (dry-run or install issue)."

progress 5 $TOTAL "Preparing runtime directories"
DB_DIR="$ROOT_DIR/data"
LOG_DIR="$ROOT_DIR/logs"
run_cmd "mkdir -p $DB_DIR $LOG_DIR"
DB_FILE="$DB_DIR/reco_trading.db"
DB_URL="file:$DB_FILE"

progress 6 $TOTAL "Generating .env (OANDA-first)"
if [[ ! -f .env || "$FORCE" == true ]]; then
  SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "reco-secret-$(date +%s)")
  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} Would create .env with OANDA defaults"
  else
    cat > .env <<ENVFILE
DATABASE_URL=$DB_URL
OANDA_ACCOUNT_ID=
OANDA_API_TOKEN=
OANDA_IS_DEMO=true
TRADING_SYMBOL=XAU_USD
TRADING_PAIRS=XAU_USD,EUR_USD,GBP_USD,USD_JPY,WTI_USD,NAS100_USD
PRIMARY_TIMEFRAME=5m
CONFIRM_LIVE_TRADING=false
RISK_PER_TRADE=1.0
MAX_DAILY_LOSS=3.0
MAX_DRAWDOWN=10.0
MAX_TRADES_PER_DAY=120
MIN_CONFIDENCE=0.62
INITIAL_CAPITAL=1000.0
CAPITAL_MODE=MEDIUM
DASHBOARD_PORT=3000
APP_TIMEZONE=$APP_TIMEZONE
NEXTAUTH_SECRET=$SESSION_SECRET
NEXTAUTH_URL=http://localhost:3000
ENVFILE
    chmod 600 .env
  fi
else
  run_cmd "grep -q '^DATABASE_URL=' .env && sed -i 's|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|' .env || echo 'DATABASE_URL=$DB_URL' >> .env"
  run_cmd "grep -q '^TRADING_SYMBOL=' .env || echo 'TRADING_SYMBOL=XAU_USD' >> .env"
  run_cmd "grep -q '^OANDA_IS_DEMO=' .env || echo 'OANDA_IS_DEMO=true' >> .env"
  run_cmd "grep -q '^APP_TIMEZONE=' .env || echo 'APP_TIMEZONE=$APP_TIMEZONE' >> .env"
fi

progress 7 $TOTAL "Installing JS dependencies"
run_cmd "bun install"

progress 8 $TOTAL "Prisma generate"
export DATABASE_URL="$DB_URL"
run_cmd "bunx prisma generate >/dev/null"

progress 9 $TOTAL "Prisma schema sync"
if [[ "$FORCE" == true ]]; then
  run_cmd "bunx prisma db push --force-reset --skip-generate >/dev/null"
else
  run_cmd "bunx prisma db push --skip-generate >/dev/null"
fi

progress 10 $TOTAL "Build smoke verification"
run_cmd "rm -rf .next/lock .next/cache 2>/dev/null || true"
if ! $DRY_RUN; then
  if ! bun run build >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} Build failed in this environment (run 'bun run build' manually for details)."
  fi
fi

echo ""
echo -e "${GREEN}✓ Installation flow completed${NC}"
echo -e "${BLUE}Next steps:${NC}"
echo "  1) Edit .env with OANDA_ACCOUNT_ID and OANDA_API_TOKEN"
echo "  2) Verify APP_TIMEZONE in .env (default: $APP_TIMEZONE)"
echo "  3) Start with: ./run.sh --daemon=auto"
