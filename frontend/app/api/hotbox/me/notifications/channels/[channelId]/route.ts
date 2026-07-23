import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

interface ChannelOverride {
  channelId: string;
  channelName: string;
  muted: boolean;
  muteUntil?: string;
}

interface StoredPrefs {
  channelOverrides?: ChannelOverride[];
  [key: string]: unknown;
}

function extractToken(req: NextRequest): string | null {
  const cookie = req.cookies.get('hx_access')?.value;
  if (cookie) return cookie;
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// PATCH /api/hotbox/me/notifications/channels/:channelId
// Body: { muted: boolean, muteUntil?: string, channelName?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { channelId: string } },
) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { muted?: boolean; muteUntil?: string; channelName?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { channelId } = params;

  const { data: existing } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', claims.org)
    .eq('key_type', 'notification_prefs')
    .eq('key_path', claims.sub)
    .maybeSingle();

  const prefs: StoredPrefs = (existing?.payload as StoredPrefs | null) ?? {};
  const overrides: ChannelOverride[] = prefs.channelOverrides ?? [];

  const idx = overrides.findIndex((o) => o.channelId === channelId);
  const updated: ChannelOverride = {
    channelId,
    channelName: body.channelName ?? overrides[idx]?.channelName ?? channelId,
    muted: body.muted ?? false,
    ...(body.muteUntil ? { muteUntil: body.muteUntil } : {}),
  };

  if (idx >= 0) {
    overrides[idx] = updated;
  } else {
    overrides.push(updated);
  }

  const merged = { ...prefs, channelOverrides: overrides };

  await db.from('hotbox_keys').upsert(
    { org_id: claims.org, key_type: 'notification_prefs', key_path: claims.sub, payload: merged },
    { onConflict: 'org_id,key_type,key_path' },
  );

  return NextResponse.json({ ok: true, override: updated });
}
