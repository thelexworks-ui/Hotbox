'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import type { AegisEnvelope } from '@/lib/hotbox/types';

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
  'chat-keys': { key: string; value: { id: string; ckBytes: ArrayBuffer; cached_at: string } };
}

async function openHotboxDB(org: string): Promise<IDBPDatabase> {
  return openDB(`hotbox-${org}`, 6, {
    upgrade(db) {
      // v6: wipe everything — keypairs evicted, chat-keys cleared (ceremony removed;
      // server now holds all CKs; local IDB is session cache only).
      if (db.objectStoreNames.contains('keypairs'))  db.deleteObjectStore('keypairs');
      if (db.objectStoreNames.contains('chat-keys')) db.deleteObjectStore('chat-keys');
      db.createObjectStore('chat-keys', { keyPath: 'id' });
    },
  });
}

export interface KeystoreContextValue {
  ready: boolean;
  encrypt(chatId: string, plaintext: string): Promise<AegisEnvelope>;
  decrypt(envelope: AegisEnvelope): Promise<string>;
  evictCK(chatId: string): Promise<void>;
}

const Ctx = createContext<KeystoreContextValue | null>(null);

export function useKeystore(): KeystoreContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useKeystore must be inside KeystoreProvider');
  return ctx;
}

export function KeystoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const dbRef = useRef<IDBPDatabase | null>(null);

  useEffect(() => {
    openHotboxDB(ORG).then((db) => {
      dbRef.current = db;
      setReady(true);
    }).catch((err) => {
      console.error('[keystore] IDB open failed', err);
    });
  }, []);

  // ---------- Internal: fetch CK from server, cache in IDB ----------

  const getCK = useCallback(async (chatId: string, caller: 'encrypt' | 'decrypt' | 'evict-retry' = 'decrypt'): Promise<CryptoKey> => {
    console.log(`[keystore:getCK:enter] caller=${caller} kid=${chatId} db_ready=${!!dbRef.current}`);
    const db = dbRef.current!;
    const t0 = Date.now();
    const cached = await (db as IDBPDatabase<HotboxDBSchema>).get('chat-keys', chatId);
    if (cached) {
      console.log(`[keystore:getCK] caller=${caller} kid=${chatId} source=idb t=${t0}`);
      return crypto.subtle.importKey('raw', cached.ckBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    const res = await fetch(`/api/hotbox/keys?chat=${encodeURIComponent(chatId)}&org=${encodeURIComponent(ORG)}`);
    if (!res.ok) throw new Error(`[keystore] no CK for channel ${chatId} (${res.status})`);
    const { ck } = await res.json() as { ck: string };

    const ckBytes = b64ToBytes(ck);
    // Log first 8 chars of raw b64 as a fingerprint to detect server-vs-IDB divergence
    console.log(`[keystore:getCK] caller=${caller} kid=${chatId} source=server ck_fp=${ck.slice(0, 8)} t=${t0} fetch_ms=${Date.now() - t0}`);
    await (db as IDBPDatabase<HotboxDBSchema>).put('chat-keys', { id: chatId, ckBytes, cached_at: new Date().toISOString() });
    return crypto.subtle.importKey('raw', ckBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }, []);

  // ---------- Exposed: evictCK — called by KeyRotationWatcher on key.rotated ----------

  const evictCK = useCallback(async (chatId: string): Promise<void> => {
    const db = dbRef.current;
    if (!db) return;
    await (db as IDBPDatabase<HotboxDBSchema>).delete('chat-keys', chatId);
  }, []);

  // ---------- Exposed: encrypt ----------

  const encrypt = useCallback(async (chatId: string, plaintext: string): Promise<AegisEnvelope> => {
    const ck = await getCK(chatId, 'encrypt');
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
    const ck = await getCK(envelope.kid, 'decrypt');
    const ct = new Uint8Array(b64ToBytes(envelope.ciphertext));
    const tag = new Uint8Array(b64ToBytes(envelope.tag));
    const ctWithTag = new Uint8Array(new ArrayBuffer(ct.length + tag.length));
    ctWithTag.set(ct);
    ctWithTag.set(tag, ct.length);
    const plainbytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(envelope.iv) }, ck, ctWithTag);
    return new TextDecoder().decode(plainbytes);
  }, [getCK]);

  return (
    <Ctx.Provider value={{ ready, encrypt, decrypt, evictCK }}>
      {children}
    </Ctx.Provider>
  );
}
