'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
// Note: NotificationToast removed — transient toasts moved to MentionToastLayer in AppShell
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWs } from './WsProvider';
import { useHotboxStore } from '@/store/hotbox';
import type { HotboxMessage } from '@/lib/hotbox/types';

const MAX_HISTORY = 50;

interface HotboxNotification {
  id: string;
  channelId: string;
  channelName: string;
  senderId: string;
  ts: string;
  read: boolean;
  href: string;
}

function channelHref(channelId: string): string {
  return channelId.startsWith('dm-')
    ? `/dm/${channelId.replace(/^dm-/, '')}`
    : `/channels/${channelId}`;
}

function isViewingChannel(channelId: string, pathname: string): boolean {
  return pathname === channelHref(channelId);
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Bell icon ────────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────

function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: HotboxNotification;
  onDismiss(): void;
}) {
  return (
    <Link
      href={notification.href}
      onClick={onDismiss}
      className="flex items-start gap-3 rounded-lg shadow-lg px-4 py-3 max-w-xs w-full"
      style={{
        background: 'var(--hotbox-surface)',
        border: '1px solid var(--hotbox-border)',
        color: 'var(--hotbox-text)',
        textDecoration: 'none',
      }}
    >
      {/* Accent stripe */}
      <div className="flex-shrink-0 w-1 self-stretch rounded-full"
        style={{ background: 'var(--hotbox-accent)' }} />

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-[var(--hotbox-text-dim)] truncate">
          {notification.channelName}
        </p>
        <p className="text-sm font-medium text-[var(--hotbox-text)] truncate">
          {notification.senderId}
        </p>
        <p className="text-[11px] text-[var(--hotbox-text-dim)] mt-0.5">
          New message · {formatTime(notification.ts)}
        </p>
      </div>

      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
        className="flex-shrink-0 text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)] mt-0.5"
        aria-label="Dismiss"
      >
        <CloseIcon />
      </button>
    </Link>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

function NotificationPanel({
  notifications,
  onClose,
  onMarkAllRead,
}: {
  notifications: HotboxNotification[];
  onClose(): void;
  onMarkAllRead(): void;
}) {
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div
      className="absolute right-0 top-full mt-1 w-80 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden"
      style={{
        background: 'var(--hotbox-surface)',
        border: '1px solid var(--hotbox-border)',
        maxHeight: 480,
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--hotbox-border)] flex-shrink-0">
        <span className="text-sm font-semibold text-[var(--hotbox-text)]">Notifications</span>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-[11px] text-[var(--hotbox-accent)] hover:opacity-75 transition-opacity"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)]"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto hotbox-scrollbar">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="text-2xl">🔔</span>
            <p className="text-sm text-[var(--hotbox-text-dim)]">No notifications yet.</p>
          </div>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  onClick={onClose}
                  className={[
                    'flex items-start gap-3 px-4 py-3 hover:bg-[var(--hotbox-surface-2)] transition-colors border-b border-[var(--hotbox-border)]',
                    !n.read ? 'bg-[color-mix(in_srgb,var(--hotbox-accent)_8%,transparent)]' : '',
                  ].join(' ')}
                  style={{ textDecoration: 'none', color: 'var(--hotbox-text)' }}
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 mt-1.5">
                    {!n.read ? (
                      <span className="inline-block w-2 h-2 rounded-full"
                        style={{ background: 'var(--hotbox-accent)' }} />
                    ) : (
                      <span className="inline-block w-2 h-2" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[var(--hotbox-text-dim)] truncate">{n.channelName}</p>
                    <p className="text-sm font-medium truncate">{n.senderId}</p>
                    <p className="text-[11px] text-[var(--hotbox-text-dim)] mt-0.5">
                      New message · {formatTime(n.ts)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── NotificationsProvider (mounts inside AppShell) ───────────────────────────
// Owns the bell-panel notification history (all messages).
// The @-mention / DM toast is handled separately by useMentionDetect + MentionToastLayer
// in AppShell — this component no longer fires transient toasts.

export function NotificationsProvider() {
  const { subscribe, send, status, sendReplay } = useWs();
  const channels       = useHotboxStore((s) => s.channels);
  const appendMessage  = useHotboxStore((s) => s.appendMessage);
  const pathname       = usePathname();

  const [history, setHistory]     = useState<HotboxNotification[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef                  = useRef<HTMLDivElement>(null);

  const pathnameRef = useRef(pathname);
  const channelsRef = useRef(channels);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  const markAllRead = useCallback(() => {
    setHistory((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  // Join all channels so msg.new is delivered from any channel, then fire the
  // deferred replay (must come AFTER channel.join — server only replays subscribed channels).
  useEffect(() => {
    if (status !== 'open' || channels.length === 0) return;
    channels.forEach((ch) => send({ type: 'channel.join', channel_id: ch.id }));
    sendReplay();
  }, [status, channels, send, sendReplay]);

  // All-messages subscription — drives unread badge (via appendMessage) and bell panel history.
  // appendMessage is safe to call for the active channel too: the store deduplicates on msg.id,
  // so the ChannelView's own appendMessage call and this one are both no-ops after the first.
  useEffect(() => {
    return subscribe('msg.new', (serverMsg) => {
      const m = serverMsg.message as HotboxMessage | undefined;
      if (!m) return;

      const channelId = m.channel_id;

      // Always append — store.appendMessage increments unread only when channel is not active,
      // and deduplicates silently when ChannelView has already appended the same message.
      appendMessage(channelId, m);

      // Bell panel history: skip if the user is currently viewing this channel
      if (isViewingChannel(channelId, pathnameRef.current)) return;

      const channel     = channelsRef.current.find((c) => c.id === channelId);
      const channelName = channel?.name?.replace(/^#/, '') ?? channelId;
      const href        = channelHref(channelId);

      const notification: HotboxNotification = {
        id: m.id, channelId, channelName,
        senderId: m.sender_id, ts: m.ts,
        read: false, href,
      };

      setHistory((prev) => [notification, ...prev].slice(0, MAX_HISTORY));
    });
  }, [subscribe, appendMessage]);

  // Mark panel items read when navigating to that channel
  useEffect(() => {
    setHistory((prev) =>
      prev.map((n) => isViewingChannel(n.channelId, pathname) ? { ...n, read: true } : n)
    );
  }, [pathname]);

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  const unreadCount = history.filter((n) => !n.read).length;

  const handleBellClick = () => {
    setPanelOpen((o) => !o);
    if (!panelOpen) markAllRead();
  };

  return (
    <div
      ref={panelRef}
      className="hidden md:block fixed top-3 right-4 z-50"
    >
      <button
        onClick={handleBellClick}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className="relative flex items-center justify-center w-8 h-8 rounded-full transition-colors"
        style={{
          background: panelOpen ? 'var(--hotbox-surface-2)' : 'transparent',
          color: 'var(--hotbox-text-muted)',
        }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold leading-4 text-center text-white"
            style={{ background: 'var(--hotbox-mention)' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {panelOpen && (
        <NotificationPanel
          notifications={history}
          onClose={() => setPanelOpen(false)}
          onMarkAllRead={markAllRead}
        />
      )}
    </div>
  );
}
