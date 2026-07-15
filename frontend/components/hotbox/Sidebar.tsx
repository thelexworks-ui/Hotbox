'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHotboxStore, type ChannelMeta, type PresenceStatus } from '@/store/hotbox';
import { useWs } from './WsProvider';
import { useAgents } from '@/hooks/useMembers';
import { ChannelCreateModal } from './ChannelCreateModal';
import { MembersPanel, RoleBadge } from './MembersPanel';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG ?? 'toadsage';
const WORKSPACE_NAME = process.env.NEXT_PUBLIC_HOTBOX_WORKSPACE_NAME ?? ORG;
const MAX_AGENTS_VISIBLE = 8;

// ── PresenceDot ──────────────────────────────────────────────────────────────

function PresenceDot({ status, size = 8 }: { status: PresenceStatus; size?: number }) {
  const color =
    status === 'online'  ? 'var(--hotbox-online)'  :
    status === 'crashed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-offline)';
  const pulse = status === 'online' || status === 'crashed';
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: color, animation: pulse ? 'pulse-dot 2s ease-in-out infinite' : undefined }}
    />
  );
}

// ── Channel items ────────────────────────────────────────────────────────────

function ChannelItem({ channel, onItemClick }: { channel: ChannelMeta; onItemClick?: () => void }) {
  const pathname = usePathname();
  const presence = useHotboxStore((s) => s.presence[channel.agent_name ?? '']);
  const href = channel.type === 'dm'
    ? `/dm/${channel.id.replace(/^dm-/, '')}`
    : `/channels/${channel.id}`;
  const active = pathname.includes(channel.id);

  return (
    <Link
      href={href}
      onClick={onItemClick}
      className={[
        'flex items-center gap-2 px-2 py-[3px] rounded mx-1 group',
        active
          ? 'bg-[var(--hotbox-surface-2)] text-[var(--hotbox-text)]'
          : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface)] hover:text-[var(--hotbox-text)]',
      ].join(' ')}
    >
      {channel.agent_name && presence && <PresenceDot status={presence} />}
      {!channel.agent_name && <span className="text-[var(--hotbox-text-dim)] text-xs leading-none">#</span>}
      <span className="truncate flex-1 text-sm">{channel.name.replace(/^#/, '')}</span>
      {(channel.unread ?? 0) > 0 && (
        <span className="ml-auto bg-[var(--hotbox-accent)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          {channel.unread}
        </span>
      )}
    </Link>
  );
}

function ChannelGroup({ label, channels, onItemClick }: { label: string; channels: ChannelMeta[]; onItemClick?: () => void }) {
  if (channels.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--hotbox-text-dim)]">
        {label}
      </div>
      {channels.map((ch) => <ChannelItem key={ch.id} channel={ch} onItemClick={onItemClick} />)}
    </div>
  );
}

// ── Agents section ───────────────────────────────────────────────────────────

function AgentItem({ id, name, role, status }: { id: string; name: string; role: string; status: PresenceStatus }) {
  const pathname = usePathname();
  const href = `/dm/${id}`;
  const active = pathname.includes(id);

  return (
    <Link
      href={href}
      title={`${name} · ${role}`}
      className={[
        'flex items-center gap-2.5 px-4 py-[3px] rounded mx-1',
        active
          ? 'bg-[var(--hotbox-surface-2)] text-[var(--hotbox-text)]'
          : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface-2)] hover:text-[var(--hotbox-text)]',
      ].join(' ')}
    >
      <PresenceDot status={status} size={7} />
      <span className="flex-1 text-sm truncate">{name}</span>
      {(role === 'orchestrator' || role === 'headmaster') && (
        <RoleBadge role={role as 'orchestrator' | 'headmaster'} />
      )}
    </Link>
  );
}

function AgentsSection({ onOpenMembers }: { onOpenMembers(filter: 'agent'): void }) {
  const agents = useAgents(15_000);
  const presence = useHotboxStore((s) => s.presence);

  const sorted = [...agents].sort((a, b) => {
    const sa = (presence[a.id] ?? presence[a.name] ?? 'offline') as PresenceStatus;
    const sb = (presence[b.id] ?? presence[b.name] ?? 'offline') as PresenceStatus;
    const aOnline = sa !== 'offline';
    const bOnline = sb !== 'offline';
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    const aTop = a.role === 'orchestrator' || a.role === 'headmaster';
    const bTop = b.role === 'orchestrator' || b.role === 'headmaster';
    if (aTop !== bTop) return aTop ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const visible = sorted.slice(0, MAX_AGENTS_VISIBLE);
  const overflow = sorted.length - MAX_AGENTS_VISIBLE;

  return (
    <div className="mb-1">
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--hotbox-text-dim)]">Agents</div>
      {agents.length === 0 ? (
        <div className="px-4 py-2 text-xs text-[var(--hotbox-text-dim)]">No agents connected yet.</div>
      ) : (
        <>
          {visible.map((agent) => (
            <AgentItem
              key={agent.id}
              id={agent.id}
              name={agent.name}
              role={agent.role}
              status={(presence[agent.id] ?? presence[agent.name] ?? 'offline') as PresenceStatus}
            />
          ))}
          {overflow > 0 && (
            <button
              onClick={() => onOpenMembers('agent')}
              className="w-full text-left px-4 py-1 text-xs transition-opacity"
              style={{ color: 'var(--hotbox-accent)' }}
            >
              +{overflow} more
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ onItemClick }: { onItemClick?: () => void }) {
  const channels     = useHotboxStore((s) => s.channels);
  const setChannels  = useHotboxStore((s) => s.setChannels);
  const appendChannel = useHotboxStore((s) => s.appendChannel);
  const setPresence  = useHotboxStore((s) => s.setPresence);
  const { subscribe } = useWs();

  const [showCreate, setShowCreate]   = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [membersFilter, setMembersFilter] = useState<'all' | 'user' | 'agent'>('all');

  useEffect(() => {
    fetch(`/api/hotbox/channels?org=${ORG}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setChannels(data); })
      .catch(() => {});
  }, [setChannels]);

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

  const handleChannelCreated = (ch: ChannelMeta) => {
    appendChannel(ch);
    setShowCreate(false);
  };

  const handleOpenMembers = (filter: 'agent') => {
    setMembersFilter(filter);
    setShowMembers(true);
  };

  const system = channels.filter((c) => c.type === 'system');
  const topics = channels.filter((c) => c.type === 'topic');
  const dms    = channels.filter((c) => c.type === 'dm');

  return (
    <>
      {showCreate && (
        <ChannelCreateModal
          onCreated={handleChannelCreated}
          onClose={() => setShowCreate(false)}
        />
      )}

      <MembersPanel
        open={showMembers}
        onClose={() => setShowMembers(false)}
        initialFilter={membersFilter}
      />

      <nav
        className="flex flex-col h-full overflow-y-auto hotbox-scrollbar pt-2 pb-4"
        style={{ background: 'var(--hotbox-surface)' }}
      >
        {/* Workspace header */}
        <div className="px-4 py-2 mb-2 flex items-center justify-between border-b border-[var(--hotbox-border)]">
          <span data-testid="workspace-label" className="font-semibold text-sm text-[var(--hotbox-text)] truncate">
            {WORKSPACE_NAME}
          </span>
          <button
            onClick={() => setShowMembers(true)}
            className="text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)] transition-colors"
            title="Members"
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>
        </div>

        <AgentsSection onOpenMembers={handleOpenMembers} />
        <ChannelGroup label="Channels"        channels={[...system, ...topics]} onItemClick={onItemClick} />
        <ChannelGroup label="Direct Messages" channels={dms}                    onItemClick={onItemClick} />

        <div className="mt-auto px-3 pt-2 border-t border-[var(--hotbox-border)]">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full text-left text-xs text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-accent)] py-1 transition-colors"
          >
            + New Channel
          </button>
        </div>
      </nav>
    </>
  );
}
