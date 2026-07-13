'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHotboxStore, type ChannelMeta, type PresenceStatus } from '@/store/hotbox';
import { useWs } from './WsProvider';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG ?? 'toadsage';
const WORKSPACE_NAME = process.env.NEXT_PUBLIC_HOTBOX_WORKSPACE_NAME ?? ORG;

function PresenceDot({ status }: { status: PresenceStatus }) {
  const color =
    status === 'online'  ? 'var(--hotbox-online)'  :
    status === 'crashed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-offline)';
  const pulse = status === 'online' || status === 'crashed';
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        width: 8, height: 8, background: color,
        animation: pulse ? 'pulse-dot 2s ease-in-out infinite' : undefined,
      }}
    />
  );
}

function ChannelItem({ channel }: { channel: ChannelMeta }) {
  const pathname = usePathname();
  const presence = useHotboxStore((s) => s.presence[channel.agent_name ?? '']);
  // DM channel IDs are stored as "dm-<memberId>"; the route expects /dm/<memberId>
  const href = channel.type === 'dm'
    ? `/dm/${channel.id.replace(/^dm-/, '')}`
    : `/channels/${channel.id}`;
  const active = pathname.includes(channel.id);

  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-2 px-2 py-[3px] rounded mx-1 group',
        active
          ? 'bg-[var(--hotbox-surface-2)] text-[var(--hotbox-text)]'
          : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface)] hover:text-[var(--hotbox-text)]',
      ].join(' ')}
    >
      {channel.agent_name && presence && (
        <PresenceDot status={presence} />
      )}
      {!channel.agent_name && (
        <span className="text-[var(--hotbox-text-dim)] text-xs leading-none">#</span>
      )}
      <span className="truncate flex-1 text-sm">{channel.name.replace(/^#/, '')}</span>
      {(channel.unread ?? 0) > 0 && (
        <span className="ml-auto bg-[var(--hotbox-accent)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          {channel.unread}
        </span>
      )}
    </Link>
  );
}

function ChannelGroup({ label, channels }: { label: string; channels: ChannelMeta[] }) {
  if (channels.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--hotbox-text-dim)]">
        {label}
      </div>
      {channels.map((ch) => <ChannelItem key={ch.id} channel={ch} />)}
    </div>
  );
}

export function Sidebar() {
  const channels = useHotboxStore((s) => s.channels);
  const setChannels = useHotboxStore((s) => s.setChannels);
  const appendChannel = useHotboxStore((s) => s.appendChannel);
  const setPresence = useHotboxStore((s) => s.setPresence);
  const { subscribe } = useWs();

  useEffect(() => {
    fetch(`/api/hotbox/channels?org=${ORG}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setChannels(data); })
      .catch(() => {});
  }, [setChannels]);

  // Seed presence from server state on mount (before first WS presence event arrives)
  useEffect(() => {
    fetch('/api/hotbox/presence')
      .then((r) => r.json())
      .then((data: Record<string, PresenceStatus>) => {
        if (data && typeof data === 'object') {
          Object.entries(data).forEach(([agent, status]) => setPresence(agent, status));
        }
      })
      .catch(() => {});
  }, [setPresence]);

  useEffect(() => {
    const unsub1 = subscribe('channel.new', (msg) => {
      const ch = msg.channel as ChannelMeta;
      if (ch) appendChannel(ch);
    });
    const unsub2 = subscribe('presence', (msg) => {
      const { agent, status } = msg as unknown as { agent: string; status: PresenceStatus };
      if (agent && status) setPresence(agent, status);
    });
    return () => { unsub1(); unsub2(); };
  }, [subscribe, appendChannel, setPresence]);

  const agents   = channels.filter((c) => c.type === 'agent');
  const system   = channels.filter((c) => c.type === 'system');
  const topics   = channels.filter((c) => c.type === 'topic');
  const dms      = channels.filter((c) => c.type === 'dm');

  return (
    <nav
      className="flex flex-col h-full overflow-y-auto hotbox-scrollbar pt-2 pb-4"
      style={{ background: 'var(--hotbox-surface)' }}
    >
      {/* Workspace header */}
      <div className="px-4 py-2 mb-2 flex items-center justify-between border-b border-[var(--hotbox-border)]">
        <span data-testid="workspace-label" className="font-semibold text-sm text-[var(--hotbox-text)] truncate">{WORKSPACE_NAME}</span>
      </div>

      <ChannelGroup label="Agents"   channels={agents} />
      <ChannelGroup label="Channels" channels={[...system, ...topics]} />
      <ChannelGroup label="Direct Messages" channels={dms} />

      <div className="mt-auto px-3 pt-2 border-t border-[var(--hotbox-border)]">
        <button
          className="w-full text-left text-xs text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)] py-1"
          disabled
        >
          + New Channel
        </button>
      </div>
    </nav>
  );
}
