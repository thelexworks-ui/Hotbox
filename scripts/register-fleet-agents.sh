#!/usr/bin/env bash
# register-fleet-agents.sh — register X25519 pubkeys for all fleet agents in hotbox_keys
# Run on cortextos start (or manually). Idempotent — skips agents already registered.
#
# Required env vars:
#   HOTBOX_API_URL        e.g. https://hotbox-thelexworks-uis-projects.vercel.app
#   ORCHESTRATOR_MASTER_KEY   32-byte hex master key
#   HOTBOX_ORG            org slug (default: toadsage)
#   CTX_IPC_SOCKET        cortextos daemon IPC path (for agent list)
#   CTX_INSTANCE_ID       cortextos instance ID
#
# Optional: set AGENT_KEY_DIR to override where private keys are stored.
# Default: ~/.cortextos/<instance>/orgs/<org>/agents/<agent>/hotbox-priv.b64

set -euo pipefail

API="${HOTBOX_API_URL:-https://hotbox-thelexworks-uis-projects.vercel.app}"
MASTER_KEY="${ORCHESTRATOR_MASTER_KEY:?ORCHESTRATOR_MASTER_KEY is required}"
ORG="${HOTBOX_ORG:-toadsage}"
INSTANCE="${CTX_INSTANCE_ID:-default}"
KEY_BASE="${AGENT_KEY_DIR:-$HOME/.cortextos/$INSTANCE/orgs/$ORG/agents}"

# Get agent list from cortextos bus
AGENTS=$(cortextos bus list-agents --format json 2>/dev/null | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    name = a.get('name','')
    if name and not name.startswith('_'):
        print(name)
" 2>/dev/null) || AGENTS=""

if [[ -z "$AGENTS" ]]; then
  echo "[register-fleet-agents] no agents found via list-agents, exiting"
  exit 0
fi

registered=0
skipped=0
failed=0

while IFS= read -r agent; do
  [[ -z "$agent" ]] && continue

  # Check if already registered
  status=$(curl -sf -o /dev/null -w "%{http_code}" \
    "$API/api/hotbox/keys?member=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$agent")&org=$ORG" \
    -H "x-master-key: $MASTER_KEY" 2>/dev/null) || status="000"

  if [[ "$status" == "200" ]]; then
    echo "[register-fleet-agents] $agent: already registered (skipping)"
    ((skipped++)) || true
    continue
  fi

  # Generate X25519 keypair via node webcrypto
  KEY_JSON=$(node -e "
const { webcrypto: { subtle } } = require('crypto');
(async () => {
  const kp = await subtle.generateKey({ name: 'X25519' }, true, ['deriveKey', 'deriveBits']);
  const pub = Buffer.from(await subtle.exportKey('raw', kp.publicKey)).toString('base64');
  const jwk = await subtle.exportKey('jwk', kp.privateKey);
  const priv = Buffer.from(jwk.d, 'base64url').toString('base64');
  process.stdout.write(JSON.stringify({ pub, priv }));
})();
" 2>/dev/null) || { echo "[register-fleet-agents] $agent: keygen failed"; ((failed++)) || true; continue; }

  PUB=$(echo "$KEY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['pub'])")
  PRIV=$(echo "$KEY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['priv'])")

  # Store private key to agent state dir
  KEY_DIR="$KEY_BASE/$agent"
  mkdir -p "$KEY_DIR"
  echo "$PRIV" > "$KEY_DIR/hotbox-priv.b64"
  chmod 600 "$KEY_DIR/hotbox-priv.b64"

  # Register public key via master-key bypass
  RESP=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST "$API/api/hotbox/keys" \
    -H "Content-Type: application/json" \
    -H "x-master-key: $MASTER_KEY" \
    -d "{\"memberId\":\"$agent\",\"publicKey\":\"$PUB\",\"role\":\"agent\",\"org\":\"$ORG\"}" \
    2>/dev/null) || RESP="000"

  if [[ "$RESP" == "200" ]]; then
    echo "[register-fleet-agents] $agent: registered (pubkey stored, privkey -> $KEY_DIR/hotbox-priv.b64)"
    ((registered++)) || true
  else
    echo "[register-fleet-agents] $agent: POST failed (HTTP $RESP)"
    ((failed++)) || true
  fi

done <<< "$AGENTS"

echo "[register-fleet-agents] done — registered=$registered skipped=$skipped failed=$failed"
