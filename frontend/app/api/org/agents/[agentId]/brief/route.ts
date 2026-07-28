import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { verifyAccessToken } from '@/lib/fusion/auth';

export const runtime = 'nodejs';

// GET /api/org/agents/[agentId]/brief
// Auth: hx_access JWT — headmaster or orchestrator only
// Returns: { agentId, agentName, role, brief: string | null }
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
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

  if (caller.role !== 'headmaster' && caller.role !== 'orchestrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify agent belongs to caller's org
  const { data: agent, error: agentErr } = await db
    .from('agent_accounts')
    .select('id, name, role')
    .eq('id', agentId)
    .eq('org_id', caller.org)
    .single();

  if (agentErr || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { data: org } = await db.from('orgs').select('slug').eq('id', caller.org).single();
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

  const { data: briefRow } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', org.slug)
    .eq('key_type', 'brief')
    .eq('key_path', agentId)
    .single();

  return NextResponse.json({
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    brief: (briefRow?.payload as { content?: string } | null)?.content ?? null,
  });
}

// PATCH /api/org/agents/[agentId]/brief
// Auth: hx_access JWT — headmaster or orchestrator only
// Body: { brief: string }
// Returns: { ok: true }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
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

  if (caller.role !== 'headmaster' && caller.role !== 'orchestrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { brief?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.brief !== 'string') {
    return NextResponse.json({ error: 'brief must be a string' }, { status: 400 });
  }

  // Verify agent belongs to caller's org
  const { data: agent, error: agentErr } = await db
    .from('agent_accounts')
    .select('id')
    .eq('id', agentId)
    .eq('org_id', caller.org)
    .single();

  if (agentErr || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { data: org } = await db.from('orgs').select('slug').eq('id', caller.org).single();
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 });

  const { error: upsertErr } = await db.from('hotbox_keys').upsert(
    {
      org_id: org.slug,
      key_type: 'brief',
      key_path: agentId,
      payload: { content: body.brief },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,key_type,key_path' },
  );

  if (upsertErr) {
    return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
