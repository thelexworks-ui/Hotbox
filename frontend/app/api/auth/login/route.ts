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
    .select('id, org_id, role, password_hash')
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

  const accessToken = await signAccessToken({ sub: user.id, org: user.org_id, role: user.role });
  const rawRefresh = generateRefreshToken();
  await db.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashRefreshToken(rawRefresh),
    expires_at: refreshTokenExpiry().toISOString(),
  });

  const res = NextResponse.json({ token: accessToken, userId: user.id, orgId: user.org_id, role: user.role });
  res.cookies.set('hx_refresh', rawRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
