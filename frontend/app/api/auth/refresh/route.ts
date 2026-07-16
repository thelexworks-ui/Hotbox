import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from '@/lib/fusion/auth';

export const runtime = 'nodejs';

// POST /api/auth/refresh
// Reads hx_refresh httpOnly cookie, issues new access token + rotates refresh token.
// Returns: { token: string }
export async function POST(req: NextRequest) {
  const rawRefresh = req.cookies.get('hx_refresh')?.value;
  if (!rawRefresh) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const tokenHash = hashRefreshToken(rawRefresh);
  const { data: rt, error } = await db
    .from('refresh_tokens')
    .select('id, user_id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !rt) {
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
  }

  if (new Date(rt.expires_at) < new Date()) {
    await db.from('refresh_tokens').delete().eq('id', rt.id);
    return NextResponse.json({ error: 'Refresh token expired' }, { status: 401 });
  }

  const { data: user } = await db
    .from('users')
    .select('id, org_id, email, role')
    .eq('id', rt.user_id)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }

  const { data: org } = await db.from('orgs').select('id, slug, name').eq('id', user.org_id).single();
  if (!org) {
    return NextResponse.json({ error: 'Org not found' }, { status: 401 });
  }

  // Rotate refresh token (delete old, issue new)
  await db.from('refresh_tokens').delete().eq('id', rt.id);
  const newRaw = generateRefreshToken();
  await db.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashRefreshToken(newRaw),
    expires_at: refreshTokenExpiry().toISOString(),
  });

  const accessToken = await signAccessToken({ sub: user.id, org: user.org_id, role: user.role });
  const userSlug = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const res = NextResponse.json({
    token: accessToken,
    refreshToken: newRaw,
    user: { id: user.id, email: user.email, slug: userSlug },
    org: { id: org.id, slug: org.slug, name: org.name },
  });
  res.cookies.set('hx_refresh', newRaw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
