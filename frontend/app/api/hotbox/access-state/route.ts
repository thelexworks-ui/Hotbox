import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { getChannelMembers } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agent_id');
  const channelId = searchParams.get('channel_id');
  const orgParam = searchParams.get('org');

  if (!agentId || !channelId) {
    return NextResponse.json({ error: 'agent_id and channel_id required' }, { status: 400 });
  }

  const targetOrg = orgParam ?? scope.org;

  // Live read — no cache so revocation propagates within one poll cycle (30s)
  const members = await getChannelMembers(targetOrg, channelId);

  return NextResponse.json({
    agent_id: agentId,
    channel_id: channelId,
    org: targetOrg,
    access: members.includes(agentId),
    last_checked: new Date().toISOString(),
  });
}
