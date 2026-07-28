import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs'; // nodejs runtime

function extractToken(req: NextRequest): string | null {
  return (
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null
  );
}

// GET /api/hotbox/workspace
// Returns: { orgId, orgName, orgSlug, role }
export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch (err) {
    console.error('[workspace] GET: token verify failed', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.org) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: org } = await db
    .from('orgs')
    .select('id, name, slug')
    .eq('id', claims.org)
    .maybeSingle();

  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

  return NextResponse.json({
    orgId:   org.id,
    orgName: org.name,
    orgSlug: org.slug,
    role:    claims.role ?? 'member',
  });
}

// PATCH /api/hotbox/workspace — headmaster only
// Accepts: { name: string (1–100 chars) }
export async function PATCH(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch (err) {
    console.error('[workspace] PATCH: token verify failed', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.org) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (claims.role !== 'headmaster') {
    return NextResponse.json({ error: 'Forbidden — headmaster only' }, { status: 403 });
  }

  // Validate org exists before write (cross-org guard: claims.org is JWT-signed)
  const { data: org } = await db
    .from('orgs')
    .select('id')
    .eq('id', claims.org)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

  let body: { name?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });

  const { error } = await db.from('orgs').update({ name }).eq('id', claims.org);
  if (error) {
    console.error('[workspace] PATCH: update failed', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orgName: name });
}
