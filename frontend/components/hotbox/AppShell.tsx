'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { KeyRotationWatcher } from './KeyRotationWatcher';
import { NotificationsProvider } from './NotificationsProvider';
import { useWs } from './WsProvider';
import { useKeystore } from './KeystoreProvider';

function WsStatusBar() {
  const { status } = useWs();
  if (status === 'open') return null;
  const color = status === 'closed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-mention)';
  const label = status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…' : 'Disconnected';
  return (
    <div
      className="w-full text-center text-[11px] py-0.5 font-medium"
      style={{ background: color, color: '#fff' }}
    >
      {label}
    </div>
  );
}

function KeystoreLoadingScreen() {
  return (
    <div
      className="flex items-center justify-center h-screen gap-3"
      style={{ background: 'var(--hotbox-bg)', color: 'var(--hotbox-text-dim)' }}
    >
      <span data-testid="keystore-spinner" className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Initialising secure keystore…</span>
    </div>
  );
}

function KeystoreErrorScreen({ error, onRetry }: { error: string; onRetry(): void }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen gap-4"
      style={{ background: 'var(--hotbox-bg)' }}
    >
      <p className="text-sm text-[var(--hotbox-crashed)]">
        Keystore unavailable — {error}
      </p>
      <p className="text-xs text-[var(--hotbox-text-dim)] max-w-xs text-center">
        Try refreshing. If this persists, clear site data in browser settings.
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-1.5 rounded text-sm font-medium bg-[var(--hotbox-accent)] text-white hover:bg-[var(--hotbox-accent-hover)]"
      >
        Retry
      </button>
    </div>
  );
}

type TabItem = { icon: string; label: string; action: 'home' | 'dms' | 'activity' | 'more' };

const TABS: TabItem[] = [
  { icon: '⌂', label: 'Home',     action: 'home' },
  { icon: '💬', label: 'DMs',      action: 'dms' },
  { icon: '🔔', label: 'Activity', action: 'activity' },
  { icon: '⋯',  label: 'More',    action: 'more' },
];

function MobileTabBar({ onOpenDrawer }: { onOpenDrawer(): void }) {
  const pathname = usePathname();
  const router   = useRouter();

  const handleTab = (action: TabItem['action']) => {
    if (action === 'dms') { router.push('/dm'); return; }
    onOpenDrawer();
  };

  const isHome = !pathname.startsWith('/dm') && !pathname.startsWith('/activity');
  const isDMs  = pathname.startsWith('/dm');

  return (
    <nav
      className="md:hidden flex items-stretch fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--hotbox-border-strong)]"
      style={{ height: 64, background: 'var(--hotbox-bg-raised)', boxShadow: '0 -4px 16px oklch(0 0 0 / 0.40)' }}
      data-testid="mobile-tab-bar"
    >
      {TABS.map((tab) => {
        const active =
          (tab.action === 'home' && isHome) ||
          (tab.action === 'dms'  && isDMs);
        return (
          <button
            key={tab.action}
            onClick={() => handleTab(tab.action)}
            className="flex-1 relative flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors"
            style={{ color: active ? 'var(--hotbox-accent)' : 'var(--hotbox-text-muted)' }}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-[10px] font-semibold leading-none tracking-wide">{tab.label}</span>
            {active && (
              <span
                className="absolute bottom-0 rounded-t-full"
                style={{ width: 24, height: 2, background: 'var(--hotbox-accent)', left: '50%', transform: 'translateX(-50%)' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready } = useKeystore();
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  if (!ready) return <KeystoreLoadingScreen />;

  return (
    <div className="flex flex-col h-screen">
      <KeyRotationWatcher />
      <NotificationsProvider />
      <WsStatusBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop sidebar */}
        <aside
          data-testid="sidebar"
          className="hidden md:flex flex-col flex-shrink-0 w-60 border-r border-[var(--hotbox-border)]"
          style={{
            background: 'var(--hotbox-surface)',
            backdropFilter: 'blur(10px)',
            borderRightColor: 'rgba(26,74,90,0.60)',
            boxShadow: 'inset -1px 0 0 rgba(90,218,238,0.06)',
          }}
        >
          <Sidebar />
        </aside>

        {/* Mobile sidebar drawer */}
        {mobileDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 hotbox-backdrop"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <aside
              className="relative z-10 flex flex-col w-72 h-full border-r border-[var(--hotbox-border)]"
              style={{ background: 'var(--hotbox-surface)', boxShadow: 'var(--hotbox-shadow-lg)' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--hotbox-border)]">
                <span className="font-semibold text-sm text-[var(--hotbox-text)]">Menu</span>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)] text-lg leading-none p-1"
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>
              <Sidebar onItemClick={() => setMobileDrawerOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main content — extra bottom padding on mobile for the tab bar */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden pb-16 md:pb-0">
          {children}
        </main>
      </div>

      <MobileTabBar onOpenDrawer={() => setMobileDrawerOpen(true)} />
    </div>
  );
}
