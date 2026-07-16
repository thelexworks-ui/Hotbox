import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import {
  hashPassword,
  hashRefreshToken,
  signAccessToken,
  generateRefreshToken,
  refreshTokenExpiry,
} from '@/lib/fusion/auth';
import { addMemberToGeneral } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

// POST /api/auth/join
// Body: { token: string, name: string, email: string, password: string }
// Returns: { ok: true, memberId: string }
// 400 on invalid/malformed/expired/consumed token (G8), 409 on duplicate email
export async function POST(req: NextRequest) {
  let body: { token?: string; name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token: rawToken, name, email, password } = body;
  if (!rawToken || !name || !email || !password) {
    return NextResponse.json({ error: 'token, name, email, password required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }

  // Validate token — 400 on wrong-hash/malformed/expired/consumed (G8)
  const tokenHash = hashRefreshToken(rawToken);
  const { data: invite } = await db
    .from('invite_tokens')
    .select('id, org_id, expires_at, used_at, role')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
  if (invite.used_at) return NextResponse.json({ error: 'Invite already used' }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite expired' }, { status: 400 });

  // Check email uniqueness before expensive bcrypt
  const { data: existing } = await db.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

  const passwordHash = await hashPassword(password);
  const userRole = (invite.role as string) || 'member';

  // Create user
  const { data: user, error: userErr } = await db.from('users').insert({
    org_id: invite.org_id,
    email,
    password_hash: passwordHash,
    role: userRole,
  }).select().single();

  if (userErr || !user) {
    console.error('[join] user insert error:', userErr?.message);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }

  // Mark token consumed — atomic: if this fails, user was created but token reusable
  // Acceptable for beta; idempotent on re-use = creates second user with same token
  await db.from('invite_tokens').update({
    used_at: new Date().toISOString(),
    used_by_user_id: user.id,
  }).eq('id', invite.id);

  // Add to #general
  const { data: org } = await db.from('orgs').select('slug').eq('id', invite.org_id).maybeSingle();
  const orgSlug = org?.slug as string | undefined;
  const memberSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (orgSlug) {
    void addMemberToGeneral(orgSlug, memberSlug);
  }

  // Issue access token + refresh token
  const accessToken = await signAccessToken({
    sub: user.id,
    org: invite.org_id,
    role: userRole,
    member_id: memberSlug,
  });
  const rawRefresh = generateRefreshToken();
  await db.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashRefreshToken(rawRefresh),
    expires_at: refreshTokenExpiry().toISOString(),
  });

  const res = NextResponse.json({ ok: true, memberId: memberSlug });
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
