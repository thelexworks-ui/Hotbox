'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHotboxStore } from '@/store/hotbox';
import { useMembers } from '@/hooks/useMembers';
import type { DMThread } from '@/app/api/hotbox/dms/route';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconUserPlus() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" />
    </svg>
  );
}
function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Shared Avatar ─────────────────────────────────────────────────────────────

function Avatar({
  initials, status, size = 48,
}: {
  initials: string; status: 'online' | 'away' | 'offline'; size?: number;
}) {
  const ringColor =
    status === 'online'  ? '#4ADE80' :
    status === 'away'    ? '#FFAF2A' :
                           'rgba(232,244,248,0.20)';
  const glow = status === 'online' ? '0 0 6px rgba(74,222,128,0.50)' : undefined;
  return (
    <div
      className="relative flex-shrink-0 flex items-center justify-center rounded-full select-none"
      style={{
        width: size, height: size,
        background: 'rgba(90,218,238,0.10)',
        color: '#5ADAEE',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: size * 0.35,
        fontWeight: 600,
        boxShadow: `0 0 0 2px ${ringColor}${glow ? `, ${glow}` : ''}`,
      }}
    >
      {initials}
    </div>
  );
}

// ── relativeTime ──────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="flex gap-0.5 items-center h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: 4, height: 4,
            background: '#5ADAEE',
            opacity: 0.7,
            animation: `hx-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────────

type Filter = 'all' | 'starred' | 'unreads' | 'external';

const FILTER_IDS: Filter[] = ['all', 'starred', 'unreads', 'external'];
const FILTER_LABEL: Record<Filter, string> = {
  all:      'All',
  starred:  'VIP',
  unreads:  'Unreads',
  external: 'External',
};

// ── Compose DM sheet ──────────────────────────────────────────────────────────

function ComposeDMSheet({
  onClose,
  onSelect,
}: {
  onClose(): void;
  onSelect(peerId: string): void;
}) {
  const members = useMembers(0);
  const [query, setQuery] = useState('');
  const filtered = members.filter(
    (m) => m.id.includes(query) || m.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 flex flex-col w-full max-w-md rounded-t-2xl md:rounded-2xl overflow-hidden"
        style={{
          background: 'var(--hotbox-surface)',
          border: '1px solid var(--hotbox-border)',
          maxHeight: '60vh',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--hotbox-border)]">
          <span className="font-semibold text-sm text-[var(--hotbox-text)]">New Direct Message</span>
          <button onClick={onClose} className="text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)] p-1">
            <IconClose />
          </button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--hotbox-border)]"
          style={{ color: 'var(--hotbox-text-dim)' }}>
          <IconSearch />
          <input
            autoFocus
            placeholder="Find a teammate…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--hotbox-text)] outline-none placeholder:text-[var(--hotbox-text-dim)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto hotbox-scrollbar">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--hotbox-text-dim)] text-center">No teammates found</p>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => { onClose(); onSelect(m.id); }}
                className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-[var(--hotbox-surface-2)] transition-colors text-left"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ background: 'rgba(90,218,238,0.10)', color: '#5ADAEE' }}
                >
                  {(m.name || m.id).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--hotbox-text)]">{m.name || m.id}</p>
                  <p className="text-xs text-[var(--hotbox-text-dim)]">{m.role}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DmInboxPage() {
  const router      = useRouter();
  const presence    = useHotboxStore((s) => s.presence);
  const typingUsers = useHotboxStore((s) => s.typingUsers);
  const channels    = useHotboxStore((s) => s.channels);

  const [threads, setThreads]         = useState<DMThread[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState<Filter>('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/hotbox/dms');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.threads)) setThreads(data.threads);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
    pollRef.current = setInterval(fetchThreads, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchThreads]);

  // Overlay real-time unread + presence + typing from store
  const storeUnreadMap = new Map(
    channels.filter((c) => c.type === 'dm').map((c) => [c.id, c.unread ?? 0]),
  );
  const enriched = threads.map((t) => ({
    ...t,
    unreadCount:  storeUnreadMap.get(t.channelId) ?? t.unreadCount,
    peerStatus:   ((presence[t.peerId] === 'crashed' ? 'away' : presence[t.peerId]) ?? t.peerStatus) as DMThread['peerStatus'],
    peerIsTyping: (typingUsers[t.channelId] ?? []).includes(t.peerId),
  }));

  const displayed = enriched.filter((t) => {
    if (filter === 'starred')  return t.isStarred;
    if (filter === 'unreads')  return t.unreadCount > 0;
    if (filter === 'external') return t.isExternal;
    return true;
  });

  const contacts = enriched.slice(0, 8);

  const handleSelectPeer = useCallback(async (peerId: string) => {
    try {
      await fetch('/api/hotbox/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId }),
      });
    } catch { /* navigate anyway; thread page creates channel too */ }
    router.push(`/dm/${peerId}`);
  }, [router]);

  const handleStar = useCallback(async (channelId: string, current: boolean) => {
    setThreads((prev) =>
      prev.map((t) => t.channelId === channelId ? { ...t, isStarred: !current } : t),
    );
    try {
      await fetch(`/api/hotbox/dms/${channelId}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: !current }),
      });
    } catch { /* optimistic update stands */ }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--hotbox-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center px-4 h-14 flex-shrink-0"
        style={{
          background: 'rgba(5,12,20,0.72)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--hotbox-border-strong)',
        }}
      >
        <h1 className="text-[#E8F4F8] text-xl font-semibold">DMs</h1>
      </div>

      {/* Contact strip */}
      {contacts.length > 0 && (
        <div
          className="flex gap-4 px-4 py-3 overflow-x-auto scrollbar-none flex-shrink-0"
          style={{ borderBottom: '1px solid var(--hotbox-border)' }}
        >
          {contacts.map((t) => (
            <button
              key={t.channelId}
              onClick={() => router.push(`/dm/${t.peerId}`)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <Avatar initials={t.peerInitials} status={t.peerStatus} size={56} />
              <span
                className="text-[11px] max-w-[64px] truncate text-center"
                style={{ color: 'rgba(232,244,248,0.60)', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {t.peerName}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none flex-shrink-0">
        {FILTER_IDS.map((id) => (
          <button
            key={id}
            data-testid={`dm-filter-${id}`}
            onClick={() => setFilter(id)}
            className="flex items-center px-3 py-1.5 rounded-full text-xs flex-shrink-0 transition-colors border"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              ...(filter === id
                ? { background: 'rgba(90,218,238,0.15)', borderColor: 'rgba(90,218,238,0.50)', color: '#5ADAEE' }
                : { background: 'transparent', borderColor: 'rgba(232,244,248,0.12)', color: 'rgba(232,244,248,0.50)' }),
            }}
          >
            {FILTER_LABEL[id]}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto hotbox-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-xs text-[var(--hotbox-text-dim)] animate-pulse">Loading…</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-2xl">💬</span>
            <p className="text-sm text-[var(--hotbox-text-muted)]">
              {filter === 'all' ? 'No direct messages yet.' : `No ${filter} threads.`}
            </p>
            {filter === 'all' && (
              <p className="text-xs text-[var(--hotbox-text-dim)]">
                Tap + to start a conversation.
              </p>
            )}
          </div>
        ) : (
          <ul>
            {displayed.map((t) => (
              <li key={t.channelId} className="group relative">
                <button
                  onClick={() => router.push(`/dm/${t.peerId}`)}
                  className="flex items-center gap-3 px-4 py-3 w-full text-left transition-colors"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(90,218,238,0.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Avatar initials={t.peerInitials} status={t.peerStatus} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-sm truncate"
                        style={{
                          color: t.unreadCount > 0 ? '#E8F4F8' : 'rgba(232,244,248,0.70)',
                          fontWeight: t.unreadCount > 0 ? 600 : 400,
                        }}
                      >
                        {t.peerName}
                      </span>
                      <span
                        className="text-[10px] flex-shrink-0"
                        style={{ color: 'rgba(232,244,248,0.35)', fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {relativeTime(t.lastMessageAt)}
                      </span>
                    </div>
                    {t.peerIsTyping ? (
                      <TypingDots />
                    ) : (
                      <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(232,244,248,0.40)' }}>
                        {t.lastMessageIsOwn && t.lastMessagePreview ? 'You: ' : ''}
                        {t.lastMessagePreview}
                      </p>
                    )}
                  </div>
                  {t.unreadCount > 0 && (
                    <span
                      className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                      style={{ background: '#5ADAEE', color: '#050C14' }}
                    >
                      {t.unreadCount > 99 ? '99+' : t.unreadCount}
                    </span>
                  )}
                </button>
                {/* Star — visible on hover */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleStar(t.channelId, t.isStarred); }}
                  className="absolute right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5"
                  style={{ color: t.isStarred ? '#FFAF2A' : 'rgba(232,244,248,0.30)' }}
                  aria-label={t.isStarred ? 'Unstar' : 'Star'}
                >
                  <IconStar filled={t.isStarred} />
                </button>
              </li>
            ))}

            {/* Add Teammates row */}
            <li>
              <button
                className="flex items-center gap-3 px-4 py-3 w-full text-left transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(90,218,238,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => alert('Invite by email — coming soon')}
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(90,218,238,0.08)',
                    border: '1px solid rgba(90,218,238,0.20)',
                    color: '#5ADAEE',
                  }}
                >
                  <IconUserPlus />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#E8F4F8' }}>Add Teammates</p>
                  <p className="text-xs" style={{ color: 'rgba(232,244,248,0.40)' }}>By email or username</p>
                </div>
              </button>
            </li>
          </ul>
        )}
      </div>

      {/* Compose FAB */}
      <button
        onClick={() => setComposeOpen(true)}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full flex items-center justify-center z-10 active:scale-95 transition-transform"
        style={{ background: '#5ADAEE', color: '#050C14', boxShadow: '0 4px 20px rgba(90,218,238,0.45)' }}
        aria-label="New direct message"
      >
        <IconPlus />
      </button>

      {composeOpen && (
        <ComposeDMSheet onClose={() => setComposeOpen(false)} onSelect={handleSelectPeer} />
      )}

      <style jsx global>{`
        @keyframes hx-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%            { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
