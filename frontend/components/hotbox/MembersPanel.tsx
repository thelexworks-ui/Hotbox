'use client';

import React, { useMemo, useState } from 'react';
import { useMembers, type Member } from '@/hooks/useMembers';
import { useHotboxStore, type PresenceStatus } from '@/store/hotbox';

// ── Shared sub-components ────────────────────────────────────────────────────

function PresenceDot({ status, size = 'md' }: { status: PresenceStatus; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 7 : 9;
  const color =
    status === 'online'  ? 'var(--hotbox-online)'  :
    status === 'crashed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-offline)';
  return (
    <span
      className="flex-shrink-0 rounded-full inline-block"
      style={{ width: dim, height: dim, background: color }}
      aria-label={status}
    />
  );
}

export function RoleBadge({ role }: { role: 'orchestrator' | 'headmaster' }) {
  const label = role === 'orchestrator' ? 'orch' : 'hm';
  const bg = role === 'orchestrator' ? 'var(--hotbox-accent-subtle)' : 'rgba(250,166,26,0.12)';
  const color = role === 'orchestrator' ? 'var(--hotbox-accent)' : 'var(--hotbox-mention)';
  return (
    <span
      className="text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

export function MemberAvatar({ member, size = 32 }: { member: Member; size?: number }) {
  const isAgent = member.role !== 'user';
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-semibold"
      style={{
        width: size,
        height: size,
        background: isAgent ? 'var(--hotbox-accent-subtle)' : 'var(--hotbox-border)',
        color: isAgent ? 'var(--hotbox-accent)' : 'var(--hotbox-text-muted)',
        borderRadius: isAgent ? 6 : size / 2,
      }}
    >
      {isAgent ? (
        // Bot icon SVG
        <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v4" />
          <line x1="8" y1="16" x2="8" y2="16" />
          <line x1="16" y1="16" x2="16" y2="16" />
        </svg>
      ) : (
        member.name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

type FilterValue = 'all' | 'user' | 'agent';
const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'user', label: 'Users' },
  { value: 'agent', label: 'Agents' },
];
const AGENT_ROLES = ['agent', 'orchestrator', 'headmaster'] as const;

interface MemberRowProps {
  member: Member;
  presence: PresenceStatus | undefined;
  expanded: boolean;
  onToggle(): void;
}

function MemberRow({ member, presence, expanded, onToggle }: MemberRowProps) {
  const status = presence ?? 'offline';
  const subtitle = AGENT_ROLES.includes(member.role as typeof AGENT_ROLES[number]) ? 'agent' : 'member';
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors duration-100 text-left"
        style={{ background: expanded ? 'var(--hotbox-surface-2)' : undefined }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hotbox-surface-2)'; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = ''; }}
      >
        <MemberAvatar member={member} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium truncate" style={{ color: 'var(--hotbox-text)' }}>
              {member.name}
            </span>
            {(member.role === 'headmaster' || member.role === 'orchestrator') && (
              <RoleBadge role={member.role} />
            )}
          </div>
          <span className="text-xs" style={{ color: 'var(--hotbox-text-dim)' }}>
            {subtitle}
            {status === 'crashed' ? ' · crashed' : status === 'offline' ? '' : ''}
          </span>
        </div>
        <PresenceDot status={status} size="md" />
      </button>

      {expanded && (
        <div
          className="px-4 pb-2 border-b"
          style={{ background: 'rgba(0,0,0,0.15)', borderColor: 'var(--hotbox-border)' }}
        >
          <div className="flex items-center gap-2 py-1.5">
            <span className="text-xs w-14 flex-shrink-0" style={{ color: 'var(--hotbox-text-dim)' }}>pubkey</span>
            <code className="text-xs font-mono truncate flex-1" style={{ color: 'var(--hotbox-text-muted)' }}>
              {member.pubkey ? `${member.pubkey.slice(0, 20)}…` : 'none'}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose(): void;
  initialFilter?: FilterValue;
}

export function MembersPanel({ open, onClose, initialFilter = 'all' }: Props) {
  const members = useMembers(30_000);
  const presence = useHotboxStore((s) => s.presence);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>(initialFilter);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const byRole = filter === 'all'
      ? members
      : filter === 'agent'
      ? members.filter((m) => AGENT_ROLES.includes(m.role as typeof AGENT_ROLES[number]))
      : members.filter((m) => m.role === 'user');
    const q = search.toLowerCase();
    return q ? byRole.filter((m) => m.name.toLowerCase().includes(q)) : byRole;
  }, [members, filter, search]);

  // Group: online/crashed first, offline last
  const online = filtered.filter((m) => { const s = presence[m.id] ?? presence[m.name]; return s === 'online' || s === 'crashed'; });
  const offline = filtered.filter((m) => { const s = presence[m.id] ?? presence[m.name]; return !s || s === 'offline'; });

  return (
    <>
      {/* Desktop: right slide-out */}
      <div
        className="hidden md:flex flex-col fixed right-0 top-0 h-full z-40 border-l"
        style={{
          width: 280,
          background: 'var(--hotbox-surface)',
          borderColor: 'var(--hotbox-border)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-out',
        }}
      >
        <PanelContent
          open={open}
          onClose={onClose}
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          online={online}
          offline={offline}
          presence={presence}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
        />
      </div>

      {/* Mobile: bottom sheet overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
          onClick={onClose}
        >
          <div
            className="flex flex-col rounded-t-xl border-t"
            style={{
              background: 'var(--hotbox-surface)',
              borderColor: 'var(--hotbox-border)',
              maxHeight: '95vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <PanelContent
              open={open}
              onClose={onClose}
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
              online={online}
              offline={offline}
              presence={presence}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
            />
          </div>
        </div>
      )}
    </>
  );
}

interface PanelContentProps {
  open: boolean;
  onClose(): void;
  search: string;
  setSearch(s: string): void;
  filter: FilterValue;
  setFilter(f: FilterValue): void;
  online: Member[];
  offline: Member[];
  presence: Record<string, PresenceStatus>;
  expandedId: string | null;
  setExpandedId(id: string | null): void;
}

function PanelContent({ onClose, search, setSearch, filter, setFilter, online, offline, presence, expandedId, setExpandedId }: PanelContentProps) {
  const total = online.length + offline.length;
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--hotbox-text)' }}>Members</h2>
        <button
          onClick={onClose}
          className="transition-colors"
          style={{ color: 'var(--hotbox-text-dim)' }}
          aria-label="Close members panel"
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text-dim)'; }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border" style={{ background: 'var(--hotbox-surface-2)', borderColor: 'var(--hotbox-border)' }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--hotbox-text-dim)', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Find a member"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--hotbox-text)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'var(--hotbox-text-dim)' }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Role filter */}
      <div className="flex gap-1 px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="flex-1 text-xs font-medium py-1 rounded transition-colors duration-100"
            style={{
              background: filter === f.value ? 'var(--hotbox-surface-2)' : undefined,
              color: filter === f.value ? 'var(--hotbox-accent)' : 'var(--hotbox-text-dim)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 hotbox-scrollbar">
        {total === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <span className="text-sm" style={{ color: 'var(--hotbox-text-dim)' }}>
              {search ? `No members match "${search}"` : 'No members yet.'}
            </span>
          </div>
        )}

        {online.length > 0 && (
          <>
            <div className="px-4 py-1 sticky top-0" style={{ background: 'var(--hotbox-surface)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--hotbox-text-dim)' }}>
                Online — {online.length}
              </span>
            </div>
            {online.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                presence={presence[m.id] ?? presence[m.name]}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
              />
            ))}
          </>
        )}

        {offline.length > 0 && (
          <>
            <div className="px-4 py-1 sticky top-0" style={{ background: 'var(--hotbox-surface)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--hotbox-text-dim)' }}>
                Offline — {offline.length}
              </span>
            </div>
            {offline.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                presence={presence[m.id] ?? presence[m.name]}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}
