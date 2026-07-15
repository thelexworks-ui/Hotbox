import { NextRequest, NextResponse } from 'next/server';
import { listChannels } from '@/lib/hotbox/channel-service';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

// Derive known member IDs from:
//  1. agent_name field on agent channels
//  2. channel name prefix "agent-" (catches channels where agent_name column is null)
//  3. members arrays on any channel
//  4. HOTBOX_MEMBER_ID env var (seeds the human / primary user)
export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  try {
    const channels = await listChannels(org);
    const memberSet = new Set<string>();

    for (const ch of channels) {
      if (ch.agent_name) memberSet.add(ch.agent_name);
      // Derive agent name from channel ID for agent channels lacking agent_name field
      if (ch.id.startsWith('agent-')) memberSet.add(ch.id.slice('agent-'.length));
      for (const m of ch.members ?? []) memberSet.add(m);
    }

    if (process.env.HOTBOX_MEMBER_ID) memberSet.add(process.env.HOTBOX_MEMBER_ID);

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
