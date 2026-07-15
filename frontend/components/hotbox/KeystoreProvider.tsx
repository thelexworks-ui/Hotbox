'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import type { AegisEnvelope, WrappedKeyBundle } from '@/lib/hotbox/types';
import { useAuth } from './AuthProvider';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG || 'toadsage';

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function bytesToB64(buf: Uint8Array | ArrayBuffer): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  arr.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

interface HotboxDBSchema {
  keypairs: { key: string; value: { id: string; publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey } };
  'chat-keys': { key: string; value: { id: string; ckBytes: ArrayBuffer; cached_at: string } };
}

// Retry pubkey registration with exponential backoff. Fire-and-forget (never blocks
// keypair generation). On all-fail, writes a localStorage pending flag so the next
// init cycle retries before proceeding — prevents permanent pubkey gaps after a 503.
async function attemptPubkeyRegistration(memberId: string, pubKeyRaw: ArrayBuffer, onSuccess?: () => void): Promise<void> {
  const pendingKey = `hotbox:pubkey-pending:${memberId}`;
  const delays = [0, 2000, 4000];
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (delays[attempt]) await new Promise<void>((r) => setTimeout(r, delays[attempt]));
    try {
      const r = await fetch('/api/hotbox/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, publicKey: bytesToB64(new Uint8Array(pubKeyRaw)) }),
      });
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
      onSuccess?.();
      localStorage.removeItem(pendingKey);
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  console.error('[keystore] pubkey registration failed after 3 attempts — setting pending flag', { memberId, lastErr });
  localStorage.setItem(pendingKey, '1');
}

async function openHotboxDB(org: string): Promise<IDBPDatabase> {
  return openDB(`hotbox-${org}`, 5, {
    upgrade(db, oldVersion) {
      if (oldVersion < 2) {
        // v0/v1→v2: initial schema or first-ever install.
        if (db.objectStoreNames.contains("keypairs"))  db.deleteObjectStore("keypairs");
        if (db.objectStoreNames.contains("chat-keys")) db.deleteObjectStore("chat-keys");
        db.createObjectStore("keypairs",  { keyPath: "id" });
        db.createObjectStore("chat-keys", { keyPath: "id" });
      }
      if (oldVersion >= 2 && oldVersion < 4) {
        // v2/v3→v4: evict chat-keys only — clears local-fallback keys written when
        // /api/hotbox/keys returned 404 (pre-Supabase migration). keypairs are X25519
        // identity keys — never evict.
        if (db.objectStoreNames.contains("chat-keys")) db.deleteObjectStore("chat-keys");
        db.createObjectStore("chat-keys", { keyPath: "id" });
      }
      if (oldVersion === 4) {
        // v4→v5: evict stale chat-keys from CK divergence (getCK race before pubkey
        // registration completed — getCK generated CK_A without Lex, Lex called
        // createChatKey again and got CK_B; messages encrypted under different keys).
        if (db.objectStoreNames.contains("chat-keys")) db.deleteObjectStore("chat-keys");
        db.createObjectStore("chat-keys", { keyPath: "id" });
      }
    },
  });
}

export interface KeystoreContextValue {
  ready: boolean;
  pubkeyReady: boolean;
  initError: string | null;
  retryInit(): void;
  myPublicKey: CryptoKey | null;
  orchestratorMode: boolean;
  keyLossAckRequired: boolean;
  acknowledgeKeyLoss(): void;
  encrypt(chatId: string, plaintext: string): Promise<AegisEnvelope>;
  decrypt(envelope: AegisEnvelope): Promise<string>;
  cacheChatKey(chatId: string, bundle: WrappedKeyBundle): Promise<void>;
  createChatKey(chatId: string, memberIds: string[]): Promise<CryptoKey>;
  loadOrchestratorKey(): Promise<void>;
}

const Ctx = createContext<KeystoreContextValue | null>(null);

export function useKeystore(): KeystoreContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useKeystore must be inside KeystoreProvider');
  return ctx;
}

export function KeystoreProvider({ children }: { children: React.ReactNode }) {
  const { memberId, ready: authReady } = useAuth();
  const [ready, setReady] = useState(false);
  const [pubkeyReady, setPubkeyReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [myPublicKey, setMyPublicKey] = useState<CryptoKey | null>(null);
  const [orchestratorMode, setOrchestratorMode] = useState(false);
  const [ackRequired, setAckRequired] = useState(false);

  const retryInit = useCallback(() => {
    setInitError(null);
    setRetryCount((n) => n + 1);
  }, []);

  const dbRef = useRef<IDBPDatabase | null>(null);
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const orchestratorPrivateKeyRef = useRef<CryptoKey | null>(null);
  const memberIdRef = useRef(memberId);

  useEffect(() => { memberIdRef.current = memberId; }, [memberId]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;

    // Key-loss ack check: first login (or cleared browser data) requires hard-dismiss modal
    if (!localStorage.getItem(`hotbox:key-ack:${memberId}`)) {
      setAckRequired(true);
    }

    (async () => {
      // X25519 feature detect -- fails on Safari <17 and older Playwright WebKit builds.
      try {
        await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
      } catch {
        if (!cancelled) setInitError('Encrypted messaging requires X25519 support. Please upgrade to Safari 17+ or use Chrome 113+.');
        return;
      }

      const db = await openHotboxDB(ORG);
      if (cancelled) return;
      dbRef.current = db;

      const safeId = memberId || 'user:local';
      const existing = await (db as IDBPDatabase<HotboxDBSchema>).get('keypairs', safeId);

      let pubKey: CryptoKey;
      let privKey: CryptoKey;

      if (!existing) {
        const kp = await crypto.subtle.generateKey(
          { name: 'X25519' },
          true,
          ['deriveKey', 'deriveBits'],
        ) as CryptoKeyPair;

        const pubKeyJwk  = await crypto.subtle.exportKey('jwk', kp.publicKey);
        const privKeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
        const pubKeyRaw  = await crypto.subtle.exportKey('raw', kp.publicKey);

        await (db as IDBPDatabase<HotboxDBSchema>).put('keypairs', { id: safeId, publicKeyJwk: pubKeyJwk, privateKeyJwk: privKeyJwk });

        // IDB write is done — fire pubkey registration independently so a POST failure
        // never blocks keypair availability. attemptPubkeyRegistration sets a pending
        // localStorage flag on all-fail so next init retries.
        void attemptPubkeyRegistration(safeId, pubKeyRaw, () => setPubkeyReady(true));

        pubKey  = await crypto.subtle.importKey('jwk', pubKeyJwk,  { name: 'X25519' }, false, []);
        privKey = await crypto.subtle.importKey('jwk', privKeyJwk, { name: 'X25519' }, false, ['deriveKey', 'deriveBits']);
      } else {
        // extractable: true on public key so exportKey('raw') works in pending retry path
        pubKey  = await crypto.subtle.importKey('jwk', existing.publicKeyJwk,  { name: 'X25519' }, true, []);
        privKey = await crypto.subtle.importKey('jwk', existing.privateKeyJwk, { name: 'X25519' }, false, ['deriveKey', 'deriveBits']);

        // Re-attempt pending pubkey registration from a prior failed session.
        if (localStorage.getItem(`hotbox:pubkey-pending:${safeId}`)) {
          crypto.subtle.exportKey('raw', pubKey).then((raw) => void attemptPubkeyRegistration(safeId, raw, () => setPubkeyReady(true)));
        } else {
          setPubkeyReady(true);
        }
      }

      if (cancelled) return;
      privateKeyRef.current = privKey;
      setMyPublicKey(pubKey);
      setReady(true);
    })().catch((err) => {
      if (!cancelled) setInitError(err instanceof Error ? err.message : 'Keystore init failed');
    });

    return () => { cancelled = true; };
  }, [authReady, memberId, retryCount]);

  // ---------- Internal: unwrap CK from a bundle ----------

  const unwrapCK = useCallback(async (
    chatId: string,
    forMemberId: string,
    privateKey: CryptoKey,
    bundle: WrappedKeyBundle,
  ): Promise<CryptoKey> => {
    const db = dbRef.current!;

    // Import ephemeral public key (raw X25519)
    const epkKey = await crypto.subtle.importKey('raw', b64ToBytes(bundle.epk), { name: 'X25519' }, false, []);

    // ECDH shared secret
    const sharedBits = await crypto.subtle.deriveBits({ name: 'X25519', public: epkKey }, privateKey, 256);

    // HKDF → wrapping key (domain-separated per chat + member per §6 canonical form)
    const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const wrapKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode(`hotbox-ck:${chatId}:${forMemberId}`),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['unwrapKey'],
    );

    // AES-GCM unwrap — wiv is the wrap-time IV (required, fixes pre-§6 missing-IV crash)
    const ck = await crypto.subtle.unwrapKey(
      'raw',
      b64ToBytes(bundle.wk),
      wrapKey,
      { name: 'AES-GCM', iv: b64ToBytes(bundle.wiv) },
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );

    const ckBytes = await crypto.subtle.exportKey('raw', ck);
    await (db as IDBPDatabase<HotboxDBSchema>).put('chat-keys', { id: chatId, ckBytes, cached_at: new Date().toISOString() });

    return crypto.subtle.importKey('raw', ckBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }, []);

  // ---------- Exposed: createChatKey — generate CK + distribute wrapped bundles ----------

  const createChatKey = useCallback(async (chatId: string, memberIds: string[]): Promise<CryptoKey> => {
    const db = dbRef.current!;

    const ck = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt', 'wrapKey'],
    ) as CryptoKey;

    const seen = new Set<string>();
    const allMembers: string[] = [];
    for (const id of [...memberIds, 'orchestrator', 'headmaster']) {
      if (!seen.has(id)) { seen.add(id); allMembers.push(id); }
    }

    await Promise.all(allMembers.map(async (targetMemberId) => {
      const res = await fetch(`/api/hotbox/keys?member=${encodeURIComponent(targetMemberId)}`);
      if (!res.ok) {
        console.warn(`[keystore] createChatKey: no pubkey for ${targetMemberId} — skipping`);
        return;
      }
      const { publicKey: pubKeyB64 } = await res.json() as { publicKey: string };

      const memberPubKey = await crypto.subtle.importKey('raw', b64ToBytes(pubKeyB64), { name: 'X25519' }, false, []);

      const ephemeral = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveKey', 'deriveBits']) as CryptoKeyPair;
      const sharedBits = await crypto.subtle.deriveBits({ name: 'X25519', public: memberPubKey }, ephemeral.privateKey, 256);

      const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
      const wrapKey = await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(32),
          info: new TextEncoder().encode(`hotbox-ck:${chatId}:${targetMemberId}`),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['wrapKey'],
      );

      const wrapIv = crypto.getRandomValues(new Uint8Array(12));
      const wkBuffer = await crypto.subtle.wrapKey('raw', ck, wrapKey, { name: 'AES-GCM', iv: wrapIv });
      const epkBytes = await crypto.subtle.exportKey('raw', ephemeral.publicKey);

      await fetch('/api/hotbox/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          memberId: targetMemberId,
          wk: bytesToB64(new Uint8Array(wkBuffer)),
          epk: bytesToB64(new Uint8Array(epkBytes)),
          wiv: bytesToB64(wrapIv),
        }),
      });
    }));

    // ck is extractable; export raw bytes for IDB (Safari compat).
    const ckBytes = await crypto.subtle.exportKey('raw', ck);
    await (db as IDBPDatabase<HotboxDBSchema>).put('chat-keys', { id: chatId, ckBytes, cached_at: new Date().toISOString() });
    return ck;
  }, []);

  // ---------- Internal: get or derive CK for a chat ----------

  const getCK = useCallback(async (chatId: string): Promise<CryptoKey> => {
    const db = dbRef.current!;
    const cached = await (db as IDBPDatabase<HotboxDBSchema>).get('chat-keys', chatId);
    if (cached) {
      return crypto.subtle.importKey('raw', cached.ckBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    const useOrch = orchestratorMode && orchestratorPrivateKeyRef.current !== null;
    const activePrivateKey = useOrch ? orchestratorPrivateKeyRef.current! : privateKeyRef.current!;
    const activeMemberId = useOrch ? 'orchestrator' : memberIdRef.current;

    const res = await fetch(`/api/hotbox/keys?chat=${encodeURIComponent(chatId)}&member=${encodeURIComponent(activeMemberId)}`);
    if (!res.ok) {
      if (res.status === 404) {
        // No wrap found — channel may predate ChannelCreateModal CK distribution (seeded
        // channels, channels created before the fix). Attempt to create + distribute a shared
        // CK for all current org members. This is LOGGED (not silent) and hard-fails if
        // distribution or the retry fetch also fails — the send surfaces the error to the user.
        console.warn(`[keystore] getCK: no wrap for ${activeMemberId} in ${chatId} — attempting createChatKey for all org members`);
        try {
          const membersRes = await fetch(`/api/hotbox/keys?type=members&org=${encodeURIComponent(ORG)}`);
          if (membersRes.ok) {
            const { members } = await membersRes.json() as { members: string[] };
            if (members.length > 0) {
              const freshCk = await createChatKey(chatId, members);
              // createChatKey returns the live CryptoKey it generated — use directly.
              // Avoids an IDB round-trip that fails on fresh-storage contexts (IDB.put may
              // not have run if the member-wrap Promise.all rejected before reaching it).
              console.info(`[keystore] getCK: createChatKey recovery succeeded for ${chatId}`);
              return freshCk;
            }
          }
        } catch (err) {
          console.error('[keystore] getCK: createChatKey recovery failed', err);
        }
      }
      throw new Error(`[keystore] no wrapped bundle for ${activeMemberId} in ${chatId} (${res.status})`);
    }
    const bundle = await res.json() as WrappedKeyBundle;

    return unwrapCK(chatId, activeMemberId, activePrivateKey, bundle);
  }, [orchestratorMode, unwrapCK, createChatKey]);

  // ---------- Exposed: encrypt ----------

  const encrypt = useCallback(async (chatId: string, plaintext: string): Promise<AegisEnvelope> => {
    const ck = await getCK(chatId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherbytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ck, new TextEncoder().encode(plaintext));
    const ct = new Uint8Array(cipherbytes);
    return {
      v: 2,
      alg: 'aes-256-gcm',
      kid: chatId,
      iv: bytesToB64(iv),
      ciphertext: bytesToB64(ct.slice(0, -16)),
      tag: bytesToB64(ct.slice(-16)),
    };
  }, [getCK]);

  // ---------- Exposed: decrypt ----------

  const decrypt = useCallback(async (envelope: AegisEnvelope): Promise<string> => {
    const ck = await getCK(envelope.kid);
    const ct = new Uint8Array(b64ToBytes(envelope.ciphertext));
    const tag = new Uint8Array(b64ToBytes(envelope.tag));
    const ctWithTag = new Uint8Array(new ArrayBuffer(ct.length + tag.length));
    ctWithTag.set(ct);
    ctWithTag.set(tag, ct.length);
    const plainbytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(envelope.iv) }, ck, ctWithTag);
    return new TextDecoder().decode(plainbytes);
  }, [getCK]);

  // ---------- Exposed: cacheChatKey — pre-warm CK cache from a received bundle ----------

  const cacheChatKey = useCallback(async (chatId: string, bundle: WrappedKeyBundle): Promise<void> => {
    const useOrch = orchestratorMode && orchestratorPrivateKeyRef.current !== null;
    const activePrivateKey = useOrch ? orchestratorPrivateKeyRef.current! : privateKeyRef.current!;
    const activeMemberId = useOrch ? 'orchestrator' : memberIdRef.current;
    await unwrapCK(chatId, activeMemberId, activePrivateKey, bundle);
  }, [orchestratorMode, unwrapCK]);

  // ---------- Exposed: loadOrchestratorKey — enable Lex's full-org read mode ----------

  const loadOrchestratorKey = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/hotbox/admin/orchestrator-key', { credentials: 'include' });
    if (!res.ok) throw new Error(`[keystore] orchestrator key fetch failed (${res.status})`);
    const { privateKey: pkB64 } = await res.json() as { privateKey: string };

    orchestratorPrivateKeyRef.current = await crypto.subtle.importKey(
      'raw',
      b64ToBytes(pkB64),
      { name: 'X25519' },
      false,
      ['deriveKey', 'deriveBits'],
    );

    const db = dbRef.current!;
    await (db as IDBPDatabase<HotboxDBSchema>).clear('chat-keys');
    setOrchestratorMode(true);
  }, []);

  // ---------- acknowledgeKeyLoss ----------

  const acknowledgeKeyLoss = useCallback(() => {
    localStorage.setItem(`hotbox:key-ack:${memberId}`, '1');
    setAckRequired(false);
  }, [memberId]);

  return (
    <Ctx.Provider value={{
      ready,
      pubkeyReady,
      initError,
      retryInit,
      myPublicKey,
      orchestratorMode,
      keyLossAckRequired: ackRequired,
      acknowledgeKeyLoss,
      encrypt,
      decrypt,
      cacheChatKey,
      createChatKey,
      loadOrchestratorKey,
    }}>
      {children}
    </Ctx.Provider>
  );
}
