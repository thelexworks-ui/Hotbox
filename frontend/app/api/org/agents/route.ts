import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { verifyAccessToken } from '@/lib/fusion/auth';

export const runtime = 'nodejs';

// GET /api/org/agents — list all agent_accounts for caller's org
// Auth: hx_access JWT (any member)
export async function GET(req: NextRequest) {
  const jwt =
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let caller: { sub: string; org: string; role: string };
  try {
    caller = await verifyAccessToken(jwt);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const { data, error } = await db
    .from('agent_accounts')
    .select('id, name, role, email, llm_provider, llm_model, created_at')
    .eq('org_id', caller.org)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
  }

  return NextResponse.json({ agents: data ?? [], callerRole: caller.role });
}
