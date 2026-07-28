import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { db } from '@/lib/fusion/supabase';
import { verifyAccessToken } from '@/lib/fusion/auth';

export const runtime = 'nodejs';

// GET /api/hotbox/workspace
export async function GET(req: NextRequest) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const { data: org } = await db
    .from('orgs')
    .select('id, name, slug')
    .eq('id', scope.org)
    .maybeSingle();

  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

  const token =
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  let role = 'member';
  if (token) {
    try {
      const claims = await verifyAccessToken(token);
      role = claims.role ?? 'member';
    } catch {}
  }

  return NextResponse.json({ orgId: org.id, orgName: org.name, orgSlug: org.slug, role });
}

// PATCH /api/hotbox/workspace — headmaster only
export async function PATCH(req: NextRequest) {
  const token =
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(token); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'headmaster') {
    return NextResponse.json({ error: 'Forbidden — headmaster only' }, { status: 403 });
  }

  let body: { name?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { error } = await db.from('orgs').update({ name }).eq('id', claims.org);
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  return NextResponse.json({ ok: true, orgName: name });
}
