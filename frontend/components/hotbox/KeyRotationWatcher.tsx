'use client';

import { useEffect } from 'react';
import { useWs } from './WsProvider';
import { useKeystore } from './KeystoreProvider';
import type { ServerMessage, WrappedKeyBundle } from '@/lib/hotbox/types';

// Subscribes to key.rotated WS events and updates the local keystore cache.
// Placed inside WsProvider so both useWs() and useKeystore() are reachable.
export function KeyRotationWatcher() {
  const { subscribe } = useWs();
  const { cacheChatKey } = useKeystore();

  useEffect(() => {
    return subscribe('key.rotated', (msg: ServerMessage) => {
      const { chatId, bundle } = msg as unknown as { chatId?: string; bundle?: Partial<WrappedKeyBundle> };
      // wiv is required per §6 fix — reject bundles missing it
      if (chatId && bundle?.wk && bundle?.epk && bundle?.wiv) {
        cacheChatKey(chatId, bundle as WrappedKeyBundle).catch(() => {});
      }
    });
  }, [subscribe, cacheChatKey]);

  return null;
}
