import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import {
  hashPassword,
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  generateApiToken,
  generateAgentPassword,
} from '@/lib/fusion/auth';

export const runtime = 'nodejs';

// POST /api/auth/signup
// Body: { name: string, email: string, password: string, orgName: string }
// Returns: { token: string, refreshToken: string, userId: string, orgId: string }
export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; password?: string; orgName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, email, password, orgName } = body;
  if (!name || !email || !password || !orgName) {
    return NextResponse.json({ error: 'name, email, password, orgName required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });
  }

  // Derive org slug from orgName
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) {
    return NextResponse.json({ error: 'orgName must contain alphanumeric characters' }, { status: 400 });
  }

  // Check email uniqueness before expensive bcrypt
  const { data: existingUser } = await db.from('users').select('id').eq('email', email).maybeSingle();
  if (existingUser) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const { data: existingOrg } = await db.from('orgs').select('id').eq('slug', slug).maybeSingle();
  if (existingOrg) {
    return NextResponse.json({ error: 'Org slug already taken' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // Create org
  const { data: org, error: orgErr } = await db.from('orgs').insert({ name: orgName, slug }).select().single();
  if (orgErr || !org) {
    console.error('[signup] org insert error:', orgErr);
    return NextResponse.json({ error: 'Failed to create org' }, { status: 500 });
  }

  // Create headmaster user
  const { data: user, error: userErr } = await db.from('users').insert({
    org_id: org.id,
    email,
    password_hash: passwordHash,
    role: 'headmaster',
  }).select().single();

  if (userErr || !user) {
    // Roll back org — best-effort
    await db.from('orgs').delete().eq('id', org.id);
    console.error('[signup] user insert error:', userErr);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }

  // Create headmaster agent_account record (same person, machine identity)
  const agentEmail = `${name.toLowerCase().replace(/\s+/g, '-')}@${slug}.internal`;
  const agentPassHash = await hashPassword(generateAgentPassword());
  const apiToken = generateApiToken();

  const { data: agent, error: agentErr } = await db.from('agent_accounts').insert({
    org_id: org.id,
    name,
    role: 'headmaster',
    email: agentEmail,
    password_hash: agentPassHash,
    api_token: apiToken,
  }).select().single();

  if (agentErr || !agent) {
    await db.from('users').delete().eq('id', user.id);
    await db.from('orgs').delete().eq('id', org.id);
    console.error('[signup] agent_account insert error:', agentErr);
    return NextResponse.json({ error: 'Failed to create agent account' }, { status: 500 });
  }

  // Create member_page for headmaster agent
  await db.from('member_pages').insert({ agent_id: agent.id, display_name: name });

  // Issue tokens
  const accessToken = await signAccessToken({ sub: user.id, org: org.id, role: 'headmaster' });
  const rawRefresh = generateRefreshToken();
  const { error: rtErr } = await db.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashRefreshToken(rawRefresh),
    expires_at: refreshTokenExpiry().toISOString(),
  });
  if (rtErr) {
    console.error('[signup] refresh_token insert error:', rtErr);
  }

  const userSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const res = NextResponse.json({
    token: accessToken,
    refreshToken: rawRefresh,
    user: { id: user.id, email: user.email, slug: userSlug },
    org: { id: org.id, slug: org.slug, name: org.name },
  }, { status: 201 });
  res.cookies.set('hx_refresh', rawRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
