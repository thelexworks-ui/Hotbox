import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { channelId: string } },
) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  let body: { starred?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.starred !== 'boolean') {
    return NextResponse.json({ error: 'starred (boolean) required' }, { status: 400 });
  }

  const { data: existing } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', scope.org)
    .eq('key_type', 'dm-star')
    .eq('key_path', scope.memberId!)
    .maybeSingle();

  const current: string[] =
    (existing?.payload as { starred?: string[] } | null)?.starred ?? [];
  const updated = body.starred
    ? Array.from(new Set([...current, params.channelId]))
    : current.filter((id) => id !== params.channelId);

  const { error } = await db.from('hotbox_keys').upsert(
    {
      org_id: scope.org,
      key_type: 'dm-star',
      key_path: scope.memberId!,
      payload: { starred: updated },
    },
    { onConflict: 'org_id,key_type,key_path' },
  );

  if (error) {
    console.error('[dms/star] upsert failed:', error);
    return NextResponse.json({ error: 'star update failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, starred: body.starred });
}
