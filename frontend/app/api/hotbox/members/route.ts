import { NextRequest, NextResponse } from 'next/server';
import { listChannels } from '@/lib/hotbox/channel-service';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

// Well-known agents for this org, overridable via HOTBOX_KNOWN_AGENTS (comma-separated).
// This fallback ensures the member picker is never empty on a fresh deployment before
// any agent channels exist. HOTBOX_MEMBER_ID seeds the primary human user.
const FALLBACK_AGENTS = ['headmaster', 'boss', 'apollo', 'hepha-web'];

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  try {
    const channels = await listChannels(org);
    const memberSet = new Set<string>();

    // Derive from channel roster
    for (const ch of channels) {
      if (ch.agent_name) memberSet.add(ch.agent_name);
      if (ch.id.startsWith('agent-')) memberSet.add(ch.id.slice('agent-'.length));
      for (const m of ch.members ?? []) memberSet.add(m);
    }

    // Env var seeds
    if (process.env.HOTBOX_MEMBER_ID) memberSet.add(process.env.HOTBOX_MEMBER_ID);
    const knownAgents = process.env.HOTBOX_KNOWN_AGENTS
      ? process.env.HOTBOX_KNOWN_AGENTS.split(',').map((s) => s.trim()).filter(Boolean)
      : FALLBACK_AGENTS;
    for (const id of knownAgents) memberSet.add(id);

    const members = Array.from(memberSet).map((id) => ({
      id,
      name: id,
      role: 'agent',
      pubkey: '',
    }));
    return NextResponse.json(members);
  } catch {
    return NextResponse.json({ error: 'member list failed' }, { status: 500 });
  }
}
