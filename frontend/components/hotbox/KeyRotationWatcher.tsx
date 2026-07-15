'use client';

import { useEffect } from 'react';
import { useWs } from './WsProvider';
import { useKeystore } from './KeystoreProvider';
import type { ServerMessage } from '@/lib/hotbox/types';

// Subscribes to key.rotated WS events and evicts the local IDB cache entry.
// Next getCK() call will re-fetch the new CK from the server.
export function KeyRotationWatcher() {
  const { subscribe } = useWs();
  const { evictCK } = useKeystore();

  useEffect(() => {
    return subscribe('key.rotated', (msg: ServerMessage) => {
      const { chatId } = msg as unknown as { chatId?: string };
      if (chatId) {
        evictCK(chatId).catch(() => {});
      }
    });
  }, [subscribe, evictCK]);

  return null;
}
