import { NextRequest, NextResponse } from 'next/server';
import { listChannels } from '@/lib/hotbox/channel-service';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;
  try {
    const channels = await listChannels(scope.org);
    const memberSet = new Set<string>();

    // Derive from channel roster (exclude smoke handles)
    for (const ch of channels) {
      if (ch.agent_name && !ch.agent_name.startsWith('smk')) memberSet.add(ch.agent_name);
      if (ch.id.startsWith('agent-') && !ch.id.slice('agent-'.length).startsWith('smk')) memberSet.add(ch.id.slice('agent-'.length));
      for (const m of ch.members ?? []) { if (!m.startsWith('smk')) memberSet.add(m); }
    }

    // Deployment-specific env seeds (optional; never fall back to a hardcoded list)
    if (process.env.HOTBOX_MEMBER_ID) memberSet.add(process.env.HOTBOX_MEMBER_ID);
    if (process.env.HOTBOX_KNOWN_AGENTS) {
      for (const id of process.env.HOTBOX_KNOWN_AGENTS.split(',').map((s) => s.trim()).filter(Boolean)) {
        memberSet.add(id);
      }
    }

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
