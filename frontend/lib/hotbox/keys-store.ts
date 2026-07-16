/**
 * Server-held channel key storage.
 * Each channel has one AES-GCM-256 CK generated at create time.
 * Stored in hotbox_keys with key_type='ck', key_path=channelId, payload={ ck: base64 }.
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

// ── Channel key ops ───────────────────────────────────────────────────────────

export async function storeChannelKey(org: string, channelId: string, ckBase64: string): Promise<void> {
  const { error } = await db()
    .from('hotbox_keys')
    .upsert({
      org_id: org,
      key_type: 'ck',
      key_path: channelId,
      payload: { ck: ckBase64 },
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[hotbox-keys] ERROR storing channel key', { org, channelId, message: error.message });
    throw error;
  }
}

export async function storeChannelMembers(org: string, channelId: string, members: string[]): Promise<void> {
  const { error } = await db()
    .from('hotbox_keys')
    .upsert({
      org_id: org,
      key_type: 'members',
      key_path: channelId,
      payload: { members },
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[hotbox-keys] ERROR storing channel members', { org, channelId, message: error.message });
    throw error;
  }
}

export async function getChannelMembers(org: string, channelId: string): Promise<string[]> {
  const { data, error } = await db()
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', org)
    .eq('key_type', 'members')
    .eq('key_path', channelId)
    .single();
  if (error && error.code !== 'PGRST116') {
    console.error('[hotbox-keys] ERROR loading channel members', { org, channelId, message: error.message });
  }
  return (data?.payload as { members?: string[] } | null)?.members ?? [];
}

export async function addMemberToGeneral(org: string, memberId: string): Promise<void> {
  const current = await getChannelMembers(org, 'general');
  if (current.includes(memberId)) return;
  await storeChannelMembers(org, 'general', [...current, memberId]);
}

export async function hasChannelKey(org: string, channelId: string): Promise<boolean> {
  const { data } = await db()
    .from('hotbox_keys')
    .select('key_path')
    .eq('org_id', org)
    .eq('key_type', 'ck')
    .eq('key_path', channelId)
    .maybeSingle();
  return data !== null;
}

export async function loadChannelKey(org: string, channelId: string): Promise<string | null> {
  const { data, error } = await db()
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', org)
    .eq('key_type', 'ck')
    .eq('key_path', channelId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[hotbox-keys] ERROR loading channel key', { org, channelId, message: error.message });
      throw error;
    }
    return null;
  }

  return (data?.payload as { ck?: string } | null)?.ck ?? null;
}
