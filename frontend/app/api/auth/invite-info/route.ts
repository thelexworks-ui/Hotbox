import { NextRequest, NextResponse } from 'next/server';
import { hashRefreshToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

// GET /api/auth/invite-info?token=<rawToken>
// Returns: { orgName: string, orgSlug: string }
// 400 on missing/invalid/expired/consumed token (symmetric with POST /join)
export async function GET(req: NextRequest) {
  const rawToken = req.nextUrl.searchParams.get('token');
  if (!rawToken) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const tokenHash = hashRefreshToken(rawToken);

  const { data: invite } = await db
    .from('invite_tokens')
    .select('id, org_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
  if (invite.used_at) return NextResponse.json({ error: 'Invite already used' }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite expired' }, { status: 400 });

  const { data: org } = await db.from('orgs').select('name, slug').eq('id', invite.org_id).maybeSingle();
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 400 });

  return NextResponse.json({ orgName: org.name, orgSlug: org.slug });
}
