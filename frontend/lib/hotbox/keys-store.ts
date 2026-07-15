/**
 * Persistent key storage for Hotbox E2E encryption.
 * Supabase-backed — survives Vercel serverless cold starts.
 *
 * Table: hotbox_keys  (see migrations/002_hotbox_keys.sql)
 *   org_id   TEXT  — toadsage | etc.
 *   key_type TEXT  — 'pubkey' | 'wrapped'
 *   key_path TEXT  — memberId for pubkey; 'chatId:memberId' for wrapped
 *   payload  JSONB — { public_key } | { wk, epk, wiv }
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Singleton client (one per cold start) ────────────────────────────────────

function buildClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('[hotbox-keys] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

let _client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!_client) _client = buildClient();
  return _client;
}

// ── Startup persistence probe ─────────────────────────────────────────────────
// Runs once per cold start. Rejects if Supabase write+read-back fails, causing
// every subsequent request to fail fast with 500 rather than a silent 404.

export const persistenceProbe: Promise<void> = (async () => {
  const { error: writeErr } = await db()
    .from('hotbox_keys')
    .upsert({
      org_id: '_probe',
      key_type: 'probe',
      key_path: '_startup',
      payload: { ok: true },
      updated_at: new Date().toISOString(),
    });

  if (writeErr) {
    console.error('[hotbox-keys] STARTUP PROBE FAILED — write error:', {
      message: writeErr.message,
      code: writeErr.code,
      hint: writeErr.hint,
    });
    throw new Error(`[hotbox-keys] persistence unavailable: ${writeErr.message}`);
  }

  const { data, error: readErr } = await db()
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', '_probe')
    .eq('key_type', 'probe')
    .eq('key_path', '_startup')
    .single();

  if (readErr || !(data as { payload?: { ok?: boolean } } | null)?.payload?.ok) {
    console.error('[hotbox-keys] STARTUP PROBE FAILED — read-back error:', readErr?.message ?? 'payload missing');
    throw new Error(`[hotbox-keys] persistence read-back failed: ${readErr?.message ?? 'payload missing'}`);
  }

  console.log('[hotbox-keys] persistence probe PASS');
})();

// ── Public key ops ────────────────────────────────────────────────────────────

export async function storePublicKey(org: string, memberId: string, publicKey: string, role?: string): Promise<void> {
  const { error } = await db()
    .from('hotbox_keys')
    .upsert({
      org_id: org,
      key_type: 'pubkey',
      key_path: memberId,
      payload: role ? { public_key: publicKey, role } : { public_key: publicKey },
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[hotbox-keys] ERROR storing public key', {
      org, memberId, message: error.message, code: error.code,
    });
    throw error;
  }
}

export async function loadPublicKey(org: string, memberId: string): Promise<string | null> {
  const { data, error } = await db()
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', org)
    .eq('key_type', 'pubkey')
    .eq('key_path', memberId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[hotbox-keys] ERROR loading public key', { org, memberId, message: error.message });
      throw error;
    }
    return null;
  }

  return (data?.payload as { public_key?: string } | null)?.public_key ?? null;
}

// ── Wrapped key bundle ops ────────────────────────────────────────────────────

export interface WrappedBundle { wk: string; epk: string; wiv: string }

export async function storeWrappedBundle(
  org: string, chatId: string, memberId: string,
  wk: string, epk: string, wiv: string,
): Promise<void> {
  const { error } = await db()
    .from('hotbox_keys')
    .upsert({
      org_id: org,
      key_type: 'wrapped',
      key_path: `${chatId}:${memberId}`,
      payload: { wk, epk, wiv },
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[hotbox-keys] ERROR storing wrapped bundle', {
      org, chatId, memberId, message: error.message, code: error.code,
    });
    throw error;
  }
}

export async function loadWrappedBundle(
  org: string, chatId: string, memberId: string,
): Promise<WrappedBundle | null> {
  const { data, error } = await db()
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', org)
    .eq('key_type', 'wrapped')
    .eq('key_path', `${chatId}:${memberId}`)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[hotbox-keys] ERROR loading wrapped bundle', { org, chatId, memberId, message: error.message });
      throw error;
    }
    return null;
  }

  const p = data?.payload as WrappedBundle | null;
  if (!p?.wk || !p?.epk || !p?.wiv) return null;
  return p;
}

// ── Member discovery ──────────────────────────────────────────────────────────

export async function listRegisteredMembers(org: string): Promise<string[]> {
  const { data, error } = await db()
    .from('hotbox_keys')
    .select('key_path')
    .eq('org_id', org)
    .eq('key_type', 'pubkey');

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[hotbox-keys] ERROR listing registered members', { org, message: error.message });
      throw error;
    }
    return [];
  }

  return (data ?? []).map((r: { key_path: string }) => r.key_path);
}
