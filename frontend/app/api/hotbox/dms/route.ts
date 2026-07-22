import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { listChannels, readMessages } from '@/lib/hotbox/channel-service';
import { presenceMap } from '@/lib/hotbox/presence';
import { db } from '@/lib/fusion/supabase';
import type { HotboxMessage } from '@/lib/hotbox/types';

export const runtime = 'nodejs';

export interface DMThread {
  channelId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  peerInitials: string;
  peerStatus: 'online' | 'away' | 'offline';
  isStarred: boolean;
  isExternal: boolean;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageIsOwn: boolean;
  peerIsTyping: boolean;
}

function toInitials(name: string): string {
  return name.split(/[-_\s]/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2) || '?';
}

export async function GET(req: NextRequest) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const allChannels = await listChannels(scope.org);
  const dmChannels = allChannels.filter(
    (c) => c.type === 'dm' && c.members.includes(scope.memberId!),
  );

  if (dmChannels.length === 0) return NextResponse.json({ threads: [] });

  const peerSlugs = [...new Set(
    dmChannels.map((c) => c.members.find((m) => m !== scope.memberId!) ?? '').filter(Boolean),
  )];

  // Resolve display names from agent_accounts (best-effort; slug used as fallback)
  const { data: agentRows } = await db
    .from('agent_accounts')
    .select('name')
    .in('name', peerSlugs);
  const agentNameSet = new Set<string>((agentRows ?? []).map((r: { name: string }) => r.name));

  // Load starred channelIds for this user
  const { data: starRow } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', scope.org)
    .eq('key_type', 'dm-star')
    .eq('key_path', scope.memberId!)
    .maybeSingle();
  const starredSet = new Set<string>(
    (starRow?.payload as { starred?: string[] } | null)?.starred ?? [],
  );

  const threadPromises = dmChannels.map(async (channel) => {
    const peerId = channel.members.find((m) => m !== scope.memberId!) ?? 'unknown';
    // Capitalize slug as display name when no agent_accounts row exists
    const peerName = agentNameSet.has(peerId)
      ? peerId
      : peerId.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const msgs = await readMessages(scope.org, channel.id, 1);
    const lastMsg = msgs[msgs.length - 1];

    let lastMessagePreview = '';
    if (lastMsg) {
      if (lastMsg.type === 'system') {
        lastMessagePreview = (lastMsg.content ?? '').slice(0, 80);
      }
      // chat messages are E2E encrypted — preview not available server-side
    }

    const rawStatus = presenceMap.get(peerId);
    const peerStatus: 'online' | 'away' | 'offline' =
      rawStatus === 'online' ? 'online' : rawStatus === 'crashed' ? 'away' : 'offline';

    return {
      channelId: channel.id,
      peerId,
      peerName,
      peerAvatar: null,
      peerInitials: toInitials(peerName),
      peerStatus,
      isStarred: starredSet.has(channel.id),
      isExternal: false,
      unreadCount: 0,       // client overlays real-time from WS/store
      lastMessageAt: lastMsg?.ts ?? channel.created_at,
      lastMessagePreview,
      lastMessageIsOwn: lastMsg?.sender_id === scope.memberId,
      peerIsTyping: false,  // client overlays real-time from WS
    } satisfies DMThread;
  });

  const threads = (await Promise.all(threadPromises)).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return NextResponse.json({ threads });
}
