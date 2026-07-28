import { NextRequest, NextResponse } from 'next/server';
import { getChannelMeta, type ChannelType } from '@/lib/hotbox/channel-service';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { channelId: string } }) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const meta = await getChannelMeta(scope.org, params.channelId);
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(meta);
}

const VALID_TYPES: string[] = ['system', 'agent', 'topic', 'group', 'dm', 'nexus'];

export async function PATCH(req: NextRequest, { params }: { params: { channelId: string } }) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const body = await req.json() as { type?: string };
  if (!body.type || !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  const newType = body.type as ChannelType;
  const channelId = params.channelId;

  const meta = await getChannelMeta(scope.org, channelId);
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Non-master callers must be a member of the channel
  if (!scope.masterRole && !meta.members.includes(scope.memberId!)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await db
    .from('hotbox_channels')
    .update({ type: newType })
    .eq('org_id', scope.org)
    .eq('id', channelId);

  if (error) {
    console.error('[channels] ERROR updating channel type', { org: scope.org, channelId, message: error.message });
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }

  return NextResponse.json({ ...meta, type: newType });
}
