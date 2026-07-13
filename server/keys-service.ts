/**
 * hotbox-keys-service.ts
 * Server-side key management for Hotbox E2E encryption.
 * Drop into hepha-web/src/lib/hotbox/keys-service.ts
 *
 * Responsibilities:
 *   - Store/retrieve per-member X25519 public keys
 *   - Store/retrieve per-chat wrapped key bundles (wk + epk + wiv per member)
 *   - Canonical HKDF info string (locked with apollo-web 2026-07-12)
 *
 * HKDF INFO (both sides must be byte-identical):
 *   "hotbox-ck:<channelId>:<memberId>"
 *   channelId = channel_id slug (e.g. "agent-daedalus", "general")
 *   memberId  = member_id string from JWT
 *
 * All writes atomic (tmp → rename). Storage under:
 *   ~/.cortextos/<instance>/orgs/<org>/hotbox/keys/
 *     pubkeys/<memberId>.json          ← X25519 public key (base64 spki)
 *     wrapped/<channelId>/<memberId>.json  ← WrappedKeyBundle
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const INSTANCE_ID = process.env.CTX_INSTANCE_ID ?? 'default';

// --------------------------------------------------------------------------
// HKDF info string — canonical form, locked with apollo-web 2026-07-12
// Must match: new TextEncoder().encode(`hotbox-ck:${channelId}:${memberId}`)
// --------------------------------------------------------------------------

export function hkdfInfo(channelId: string, memberId: string): Buffer {
  return Buffer.from(`hotbox-ck:${channelId}:${memberId}`, 'utf8');
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface MemberPublicKey {
  member_id: string;
  public_key: string;   // base64 SPKI X25519 public key
  registered_at: string;
}

export interface WrappedKeyBundle {
  chat_id: string;       // channel_id slug
  member_id: string;
  wk: string;            // base64 — AES-GCM wrapped CK
  epk: string;           // base64 — ephemeral X25519 public key (ECIES)
  wiv: string;           // base64 — 12-byte AES-GCM wrap IV (per-bundle, required for unwrap)
  wrapped_at: string;    // ISO8601 UTC
}

export interface WrappedKeyPost {
  chatId: string;
  memberId: string;
  wk: string;
  epk: string;
  wiv: string;
}

// --------------------------------------------------------------------------
// Paths
// --------------------------------------------------------------------------

function keysRoot(org: string): string {
  return path.join(os.homedir(), '.cortextos', INSTANCE_ID, 'orgs', org, 'hotbox', 'keys');
}

function pubkeyPath(org: string, memberId: string): string {
  return path.join(keysRoot(org), 'pubkeys', `${memberId}.json`);
}

function wrappedKeyPath(org: string, channelId: string, memberId: string): string {
  return path.join(keysRoot(org), 'wrapped', channelId, `${memberId}.json`);
}

// --------------------------------------------------------------------------
// Atomic write helper
// --------------------------------------------------------------------------

function writeAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

// --------------------------------------------------------------------------
// Member public key CRUD
// --------------------------------------------------------------------------

export function storeMemberPublicKey(org: string, memberId: string, publicKey: string): void {
  const entry: MemberPublicKey = {
    member_id: memberId,
    public_key: publicKey,
    registered_at: new Date().toISOString(),
  };
  writeAtomic(pubkeyPath(org, memberId), entry);
}

export function getMemberPublicKey(org: string, memberId: string): MemberPublicKey | null {
  const p = pubkeyPath(org, memberId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as MemberPublicKey;
  } catch {
    return null;
  }
}

export function listMemberPublicKeys(org: string): MemberPublicKey[] {
  const dir = path.join(keysRoot(org), 'pubkeys');
  if (!fs.existsSync(dir)) return [];
  const keys: MemberPublicKey[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      keys.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    } catch { /* skip corrupt */ }
  }
  return keys;
}

// --------------------------------------------------------------------------
// Wrapped key bundle CRUD
// --------------------------------------------------------------------------

export function storeWrappedKey(org: string, bundle: WrappedKeyPost): void {
  const entry: WrappedKeyBundle = {
    chat_id: bundle.chatId,
    member_id: bundle.memberId,
    wk: bundle.wk,
    epk: bundle.epk,
    wiv: bundle.wiv,
    wrapped_at: new Date().toISOString(),
  };
  writeAtomic(wrappedKeyPath(org, bundle.chatId, bundle.memberId), entry);
}

export function getWrappedKey(org: string, channelId: string, memberId: string): WrappedKeyBundle | null {
  const p = wrappedKeyPath(org, channelId, memberId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as WrappedKeyBundle;
  } catch {
    return null;
  }
}

export function listWrappedKeysForChat(org: string, channelId: string): WrappedKeyBundle[] {
  const dir = path.join(keysRoot(org), 'wrapped', channelId);
  if (!fs.existsSync(dir)) return [];
  const bundles: WrappedKeyBundle[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      bundles.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    } catch { /* skip corrupt */ }
  }
  return bundles;
}

// --------------------------------------------------------------------------
// Orchestrator public key — stored separately, readable by browser
// --------------------------------------------------------------------------

export function storeOrchestratorPublicKey(org: string, publicKey: string): void {
  writeAtomic(
    path.join(keysRoot(org), 'orchestrator-pubkey.json'),
    { public_key: publicKey, registered_at: new Date().toISOString() },
  );
}

export function getOrchestratorPublicKey(org: string): string | null {
  const p = path.join(keysRoot(org), 'orchestrator-pubkey.json');
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data.public_key ?? null;
  } catch {
    return null;
  }
}
