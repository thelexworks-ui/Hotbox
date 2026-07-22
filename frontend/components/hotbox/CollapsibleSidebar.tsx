'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHotboxStore, type ChannelMeta, type PresenceStatus } from '@/store/hotbox';
import { useWs } from './WsProvider';
import { useHeadmasters, useOrchestrators, useAgentsOnly, type Member } from '@/hooks/useMembers';
import { useAuth } from './AuthProvider';

interface CollapsibleSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ── Presence dot ──────────────────────────────────────────────────────────────

function PresenceDot({ status, size = 7 }: { status: PresenceStatus; size?: number }) {
  const color =
    status === 'online'  ? 'var(--hotbox-online)'  :
    status === 'crashed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-offline)';
  return (
    <span
      className="rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: color, display: 'inline-block' }}
    />
  );
}

// ── Nav section ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { icon: '⬡', label: 'Dashboard', href: '/dashboard' },
  { icon: '#', label: 'Channels',   href: '/channels' },
  { icon: '✉', label: 'DMs',        href: '/dm' },
];

function NavItem({ icon, label, href, active, collapsed }: {
  icon: string; label: string; href: string; active: boolean; collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-2.5 rounded mx-1 transition-colors',
        'text-sm px-[11px] py-[5px]',
        active
          ? 'bg-[var(--hotbox-selected)] text-[var(--hotbox-text)] font-medium'
          : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface-hover)] hover:text-[var(--hotbox-text)]',
      ].join(' ')}
    >
      <span className="text-[13px] w-[16px] text-center flex-shrink-0">{icon}</span>
      <span
        className="truncate transition-opacity duration-150"
        style={{ opacity: collapsed ? 0 : 1, pointerEvents: collapsed ? 'none' : undefined }}
      >
        {label}
      </span>
    </Link>
  );
}

// ── Channel item ──────────────────────────────────────────────────────────────

function ChannelItem({ channel, collapsed }: { channel: ChannelMeta; collapsed: boolean }) {
  const pathname = usePathname();
  const presence = useHotboxStore((s) => s.presence[channel.agent_name ?? '']);
  const href = channel.type === 'dm' ? `/dm/${channel.id.replace(/^dm-/, '')}` : `/channels/${channel.id}`;
  const active = pathname.includes(channel.id);
  const unread = channel.unread ?? 0;

  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-2 px-2 py-[3px] rounded mx-1 transition-colors relative',
        active
          ? 'bg-[var(--hotbox-selected)] text-[var(--hotbox-text)] font-medium'
          : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface-hover)] hover:text-[var(--hotbox-text)]',
      ].join(' ')}
      title={channel.name}
    >
      {channel.agent_name && presence
        ? <PresenceDot status={presence} />
        : <span className="text-[var(--hotbox-text-dim)] text-xs leading-none flex-shrink-0">#</span>}
      <span
        className="truncate flex-1 text-sm transition-opacity duration-150"
        style={{ opacity: collapsed ? 0 : 1 }}
      >
        {channel.name.replace(/^#/, '')}
      </span>
      {!collapsed && unread > 0 && (
        <span className="ml-auto bg-[var(--hotbox-accent)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          {unread}
        </span>
      )}
    </Link>
  );
}

// ── DM member item ────────────────────────────────────────────────────────────

function MemberItem({ member, status, collapsed }: { member: Member; status: PresenceStatus; collapsed: boolean }) {
  const pathname = usePathname();
  const href = `/dm/${member.id}`;
  const active = pathname.includes(member.id);
  const initials = member.name.charAt(0).toUpperCase();

  return (
    <Link
      href={href}
      className={[
        'flex items-center gap-2 px-2 py-[3px] rounded mx-1 transition-colors',
        active
          ? 'bg-[var(--hotbox-selected)] text-[var(--hotbox-text)] font-medium'
          : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface-hover)] hover:text-[var(--hotbox-text)]',
      ].join(' ')}
      title={member.name}
    >
      <div
        className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 relative"
        style={{ background: 'rgba(90,218,238,0.10)', border: '1px solid rgba(90,218,238,0.18)', color: '#5ADAEE' }}
      >
        {initials}
        <span
          className="absolute -bottom-[1px] -right-[1px] w-[6px] h-[6px] rounded-full"
          style={{
            background:
              status === 'online'  ? 'var(--hotbox-online)'  :
              status === 'crashed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-offline)',
            border: '1px solid var(--hotbox-surface)',
          }}
        />
      </div>
      <span
        className="truncate flex-1 text-sm transition-opacity duration-150"
        style={{ opacity: collapsed ? 0 : 1 }}
      >
        {member.name}
      </span>
    </Link>
  );
}

// ── CollapsibleSidebar ────────────────────────────────────────────────────────

export function CollapsibleSidebar({ collapsed, onToggle }: CollapsibleSidebarProps) {
  const pathname = usePathname();
  const channels    = useHotboxStore((s) => s.channels);
  const setChannels = useHotboxStore((s) => s.setChannels);
  const appendChannel = useHotboxStore((s) => s.appendChannel);
  const setPresence = useHotboxStore((s) => s.setPresence);
  const presence    = useHotboxStore((s) => s.presence);
  const { subscribe } = useWs();

  const headmasters   = useHeadmasters(30_000);
  const orchestrators = useOrchestrators(30_000);
  const agentsOnly    = useAgentsOnly(15_000);

  const { org: authOrg } = useAuth();
  const orgInitials = (authOrg || 'HX').slice(0, 2).toUpperCase();
  const orgDisplay  = authOrg || 'Workspace';

  const refetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/hotbox/channels');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setChannels(data);
    } catch {}
  }, [setChannels]);

  useEffect(() => { refetchChannels(); }, [refetchChannels]);

  useEffect(() => {
    fetch('/api/hotbox/presence')
      .then((r) => { if (!r.ok) return; return r.json(); })
      .then((data: Record<string, PresenceStatus> | undefined) => {
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

  const publicChannels = channels.filter((c) => c.type !== 'dm');
  const allMembers = [...headmasters, ...orchestrators, ...agentsOnly].slice(0, 12);

  // Total DM unread count for badge on DM nav item
  const dmUnread = channels
    .filter((c) => c.type === 'dm')
    .reduce((sum, c) => sum + (c.unread ?? 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute z-30 flex items-center justify-center transition-colors duration-150 hover:border-[rgba(90,218,238,0.40)]"
        style={{
          right: -11,
          top: 13,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'var(--hotbox-surface)',
          border: '1px solid rgba(26,74,90,0.60)',
          color: 'rgba(232,244,248,0.35)',
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        {collapsed ? '▶' : '◀'}
      </button>

      {/* Org header */}
      <div
        className="flex items-center gap-2.5 px-3 py-[14px] border-b flex-shrink-0"
        style={{ borderColor: 'rgba(26,74,90,0.50)' }}
      >
        <div
          className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-[9px] font-bold font-mono flex-shrink-0"
          style={{ background: 'rgba(90,218,238,0.12)', border: '1px solid rgba(90,218,238,0.30)', color: '#5ADAEE' }}
        >
          {orgInitials}
        </div>
        <span
          className="text-sm font-semibold truncate transition-opacity duration-150"
          style={{ color: 'var(--hotbox-text)', opacity: collapsed ? 0 : 1 }}
        >
          {orgDisplay}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {/* Nav */}
        <div className="mb-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const showBadge = item.href === '/dm' && dmUnread > 0 && !collapsed;
            return (
              <div key={item.href} className="relative">
                <NavItem
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={active}
                  collapsed={collapsed}
                />
                {showBadge && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-[var(--hotbox-accent)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                  >
                    {dmUnread}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="h-px mx-3 mb-2" style={{ background: 'rgba(26,74,90,0.40)' }} />

        {/* Channels */}
        {publicChannels.length > 0 && (
          <div className="mb-2">
            {!collapsed && (
              <div
                className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', color: 'rgba(232,244,248,0.35)' }}
              >
                Channels
              </div>
            )}
            {publicChannels.map((ch) => (
              <ChannelItem key={ch.id} channel={ch} collapsed={collapsed} />
            ))}
          </div>
        )}

        {/* Direct Messages */}
        {allMembers.length > 0 && (
          <div className="mb-2">
            {!collapsed && (
              <div
                className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', color: 'rgba(232,244,248,0.35)' }}
              >
                Direct messages
              </div>
            )}
            {allMembers.map((m) => (
              <MemberItem
                key={m.id}
                member={m}
                status={(presence[m.id] ?? presence[m.name] ?? 'offline') as PresenceStatus}
                collapsed={collapsed}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t flex-shrink-0" style={{ borderColor: 'rgba(26,74,90,0.50)' }}>
        {!collapsed && (
          <div className="px-3 pt-3 pb-1">
            <button
              className="w-full text-left text-[12px] px-2 py-1.5 rounded transition-colors hover:bg-[rgba(90,218,238,0.06)]"
              style={{ color: 'rgba(232,244,248,0.40)' }}
            >
              + New channel
            </button>
          </div>
        )}

        <ProfileFooter collapsed={collapsed} />
      </div>
    </div>
  );
}

function ProfileFooter({ collapsed }: { collapsed: boolean }) {
  const { name, org, logout } = useAuth();
  const initials = (name || org || 'HX').slice(0, 2).toUpperCase();

  if (collapsed) {
    return (
      <div className="flex justify-center py-2">
        <Link
          href="/account"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono transition-colors hover:bg-[rgba(90,218,238,0.12)]"
          style={{
            background: 'rgba(90,218,238,0.08)',
            border: '1px solid rgba(90,218,238,0.18)',
            color: '#5ADAEE',
          }}
          title="Account settings"
        >
          {initials}
        </Link>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 flex items-center gap-2">
      <Link
        href="/account"
        className="flex items-center gap-2 flex-1 min-w-0 rounded-lg px-2 py-1.5 transition-colors hover:bg-[rgba(90,218,238,0.06)]"
        title="Account settings"
      >
        <span
          className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0"
          style={{
            background: 'rgba(90,218,238,0.10)',
            border: '1px solid rgba(90,218,238,0.20)',
            color: '#5ADAEE',
          }}
        >
          {initials}
        </span>
        <span className="truncate text-[12px]" style={{ color: 'rgba(232,244,248,0.60)' }}>
          {name || org || 'Account'}
        </span>
      </Link>

      <button
        onClick={() => void logout()}
        title="Sign out"
        className="flex-shrink-0 p-1.5 rounded transition-colors hover:bg-[rgba(255,77,77,0.08)]"
        style={{ color: 'rgba(232,244,248,0.30)' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}
