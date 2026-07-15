import { NextRequest, NextResponse } from 'next/server';
import { validateMasterKey } from '@/lib/hotbox/master-key';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

function buildClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE(req: NextRequest) {
  const masterRole = validateMasterKey(req.headers.get('x-master-key'));
  if (!masterRole) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Body is optional — bare DELETE with no payload clears the default set
  let bodyData: { channels?: string[]; org?: string } = {};
  try {
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      bodyData = await req.json() as { channels?: string[]; org?: string };
    }
  } catch { /* no body or non-JSON — use defaults */ }

  const org = bodyData.org ?? DEFAULT_ORG;

  // Default: clear general, alerts, and any smoke-* channels
  // Caller may pass explicit list to override
  let channels: string[] = bodyData.channels ?? [];

  const db = buildClient();

  if (channels.length === 0) {
    // Fetch all channel IDs, filter to general + alerts + smoke-*
    const { data, error } = await db
      .from('hotbox_channels')
      .select('id')
      .eq('org_id', org);

    if (error) {
      console.error('[clear-channel-keys] failed to list channels', error.message);
      return NextResponse.json({ error: 'failed to list channels' }, { status: 500 });
    }

    channels = (data ?? [])
      .map((r: { id: string }) => r.id)
      .filter((id: string) => id === 'general' || id === 'alerts' || id.startsWith('smoke-'));
  }

  if (channels.length === 0) {
    return NextResponse.json({ cleared: 0, channels: [] });
  }

  // Delete wrapped bundles for each channel: key_path starts with '<channelId>:'
  const results: { channel: string; deleted: number; error?: string }[] = [];

  for (const channelId of channels) {
    const { data, error } = await db
      .from('hotbox_keys')
      .delete()
      .eq('org_id', org)
      .eq('key_type', 'wrapped')
      .like('key_path', `${channelId}:%`)
      .select('key_path');

    if (error) {
      console.error('[clear-channel-keys] delete failed for', channelId, error.message);
      results.push({ channel: channelId, deleted: 0, error: error.message });
    } else {
      results.push({ channel: channelId, deleted: (data ?? []).length });
    }
  }

  const totalCleared = results.reduce((s, r) => s + r.deleted, 0);
  console.log('[clear-channel-keys] cleared', totalCleared, 'wrapped bundles across', channels.length, 'channels');

  return NextResponse.json({
    cleared: totalCleared,
    channels: results,
  });
}
