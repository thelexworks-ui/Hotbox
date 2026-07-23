import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

interface DndSchedule {
  enabled: boolean;
  startTime: string;
  endTime: string;
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
}

interface ChannelOverride {
  channelId: string;
  channelName: string;
  muted: boolean;
  muteUntil?: string;
}

interface NotificationPrefs {
  dms: 'all' | 'mentions' | 'none';
  mentions: boolean;
  keywords: string[];
  channelOverrides: ChannelOverride[];
  mobilePush: boolean;
  mobilePushWhen: 'always' | 'away_only';
  sound: boolean;
  soundName: string;
  unreadBadge: boolean;
  dndEnabled: boolean;
  dndSchedule: DndSchedule;
}

const DEFAULTS: NotificationPrefs = {
  dms: 'all',
  mentions: true,
  keywords: [],
  channelOverrides: [],
  mobilePush: false,
  mobilePushWhen: 'always',
  sound: true,
  soundName: 'default',
  unreadBadge: true,
  dndEnabled: false,
  dndSchedule: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  },
};

function extractToken(req: NextRequest): string | null {
  const cookie = req.cookies.get('hx_access')?.value;
  if (cookie) return cookie;
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function loadPrefs(orgId: string, userId: string): Promise<NotificationPrefs> {
  const { data } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', orgId)
    .eq('key_type', 'notification_prefs')
    .eq('key_path', userId)
    .maybeSingle();
  return { ...DEFAULTS, ...(data?.payload as Partial<NotificationPrefs> | null ?? {}) };
}

// GET /api/hotbox/me/notifications
export async function GET(req: NextRequest) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(await loadPrefs(claims.org, claims.sub));
}

// PATCH /api/hotbox/me/notifications
export async function PATCH(req: NextRequest) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<NotificationPrefs>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const current = await loadPrefs(claims.org, claims.sub);
  const merged = { ...current, ...body };

  await db.from('hotbox_keys').upsert(
    { org_id: claims.org, key_type: 'notification_prefs', key_path: claims.sub, payload: merged },
    { onConflict: 'org_id,key_type,key_path' },
  );

  return NextResponse.json(merged);
}
