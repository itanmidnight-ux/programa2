#!/usr/bin/env bash
# ============================================
# RECO-TRADING - Universal Runner
# Linux + Termux + optional systemd daemon mode
# ============================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${DASHBOARD_PORT:-3000}"
DAEMON_MODE="foreground"  # foreground | nohup | systemd | auto
FORCE_BUILD=false
NO_ENGINE=false
DRY_RUN=false
DIAGNOSE_OANDA=true
SELF_CHECK=false
SELF_CHECK_STRICT=false
SELF_CHECK_REPORT="$SCRIPT_DIR/logs/self-check-report.json"
SELF_CHECK_WRITE_STATUS="skipped"
SELF_CHECK_ENV_STATUS="skipped"
SELF_CHECK_PORT_STATUS="skipped"
SELF_CHECK_ENGINE_STATUS="skipped"
SELF_CHECK_OANDA_STATUS="skipped"
SELF_CHECK_OANDA_HTTP="n/a"
SELF_CHECK_OANDA_LATENCY_MS="n/a"
SELF_CHECK_OANDA_WARN_MS="${SELF_CHECK_OANDA_WARN_MS:-1200}"
SELF_CHECK_OANDA_FAIL_MS="${SELF_CHECK_OANDA_FAIL_MS:-2500}"
APP_TIMEZONE="${APP_TIMEZONE:-America/New_York}"
PHASE_TEST=false
PHASE_TEST_SAMPLES="${PHASE_TEST_SAMPLES:-5}"
PHASE_PROFILE="${PHASE_PROFILE:-prod}"
PHASE_CUSTOM_THRESHOLDS="${PHASE_CUSTOM_THRESHOLDS:-false}"
PHASE_MAX_AVG_MS="${PHASE_MAX_AVG_MS:-800}"
PHASE_MAX_P95_MS="${PHASE_MAX_P95_MS:-1500}"
PHASE_MAX_MAX_MS="${PHASE_MAX_MAX_MS:-2500}"

for arg in "$@"; do
  case "$arg" in
    --daemon|-d) DAEMON_MODE="nohup" ;;
    --daemon=auto) DAEMON_MODE="auto" ;;
    --daemon=systemd) DAEMON_MODE="systemd" ;;
    --daemon=nohup) DAEMON_MODE="nohup" ;;
    --build|-b) FORCE_BUILD=true ;;
    --no-engine) NO_ENGINE=true ;;
    --dry-run) DRY_RUN=true ;;
    --no-diagnose-oanda) DIAGNOSE_OANDA=false ;;
    --self-check) SELF_CHECK=true ;;
    --self-check=strict) SELF_CHECK=true; SELF_CHECK_STRICT=true ;;
    --phase-test) PHASE_TEST=true ;;
  esac
done

run_cmd() {
  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} $*"
  else
    eval "$@"
  fi
}

IS_TERMUX=false
[[ -n "${PREFIX:-}" && "$PREFIX" == *"com.termux"* ]] && IS_TERMUX=true
IS_ROOT=false
[[ "$(id -u)" -eq 0 ]] && IS_ROOT=true
SUDO_CMD=""
if ! $IS_ROOT && ! $IS_TERMUX && command -v sudo >/dev/null 2>&1; then
  SUDO_CMD="sudo"
fi
SYSTEMD_AVAILABLE=false
if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  SYSTEMD_AVAILABLE=true
fi

progress() {
  local pct="$1" msg="$2"
  local bars=$((pct/4))
  local bar=""
  for ((i=0;i<bars;i++)); do bar+="█"; done
  printf "${CYAN}[%3d%%]${NC} %-24s %s\n" "$pct" "[$bar]" "$msg"
}

get_env_value() {
  local key="$1"
  [[ -f .env ]] || { echo ""; return; }
  grep -E "^${key}=" .env | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'"
}

strict_fail() {
  local msg="$1"
  if $SELF_CHECK_STRICT; then
    echo -e "${RED}✗${NC} $msg"
    exit 1
  fi
}

validate_write_permissions() {
  progress 30 "Validating write permissions"
  local write_ok=true
  run_cmd "mkdir -p $SCRIPT_DIR/data $SCRIPT_DIR/logs"
  if ! $DRY_RUN; then
    touch "$SCRIPT_DIR/data/.perm_test" 2>/dev/null || write_ok=false
    touch "$SCRIPT_DIR/logs/.perm_test" 2>/dev/null || write_ok=false
    rm -f "$SCRIPT_DIR/data/.perm_test" "$SCRIPT_DIR/logs/.perm_test" 2>/dev/null || true
  fi
  if [[ "$write_ok" == false ]]; then
    SELF_CHECK_WRITE_STATUS="fail"
    echo -e "${RED}✗ No write permission in data/ or logs/.${NC}"
    exit 1
  fi
  SELF_CHECK_WRITE_STATUS="pass"
}

validate_env_requirements() {
  progress 35 "Validating .env requirements"
  if [[ ! -f .env ]]; then
    SELF_CHECK_ENV_STATUS="warn"
    echo -e "${YELLOW}⚠${NC} .env missing. Run ./install.sh first (or create .env manually)."
    strict_fail ".env file is required in strict self-check mode."
    return 0
  fi
  local missing=()
  for k in DATABASE_URL TRADING_SYMBOL OANDA_IS_DEMO; do
    [[ -n "$(get_env_value "$k")" ]] || missing+=("$k")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    SELF_CHECK_ENV_STATUS="warn"
    echo -e "${YELLOW}⚠${NC} Missing keys in .env: ${missing[*]}"
    strict_fail "Missing required .env keys: ${missing[*]}"
  else
    SELF_CHECK_ENV_STATUS="pass"
  fi
}

preflight_self_check() {
  $SELF_CHECK || return 0
  validate_write_permissions
  validate_env_requirements
  progress 40 "Preflight port diagnostics"
  if command -v lsof >/dev/null 2>&1 && lsof -i :"$PORT" >/dev/null 2>&1; then
    SELF_CHECK_PORT_STATUS="warn"
    echo -e "${YELLOW}⚠${NC} Port $PORT currently in use; runner will attempt cleanup."
  else
    SELF_CHECK_PORT_STATUS="pass"
  fi
}

post_start_self_check() {
  $SELF_CHECK || return 0
  progress 98 "Self-check /api/engine"
  if $DRY_RUN; then
    SELF_CHECK_ENGINE_STATUS="skipped"
    echo -e "${YELLOW}[DRY-RUN]${NC} curl -sf http://localhost:${PORT}/api/engine"
    return 0
  fi
  if ! curl -sf "http://localhost:${PORT}/api/engine" >/dev/null 2>&1; then
    SELF_CHECK_ENGINE_STATUS="warn"
    echo -e "${YELLOW}⚠${NC} /api/engine check failed after startup."
    strict_fail "/api/engine failed health validation."
  else
    SELF_CHECK_ENGINE_STATUS="pass"
    echo -e "${GREEN}✓${NC} /api/engine reachable."
  fi
}

emit_self_check_report() {
  $SELF_CHECK || return 0
  run_cmd "mkdir -p $SCRIPT_DIR/logs"
  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} write self-check report to $SELF_CHECK_REPORT"
    return 0
  fi
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat > "$SELF_CHECK_REPORT" <<JSON
{
  "timestamp_utc": "$ts",
  "strict_mode": $SELF_CHECK_STRICT,
  "dry_run": $DRY_RUN,
  "port": $PORT,
  "checks": {
    "write_permissions": "$SELF_CHECK_WRITE_STATUS",
    "env_requirements": "$SELF_CHECK_ENV_STATUS",
    "port_diagnostics": "$SELF_CHECK_PORT_STATUS",
    "oanda_connectivity": "$SELF_CHECK_OANDA_STATUS",
    "engine_endpoint": "$SELF_CHECK_ENGINE_STATUS"
  },
  "oanda": {
    "http_code": "$SELF_CHECK_OANDA_HTTP",
    "latency_ms": "$SELF_CHECK_OANDA_LATENCY_MS",
    "warn_threshold_ms": "$SELF_CHECK_OANDA_WARN_MS",
    "fail_threshold_ms": "$SELF_CHECK_OANDA_FAIL_MS"
  }
}
JSON
  echo -e "${BLUE}[INFO]${NC} Self-check report saved: $SELF_CHECK_REPORT"
}

configure_us_timezone() {
  progress 15 "Configuring US timezone"
  export TZ="$APP_TIMEZONE"
  echo -e "${BLUE}[INFO]${NC} Runtime timezone set: $APP_TIMEZONE ($(date '+%Y-%m-%d %H:%M:%S %Z'))"

  if $IS_TERMUX; then
    echo -e "${YELLOW}⚠${NC} Termux detected: system timezone change skipped (runtime TZ active)."
    return 0
  fi

  if ! command -v timedatectl >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} timedatectl unavailable. Runtime TZ applied only."
    if ! $DRY_RUN; then
      strict_fail "Unable to set system timezone (timedatectl not found)."
    fi
    return 0
  fi

  local current_tz
  current_tz="$(timedatectl show --property=Timezone --value 2>/dev/null || true)"
  if [[ "$current_tz" == "$APP_TIMEZONE" ]]; then
    echo -e "${GREEN}✓${NC} System timezone already set to $APP_TIMEZONE."
    return 0
  fi

  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} ${SUDO_CMD} timedatectl set-timezone $APP_TIMEZONE"
    return 0
  fi

  if ${SUDO_CMD:+$SUDO_CMD }timedatectl set-timezone "$APP_TIMEZONE" >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} System timezone updated to $APP_TIMEZONE."
  else
    echo -e "${YELLOW}⚠${NC} Could not change system timezone (insufficient privileges or restricted host)."
    strict_fail "Failed to set system timezone to $APP_TIMEZONE."
  fi
}

apply_phase_profile_thresholds() {
  $PHASE_TEST || return 0
  if [[ "$PHASE_CUSTOM_THRESHOLDS" == "true" ]]; then
    echo -e "${BLUE}[QUALITY]${NC} Using custom phase thresholds from environment."
    return 0
  fi
  case "$PHASE_PROFILE" in
    dev)
      PHASE_MAX_AVG_MS=1400
      PHASE_MAX_P95_MS=2600
      PHASE_MAX_MAX_MS=4000
      ;;
    staging)
      PHASE_MAX_AVG_MS=1000
      PHASE_MAX_P95_MS=1800
      PHASE_MAX_MAX_MS=3000
      ;;
    prod|production)
      PHASE_MAX_AVG_MS=800
      PHASE_MAX_P95_MS=1500
      PHASE_MAX_MAX_MS=2500
      ;;
    *)
      echo -e "${YELLOW}⚠${NC} Unknown PHASE_PROFILE='$PHASE_PROFILE'. Falling back to prod thresholds."
      PHASE_MAX_AVG_MS=800
      PHASE_MAX_P95_MS=1500
      PHASE_MAX_MAX_MS=2500
      ;;
  esac
  echo -e "${BLUE}[QUALITY]${NC} Profile=${PHASE_PROFILE} thresholds(avg/p95/max)=${PHASE_MAX_AVG_MS}/${PHASE_MAX_P95_MS}/${PHASE_MAX_MAX_MS}ms"
}

diagnose_oanda_connectivity() {
  $DIAGNOSE_OANDA || return 0
  progress 70 "Diagnosing OANDA connectivity"

  local account_id token is_demo base_url
  account_id="$(get_env_value OANDA_ACCOUNT_ID)"
  token="$(get_env_value OANDA_API_TOKEN)"
  is_demo="$(get_env_value OANDA_IS_DEMO)"
  [[ -z "$is_demo" ]] && is_demo="true"

  if [[ -z "$account_id" || -z "$token" ]]; then
    SELF_CHECK_OANDA_STATUS="skipped"
    echo -e "${YELLOW}⚠${NC} OANDA credentials missing in .env (account/token). Continuing in market-only mode."
    return 0
  fi

  if [[ "$is_demo" == "false" ]]; then
    base_url="https://api-fxtrade.oanda.com"
  else
    base_url="https://api-fxpractice.oanda.com"
  fi

  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer ***' '$base_url/v3/accounts/$account_id/summary'"
    return 0
  fi

  local code
  local response time_total latency_ms
  response=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" \
    -H "Authorization: Bearer $token" \
    "$base_url/v3/accounts/$account_id/summary" || true)
  code="$(echo "$response" | awk '{print $1}')"
  time_total="$(echo "$response" | awk '{print $2}')"
  latency_ms="$(awk -v t="${time_total:-0}" 'BEGIN { printf "%d", (t*1000) }')"
  SELF_CHECK_OANDA_HTTP="${code:-n/a}"
  SELF_CHECK_OANDA_LATENCY_MS="${latency_ms:-n/a}"

  if [[ "$code" != "200" ]]; then
    SELF_CHECK_OANDA_STATUS="warn"
    echo -e "${YELLOW}⚠${NC} OANDA diagnostic returned HTTP $code. Engine start may fail until credentials are corrected."
    strict_fail "OANDA diagnostics returned HTTP $code."
  else
    SELF_CHECK_OANDA_STATUS="pass"
    echo -e "${GREEN}✓${NC} OANDA credentials reachable (HTTP 200)."
    if [[ "${latency_ms:-0}" -ge "$SELF_CHECK_OANDA_FAIL_MS" ]]; then
      SELF_CHECK_OANDA_STATUS="warn"
      echo -e "${YELLOW}⚠${NC} OANDA latency high (${latency_ms}ms >= ${SELF_CHECK_OANDA_FAIL_MS}ms fail threshold)."
      strict_fail "OANDA latency ${latency_ms}ms exceeds fail threshold (${SELF_CHECK_OANDA_FAIL_MS}ms)."
    elif [[ "${latency_ms:-0}" -ge "$SELF_CHECK_OANDA_WARN_MS" ]]; then
      SELF_CHECK_OANDA_STATUS="warn"
      echo -e "${YELLOW}⚠${NC} OANDA latency warning (${latency_ms}ms >= ${SELF_CHECK_OANDA_WARN_MS}ms)."
    else
      echo -e "${GREEN}✓${NC} OANDA latency: ${latency_ms}ms."
    fi
  fi
}

run_phase_quality_checks() {
  $PHASE_TEST || return 0
  progress 99 "Phase quality checks"

  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} benchmark '/' and '/api/engine' (${PHASE_TEST_SAMPLES} samples)"
    return 0
  fi

  run_cmd "mkdir -p $SCRIPT_DIR/logs"
  local endpoints=("/" "/api/engine")
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local tmp_report
  tmp_report="$(mktemp)"
  {
    echo "{"
    echo "  \"timestamp_utc\": \"$ts\","
    echo "  \"profile\": \"$PHASE_PROFILE\","
    echo "  \"samples\": $PHASE_TEST_SAMPLES,"
    echo "  \"thresholds\": {"
    echo "    \"max_avg_ms\": $PHASE_MAX_AVG_MS,"
    echo "    \"max_p95_ms\": $PHASE_MAX_P95_MS,"
    echo "    \"max_max_ms\": $PHASE_MAX_MAX_MS"
    echo "  },"
    echo "  \"results\": ["
  } > "$tmp_report"

  local first=true
  local overall_status="pass"
  local score_sum=0
  local score_count=0
  for ep in "${endpoints[@]}"; do
    local values=""
    local i
    for ((i=1; i<=PHASE_TEST_SAMPLES; i++)); do
      local sec ms
      sec="$(curl -s -o /dev/null -w "%{time_total}" "http://localhost:${PORT}${ep}" || echo "0")"
      ms="$(awk -v t="$sec" 'BEGIN { printf "%d", (t*1000) }')"
      values+="${ms}"$'\n'
    done
    local avg max p95
    avg="$(echo "$values" | awk 'NF{sum+=$1; c++} END{if(c) printf "%d", sum/c; else print 0}')"
    max="$(echo "$values" | awk 'NF{if($1>m)m=$1} END{print m+0}')"
    p95="$(echo "$values" | sed '/^$/d' | sort -n | awk '{
      a[++n]=$1
    } END {
      if (n==0) { print 0; exit }
      idx=int((n*95+99)/100)
      if (idx < 1) idx=1
      if (idx > n) idx=n
      print a[idx]
    }')"
    if [[ "$first" == true ]]; then
      first=false
    else
      echo "    ," >> "$tmp_report"
    fi
    local endpoint_status="pass"
    local endpoint_score=100
    if [[ "$avg" -gt "$PHASE_MAX_AVG_MS" || "$p95" -gt "$PHASE_MAX_P95_MS" || "$max" -gt "$PHASE_MAX_MAX_MS" ]]; then
      endpoint_status="warn"
      overall_status="warn"
    fi
    [[ "$avg" -gt "$PHASE_MAX_AVG_MS" ]] && endpoint_score=$((endpoint_score-30))
    [[ "$p95" -gt "$PHASE_MAX_P95_MS" ]] && endpoint_score=$((endpoint_score-40))
    [[ "$max" -gt "$PHASE_MAX_MAX_MS" ]] && endpoint_score=$((endpoint_score-30))
    [[ "$endpoint_score" -lt 0 ]] && endpoint_score=0
    score_sum=$((score_sum + endpoint_score))
    score_count=$((score_count + 1))

    {
      echo "    {"
      echo "      \"endpoint\": \"$ep\","
      echo "      \"avg_ms\": $avg,"
      echo "      \"p95_ms\": $p95,"
      echo "      \"max_ms\": $max,"
      echo "      \"status\": \"$endpoint_status\","
      echo "      \"score\": $endpoint_score"
      echo "    }"
    } >> "$tmp_report"
    echo -e "${BLUE}[QUALITY]${NC} ${ep} avg=${avg}ms p95=${p95}ms max=${max}ms status=${endpoint_status} score=${endpoint_score}"
  done
  local overall_score=0
  if [[ "$score_count" -gt 0 ]]; then
    overall_score=$((score_sum / score_count))
  fi
  if [[ "$overall_score" -lt 85 && "$overall_status" == "pass" ]]; then
    overall_status="warn"
  fi

  {
    echo "  ],"
    echo "  \"overall_score\": $overall_score,"
    echo "  \"overall_status\": \"$overall_status\""
    echo "}"
  } >> "$tmp_report"

  mv "$tmp_report" "$SCRIPT_DIR/logs/phase-quality.json"
  echo -e "${BLUE}[INFO]${NC} Phase quality report saved: $SCRIPT_DIR/logs/phase-quality.json"
  if [[ "$overall_status" != "pass" ]]; then
    echo -e "${YELLOW}⚠${NC} Phase quality thresholds exceeded. Review logs/phase-quality.json."
    strict_fail "Phase quality checks exceeded configured thresholds."
  else
    echo -e "${GREEN}✓${NC} Phase quality checks passed (score=${overall_score}/100)."
  fi
}

start_systemd_service() {
  local svc="reco-trading.service"
  local service_path=""
  if [[ "$(id -u)" -eq 0 ]]; then
    service_path="/etc/systemd/system/$svc"
  else
    mkdir -p "$HOME/.config/systemd/user"
    service_path="$HOME/.config/systemd/user/$svc"
  fi

  cat > "$service_path" <<UNIT
[Unit]
Description=RECO Trading Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=$SCRIPT_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=TZ=$APP_TIMEZONE
ExecStart=$(command -v bun) run start
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT

  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} systemctl (enable/start) $svc"
  elif [[ "$(id -u)" -eq 0 ]]; then
    systemctl daemon-reload
    systemctl enable --now "$svc"
  else
    systemctl --user daemon-reload
    systemctl --user enable --now "$svc"
  fi

  echo -e "${GREEN}✓${NC} systemd service prepared: $svc"
}

release_port() {
  if command -v lsof >/dev/null 2>&1; then
    run_cmd "lsof -ti:$PORT | xargs -r kill -9 2>/dev/null || true"
  elif command -v fuser >/dev/null 2>&1; then
    run_cmd "fuser -k ${PORT}/tcp 2>/dev/null || true"
  fi
}

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         RECO-TRADING UNIVERSAL RUN           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo -e "${BLUE}[INFO]${NC} daemon mode requested: $DAEMON_MODE | dry-run: $DRY_RUN"

run_cmd "mkdir -p $SCRIPT_DIR/data $SCRIPT_DIR/logs"
export DATABASE_URL="file:$SCRIPT_DIR/data/reco_trading.db"

progress 10 "Checking runtime"
if ! command -v bun >/dev/null 2>&1; then
  echo -e "${RED}✗ Bun not found. Run ./install.sh first.${NC}"
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo -e "${RED}✗ curl not found. Install curl and retry.${NC}"
  exit 1
fi

configure_us_timezone
preflight_self_check

progress 25 "Installing deps if needed"
[[ -d node_modules ]] || run_cmd "bun install"

progress 45 "Preparing build"
run_cmd "rm -rf .next/lock .next/cache 2>/dev/null || true"
if [[ "$FORCE_BUILD" == true || ! -f .next/standalone/server.js ]]; then
  run_cmd "bun run build"
fi

progress 60 "Releasing port $PORT"
release_port

# Resolve auto daemon mode
if [[ "$DAEMON_MODE" == "auto" ]]; then
  if $SYSTEMD_AVAILABLE && ! $IS_TERMUX; then
    DAEMON_MODE="systemd"
  else
    DAEMON_MODE="nohup"
  fi
fi

if [[ "$DAEMON_MODE" == "systemd" ]]; then
  if $IS_TERMUX; then
    echo -e "${YELLOW}⚠${NC} Termux does not support systemd/systemctl. Falling back to nohup."
    DAEMON_MODE="nohup"
  elif ! $SYSTEMD_AVAILABLE; then
    echo -e "${YELLOW}⚠${NC} systemd unavailable on this host. Falling back to nohup."
    DAEMON_MODE="nohup"
  fi
fi

diagnose_oanda_connectivity
apply_phase_profile_thresholds

auto_engine_start() {
  [[ "$NO_ENGINE" == true ]] && return 0
  progress 95 "Starting trading engine"
  run_cmd "curl -s -X POST http://localhost:${PORT}/api/engine -H 'Content-Type: application/json' -d '{\"action\":\"start\"}' >/dev/null || true"
}

health_check() {
  local max_wait=45 waited=0
  if $DRY_RUN; then
    echo -e "${YELLOW}[DRY-RUN]${NC} Health-check loop skipped"
    return 0
  fi
  until curl -sf "http://localhost:${PORT}" >/dev/null 2>&1; do
    sleep 1
    waited=$((waited+1))
    if [[ $waited -ge $max_wait ]]; then
      echo -e "${RED}✗ Server failed to start. Check server.log${NC}"
      exit 1
    fi
  done
}

progress 75 "Starting server"
export NODE_ENV=production
export PORT

if [[ "$DAEMON_MODE" == "systemd" ]]; then
  start_systemd_service
else
  if [[ "$DAEMON_MODE" == "nohup" ]]; then
    run_cmd "nohup bun run start > server.log 2>&1 &"
  else
    run_cmd "bun run start > server.log 2>&1 &"
  fi
  if ! $DRY_RUN; then
    SERVER_PID=$!
    echo "$SERVER_PID" > .web.pid
  fi

  progress 88 "Health check"
  health_check
  auto_engine_start
  post_start_self_check
  run_phase_quality_checks
  emit_self_check_report

  progress 100 "System ready"
  echo -e "${GREEN}✓ Dashboard:${NC} http://localhost:${PORT}"
  if ! $DRY_RUN; then echo -e "${GREEN}✓ PID:${NC} $SERVER_PID"; fi
  echo -e "${BLUE}Tips:${NC} ./stop.sh | ./health-check.sh | tail -f server.log"

  if [[ "$DAEMON_MODE" == "foreground" && "$DRY_RUN" == false ]]; then
    tail -f server.log
  fi
  exit 0
fi

progress 88 "Health check"
health_check
auto_engine_start
post_start_self_check
run_phase_quality_checks
emit_self_check_report
progress 100 "System ready"
echo -e "${GREEN}✓ Dashboard:${NC} http://localhost:${PORT}"
