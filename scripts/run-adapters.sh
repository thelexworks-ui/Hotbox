#!/usr/bin/env bash
# run-adapters.sh — starts one hotbox-adapter process per agent identity.
#
# Each process uses the same adapter script but a unique HOTBOX_AGENT_ID
# and its own cursor file. All other env vars (SB creds, JWT secret, etc.)
# are inherited from the calling shell.
#
# Usage:
#   1. Set required env vars (or source your secrets file):
#        export NEXT_PUBLIC_SUPABASE_URL="https://..."
#        export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
#        export HOTBOX_JWT_SECRET="..."
#        export HOTBOX_INTERNAL_URL="https://hotbox-xxx.vercel.app"
#   2. Optionally set HOTBOX_AGENTS to override the default list:
#        export HOTBOX_AGENTS="boss hepha-web apollo"
#   3. Run: bash scripts/run-adapters.sh
#
# To stop all adapters: bash scripts/run-adapters.sh stop
# Logs:   /tmp/hotbox-adapter-{agent}.log
# PIDs:   /tmp/hotbox-adapter-{agent}.pid

set -euo pipefail

ADAPTER_SCRIPT="${ADAPTER_SCRIPT:-$(cd "$(dirname "$0")" && pwd)/hotbox-adapter.js}"
LOG_DIR="${HOTBOX_LOG_DIR:-/tmp}"

# Default agent roster — override with HOTBOX_AGENTS env var
DEFAULT_AGENTS="boss hepha-web apollo aegis asclepius hermes osiris daedalus"
AGENTS="${HOTBOX_AGENTS:-$DEFAULT_AGENTS}"

# ── stop mode ────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "stop" ]]; then
  echo "[run-adapters] stopping all adapters..."
  for AGENT in $AGENTS; do
    PID_FILE="${LOG_DIR}/hotbox-adapter-${AGENT}.pid"
    if [[ -f "$PID_FILE" ]]; then
      PID=$(cat "$PID_FILE")
      if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "[run-adapters] stopped ${AGENT} (PID ${PID})"
      else
        echo "[run-adapters] ${AGENT} PID ${PID} not running"
      fi
      rm -f "$PID_FILE"
    else
      echo "[run-adapters] no PID file for ${AGENT}"
    fi
  done
  exit 0
fi

# ── validate env ─────────────────────────────────────────────────────────────
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}"
: "${HOTBOX_JWT_SECRET:?HOTBOX_JWT_SECRET required}"
: "${HOTBOX_INTERNAL_URL:?HOTBOX_INTERNAL_URL required}"

if [[ ! -f "$ADAPTER_SCRIPT" ]]; then
  echo "[run-adapters] ERROR: adapter not found at $ADAPTER_SCRIPT" >&2
  exit 1
fi

echo "[run-adapters] starting adapters for: $AGENTS"
echo "[run-adapters] adapter: $ADAPTER_SCRIPT"
echo ""

# DM slug overrides — agents whose bus name differs from their channel slug.
# Format: "agent_id:dm_slug" entries, space-separated.
DM_SLUG_OVERRIDES="${DM_SLUG_OVERRIDES:-hepha-web:hepha}"

get_dm_slug() {
  local agent="$1"
  for entry in $DM_SLUG_OVERRIDES; do
    local key="${entry%%:*}"
    local val="${entry##*:}"
    if [[ "$key" == "$agent" ]]; then echo "$val"; return; fi
  done
  echo "$agent"
}

# ── start mode ───────────────────────────────────────────────────────────────
for AGENT in $AGENTS; do
  LOG="${LOG_DIR}/hotbox-adapter-${AGENT}.log"
  CURSOR="${LOG_DIR}/hotbox-adapter-${AGENT}-cursor.json"
  PID_FILE="${LOG_DIR}/hotbox-adapter-${AGENT}.pid"
  DM_SLUG="$(get_dm_slug "$AGENT")"

  # Kill stale process if PID file exists
  if [[ -f "$PID_FILE" ]]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[run-adapters] stopping stale ${AGENT} (PID ${OLD_PID})"
      kill "$OLD_PID" 2>/dev/null || true
      sleep 0.3
    fi
    rm -f "$PID_FILE"
  fi

  HOTBOX_AGENT_ID="$AGENT" \
  HOTBOX_DM_SLUG="$DM_SLUG" \
  HOTBOX_ADAPTER_CURSOR_FILE="$CURSOR" \
  node "$ADAPTER_SCRIPT" >> "$LOG" 2>&1 &

  PID=$!
  echo "$PID" > "$PID_FILE"
  echo "[run-adapters] ✓ ${AGENT}  DM=dm-lex-${DM_SLUG}  PID=${PID}  log=${LOG}"
done

echo ""
echo "[run-adapters] all adapters started."
echo "  Monitor: tail -f ${LOG_DIR}/hotbox-adapter-*.log"
echo "  Stop:    bash $(basename "$0") stop"
