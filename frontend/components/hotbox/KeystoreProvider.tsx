'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import type { AegisEnvelope, WrappedKeyBundle } from '@/lib/hotbox/types';
import { useAuth } from './AuthProvider';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG ?? 'toadsage';

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
  keypairs: { key: string; value: { id: string; publicKey: CryptoKey; privateKey: CryptoKey } };
  'chat-keys': { key: string; value: { id: string; ck: CryptoKey; cached_at: string } };
}

async function openHotboxDB(org: string): Promise<IDBPDatabase> {
  return openDB(`hotbox-${org}`, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('keypairs'))  db.createObjectStore('keypairs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chat-keys')) db.createObjectStore('chat-keys', { keyPath: 'id' });
    },
  });
}

export interface KeystoreContextValue {
  ready: boolean;
  initError: string | null;
  retryInit(): void;
  myPublicKey: CryptoKey | null;
  orchestratorMode: boolean;
  keyLossAckRequired: boolean;
  acknowledgeKeyLoss(): void;
  encrypt(chatId: string, plaintext: string): Promise<AegisEnvelope>;
  decrypt(envelope: AegisEnvelope): Promise<string>;
  cacheChatKey(chatId: string, bundle: WrappedKeyBundle): Promise<void>;
  createChatKey(chatId: string, memberIds: string[]): Promise<void>;
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
      const db = await openHotboxDB(ORG);
      if (cancelled) return;
      dbRef.current = db;

      const safeId = memberId || 'user:local';
      let existing = await (db as IDBPDatabase<HotboxDBSchema>).get('keypairs', safeId);

      if (!existing) {
        const kp = await crypto.subtle.generateKey(
          { name: 'X25519' },
          false,
          ['deriveKey', 'deriveBits'],
        ) as CryptoKeyPair;

        const pubKeyRaw = await crypto.subtle.exportKey('raw', kp.publicKey);
        existing = { id: safeId, publicKey: kp.publicKey, privateKey: kp.privateKey };
        await (db as IDBPDatabase<HotboxDBSchema>).put('keypairs', existing);

        try {
          await fetch('/api/hotbox/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId, publicKey: bytesToB64(new Uint8Array(pubKeyRaw)) }),
          });
        } catch { /* non-fatal — key registered on next load */ }
      }

      if (cancelled) return;
      privateKeyRef.current = existing.privateKey;
      setMyPublicKey(existing.publicKey);
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
      false,
      ['encrypt', 'decrypt'],
    );

    await (db as IDBPDatabase<HotboxDBSchema>).put('chat-keys', { id: chatId, ck, cached_at: new Date().toISOString() });
    return ck;
  }, []);

  // ---------- Internal: get or derive CK for a chat ----------

  const getCK = useCallback(async (chatId: string): Promise<CryptoKey> => {
    const db = dbRef.current!;
    const cached = await (db as IDBPDatabase<HotboxDBSchema>).get('chat-keys', chatId);
    if (cached) return cached.ck;

    const useOrch = orchestratorMode && orchestratorPrivateKeyRef.current !== null;
    const activePrivateKey = useOrch ? orchestratorPrivateKeyRef.current! : privateKeyRef.current!;
    const activeMemberId = useOrch ? 'orchestrator' : memberIdRef.current;

    const res = await fetch(`/api/hotbox/keys?chat=${encodeURIComponent(chatId)}&member=${encodeURIComponent(activeMemberId)}`);
    if (!res.ok) throw new Error(`[keystore] no wrapped key for ${activeMemberId} in chat ${chatId}`);
    const bundle = await res.json() as WrappedKeyBundle;

    return unwrapCK(chatId, activeMemberId, activePrivateKey, bundle);
  }, [orchestratorMode, unwrapCK]);

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

  // ---------- Exposed: createChatKey — generate CK + distribute wrapped bundles ----------

  const createChatKey = useCallback(async (chatId: string, memberIds: string[]): Promise<void> => {
    const db = dbRef.current!;

    const ck = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt', 'wrapKey'],
    ) as CryptoKey;

    const seen = new Set<string>();
    const allMembers: string[] = [];
    for (const id of [...memberIds, 'orchestrator']) {
      if (!seen.has(id)) { seen.add(id); allMembers.push(id); }
    }

    for (const targetMemberId of allMembers) {
      const res = await fetch(`/api/hotbox/keys?member=${encodeURIComponent(targetMemberId)}`);
      if (!res.ok) {
        console.warn(`[keystore] createChatKey: no pubkey for ${targetMemberId} — skipping`);
        continue;
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
    }

    // Cache CK for the creator immediately — avoid self-round-trip
    await (db as IDBPDatabase<HotboxDBSchema>).put('chat-keys', { id: chatId, ck, cached_at: new Date().toISOString() });
  }, []);

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
