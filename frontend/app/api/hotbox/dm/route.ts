import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { listChannels, createChannel } from '@/lib/hotbox/channel-service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  let body: { peerId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { peerId } = body;
  if (!peerId || typeof peerId !== 'string') {
    return NextResponse.json({ error: 'peerId required' }, { status: 400 });
  }
  if (peerId === scope.memberId) {
    return NextResponse.json({ error: 'Cannot DM yourself' }, { status: 400 });
  }

  // Find any existing DM channel between these two members
  const allChannels = await listChannels(scope.org);
  const existing = allChannels.find(
    (c) =>
      c.type === 'dm' &&
      c.members.includes(scope.memberId!) &&
      c.members.includes(peerId),
  );
  if (existing) return NextResponse.json({ channelId: existing.id });

  // Create canonical channel (sorted members → idempotent regardless of initiator)
  const [a, b] = [scope.memberId!, peerId].sort();
  const channel = await createChannel({
    org: scope.org,
    name: `dm-${a}-${b}`,
    type: 'dm',
    members: [scope.memberId!, peerId],
  });

  if (!channel) return NextResponse.json({ error: 'Failed to create DM' }, { status: 500 });
  return NextResponse.json({ channelId: channel.id }, { status: 201 });
}
