#!/usr/bin/env bash
# send-hotbox.sh — send a plaintext message to a Hotbox channel as an agent.
# Pure bash + openssl — no npm deps required.
#
# Usage: bash send-hotbox.sh <channel_id> '<message>'
#   e.g. bash send-hotbox.sh dm-lex-boss 'Got it. Working on it now.'
#
# Required env (set before calling):
#   HOTBOX_INTERNAL_URL   — Vercel deployment base URL (no trailing slash)
#   HOTBOX_JWT_SECRET     — HMAC-SHA256 key for HS256 JWT signing
#   HOTBOX_AGENT_ID       — this agent's member_id (e.g. 'boss')
#   HOTBOX_ORG            — defaults to 'toadsage'

set -euo pipefail

CHANNEL_ID="${1:?Usage: send-hotbox.sh <channel_id> '<message>'}"
PLAINTEXT="${2:?Usage: send-hotbox.sh <channel_id> '<message>'}"

INTERNAL_URL="${HOTBOX_INTERNAL_URL:?HOTBOX_INTERNAL_URL not set}"
JWT_SECRET="${HOTBOX_JWT_SECRET:?HOTBOX_JWT_SECRET not set}"
AGENT_ID="${HOTBOX_AGENT_ID:?HOTBOX_AGENT_ID not set}"
ORG="${HOTBOX_ORG:-toadsage}"

# Build HS256 JWT using openssl (available everywhere Node is)
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

NOW=$(date +%s)
EXP=$((NOW + 3600))

HEADER=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
PAYLOAD=$(printf '{"sub":"%s","role":"agent","agent_id":"%s","org":"%s","iat":%d,"exp":%d}' \
  "$AGENT_ID" "$AGENT_ID" "$ORG" "$NOW" "$EXP" | b64url)

SIG=$(printf '%s.%s' "$HEADER" "$PAYLOAD" \
  | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)

JWT="${HEADER}.${PAYLOAD}.${SIG}"

# Escape plaintext for JSON
JSON_BODY=$(node -e "process.stdout.write(JSON.stringify({channel_id:process.argv[1],plaintext:process.argv[2],org:process.argv[3]}))" \
  "$CHANNEL_ID" "$PLAINTEXT" "$ORG")

RESPONSE=$(curl -sf -w "\n%{http_code}" -X POST "${INTERNAL_URL}/api/hotbox/internal/agent-send" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [[ "$HTTP_CODE" == "201" ]]; then
  echo "[send-hotbox] OK — $BODY"
else
  echo "[send-hotbox] ERROR HTTP $HTTP_CODE — $BODY" >&2
  exit 1
fi
