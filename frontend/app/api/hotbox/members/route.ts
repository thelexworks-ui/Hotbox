import { NextRequest, NextResponse } from 'next/server';
import { listChannels } from '@/lib/hotbox/channel-service';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

// Derive known member IDs from agent channels (channels with agent_name set).
// This replaces the old pubkey-registry approach — member list is now inferred
// from the channel roster rather than stored separately.
export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  try {
    const channels = await listChannels(org);
    const memberSet = new Set<string>();
    for (const ch of channels) {
      if (ch.agent_name) memberSet.add(ch.agent_name);
      for (const m of ch.members ?? []) memberSet.add(m);
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
