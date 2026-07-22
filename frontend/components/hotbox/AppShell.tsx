'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { KeyRotationWatcher } from './KeyRotationWatcher';
import { NotificationsProvider } from './NotificationsProvider';
import { MentionToastLayer, useMentionToasts } from './MentionToast';
import { useWs } from './WsProvider';
import { useKeystore } from './KeystoreProvider';
import { useMentionDetect } from '@/hooks/useMentionDetect';

const NeuralGlobe = dynamic(
  () => import('@/app/preview/dashboard-v2/NeuralGlobe'),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: '100%', height: '100%', background: '#050C14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#5ADAEE', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, opacity: 0.7, letterSpacing: '0.06em' }}>
          Initialising neural link…
        </span>
      </div>
    ),
  }
);

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

interface AppShellProps {
  children: React.ReactNode;
  sidebarContent?: React.ReactNode;
  collapsedSidebar?: boolean;
  onSidebarToggle?: () => void;
}

export function AppShell({ children, sidebarContent, collapsedSidebar }: AppShellProps) {
  const { ready } = useKeystore();
  const pathname = usePathname();
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [showGlobe, setShowGlobe] = React.useState(false);
  const [prefersReduced, setPrefersReduced] = React.useState(false);

  // @-mention / DM toast layer — suppressed on /dashboard surface
  const { toasts, add: addToast, dismiss: dismissToast } = useMentionToasts();
  useMentionDetect((event) => {
    if (!pathname.startsWith('/dashboard')) addToast(event);
  });

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

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
          data-collapsed={collapsedSidebar || undefined}
          className={[
            'hidden md:flex flex-col flex-shrink-0 border-r border-[var(--hotbox-border)] overflow-hidden relative',
            collapsedSidebar !== undefined
              ? 'transition-[width] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]'
              : 'w-60',
          ].join(' ')}
          style={{
            background: 'var(--hotbox-surface)',
            backdropFilter: 'blur(10px)',
            borderRightColor: 'rgba(26,74,90,0.60)',
            boxShadow: 'inset -1px 0 0 rgba(90,218,238,0.06)',
            ...(collapsedSidebar !== undefined
              ? { width: collapsedSidebar ? 48 : 240 }
              : {}),
          }}
        >
          {sidebarContent ?? <Sidebar onNeuralLink={() => setShowGlobe(true)} />}
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
              <Sidebar onItemClick={() => setMobileDrawerOpen(false)} onNeuralLink={() => { setMobileDrawerOpen(false); setShowGlobe(true); }} />
            </aside>
          </div>
        )}

        {/* Main content — extra bottom padding on mobile for the tab bar */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden pb-16 md:pb-0">
          {children}
        </main>
      </div>

      <MobileTabBar onOpenDrawer={() => setMobileDrawerOpen(true)} />

      {/* @-mention / DM toast layer — desktop top-right, mobile bottom-center */}
      <MentionToastLayer toasts={toasts} onDismiss={dismissToast} />

      {showGlobe && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: '#050C14',
          }}
        >
          <button
            onClick={() => setShowGlobe(false)}
            style={{
              position: 'absolute', top: 16, right: 20, zIndex: 10,
              background: 'rgba(5,12,20,0.80)',
              border: '1px solid rgba(26,74,90,0.60)',
              borderRadius: 8,
              color: '#5ADAEE',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: '0.08em',
              padding: '6px 14px',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              textTransform: 'uppercase',
            }}
          >
            ✕ Close
          </button>
          <NeuralGlobe prefersReduced={prefersReduced} />
        </div>
      )}
    </div>
  );
}
