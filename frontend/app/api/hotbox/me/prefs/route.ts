import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

function extractToken(req: NextRequest): string | null {
  const cookie = req.cookies.get('hx_access')?.value;
  if (cookie) return cookie;
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// GET /api/hotbox/me/prefs
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
    .eq('key_type', 'app_prefs')
    .eq('key_path', claims.sub)
    .maybeSingle();

  const defaults = {
    theme: 'dark',
    sidebarLayout: 'default',
    messageDensity: 'comfortable',
    linkPreview: true,
    openLinksIn: 'new_tab',
    keyboardShortcutsEnabled: true,
    spellcheck: true,
  };

  return NextResponse.json({ ...defaults, ...(data?.payload ?? {}) });
}

// PATCH /api/hotbox/me/prefs
export async function PATCH(req: NextRequest) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', claims.org)
    .eq('key_type', 'app_prefs')
    .eq('key_path', claims.sub)
    .maybeSingle();

  const merged = { ...(existing?.payload ?? {}), ...body };

  await db.from('hotbox_keys').upsert(
    { org_id: claims.org, key_type: 'app_prefs', key_path: claims.sub, payload: merged },
    { onConflict: 'org_id,key_type,key_path' },
  );

  return NextResponse.json(merged);
}
