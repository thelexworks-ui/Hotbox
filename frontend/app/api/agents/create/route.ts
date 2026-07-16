import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { verifyAccessToken, hashPassword, generateApiToken, generateAgentPassword } from '@/lib/fusion/auth';
import { addMemberToGeneral } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

// POST /api/agents/create
// Body: { name: string, role?: string }
// Auth: Bearer <accessToken>
// Returns: { agentId: string, apiToken: string, email: string }
//
// Atomic: agent_accounts + member_pages created together.
// On error both rows are absent (Supabase transactions via rpc or sequential insert+rollback).
// Bus registration deferred to Slice D.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!rawToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let caller: { sub: string; org: string; role: string };
  try {
    caller = await verifyAccessToken(rawToken);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (caller.role !== 'headmaster' && caller.role !== 'orchestrator') {
    return NextResponse.json({ error: 'Forbidden — headmaster or orchestrator only' }, { status: 403 });
  }

  let body: { name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, role = 'agent' } = body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const agentName = name.trim();

  // Resolve org slug for email construction
  const { data: org, error: orgErr } = await db.from('orgs').select('slug').eq('id', caller.org).single();
  if (orgErr || !org) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 });
  }

  const emailSlug = agentName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const email = `${emailSlug}@${org.slug}.internal`;
  const apiToken = generateApiToken();
  const passwordHash = await hashPassword(generateAgentPassword());

  // Atomic: insert agent_accounts then member_pages.
  // If member_pages insert fails, delete the agent_accounts row.
  const { data: agent, error: agentErr } = await db.from('agent_accounts').insert({
    org_id: caller.org,
    name: agentName,
    role,
    email,
    password_hash: passwordHash,
    api_token: apiToken,
  }).select('id').single();

  if (agentErr || !agent) {
    if (agentErr?.code === '23505') {
      return NextResponse.json({ error: `Agent name '${agentName}' already exists in this org` }, { status: 409 });
    }
    console.error('[agents/create] agent_accounts insert error:', agentErr);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }

  const { error: mpErr } = await db.from('member_pages').insert({
    agent_id: agent.id,
    display_name: agentName,
  });

  if (mpErr) {
    // Rollback agent_accounts row to keep state clean (atomic guarantee)
    await db.from('agent_accounts').delete().eq('id', agent.id);
    console.error('[agents/create] member_pages insert error:', mpErr);
    return NextResponse.json({ error: 'Failed to create member page — agent creation rolled back' }, { status: 500 });
  }

  // Add new agent to #general — fire-and-forget, non-blocking
  void addMemberToGeneral(org.slug, agentName);

  return NextResponse.json({ agentId: agent.id, apiToken, email }, { status: 201 });
}
