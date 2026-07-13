import { NextRequest, NextResponse } from 'next/server';
import { listChannels, createChannel } from '@/lib/hotbox/channel-service';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

const DEFAULT_CHANNELS = (org: string, now: string) => [
  { id: 'general', name: '#general', type: 'system' as const, org, pinned: true, created_at: now, topic: 'General discussion', members: [], agent_name: undefined, agent_role: undefined },
  { id: 'alerts',  name: '#alerts',  type: 'system' as const, org, pinned: true, created_at: now, topic: 'System alerts', members: [], agent_name: undefined, agent_role: undefined },
];

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  const channels = listChannels(org);
  return NextResponse.json(channels.length > 0 ? channels : DEFAULT_CHANNELS(org, new Date().toISOString()));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { org = DEFAULT_ORG, name, type, topic, members } = body as {
    org?: string; name: string; type: string; topic?: string; members?: string[];
  };

  if (!name || !type) return NextResponse.json({ error: 'name and type required' }, { status: 400 });

  const channel = createChannel({
    org,
    name,
    type: type as 'system' | 'agent' | 'topic' | 'dm',
    topic,
    members,
  });

  if (!channel) return NextResponse.json({ error: 'channel already exists or create failed' }, { status: 409 });
  return NextResponse.json(channel, { status: 201 });
}
