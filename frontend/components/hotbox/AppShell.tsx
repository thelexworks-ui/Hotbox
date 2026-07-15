'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { KeyRotationWatcher } from './KeyRotationWatcher';
import { KeyLossWarningModal } from './KeyLossWarningModal';
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
      className="md:hidden flex items-stretch fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--hotbox-border)]"
      style={{ height: 64, background: 'var(--hotbox-surface)' }}
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
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[var(--hotbox-text-muted)] active:opacity-70"
            style={active ? { color: 'var(--hotbox-accent)' } : undefined}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-[10px] font-medium leading-none">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, initError, retryInit, keyLossAckRequired, acknowledgeKeyLoss } = useKeystore();
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  if (keyLossAckRequired) {
    return (
      <div className="flex flex-col h-screen" style={{ background: 'var(--hotbox-bg)' }}>
        <KeyLossWarningModal onConfirm={acknowledgeKeyLoss} />
      </div>
    );
  }

  if (!ready) {
    if (initError) return <KeystoreErrorScreen error={initError} onRetry={retryInit} />;
    return <KeystoreLoadingScreen />;
  }

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
          style={{ background: 'var(--hotbox-surface)' }}
        >
          <Sidebar />
        </aside>

        {/* Mobile sidebar drawer */}
        {mobileDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <aside
              className="relative z-10 flex flex-col w-72 h-full shadow-2xl border-r border-[var(--hotbox-border)]"
              style={{ background: 'var(--hotbox-surface)' }}
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
