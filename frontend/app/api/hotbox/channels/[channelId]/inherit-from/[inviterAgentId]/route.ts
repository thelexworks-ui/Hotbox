import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { db } from '@/lib/fusion/supabase';
import { getChannelMeta } from '@/lib/hotbox/channel-service';
import { getChannelMembers, storeChannelMembers, loadChannelKey, storeChannelKey } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string; inviterAgentId: string } },
) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;
  if (!scope.memberId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { channelId, inviterAgentId } = params;

  // Resolve inviter's org via agent_accounts
  const { data: agentRow } = await db
    .from('agent_accounts')
    .select('org_id')
    .eq('name', inviterAgentId)
    .maybeSingle();

  if (!agentRow?.org_id) {
    return NextResponse.json({ error: 'Inviter agent not found' }, { status: 404 });
  }

  const { data: orgRow } = await db
    .from('orgs')
    .select('slug')
    .eq('id', agentRow.org_id)
    .maybeSingle();

  if (!orgRow?.slug) {
    return NextResponse.json({ error: 'Inviter org not found' }, { status: 404 });
  }

  const inviterOrg = orgRow.slug;

  // Verify channel exists in inviter's org
  const channel = await getChannelMeta(inviterOrg, channelId);
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found in inviter org' }, { status: 404 });
  }

  // Verify inviter is a member of that channel
  if (!channel.members.includes(inviterAgentId)) {
    return NextResponse.json({ error: 'Inviter is not a member of that channel' }, { status: 403 });
  }

  // Add caller to channel members — idempotent
  const callerId = scope.memberId;
  const current = await getChannelMembers(inviterOrg, channelId);
  const updated = current.includes(callerId) ? current : [...current, callerId];
  if (updated.length !== current.length) {
    await storeChannelMembers(inviterOrg, channelId, updated);
  }

  // Q2-A: snapshot CK from inviter's org to caller's org at invite time
  const ck = await loadChannelKey(inviterOrg, channelId);
  if (ck) {
    await storeChannelKey(scope.org, channelId, ck);
  }

  return NextResponse.json({
    channel_id: channelId,
    org: inviterOrg,
    member_id: callerId,
    inherited_from: inviterAgentId,
    members: updated,
  });
}
