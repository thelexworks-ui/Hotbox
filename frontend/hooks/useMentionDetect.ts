'use client';

import { useEffect, useRef } from 'react';
import { useWs } from '@/components/hotbox/WsProvider';
import { useKeystore } from '@/components/hotbox/KeystoreProvider';
import { useAuth } from '@/components/hotbox/AuthProvider';
import { useHotboxStore } from '@/store/hotbox';
import type { HotboxMessage } from '@/lib/hotbox/types';

export interface MentionEvent {
  channelId: string;
  channelName: string;
  senderName: string;
  preview: string;
  isDm: boolean;
  threadParentId?: string;
}

type MentionHandler = (event: MentionEvent) => void;

export function useMentionDetect(onMention: MentionHandler) {
  const { subscribe } = useWs();
  const { decrypt } = useKeystore();
  const { memberId } = useAuth();
  const incrementMention = useHotboxStore((s) => s.incrementMention);
  const channels = useHotboxStore((s) => s.channels);
  const activeChannelId = useHotboxStore((s) => s.activeChannelId);

  // Capture session start time once — gates replay burst (messages older than
  // this mount time don't fire toasts, they're replayed history not live events).
  const sessionStartRef = useRef<number>(Date.now());
  const onMentionRef = useRef(onMention);
  onMentionRef.current = onMention;

  // Stable ref for channels so the subscription closure doesn't go stale.
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const activeChannelIdRef = useRef(activeChannelId);
  activeChannelIdRef.current = activeChannelId;
  const memberIdRef = useRef(memberId);
  memberIdRef.current = memberId;

  useEffect(() => {
    return subscribe('msg.new', async (serverMsg) => {
      const msg = serverMsg.message as HotboxMessage | undefined;
      if (!msg || msg.type !== 'message') return;

      // Skip replay burst: messages older than session mount
      if (new Date(msg.ts).getTime() < sessionStartRef.current) return;

      // Skip self-sent messages
      const myId = memberIdRef.current;
      if (myId && msg.sender_id === myId) return;

      // Skip if this channel is currently active (user is looking at it)
      if (msg.channel_id === activeChannelIdRef.current) return;

      const channel = channelsRef.current.find((c) => c.id === msg.channel_id);
      // Fallback to ID prefix when channel isn't in the store yet (e.g. DM created mid-session)
      const isDm = channel?.type === 'dm' || msg.channel_id.startsWith('dm-');

      // For non-DM channels, check for @-mention after decrypt
      let isMention = isDm; // DMs always qualify
      let preview = '';

      if (!isDm) {
        // Decrypt to scan for @mention
        try {
          const text = await decrypt(msg.crypto_envelope);
          // Build mention pattern from memberId (strip "user:" prefix if present)
          const slug = myId.replace(/^user:/, '');
          const mentionRe = new RegExp(`@${slug}\\b`, 'i');
          if (!mentionRe.test(text)) return; // not a mention, bail
          isMention = true;
          preview = text.slice(0, 60);
        } catch {
          return; // decrypt failed — don't fire false-positive toast
        }
      } else {
        // DM: decrypt for preview only, non-fatal
        try {
          const text = await decrypt(msg.crypto_envelope);
          preview = text.slice(0, 60);
        } catch {
          preview = '';
        }
      }

      if (!isMention) return;

      // Increment mentionCount in store
      incrementMention(msg.channel_id);

      // Fire toast callback
      onMentionRef.current({
        channelId: msg.channel_id,
        channelName: channel?.name ?? msg.channel_id,
        senderName: msg.sender_id,
        preview,
        isDm,
        threadParentId: msg.thread_parent_id,
      });
    });
  }, [subscribe, decrypt, incrementMention]);
}
