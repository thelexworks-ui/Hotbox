import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { listChannels } from '@/lib/hotbox/channel-service';
import { presenceMap } from '@/lib/hotbox/presence';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';
const FALLBACK_AGENTS = ['headmaster', 'boss', 'apollo', 'hepha-web'];

// Mirror /members member-set resolution so the same slugs resolve here.
async function buildMemberSet(org: string): Promise<Set<string>> {
  const channels = await listChannels(org);
  const set = new Set<string>();
  for (const ch of channels) {
    if (ch.agent_name) set.add(ch.agent_name);
    if (ch.id.startsWith('agent-')) set.add(ch.id.slice('agent-'.length));
    for (const m of ch.members ?? []) set.add(m);
  }
  if (process.env.HOTBOX_MEMBER_ID) set.add(process.env.HOTBOX_MEMBER_ID);
  const known = process.env.HOTBOX_KNOWN_AGENTS
    ? process.env.HOTBOX_KNOWN_AGENTS.split(',').map((s) => s.trim()).filter(Boolean)
    : FALLBACK_AGENTS;
  for (const id of known) set.add(id);
  return set;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;

  if (id.startsWith('ghost-')) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Verify slug is a known member (same source as /members)
  let members: Set<string>;
  try {
    members = await buildMemberSet(org);
  } catch {
    members = new Set(FALLBACK_AGENTS);
  }
  if (!members.has(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Channel memberships for this agent
  let channels: string[] = [];
  try {
    const { data: memberRows } = await db
      .from('hotbox_keys')
      .select('key_path, payload')
      .eq('org_id', org)
      .eq('key_type', 'members')
      .limit(100);
    channels = (memberRows ?? [])
      .filter((r) => ((r.payload as { members?: string[] } | null)?.members ?? []).includes(id))
      .map((r) => r.key_path as string)
      .slice(0, 10);
  } catch {}

  // Enrich from agent_accounts if a row exists (best-effort)
  let role = 'agent';
  let agentDbId: string | null = null;
  try {
    const { data: account } = await db
      .from('agent_accounts')
      .select('id, role')
      .eq('name', id)
      .maybeSingle();
    if (account) {
      role = (account.role as string) ?? 'agent';
      agentDbId = account.id as string;
    }
  } catch {}

  // Task count — 0 if table absent or no DB id
  let taskCount = 0;
  if (agentDbId) {
    try {
      const { count } = await db
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentDbId)
        .in('status', ['open', 'in_progress']);
      taskCount = count ?? 0;
    } catch {}
  }

  // Last active — derived from in-memory presenceMap (no heartbeats table in DB).
  // 'online' → 0ms ago; anything else → null (unknown).
  const presence = presenceMap.get(id);
  const lastActiveMsAgo: number | null = presence === 'online' ? 0 : null;

  return NextResponse.json({
    id,
    name: id,
    role,
    skills: [],
    channels,
    taskCount,
    lastActiveMsAgo,
  });
}
