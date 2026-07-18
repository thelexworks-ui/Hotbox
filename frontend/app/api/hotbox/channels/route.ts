import { NextRequest, NextResponse } from 'next/server';
import { listChannels, createChannel, bootstrapWorkspace } from '@/lib/hotbox/channel-service';
import { validateMasterKey } from '@/lib/hotbox/master-key';
import { randomBytes } from 'node:crypto';
import { storeChannelKey, storeChannelMembers, hasChannelKey } from '@/lib/hotbox/keys-store';
import { requireEmailVerified } from '@/lib/fusion/require-verified';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

const DEFAULT_CHANNELS = (org: string, now: string) => [
  { id: 'general', name: '#general', type: 'system' as const, org, pinned: true, created_at: now, topic: 'General discussion', members: [], agent_name: undefined, agent_role: undefined },
  { id: 'alerts',  name: '#alerts',  type: 'system' as const, org, pinned: true, created_at: now, topic: 'System alerts', members: [], agent_name: undefined, agent_role: undefined },
];

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  const masterRole = validateMasterKey(req.headers.get('x-master-key'));

  let channels = await listChannels(org);
  if (channels.length === 0) {
    await bootstrapWorkspace(org);
    channels = await listChannels(org);
  }

  const res = NextResponse.json(channels.length > 0 ? channels : DEFAULT_CHANNELS(org, new Date().toISOString()));
  if (masterRole) res.headers.set('X-Role', masterRole);
  return res;
}

export async function POST(req: NextRequest) {
  const denied = await requireEmailVerified(req);
  if (denied) return denied;

  const body = await req.json() as {
    org?: string; name: string; type: string; topic?: string;
    members?: string[]; memberIds?: string[];
  };
  const { org = DEFAULT_ORG, name, type, topic } = body;
  // Modal sends memberIds; server-to-server callers may send members — accept both
  const memberList = body.memberIds ?? body.members ?? [];

  if (!name || !type) return NextResponse.json({ error: 'name and type required' }, { status: 400 });

  const channel = await createChannel({
    org,
    name,
    type: type as 'system' | 'agent' | 'topic' | 'dm',
    topic,
    members: memberList,
  });

  if (!channel) return NextResponse.json({ error: 'create failed' }, { status: 500 });

  // Guard: only write CK if one doesn't already exist. createChannel already stores
  // a CK for new channels. Writing a second random CK would silently rotate the key,
  // making all cached CKs stale and breaking decryption for existing members (F2).
  const ckPresent = await hasChannelKey(org, channel.id);
  if (!ckPresent) {
    try {
      await storeChannelKey(org, channel.id, randomBytes(32).toString('base64'));
    } catch (err) {
      console.error('[channels] FATAL: CK write failed for newly-created channel', { org, channelId: channel.id, err });
      return NextResponse.json({ error: 'Channel created but encryption key storage failed — retry or contact support' }, { status: 500 });
    }
  }

  // Persist membership so adapters can discover this channel via hotbox_keys
  if (memberList.length > 0) {
    await storeChannelMembers(org, channel.id, memberList);
  }

  return NextResponse.json(channel, { status: 201 });
}
