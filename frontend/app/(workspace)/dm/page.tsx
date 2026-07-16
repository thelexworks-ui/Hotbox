'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useHotboxStore, type ChannelMeta, type PresenceStatus } from '@/store/hotbox';
import { useMembers, type Member } from '@/hooks/useMembers';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG ?? 'toadsage';

function PresenceDot({ status }: { status: PresenceStatus }) {
  const color =
    status === 'online'  ? 'var(--hotbox-online)'  :
    status === 'crashed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-offline)';
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: 8, height: 8, background: color,
        animation: (status === 'online' || status === 'crashed') ? 'pulse-dot 2s ease-in-out infinite' : undefined }}
    />
  );
}

function RolePill({ role }: { role: Member['role'] }) {
  if (role === 'headmaster') return (
    <span
      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: 'rgba(255,215,0,0.14)', color: '#FFD700', fontFamily: "'JetBrains Mono', monospace" }}
    >HM</span>
  );
  if (role === 'orchestrator') return (
    <span
      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: 'var(--hotbox-accent-subtle)', color: 'var(--hotbox-accent)', fontFamily: "'JetBrains Mono', monospace" }}
    >ORC</span>
  );
  return null;
}

function formatRelTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface DmRow {
  channel: ChannelMeta;
  member?: Member;
  status: PresenceStatus;
  memberId: string;
}

export default function DmInboxPage() {
  const channels   = useHotboxStore((s) => s.channels);
  const setChannels = useHotboxStore((s) => s.setChannels);
  const presence   = useHotboxStore((s) => s.presence);
  const members    = useMembers(30_000);

  // Fetch channels if store is empty (direct URL nav before sidebar loaded)
  useEffect(() => {
    if (channels.length === 0) {
      fetch(`/api/hotbox/channels?org=${ORG}`)
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setChannels(data); })
        .catch(() => {});
    }
  }, [channels.length, setChannels]);

  const memberMap = new Map<string, Member>(members.map((m) => [m.id, m]));

  const dms: DmRow[] = channels
    .filter((c) => c.type === 'dm')
    .map((channel) => {
      const memberId = channel.id.replace(/^dm-/, '');
      const member   = memberMap.get(memberId) ?? memberMap.get(channel.agent_name ?? '');
      const agentKey = channel.agent_name ?? memberId;
      const status   = (presence[agentKey] ?? presence[memberId] ?? 'offline') as PresenceStatus;
      return { channel, member, status, memberId };
    })
    .sort((a, b) => {
      // unread-first
      const ua = a.channel.unread ?? 0;
      const ub = b.channel.unread ?? 0;
      if (ua !== ub) return ub - ua;
      // online-first
      const onlineA = a.status !== 'offline';
      const onlineB = b.status !== 'offline';
      if (onlineA !== onlineB) return onlineA ? -1 : 1;
      // alpha
      return (a.channel.name ?? '').localeCompare(b.channel.name ?? '');
    });

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--hotbox-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center px-4 py-3 border-b border-[var(--hotbox-border-strong)] flex-shrink-0"
        style={{
          background: 'rgba(5,12,20,0.72)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <h1 className="font-semibold text-sm text-[var(--hotbox-text)]">Direct Messages</h1>
        {dms.length > 0 && (
          <span className="ml-2 text-xs text-[var(--hotbox-text-dim)]">({dms.length})</span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto hotbox-scrollbar">
        {dms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 pb-16">
            <span className="text-2xl">💬</span>
            <p className="text-sm text-[var(--hotbox-text-muted)]">No direct messages yet.</p>
            <p className="text-xs text-[var(--hotbox-text-dim)]">Click a member in the sidebar to start a DM.</p>
          </div>
        ) : (
          <ul className="py-2">
            {dms.map(({ channel, member, status, memberId }) => {
              const displayName = member?.name ?? channel.name.replace(/^#/, '') ?? memberId;
              const unread      = channel.unread ?? 0;
              return (
                <li key={channel.id}>
                  <Link
                    href={`/dm/${memberId}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hotbox-surface-2)] transition-colors"
                  >
                    {/* Avatar with role halo */}
                    {(() => {
                      const isAgent = !!member && member.role !== 'user';
                      const isHM    = member?.role === 'headmaster';
                      const isOrch  = member?.role === 'orchestrator';
                      const haloBg  = isHM ? 'rgba(255,215,0,0.12)' : isAgent ? 'var(--hotbox-accent-subtle)' : 'var(--hotbox-surface-2)';
                      const haloClr = isHM ? '#FFD700' : isAgent ? 'var(--hotbox-accent)' : 'var(--hotbox-text-muted)';
                      const haloRing = isHM
                        ? '0 0 0 1.5px rgba(255,215,0,0.60), 0 0 12px rgba(255,215,0,0.25)'
                        : isOrch
                        ? '0 0 0 1.5px rgba(248,254,255,0.40), 0 0 12px rgba(248,254,255,0.15)'
                        : isAgent
                        ? '0 0 0 1.5px rgba(90,218,238,0.50), 0 0 12px rgba(90,218,238,0.20)'
                        : 'none';
                      return (
                        <div
                          className="relative flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold select-none"
                          style={{ background: haloBg, color: haloClr, boxShadow: haloRing }}
                        >
                          {displayName.charAt(0).toUpperCase()}
                          <span className="absolute bottom-0 right-0 p-0.5 rounded-full"
                            style={{ background: 'var(--hotbox-bg)' }}>
                            <PresenceDot status={status} />
                          </span>
                        </div>
                      );
                    })()}

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={[
                          'text-sm truncate',
                          unread > 0 ? 'font-semibold text-[var(--hotbox-text)]' : 'text-[var(--hotbox-text-muted)]',
                        ].join(' ')}>
                          {displayName}
                        </span>
                        {member && <RolePill role={member.role} />}
                      </div>
                      <p className="text-xs text-[var(--hotbox-text-dim)] truncate mt-0.5">
                        {formatRelTime(channel.created_at)}
                      </p>
                    </div>

                    {/* Unread badge */}
                    {unread > 0 && (
                      <span
                        className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none text-white"
                        style={{ background: 'var(--hotbox-accent)' }}
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
