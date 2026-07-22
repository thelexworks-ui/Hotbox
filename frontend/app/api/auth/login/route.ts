import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import {
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from '@/lib/fusion/auth';

export const runtime = 'nodejs';

// POST /api/auth/login
// Body: { email: string, password: string }
// Returns: { token: string, userId: string, orgId: string, role: string }
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const { data: user, error } = await db
    .from('users')
    .select('id, org_id, email, role, password_hash, email_verified_at')
    .eq('email', email)
    .maybeSingle();

  if (error || !user) {
    // Constant-time-ish: run bcrypt even on miss to prevent timing oracle
    await verifyPassword(password, '$2b$12$invalidhashtopreventtimingattacksonmiss000000000000000000');
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (!user.email_verified_at) {
    return NextResponse.json({ error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' }, { status: 403 });
  }

  const { data: org } = await db.from('orgs').select('id, slug, name').eq('id', user.org_id).single();
  if (!org) {
    return NextResponse.json({ error: 'Org not found' }, { status: 500 });
  }

  const userSlug = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const accessToken = await signAccessToken({ sub: user.id, org: user.org_id, role: user.role, member_id: userSlug });
  const rawRefresh = generateRefreshToken();
  await db.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashRefreshToken(rawRefresh),
    expires_at: refreshTokenExpiry().toISOString(),
  });

  const res = NextResponse.json({
    token: accessToken,
    refreshToken: rawRefresh,
    user: { id: user.id, email: user.email, slug: userSlug },
    org: { id: org.id, slug: org.slug, name: org.name },
  });
  res.cookies.set('hx_access', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });
  res.cookies.set('hx_refresh', rawRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
