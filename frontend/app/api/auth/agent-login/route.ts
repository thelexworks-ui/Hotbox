import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { signAccessToken } from '@/lib/fusion/auth';

export const runtime = 'nodejs';

// POST /api/auth/agent-login
// Body: { api_token: string }
// Returns: { token: string } — raw Bearer JWT, no cookie, no refresh token.
// Designed for daemon / server-to-server callers that manage their own token lifecycle.
export async function POST(req: NextRequest) {
  let body: { api_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { api_token } = body;
  if (!api_token?.trim()) {
    return NextResponse.json({ error: 'api_token required' }, { status: 400 });
  }

  const { data: account, error } = await db
    .from('agent_accounts')
    .select('id, org_id, name, role, api_token')
    .eq('api_token', api_token.trim())
    .maybeSingle();

  if (error || !account) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const { data: org } = await db
    .from('orgs')
    .select('slug')
    .eq('id', account.org_id)
    .maybeSingle();

  if (!org?.slug) {
    return NextResponse.json({ error: 'Org not found' }, { status: 500 });
  }

  const token = await signAccessToken({
    sub: account.id,
    org: account.org_id,
    role: account.role,
    member_id: account.name,
  });

  return NextResponse.json({ token });
}
