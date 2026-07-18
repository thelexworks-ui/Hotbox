import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = cookies();

  // Path 1: JWT via hx_access cookie (new auth)
  const accessCookie = cookieStore.get('hx_access');
  if (accessCookie?.value) {
    try {
      const claims = await verifyAccessToken(accessCookie.value);
      if (claims.member_id) {
        const [orgRow, userRow] = await Promise.all([
          db.from('orgs').select('slug').eq('id', claims.org).maybeSingle(),
          db.from('users').select('email, email_verified_at').eq('id', claims.sub).maybeSingle(),
        ]);
        const agentRow = await db
          .from('agent_accounts')
          .select('name')
          .eq('org_id', claims.org)
          .eq('role', 'headmaster')
          .maybeSingle();
        return NextResponse.json({
          memberId:        claims.member_id,
          org:             orgRow.data?.slug ?? process.env.HOTBOX_ORG ?? 'toadsage',
          userId:          claims.sub,
          role:            claims.role,
          name:            agentRow.data?.name ?? null,
          email:           userRow.data?.email ?? null,
          emailVerifiedAt: userRow.data?.email_verified_at ?? null,
        });
      }
    } catch {
      // Token expired or invalid — fall through to legacy path
    }
  }

  // Path 2: Legacy invite-code cookie (HOTBOXBETA beta path)
  const sessionCookie = cookieStore.get('hotbox-member-id');
  const memberId =
    sessionCookie?.value ||
    process.env.HOTBOX_MEMBER_ID ||
    `user:${process.env.HOTBOX_ORG ?? 'local'}`;
  const org = process.env.HOTBOX_ORG ?? 'toadsage';

  return NextResponse.json({ memberId, org });
}

function extractToken(req: NextRequest): string | null {
  const cookieToken = req.cookies.get('hx_access')?.value;
  if (cookieToken) return cookieToken;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function PATCH(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(token); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string; email?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.name === undefined && body.email === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // name lives in agent_accounts (users table has no name column)
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    const { error: nameErr } = await db
      .from('agent_accounts')
      .update({ name })
      .eq('org_id', claims.org)
      .eq('role', 'headmaster');
    if (nameErr) {
      console.error('[me:patch] name update failed:', nameErr);
      return NextResponse.json({ error: 'Failed to update name', detail: nameErr.message }, { status: 500 });
    }
  }

  // email lives in users table
  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'invalid email' }, { status: 400 });
    }
    const { data: existing } = await db
      .from('users')
      .select('id')
      .eq('email', email)
      .neq('id', claims.sub)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    const { error: emailErr } = await db
      .from('users')
      .update({ email, email_verified_at: null })
      .eq('id', claims.sub);
    if (emailErr) {
      console.error('[me:patch] email update failed:', emailErr);
      return NextResponse.json({ error: 'Failed to update email', detail: emailErr.message }, { status: 500 });
    }
  }

  const [userRow, agentRow] = await Promise.all([
    db.from('users').select('email, email_verified_at').eq('id', claims.sub).maybeSingle(),
    db.from('agent_accounts').select('name').eq('org_id', claims.org).eq('role', 'headmaster').maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    name:            agentRow.data?.name ?? null,
    email:           userRow.data?.email ?? null,
    emailVerifiedAt: userRow.data?.email_verified_at ?? null,
  });
}
