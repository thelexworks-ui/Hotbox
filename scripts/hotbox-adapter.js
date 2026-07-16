#!/usr/bin/env node
/**
 * hotbox-adapter — per-agent process that polls Hotbox channels this agent
 * is a member of, decrypts inbound messages, and delivers plaintext to the
 * agent's cortextos bus inbox.
 *
 * Pure Node.js CJS — no external deps. Requires Node 18+ (global fetch).
 *
 * Usage (one process per agent identity):
 *   HOTBOX_AGENT_ID=boss node /path/to/scripts/hotbox-adapter.js
 *   HOTBOX_AGENT_ID=hepha-web node /path/to/scripts/hotbox-adapter.js
 *
 * Required env:
 *   HOTBOX_AGENT_ID            — this agent's member_id (e.g. 'boss', 'hepha-web')
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (bypasses RLS)
 *   HOTBOX_JWT_SECRET          — HMAC-SHA256 key (must match Vercel deployment)
 *   HOTBOX_INTERNAL_URL        — Vercel base URL (no trailing slash)
 *
 * Optional env:
 *   HOTBOX_ORG                 — defaults to 'toadsage'
 *   HOTBOX_POLL_INTERVAL_MS    — defaults to 3000
 *   HOTBOX_MEMBER_REFRESH_MS   — how often to rediscover channels, defaults to 60000
 *   HOTBOX_ADAPTER_CURSOR_FILE — defaults to /tmp/hotbox-adapter-{AGENT_ID}-cursor.json
 *   HOTBOX_HUMAN_ID            — human member in DM channel, defaults to 'lex'
 *   HOTBOX_DM_SLUG             — override the slug used in the DM channel ID when it differs
 *                                from HOTBOX_AGENT_ID (e.g. AGENT_ID=hepha-web, DM_SLUG=hepha
 *                                → channel dm-lex-hepha). Defaults to HOTBOX_AGENT_ID.
 */

'use strict';

const { createDecipheriv, createCipheriv, randomBytes, createHmac } = require('node:crypto');
const { execSync }    = require('node:child_process');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { tmpdir }      = require('node:os');
const path            = require('node:path');

// ── Config ──────────────────────────────────────────────────────────────────
const AGENT_ID     = process.env.HOTBOX_AGENT_ID ?? '';
const ORG          = process.env.HOTBOX_ORG ?? 'toadsage';
const POLL_MS      = Number(process.env.HOTBOX_POLL_INTERVAL_MS ?? 3000);
const REFRESH_MS   = Number(process.env.HOTBOX_MEMBER_REFRESH_MS ?? 60_000);
const CURSOR_FILE  = process.env.HOTBOX_ADAPTER_CURSOR_FILE
  ?? path.join(tmpdir(), `hotbox-adapter-${AGENT_ID}-cursor.json`);
const INTERNAL_URL = (process.env.HOTBOX_INTERNAL_URL ?? '').replace(/\/$/, '');
const SB_URL       = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SB_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const JWT_SECRET   = process.env.HOTBOX_JWT_SECRET ?? '';
const HUMAN_ID     = process.env.HOTBOX_HUMAN_ID ?? 'lex';
// DM_SLUG: the slug used in the channel ID dm-{HUMAN_ID}-{DM_SLUG}.
// Agents whose bus name differs from their channel slug (e.g. hepha-web → dm-lex-hepha)
// set HOTBOX_DM_SLUG to the shorter form.
const DM_SLUG      = process.env.HOTBOX_DM_SLUG ?? AGENT_ID;

if (!AGENT_ID)    { console.error('[adapter] HOTBOX_AGENT_ID required'); process.exit(1); }
if (!SB_URL || !SB_KEY) { console.error('[adapter] NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
if (!JWT_SECRET)  { console.error('[adapter] HOTBOX_JWT_SECRET required'); process.exit(1); }
if (!INTERNAL_URL){ console.error('[adapter] HOTBOX_INTERNAL_URL required'); process.exit(1); }

// ── Cursor ──────────────────────────────────────────────────────────────────
let cursor = {};
if (existsSync(CURSOR_FILE)) {
  try { cursor = JSON.parse(readFileSync(CURSOR_FILE, 'utf8')); } catch {}
}
function saveCursor() {
  try { writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2)); } catch {}
}

// ── Supabase REST ───────────────────────────────────────────────────────────
const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

async function sbGet(table, params) {
  const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`Supabase GET ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbUpsert(table, body) {
  const headers = { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' };
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} ${res.status}: ${await res.text()}`);
  return res.status;
}

async function sbInsert(table, body) {
  const headers = { ...SB_HEADERS, Prefer: 'return=minimal' };
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) throw new Error(`Supabase INSERT ${table} ${res.status}: ${await res.text()}`);
  return res.status;
}

// ── Crypto ──────────────────────────────────────────────────────────────────
function decryptEnvelope(ckBase64, envelope) {
  const key        = Buffer.from(ckBase64, 'base64');
  const iv         = Buffer.from(envelope.iv, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const tag        = Buffer.from(envelope.tag, 'base64');
  const decipher   = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeAgentJwt() {
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url('{"alg":"HS256","typ":"JWT"}');
  const pld = b64url(JSON.stringify({ sub: AGENT_ID, role: 'agent', agent_id: AGENT_ID, org: ORG, iat: now, exp: now + 3600 }));
  const sig = createHmac('sha256', JWT_SECRET).update(`${hdr}.${pld}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${hdr}.${pld}.${sig}`;
}

// ── Channel key cache ───────────────────────────────────────────────────────
const ckCache = Object.create(null);

async function loadCK(channelId) {
  if (ckCache[channelId]) return ckCache[channelId];
  const rows = await sbGet('hotbox_keys', {
    select: 'payload',
    org_id: `eq.${ORG}`,
    key_type: 'eq.ck',
    key_path: `eq.${channelId}`,
    limit: '1',
  });
  if (!rows.length || !rows[0]?.payload?.ck) return null;
  ckCache[channelId] = rows[0].payload.ck;
  return ckCache[channelId];
}

// ── Member discovery ────────────────────────────────────────────────────────
// discoveredChannels is the authoritative set of channels this adapter should poll.
let discoveredChannels = new Set();

async function refreshMembership() {
  const rows = await sbGet('hotbox_keys', {
    select: 'key_path,payload',
    org_id: `eq.${ORG}`,
    key_type: 'eq.members',
  });

  const next = new Set();
  for (const row of rows) {
    const members = Array.isArray(row.payload?.members) ? row.payload.members : [];
    if (members.includes(AGENT_ID)) next.add(row.key_path);
  }

  const added   = [...next].filter((c) => !discoveredChannels.has(c));
  const removed = [...discoveredChannels].filter((c) => !next.has(c));
  discoveredChannels = next;

  if (added.length || removed.length) {
    console.log(`[adapter:${AGENT_ID}] membership change — +[${added.join(',')}] -[${removed.join(',')}]`);
  }
  console.log(`[adapter:${AGENT_ID}] channels: ${[...next].join(', ') || '(none)'}`);
}

// ── DM channel bootstrap ────────────────────────────────────────────────────
async function bootstrapMyDmChannel() {
  const channelId = `dm-${HUMAN_ID}-${DM_SLUG}`;

  // Ensure channel row exists
  const existing = await sbGet('hotbox_channels', {
    select: 'id',
    id: `eq.${channelId}`,
    org_id: `eq.${ORG}`,
  });

  if (!existing.length) {
    console.log(`[adapter:${AGENT_ID}] creating channel ${channelId}`);
    await sbInsert('hotbox_channels', {
      id: channelId, org_id: ORG,
      name: `#${channelId}`, type: 'dm',
      pinned: false, topic: `DM with ${AGENT_ID}`,
      created_at: new Date().toISOString(),
    });
  }

  // Ensure CK exists
  const ckRows = await sbGet('hotbox_keys', {
    select: 'payload',
    org_id: `eq.${ORG}`,
    key_type: 'eq.ck',
    key_path: `eq.${channelId}`,
    limit: '1',
  });
  if (!ckRows.length || !ckRows[0]?.payload?.ck) {
    const ck = randomBytes(32).toString('base64');
    await sbUpsert('hotbox_keys', {
      org_id: ORG, key_type: 'ck', key_path: channelId,
      payload: { ck }, updated_at: new Date().toISOString(),
    });
  }

  // Ensure member record — write if missing or incomplete
  const memberRows = await sbGet('hotbox_keys', {
    select: 'payload',
    org_id: `eq.${ORG}`,
    key_type: 'eq.members',
    key_path: `eq.${channelId}`,
    limit: '1',
  });
  const existing_members = memberRows[0]?.payload?.members ?? [];
  if (!existing_members.includes(AGENT_ID) || !existing_members.includes(HUMAN_ID)) {
    const merged = Array.from(new Set([...existing_members, HUMAN_ID, AGENT_ID]));
    await sbUpsert('hotbox_keys', {
      org_id: ORG, key_type: 'members', key_path: channelId,
      payload: { members: merged }, updated_at: new Date().toISOString(),
    });
    console.log(`[adapter:${AGENT_ID}] member record for ${channelId}: [${merged.join(', ')}]`);
  }

  console.log(`[adapter:${AGENT_ID}] DM channel ${channelId} ready`);
}

// ── Polling ─────────────────────────────────────────────────────────────────
async function pollChannel(channelId) {
  const params = {
    select: 'payload,created_at',
    org_id: `eq.${ORG}`,
    channel_id: `eq.${channelId}`,
    order: 'created_at.asc',
    limit: '50',
  };
  const since = cursor[channelId];
  if (since) params.created_at = `gt.${since}`;

  const rows = await sbGet('hotbox_messages', params);
  if (!rows.length) return;

  const ck = await loadCK(channelId);
  if (!ck) { console.warn(`[adapter:${AGENT_ID}] no CK for ${channelId} — skipping`); return; }

  let lastTs = null;
  for (const row of rows) {
    const msg = row.payload;
    lastTs = row.created_at;

    if (msg.type !== 'message' || !msg.crypto_envelope) continue;
    // Skip own messages and system messages
    if (msg.sender_id === AGENT_ID || msg.sender_id === 'system') continue;

    let plaintext;
    try {
      plaintext = decryptEnvelope(ck, msg.crypto_envelope);
    } catch (err) {
      console.error(`[adapter:${AGENT_ID}] decrypt failed msg ${msg.id}:`, err.message);
      continue;
    }

    const busMsg = `[Hotbox from ${msg.sender_id} in #${channelId}]\n${plaintext}`;
    try {
      execSync(`cortextos bus send-message ${AGENT_ID} normal ${JSON.stringify(busMsg)}`, { stdio: 'pipe' });
      console.log(`[adapter:${AGENT_ID}] → bus: "${plaintext.slice(0, 80)}"`);
    } catch (err) {
      console.error(`[adapter:${AGENT_ID}] bus delivery failed:`, err.message);
    }
  }

  if (lastTs) {
    cursor[channelId] = lastTs;
    saveCursor();
  }
}

async function poll() {
  const channels = [...discoveredChannels];
  const results = await Promise.allSettled(channels.map((ch) => pollChannel(ch)));
  for (const r of results) {
    if (r.status === 'rejected') console.error(`[adapter:${AGENT_ID}] poll error:`, r.reason?.message);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`[adapter:${AGENT_ID}] starting — org=${ORG} poll=${POLL_MS}ms refresh=${REFRESH_MS}ms`);
console.log(`[adapter:${AGENT_ID}] cursor file: ${CURSOR_FILE}`);

(async () => {
  await bootstrapMyDmChannel();
  await refreshMembership();

  // Periodic membership refresh to pick up new channels created in UI
  setInterval(
    () => refreshMembership().catch((e) => console.error(`[adapter:${AGENT_ID}] refresh error:`, e.message)),
    REFRESH_MS,
  );

  console.log(`[adapter:${AGENT_ID}] ready — polling ${discoveredChannels.size} channel(s)`);
  await poll();
  setInterval(
    () => poll().catch((e) => console.error(`[adapter:${AGENT_ID}] poll error:`, e.message)),
    POLL_MS,
  );
})().catch((err) => {
  console.error(`[adapter:${AGENT_ID}] fatal startup error:`, err);
  process.exit(1);
});
