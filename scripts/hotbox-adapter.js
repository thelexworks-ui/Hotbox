#!/usr/bin/env node
/**
 * hotbox-adapter — polls Hotbox DM channels, decrypts inbound messages,
 * and delivers plaintext to each agent's cortextos bus inbox.
 *
 * Pure Node.js CJS — no external deps. Requires Node 18+ (global fetch).
 *
 * Usage (from any directory, with env vars set):
 *   node /path/to/scripts/hotbox-adapter.js
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — service role key (bypasses RLS)
 *   HOTBOX_JWT_SECRET           — HMAC-SHA256 key (must match Vercel deployment)
 *   HOTBOX_INTERNAL_URL         — Vercel base URL (no trailing slash)
 *
 * Optional env:
 *   HOTBOX_ORG                  — defaults to 'toadsage'
 *   HOTBOX_POLL_INTERVAL_MS     — defaults to 3000
 *   HOTBOX_ADAPTER_CURSOR_FILE  — defaults to /tmp/hotbox-adapter-cursor.json
 */

'use strict';

const { createDecipheriv, createCipheriv, randomBytes, createHmac } = require('node:crypto');
const { execSync }    = require('node:child_process');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { tmpdir }      = require('node:os');
const path            = require('node:path');

const ORG          = process.env.HOTBOX_ORG ?? 'toadsage';
const POLL_MS      = Number(process.env.HOTBOX_POLL_INTERVAL_MS ?? 3000);
const CURSOR_FILE  = process.env.HOTBOX_ADAPTER_CURSOR_FILE ?? path.join(tmpdir(), 'hotbox-adapter-cursor.json');
const INTERNAL_URL = (process.env.HOTBOX_INTERNAL_URL ?? '').replace(/\/$/, '');
const SB_URL       = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SB_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const JWT_SECRET   = process.env.HOTBOX_JWT_SECRET ?? '';

if (!SB_URL || !SB_KEY) { console.error('[adapter] NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
if (!JWT_SECRET)         { console.error('[adapter] HOTBOX_JWT_SECRET required'); process.exit(1); }
if (!INTERNAL_URL)       { console.error('[adapter] HOTBOX_INTERNAL_URL required (e.g. https://hotbox-xxx.vercel.app)'); process.exit(1); }

// ── Channel → agent routing ─────────────────────────────────────────────────
// Extend as agents are onboarded. dm-{human_slug}-{agent_slug} → agent bus name
const CHANNEL_AGENTS = {
  'dm-lex-boss':      'boss',
  'dm-lex-hepha':     'hepha-web',
  'dm-lex-apollo':    'apollo',
  'dm-lex-aegis':     'aegis',
  'dm-lex-asclepius': 'asclepius',
  'dm-lex-hermes':    'hermes',
  'dm-lex-osiris':    'osiris',
  'dm-lex-daedalus':  'daedalus',
};

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
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`Supabase GET ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, body, prefer) {
  const headers = { ...SB_HEADERS };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) throw new Error(`Supabase POST ${table} ${res.status}: ${await res.text()}`);
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

function makeAgentJwt(agentId) {
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url('{"alg":"HS256","typ":"JWT"}');
  const pld = b64url(JSON.stringify({ sub: agentId, role: 'agent', agent_id: agentId, org: ORG, iat: now, exp: now + 3600 }));
  const sig = createHmac('sha256', JWT_SECRET).update(`${hdr}.${pld}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${hdr}.${pld}.${sig}`;
}

// ── Channel bootstrap ───────────────────────────────────────────────────────
async function ensureChannel(channelId, agentName) {
  const rows = await sbGet('hotbox_channels', { select: 'id', 'id': `eq.${channelId}`, org_id: `eq.${ORG}` });
  if (rows.length > 0) { return; }

  console.log(`[adapter] creating channel ${channelId}`);
  await sbPost('hotbox_channels', {
    id: channelId, org_id: ORG, name: `#${channelId}`, type: 'dm',
    pinned: false, topic: `DM with ${agentName}`, created_at: new Date().toISOString(),
  }, 'return=minimal');

  const ck = randomBytes(32).toString('base64');
  await sbPost('hotbox_keys', {
    org_id: ORG, key_type: 'ck', key_path: channelId,
    payload: { ck }, updated_at: new Date().toISOString(),
  }, 'resolution=merge-duplicates,return=minimal');

  console.log(`[adapter] channel ${channelId} ready`);
}

// ── Polling ─────────────────────────────────────────────────────────────────
const ckCache = Object.create(null);

async function loadCK(channelId) {
  if (ckCache[channelId]) return ckCache[channelId];
  const rows = await sbGet('hotbox_keys', {
    select: 'payload', org_id: `eq.${ORG}`, key_type: 'eq.ck', key_path: `eq.${channelId}`, limit: '1',
  });
  if (!rows.length || !rows[0]?.payload?.ck) return null;
  ckCache[channelId] = rows[0].payload.ck;
  return ckCache[channelId];
}

async function pollChannel(channelId, agentName) {
  const since = cursor[channelId];
  const params = { select: 'payload,created_at', org_id: `eq.${ORG}`, channel_id: `eq.${channelId}`, order: 'created_at.asc', limit: '50' };
  if (since) params.created_at = `gt.${since}`;

  const rows = await sbGet('hotbox_messages', params);
  if (!rows.length) return;

  const ck = await loadCK(channelId);
  if (!ck) { console.warn(`[adapter] no CK for ${channelId} — skipping`); return; }

  let lastTs = null;
  for (const row of rows) {
    const msg = row.payload;
    lastTs = row.created_at;

    if (msg.type !== 'message' || !msg.crypto_envelope) continue;
    if (msg.sender_id === agentName || msg.sender_id === 'system') continue;

    let plaintext;
    try {
      plaintext = decryptEnvelope(ck, msg.crypto_envelope);
    } catch (err) {
      console.error(`[adapter] decrypt failed msg ${msg.id}:`, err.message);
      continue;
    }

    const busMsg = `[Hotbox DM from ${msg.sender_id} in #${channelId}]\n${plaintext}`;
    try {
      execSync(`cortextos bus send-message ${agentName} normal ${JSON.stringify(busMsg)}`, { stdio: 'pipe' });
      console.log(`[adapter] → ${agentName}: ${plaintext.slice(0, 80)}`);
    } catch (err) {
      console.error(`[adapter] bus delivery to ${agentName} failed:`, err.message);
    }
  }

  if (lastTs) {
    cursor[channelId] = lastTs;
    saveCursor();
  }
}

async function poll() {
  const results = await Promise.allSettled(
    Object.entries(CHANNEL_AGENTS).map(([ch, agent]) => pollChannel(ch, agent))
  );
  for (const r of results) {
    if (r.status === 'rejected') console.error('[adapter] poll error:', r.reason?.message);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log('[adapter] starting — channels:', Object.keys(CHANNEL_AGENTS).join(', '));
console.log('[adapter] cursor file:', CURSOR_FILE);

(async () => {
  for (const [ch, agent] of Object.entries(CHANNEL_AGENTS)) {
    await ensureChannel(ch, agent);
  }
  console.log('[adapter] bootstrap complete, polling every', POLL_MS, 'ms');
  await poll();
  setInterval(() => poll().catch((e) => console.error('[adapter] poll error:', e.message)), POLL_MS);
})().catch((err) => { console.error('[adapter] fatal startup error:', err); process.exit(1); });
