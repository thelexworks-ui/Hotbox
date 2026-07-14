/**
 * hotbox-vault-helper.ts
 * Vault read helper for boss agent — retrieves orchestrator X25519 private key
 * at session start for CK wrapping operations.
 *
 * Vault path: secret/data/hotbox/orchestrator-master-key
 * Expected secret shape: { private_key: "<base64 raw X25519 private key>", public_key: "<base64 spki>" }
 *
 * Usage pattern (boss agent session start):
 *   const keyMaterial = await readOrchestratorKey();
 *   // ... use privateKeyBytes for CK wrapping ops ...
 *   keyMaterial.wipe(); // zero memory on session end
 *
 * Security requirements:
 *   - Key material NEVER written to disk or logged
 *   - wipe() called on session end, agent crash, or SIGTERM
 *   - Private key held in Uint8Array (not string) so wipe() can zero the buffer
 *
 * Vault access: uses VAULT_ADDR + VAULT_TOKEN env vars (or VAULT_ROLE_ID + VAULT_SECRET_ID
 * for AppRole auth). Falls back to VAULT_ROLE_ID/SECRET_ID if token is absent.
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------

const VAULT_ADDR  = process.env.VAULT_ADDR  ?? 'http://127.0.0.1:8200';
const VAULT_PATH  = 'secret/data/hotbox/orchestrator-master-key';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface OrchestratorKeyMaterial {
  privateKeyBytes: Uint8Array;  // raw X25519 private key, 32 bytes
  publicKeyBase64: string;      // base64 SPKI for registration with hepha-web
  wipe(): void;                 // zero private key bytes in memory
}

// --------------------------------------------------------------------------
// Low-level vault fetch (no external dep)
// --------------------------------------------------------------------------

async function vaultGet(vaultPath: string, token: string): Promise<unknown> {
  const url = new URL(`/v1/${vaultPath}`, VAULT_ADDR);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(
      url.toString(),
      { headers: { 'X-Vault-Token': token, 'Content-Type': 'application/json' } },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode !== 200) {
              reject(new Error(`Vault returned ${res.statusCode}: ${parsed.errors?.join(', ') ?? body}`));
              return;
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Vault response parse error: ${(e as Error).message}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(new Error('Vault request timeout')); });
  });
}

async function getVaultToken(): Promise<string> {
  // Prefer direct token
  const directToken = process.env.VAULT_TOKEN;
  if (directToken) return directToken;

  // AppRole auth fallback
  const roleId   = process.env.VAULT_ROLE_ID;
  const secretId = process.env.VAULT_SECRET_ID;
  if (!roleId || !secretId) {
    throw new Error('No vault auth: set VAULT_TOKEN or VAULT_ROLE_ID + VAULT_SECRET_ID');
  }

  const url = new URL('/v1/auth/approle/login', VAULT_ADDR);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;
  const payload = JSON.stringify({ role_id: roleId, secret_id: secretId });

  return new Promise((resolve, reject) => {
    const req = lib.request(
      url.toString(),
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { auth?: { client_token?: string }; errors?: string[] };
            const token = parsed.auth?.client_token;
            if (!token) reject(new Error(`AppRole login failed: ${parsed.errors?.join(', ') ?? body}`));
            else resolve(token);
          } catch (e) {
            reject(new Error(`AppRole login parse error: ${(e as Error).message}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(new Error('Vault auth timeout')); });
    req.write(payload);
    req.end();
  });
}

// --------------------------------------------------------------------------
// Read orchestrator master key from vault
// --------------------------------------------------------------------------

export async function readOrchestratorKey(): Promise<OrchestratorKeyMaterial> {
  const token = await getVaultToken();
  const response = await vaultGet(VAULT_PATH, token) as {
    data?: { data?: { private_key?: string; public_key?: string } };
  };

  const secret = response.data?.data;
  if (!secret?.private_key || !secret?.public_key) {
    throw new Error(
      `Vault secret at ${VAULT_PATH} missing private_key or public_key. ` +
      'Run: vault kv put secret/hotbox/orchestrator-master-key private_key=<b64> public_key=<b64>',
    );
  }

  // Decode private key into a Uint8Array so wipe() can zero it
  const privateKeyBytes = new Uint8Array(Buffer.from(secret.private_key, 'base64'));
  const publicKeyBase64 = secret.public_key;

  return {
    privateKeyBytes,
    publicKeyBase64,
    wipe() {
      // Zero the key material in memory
      privateKeyBytes.fill(0);
    },
  };
}

// --------------------------------------------------------------------------
// Wrap CK for a member — ECDH + HKDF + AES-GCM (Node.js crypto, agent-side)
//
// Called by boss agent when a new member joins a channel.
// The wrapped bundle is then POSTed to /api/hotbox/admin/orchestrator-key
// (or /api/hotbox/keys with admin password) for storage.
//
// Returns WrappedKeyPost fields (wk, epk, wiv) ready for the keys route.
// --------------------------------------------------------------------------

export interface WrapResult {
  wk:  string;   // base64 — AES-GCM wrapped CK
  epk: string;   // base64 — ephemeral X25519 public key
  wiv: string;   // base64 — 12-byte AES-GCM wrap IV
}

export async function wrapChatKeyForMember(
  ck: Uint8Array<ArrayBuffer>,              // 32-byte raw AES-256-GCM chat key
  memberPublicKeyBase64: string, // base64 SPKI X25519 public key of recipient
  channelId: string,
  memberId: string,
): Promise<WrapResult> {
  const { subtle } = globalThis.crypto ?? (await import('node:crypto')).webcrypto;

  // 1. Import recipient's public key
  const memberPubKey = await subtle.importKey(
    'spki',
    Buffer.from(memberPublicKeyBase64, 'base64'),
    { name: 'X25519' },
    false,
    [],
  );

  // 2. Generate ephemeral X25519 keypair for ECIES
  const ephemeral = (await subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveKey', 'deriveBits'],
  )) as CryptoKeyPair;

  // 3. ECDH: ephemeral private + member public → shared secret
  const sharedBits = await subtle.deriveBits(
    { name: 'X25519', public: memberPubKey },
    ephemeral.privateKey,
    256,
  );

  // 4. HKDF → AES-256-GCM wrap key
  // info string MUST match: "hotbox-ck:<channelId>:<memberId>" (locked 2026-07-12)
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const wrapKey = await subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(`hotbox-ck:${channelId}:${memberId}`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey'],
  );

  // 5. Import CK as raw AES-GCM key for wrapping
  const ckKey = await subtle.importKey(
    'raw',
    ck,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  // 6. Generate per-bundle wrap IV
  const wrapIv = (globalThis.crypto
    ? globalThis.crypto.getRandomValues(new Uint8Array(12))
    : new Uint8Array((await import('node:crypto')).randomBytes(12).buffer as ArrayBuffer)
  ) as Uint8Array<ArrayBuffer>;

  // 7. AES-GCM wrap
  const wrappedKey = await subtle.wrapKey('raw', ckKey, wrapKey, { name: 'AES-GCM', iv: wrapIv });

  // 8. Export ephemeral public key (raw X25519 point, 32 bytes)
  const epkRaw = await subtle.exportKey('raw', ephemeral.publicKey);

  return {
    wk:  Buffer.from(wrappedKey).toString('base64'),
    epk: Buffer.from(epkRaw).toString('base64'),
    wiv: Buffer.from(wrapIv).toString('base64'),
  };
}

// --------------------------------------------------------------------------
// Session-start registration helper
// Reads vault key, registers public key with hepha-web admin route, returns material.
// Call once per boss agent session. wipe() on SIGTERM / session end.
// --------------------------------------------------------------------------

export async function bootstrapOrchestratorKey(
  hephaBaseUrl: string,
  org: string,
  adminPassword: string,
): Promise<OrchestratorKeyMaterial> {
  const material = await readOrchestratorKey();

  // Register public key with hepha-web so members can encrypt CKs for orchestrator
  const res = await fetch(`${hephaBaseUrl}/api/hotbox/admin/orchestrator-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({ org, publicKey: material.publicKeyBase64 }),
  });

  if (!res.ok) {
    material.wipe();
    throw new Error(`Failed to register orchestrator public key: ${res.status} ${await res.text()}`);
  }

  return material;
}
