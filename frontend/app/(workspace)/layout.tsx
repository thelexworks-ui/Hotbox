'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/hotbox/AppShell';
import { useHotboxStore } from '@/store/hotbox';

// Clears unread + mentionCount when the user returns to a channel tab
// (tab switch, browser focus, or navigating to the channel while already there).
function useVisibilityMarkRead() {
  const pathname = usePathname();
  const setActiveChannel = useHotboxStore((s) => s.setActiveChannel);

  useEffect(() => {
    // Extract channelId from /channels/[id] or /dm/[memberId] routes
    const channelMatch = pathname.match(/^\/channels\/([^/]+)/);
    const dmMatch      = pathname.match(/^\/dm\/([^/]+)/);
    const channelId    = channelMatch?.[1] ?? dmMatch?.[1];
    if (!channelId) return;

    // Sync activeChannelId immediately on navigation so appendMessage knows
    // which channel is active and suppresses unread increments for it.
    setActiveChannel(channelId);

    const onVisible = () => {
      if (!document.hidden) setActiveChannel(channelId);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [pathname, setActiveChannel]);
}

function WorkspaceInner({ children }: { children: React.ReactNode }) {
  useVisibilityMarkRead();
  return <>{children}</>;
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <WorkspaceInner>{children}</WorkspaceInner>
    </AppShell>
  );
}
