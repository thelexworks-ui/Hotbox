'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useHotboxStore, type ChannelMeta, type PresenceStatus } from '@/store/hotbox';
import { useWs } from './WsProvider';
import { useHeadmasters, useOrchestrators, useAgentsOnly, type Member } from '@/hooks/useMembers';
import { ChannelCreateModal } from './ChannelCreateModal';
import { MembersPanel, RoleBadge } from './MembersPanel';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG ?? 'toadsage';
const WORKSPACE_NAME = process.env.NEXT_PUBLIC_HOTBOX_WORKSPACE_NAME ?? ORG;
const MAX_AGENTS_VISIBLE = 8;

// ── Icons ────────────────────────────────────────────────────────────────────

function IconMembers() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      style={{ animation: spinning ? 'spin 0.6s linear' : undefined }}
    >
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

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

// ── MemberItem (shared by all 3 role sections) ───────────────────────────────

function MemberItem({ member, status }: { member: Member; status: PresenceStatus }) {
  const pathname = usePathname();
  const href = `/dm/${member.id}`;
  const active = pathname.includes(member.id);

  return (
    <Link
      href={href}
      title={`${member.name} · ${member.role}`}
      className={[
        'flex items-center gap-2.5 px-4 py-[3px] rounded mx-1',
        active
          ? 'bg-[var(--hotbox-surface-2)] text-[var(--hotbox-text)]'
          : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface-2)] hover:text-[var(--hotbox-text)]',
      ].join(' ')}
    >
      <PresenceDot status={status} size={7} />
      <span className="flex-1 text-sm truncate">{member.name}</span>
      {(member.role === 'orchestrator' || member.role === 'headmaster') && (
        <RoleBadge role={member.role} />
      )}
    </Link>
  );
}

// ── Role sections ────────────────────────────────────────────────────────────

function RoleSection({
  label,
  members,
  presence,
  overflow,
  onMore,
}: {
  label: string;
  members: Member[];
  presence: Record<string, PresenceStatus>;
  overflow?: number;
  onMore?: () => void;
}) {
  if (members.length === 0 && !overflow) return null;
  return (
    <div className="mb-1">
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--hotbox-text-dim)]">
        {label}
      </div>
      {members.length === 0 ? (
        <div className="px-4 py-1 text-xs text-[var(--hotbox-text-dim)]">None connected.</div>
      ) : (
        members.map((m) => (
          <MemberItem
            key={m.id}
            member={m}
            status={(presence[m.id] ?? presence[m.name] ?? 'offline') as PresenceStatus}
          />
        ))
      )}
      {overflow != null && overflow > 0 && onMore && (
        <button
          onClick={onMore}
          className="w-full text-left px-4 py-1 text-xs transition-opacity hover:opacity-75"
          style={{ color: 'var(--hotbox-accent)' }}
        >
          +{overflow} more
        </button>
      )}
    </div>
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
        'flex items-center gap-2 px-2 py-[3px] rounded mx-1',
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

// ── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ onItemClick }: { onItemClick?: () => void }) {
  const router = useRouter();
  const channels     = useHotboxStore((s) => s.channels);
  const setChannels  = useHotboxStore((s) => s.setChannels);
  const appendChannel = useHotboxStore((s) => s.appendChannel);
  const setPresence  = useHotboxStore((s) => s.setPresence);
  const presence     = useHotboxStore((s) => s.presence);
  const { subscribe } = useWs();

  const headmasters   = useHeadmasters(30_000);
  const orchestrators = useOrchestrators(30_000);
  const agentsOnly    = useAgentsOnly(15_000);

  const [showCreate, setShowCreate]   = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [membersFilter, setMembersFilter] = useState<'all' | 'user' | 'agent'>('all');
  const [refreshing, setRefreshing]   = useState(false);
  const [refreshKey, setRefreshKey]   = useState(0);

  // CH3: refetch channels (also triggered by refreshKey for CH4)
  const refetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/hotbox/channels?org=${ORG}`);
      const data = await res.json();
      if (Array.isArray(data)) setChannels(data);
    } catch {}
  }, [setChannels]);

  useEffect(() => {
    refetchChannels();
  }, [refetchChannels, refreshKey]);

  useEffect(() => {
    fetch('/api/hotbox/presence')
      .then((r) => r.json())
      .then((data: Record<string, PresenceStatus>) => {
        if (data && typeof data === 'object') {
          Object.entries(data).forEach(([agent, status]) => setPresence(agent, status));
        }
      })
      .catch(() => {});
  }, [setPresence, refreshKey]);

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

  // CH3: append optimistic, close modal, re-fetch authoritative list, then navigate
  const handleChannelCreated = async (ch: ChannelMeta) => {
    appendChannel(ch);
    setShowCreate(false);
    await refetchChannels();
    router.push(`/channels/${ch.id}`);
  };

  // CH4: manual refresh
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    router.refresh();
    setTimeout(() => setRefreshing(false), 700);
  };

  const handleOpenMembers = (filter: 'agent') => {
    setMembersFilter(filter);
    setShowMembers(true);
  };

  // Agents: sort online-first, alpha within group; cap at MAX_AGENTS_VISIBLE
  const sortedAgents = [...agentsOnly].sort((a, b) => {
    const sa = (presence[a.id] ?? presence[a.name] ?? 'offline') as PresenceStatus;
    const sb = (presence[b.id] ?? presence[b.name] ?? 'offline') as PresenceStatus;
    if ((sa !== 'offline') !== (sb !== 'offline')) return sa !== 'offline' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const visibleAgents = sortedAgents.slice(0, MAX_AGENTS_VISIBLE);
  const agentOverflow = sortedAgents.length - MAX_AGENTS_VISIBLE;

  const system = channels.filter((c) => c.type === 'system');
  const topics = channels.filter((c) => c.type === 'topic' || c.type === 'group');
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
          <div className="flex items-center gap-2">
            {/* CH4: Refresh button */}
            <button
              onClick={handleRefresh}
              title="Refresh"
              className="text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)] transition-colors"
            >
              <IconRefresh spinning={refreshing} />
            </button>
            {/* Members panel button */}
            <button
              onClick={() => setShowMembers(true)}
              title="Members"
              className="text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)] transition-colors"
            >
              <IconMembers />
            </button>
          </div>
        </div>

        {/* CH1: 3-level hierarchy */}
        <RoleSection label="Headmaster" members={headmasters} presence={presence} />
        <RoleSection label="Orchestrator" members={orchestrators} presence={presence} />
        <RoleSection
          label="Agents"
          members={visibleAgents}
          presence={presence}
          overflow={agentOverflow > 0 ? agentOverflow : undefined}
          onMore={() => handleOpenMembers('agent')}
        />

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
