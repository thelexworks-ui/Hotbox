'use client';

import React from 'react';
import { Sidebar } from './Sidebar';
import { KeyRotationWatcher } from './KeyRotationWatcher';
import { KeyLossWarningModal } from './KeyLossWarningModal';
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
      <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, initError, retryInit, keyLossAckRequired, acknowledgeKeyLoss } = useKeystore();

  // First-time key-loss acknowledgement must happen before anything else.
  // Render only the modal — no children, no decrypt calls, no premature IDB access.
  if (keyLossAckRequired) {
    return (
      <div className="flex flex-col h-screen" style={{ background: 'var(--hotbox-bg)' }}>
        <KeyLossWarningModal onConfirm={acknowledgeKeyLoss} />
      </div>
    );
  }

  // Gate children on keystore readiness — prevents ChannelView from mounting before
  // IDB is open, which would cause all pre-loaded messages to hit the dbRef.current!
  // null-assert and land permanently in [decryption failed] with no retry path.
  if (!ready) {
    if (initError) return <KeystoreErrorScreen error={initError} onRetry={retryInit} />;
    return <KeystoreLoadingScreen />;
  }

  return (
    <div className="flex flex-col h-screen">
      <KeyRotationWatcher />
      <WsStatusBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className="hidden md:flex flex-col flex-shrink-0 w-60 border-r border-[var(--hotbox-border)]"
          style={{ background: 'var(--hotbox-surface)' }}
        >
          <Sidebar />
        </aside>
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
