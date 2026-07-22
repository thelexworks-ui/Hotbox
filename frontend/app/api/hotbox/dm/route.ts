import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { createChannel } from '@/lib/hotbox/channel-service';

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

  // Always derive and use the canonical sorted channel ID.
  // createChannel() is idempotent — on an existing channel it tops up any
  // missing CK or members list, so this call also heals legacy channels
  // that were created before storeChannelKey was wired in.
  const [a, b] = [scope.memberId!, peerId].sort();
  const channel = await createChannel({
    org: scope.org,
    name: `dm-${a}-${b}`,
    type: 'dm',
    members: [scope.memberId!, peerId],
  });

  if (!channel) return NextResponse.json({ error: 'Failed to create DM' }, { status: 500 });
  return NextResponse.json({ channelId: channel.id });
}
