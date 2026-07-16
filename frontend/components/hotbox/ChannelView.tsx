'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useHotboxStore } from '@/store/hotbox';
import { useWs } from './WsProvider';
import { useKeystore } from './KeystoreProvider';
import { Composer } from './Composer';
import type { AnyMessage, HotboxMessage, ServerMessage } from '@/lib/hotbox/types';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG || 'toadsage';

const EMPTY_MESSAGES: AnyMessage[] = [];
const EMPTY_TYPING: string[] = [];

function isHotboxMsg(msg: AnyMessage): msg is HotboxMessage {
  return msg.type === 'message';
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageRow({ msg }: { msg: AnyMessage }) {
  const { decrypt, evictCK } = useKeystore();
  const [text, setText] = React.useState<string | null>(null);

  useEffect(() => {
    console.log('[MessageRow:effect] id=' + (isHotboxMsg(msg) ? msg.id : 'sys') + ' type=' + msg.type + ' _pending=' + (isHotboxMsg(msg) ? msg._pending : false) + ' _text=' + (isHotboxMsg(msg) ? (msg._text ?? 'none') : 'n/a'));
    if (!isHotboxMsg(msg)) { setText(msg.content); return; }
    // Optimistic messages carry _text directly (no decryption needed)
    if (msg._text) { setText(msg._text); return; }
    const env = msg.crypto_envelope;
    console.log('[MessageRow:decrypt-call] kid=' + (env?.kid ?? 'MISSING') + ' env_present=' + !!env);
    if (!env || !env.kid) { setText('[legacy — no envelope]'); return; }
    decrypt(env)
      .then((t) => setText(t))
      .catch(async (firstErr) => {
        // IDB CK may be stale (prior session, key rotation, or concurrent auto-gen race).
        // Evict and re-fetch from server — one retry only to avoid infinite loops.
        console.warn('[MessageRow:decrypt-first-fail] kid=' + (env?.kid ?? 'MISSING'), firstErr);
        try {
          await evictCK(env?.kid ?? '');
          const t = await decrypt(env);
          setText(t);
        } catch (retryErr) {
          console.error('[keystore:decrypt-retry] FAILED kid=' + (env?.kid ?? 'MISSING') + ' v=' + (env?.v ?? '?'), retryErr);
          setText('[decryption failed]');
        }
      });
  }, [msg, decrypt, evictCK]);

  if (msg.type === 'system') {
    return (
      <div className="px-4 py-0.5 flex items-center gap-2">
        <div className="flex-1 h-px bg-[var(--hotbox-border)]" />
        <span className="text-[11px] text-[var(--hotbox-text-dim)] italic whitespace-nowrap">
          {msg.content}
        </span>
        <div className="flex-1 h-px bg-[var(--hotbox-border)]" />
      </div>
    );
  }

  const isPending = isHotboxMsg(msg) && msg._pending;
  const threadCount = isHotboxMsg(msg) ? (msg.thread_count ?? 0) : 0;

  return (
    <div className={['px-4 py-1 hover:bg-[var(--hotbox-surface-hover)] group rounded transition-colors hotbox-msg-in', isPending ? 'opacity-60' : ''].join(' ')}>
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="font-semibold text-sm text-[var(--hotbox-text)]">{msg.sender_id}</span>
        <span className="text-[11px] text-[var(--hotbox-text-dim)]">{formatTime(msg.ts)}</span>
        {isPending && <span className="text-[11px] text-[var(--hotbox-text-dim)] italic">sending…</span>}
      </div>
      <p className="text-sm text-[var(--hotbox-text)] leading-snug">
        {text ?? <span className="text-[var(--hotbox-text-dim)] italic">decrypting…</span>}
      </p>
      {threadCount > 0 && (
        <Link
          href={`/channels/${msg.channel_id}/${msg.id}`}
          className="inline-flex items-center gap-1 mt-1 text-[11px] text-[var(--hotbox-accent)] hover:underline"
        >
          <span>💬</span>
          <span>{threadCount} {threadCount === 1 ? 'reply' : 'replies'}</span>
        </Link>
      )}
    </div>
  );
}

function TypingIndicator({ channelId }: { channelId: string }) {
  const typingUsers = useHotboxStore((s) => s.typingUsers[channelId] ?? EMPTY_TYPING);
  if (typingUsers.length === 0) return <div className="h-5" />;
  const label =
    typingUsers.length === 1 ? `${typingUsers[0]} is typing…`
    : typingUsers.length <= 3 ? `${typingUsers.join(', ')} are typing…`
    : 'Several people are typing…';
  return (
    <div className="px-4 h-5 text-[11px] text-[var(--hotbox-text-muted)] italic">{label}</div>
  );
}

interface Props {
  channelId: string;
  isDm?: boolean;
}

const WS_CURSOR_KEY = 'hotbox:lastSeenTs';

export function ChannelView({ channelId, isDm }: Props) {
  const messages = useHotboxStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const channel = useHotboxStore((s) => s.channels.find((c) => c.id === channelId));
  const setActiveChannel = useHotboxStore((s) => s.setActiveChannel);
  const appendMessage = useHotboxStore((s) => s.appendMessage);
  const setMessages = useHotboxStore((s) => s.setMessages);
  const setTyping = useHotboxStore((s) => s.setTyping);
  const clearTyping = useHotboxStore((s) => s.clearTyping);
  const incrementThreadCount = useHotboxStore((s) => s.incrementThreadCount);
  const removeMessage = useHotboxStore((s) => s.removeMessage);
  const updateReaction = useHotboxStore((s) => s.updateReaction);
  const { subscribe, send, status } = useWs();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [loading, setLoading] = React.useState(true);
  const [memberCount, setMemberCount] = React.useState(channel?.members.length ?? 0);

  useEffect(() => { setActiveChannel(channelId); }, [channelId, setActiveChannel]);

  // Load history and bootstrap WS replay cursor
  useEffect(() => {
    setLoading(true);
    fetch(`/api/hotbox/channels/${channelId}/messages?org=${ORG}&limit=100`)
      .then((r) => r.json())
      .then((data: AnyMessage[]) => {
        if (Array.isArray(data)) {
          setMessages(channelId, data);
          const maxTs = data.reduce<string>((acc, m) => (m.ts > acc ? m.ts : acc), '');
          if (maxTs) {
            const stored = sessionStorage.getItem(WS_CURSOR_KEY) ?? '';
            if (maxTs > stored) sessionStorage.setItem(WS_CURSOR_KEY, maxTs);
          }
          setTimeout(() => virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' }), 50);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId, setMessages]);

  // WS subscriptions
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Mirror server's ephemeral-state reset on reconnect — server drops all
    // typing state on disconnect; flushing the store prevents stale indicators.
    unsubs.push(subscribe('hello', () => { clearTyping(channelId); }));

    unsubs.push(subscribe('msg.new', (msg: ServerMessage) => {
      const m = msg.message as AnyMessage | undefined;
      console.log('[ChannelView:msg.new] ch=' + channelId + ' recv_ch=' + (m?.channel_id ?? 'none') + ' id=' + ((m as HotboxMessage | undefined)?.id ?? '') + ' _text=' + ((m as HotboxMessage | undefined)?._text ?? 'none'));
      if (!m || m.channel_id !== channelId) return;
      if (isHotboxMsg(m) && m.thread_parent_id) {
        incrementThreadCount(channelId, m.thread_parent_id);
      } else {
        console.log('[ChannelView:appendMessage] ch=' + channelId + ' id=' + (isHotboxMsg(m) ? m.id : 'sys') + ' calling store.appendMessage');
        appendMessage(channelId, m);
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
      }
    }));

    // §5 Final: typing server→client = { type:"typing", channel_id, sender_id, action:"start"|"stop" }
    unsubs.push(subscribe('typing', (msg: ServerMessage) => {
      const { channel_id, sender_id, action } = msg as unknown as {
        channel_id: string;
        sender_id: string;
        action: 'start' | 'stop';
      };
      if (channel_id === channelId) setTyping(channelId, sender_id, action === 'start');
    }));

    // msg.deleted — remove from feed
    unsubs.push(subscribe('msg.deleted', (msg: ServerMessage) => {
      const { message_id, channel_id } = msg as unknown as { message_id: string; channel_id: string };
      if (channel_id === channelId) removeMessage(channelId, message_id);
    }));

    // msg.reaction — update emoji counts
    unsubs.push(subscribe('msg.reaction', (msg: ServerMessage) => {
      const { message_id, emoji, sender_id, action } = msg as unknown as {
        message_id: string;
        emoji: string;
        sender_id: string;
        action: 'add' | 'remove';
      };
      updateReaction(message_id, emoji, sender_id, action);
    }));

    return () => { unsubs.forEach((u) => u()); };
  }, [channelId, subscribe, appendMessage, setTyping, clearTyping, incrementThreadCount, removeMessage, updateReaction]);

  // channel.join → drives member count
  useEffect(() => {
    if (status !== 'open') return;
    send({ type: 'channel.join', channel_id: channelId });
    setMemberCount((n) => n + 1);
    const unsubs: (() => void)[] = [];
    unsubs.push(subscribe('member.join', (msg) => {
      const m = msg as unknown as { channel_id: string };
      if (m.channel_id === channelId) setMemberCount((n) => n + 1);
    }));
    unsubs.push(subscribe('member.leave', (msg) => {
      const m = msg as unknown as { channel_id: string };
      if (m.channel_id === channelId) setMemberCount((n) => Math.max(0, n - 1));
    }));
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [channelId, status, send, subscribe]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--hotbox-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-[var(--hotbox-border-strong)] flex-shrink-0"
        style={{ background: 'var(--hotbox-bg)' }}
      >
        <span className="font-semibold text-sm text-[var(--hotbox-text)]">
          {isDm ? '' : '#'}{channel?.name.replace(/^#/, '') ?? channelId}
        </span>
        {channel?.topic && (
          <>
            <div className="w-px h-4 bg-[var(--hotbox-border)]" />
            <span className="text-xs text-[var(--hotbox-text-muted)] truncate">{channel.topic}</span>
          </>
        )}
        <div data-testid="member-count" className="ml-auto text-xs text-[var(--hotbox-text-dim)]">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-[var(--hotbox-text-dim)] text-sm">
            <span className="inline-block w-4 h-4 border-2 border-[var(--hotbox-text-dim)] border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--hotbox-text-dim)] text-sm">
            No messages yet
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            followOutput="smooth"
            style={{ height: '100%' }}
            itemContent={(_, msg) => <MessageRow key={msg.id} msg={msg} />}
          />
        )}
      </div>

      <TypingIndicator channelId={channelId} />
      <Composer channelId={channelId} />
    </div>
  );
}
