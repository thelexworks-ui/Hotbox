import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { verifyAccessToken, hashRefreshToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

const INVITE_TTL_HOURS = 72;

// POST /api/auth/invite
// Requires: hx_access cookie with role=headmaster
// Returns: { inviteUrl: string, expiresAt: string }
export async function POST(req: NextRequest) {
  // Auth: require headmaster JWT
  const token = req.cookies.get('hx_access')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (claims.role !== 'headmaster') {
    return NextResponse.json({ error: 'Forbidden — headmaster only' }, { status: 403 });
  }

  // Look up org
  const { data: org } = await db.from('orgs').select('id').eq('id', claims.org).maybeSingle();
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

  // Generate invite token — raw never stored
  const rawToken = randomBytes(48).toString('base64url');
  const tokenHash = hashRefreshToken(rawToken); // sha256 hex

  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const { error } = await db.from('invite_tokens').insert({
    org_id: claims.org,
    token_hash: tokenHash,
    role: 'member',
    created_by: claims.sub,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error('[invite] insert error:', error.message);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }

  const baseUrl = req.nextUrl.origin;
  const inviteUrl = `${baseUrl}/join?token=${rawToken}`;

  return NextResponse.json({ inviteUrl, expiresAt: expiresAt.toISOString() });
}
