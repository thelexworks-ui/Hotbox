import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

interface UserStatus {
  emoji: string;
  text: string;
  clearAfter?: string;
  dndActive: boolean;
}

const DEFAULT_STATUS: UserStatus = { emoji: '', text: '', dndActive: false };

function extractToken(req: NextRequest): string | null {
  const cookie = req.cookies.get('hx_access')?.value;
  if (cookie) return cookie;
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// GET /api/hotbox/me/status
export async function GET(req: NextRequest) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', claims.org)
    .eq('key_type', 'user_status')
    .eq('key_path', claims.sub)
    .maybeSingle();

  return NextResponse.json((data?.payload as UserStatus | null) ?? DEFAULT_STATUS);
}

// PATCH /api/hotbox/me/status
// Body: Partial<UserStatus>
export async function PATCH(req: NextRequest) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<UserStatus>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', claims.org)
    .eq('key_type', 'user_status')
    .eq('key_path', claims.sub)
    .maybeSingle();

  const current: UserStatus = (existing?.payload as UserStatus | null) ?? DEFAULT_STATUS;
  const updated: UserStatus = { ...current, ...body };

  await db.from('hotbox_keys').upsert(
    { org_id: claims.org, key_type: 'user_status', key_path: claims.sub, payload: updated },
    { onConflict: 'org_id,key_type,key_path' },
  );

  return NextResponse.json(updated);
}
