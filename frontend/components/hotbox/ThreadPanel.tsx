'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import Link from 'next/link';
import { useHotboxStore } from '@/store/hotbox';
import { useWs } from './WsProvider';
import { useKeystore } from './KeystoreProvider';
import { Composer } from './Composer';
import type { AnyMessage, HotboxMessage, ServerMessage } from '@/lib/hotbox/types';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG || 'toadsage';

const EMPTY_MESSAGES: AnyMessage[] = [];

function isHotboxMsg(msg: AnyMessage): msg is HotboxMessage {
  return msg.type === 'message';
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ThreadMessageRow({ msg }: { msg: AnyMessage }) {
  const { decrypt } = useKeystore();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!isHotboxMsg(msg)) { setText(msg.content); return; }
    decrypt(msg.crypto_envelope)
      .then((t) => setText(t))
      .catch(() => setText('[decryption failed]'));
  }, [msg, decrypt]);

  if (msg.type === 'system') {
    return (
      <div className="px-4 py-1 text-[11px] text-[var(--hotbox-text-dim)] italic text-center">
        {msg.content}
      </div>
    );
  }

  return (
    <div className="px-4 py-1 hover:bg-[var(--hotbox-surface-2)] rounded">
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="font-semibold text-sm text-[var(--hotbox-text)]">{msg.sender_id}</span>
        <span className="text-[11px] text-[var(--hotbox-text-dim)]">{formatTime(msg.ts)}</span>
      </div>
      <p className="text-sm text-[var(--hotbox-text)] leading-snug">
        {text ?? <span className="text-[var(--hotbox-text-dim)] italic">decrypting…</span>}
      </p>
    </div>
  );
}

// Thread-scoped message store (channel messages keyed by thread parent id)
const threadMessages: Record<string, AnyMessage[]> = {};

interface Props {
  channelId: string;
  messageId: string;
}

export function ThreadPanel({ channelId, messageId }: Props) {
  const threadKey = `${channelId}:${messageId}`;
  const [msgs, setMsgs] = useState<AnyMessage[]>(threadMessages[threadKey] ?? []);
  const [loading, setLoading] = useState(!threadMessages[threadKey]);
  const [parentMsg, setParentMsg] = useState<AnyMessage | null>(null);
  const { decrypt } = useKeystore();
  const [parentText, setParentText] = useState<string | null>(null);
  const { subscribe } = useWs();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const channelMessages = useHotboxStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);

  // Resolve parent message from store or fetch
  useEffect(() => {
    const fromStore = channelMessages.find((m) => m.id === messageId);
    if (fromStore) {
      setParentMsg(fromStore);
      return;
    }
    fetch(`/api/hotbox/channels/${channelId}/messages?org=${ORG}&limit=200`)
      .then((r) => r.json())
      .then((data: AnyMessage[]) => {
        const found = data.find((m) => m.id === messageId);
        if (found) setParentMsg(found);
      })
      .catch(() => {});
  }, [channelId, messageId, channelMessages]);

  // Decrypt parent
  useEffect(() => {
    if (!parentMsg) return;
    if (!isHotboxMsg(parentMsg)) { setParentText((parentMsg as { content: string }).content); return; }
    decrypt(parentMsg.crypto_envelope)
      .then((t) => setParentText(t))
      .catch(() => setParentText('[decryption failed]'));
  }, [parentMsg, decrypt]);

  // Fetch thread replies
  useEffect(() => {
    if (!threadMessages[threadKey]) setLoading(true);
    fetch(`/api/hotbox/channels/${channelId}/messages?org=${ORG}&thread=${messageId}&limit=100`)
      .then((r) => r.json())
      .then((data: AnyMessage[]) => {
        if (Array.isArray(data)) {
          threadMessages[threadKey] = data;
          setMsgs(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId, messageId, threadKey]);

  // WS subscription for new thread replies
  useEffect(() => {
    const unsub = subscribe('msg.new', (msg: ServerMessage) => {
      const m = msg.message as AnyMessage | undefined;
      if (m && isHotboxMsg(m) && m.channel_id === channelId && m.thread_parent_id === messageId) {
        setMsgs((prev) => {
          const next = [...prev, m];
          threadMessages[threadKey] = next;
          return next;
        });
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
      }
    });
    return unsub;
  }, [channelId, messageId, threadKey, subscribe]);

  return (
    <aside
      className="flex flex-col border-l border-[var(--hotbox-border)] flex-shrink-0"
      style={{ background: 'var(--hotbox-bg)', width: 360 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--hotbox-border)] flex-shrink-0">
        <span className="font-semibold text-sm text-[var(--hotbox-text)]">Thread</span>
        <Link
          href={`/channels/${channelId}`}
          className="text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)] text-lg leading-none"
          title="Close thread"
        >
          ×
        </Link>
      </div>

      {/* Parent message preview */}
      {parentMsg && (
        <div className="px-4 py-3 border-b border-[var(--hotbox-border)] flex-shrink-0 bg-[var(--hotbox-surface)]">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-sm text-[var(--hotbox-text)]">
              {parentMsg.sender_id}
            </span>
            <span className="text-[11px] text-[var(--hotbox-text-dim)]">
              {formatTime(parentMsg.ts)}
            </span>
          </div>
          <p className="text-sm text-[var(--hotbox-text)] leading-snug line-clamp-3">
            {parentText ?? <span className="text-[var(--hotbox-text-dim)] italic">decrypting…</span>}
          </p>
        </div>
      )}

      {/* Reply count */}
      {msgs.length > 0 && (
        <div className="px-4 py-1.5 text-[11px] text-[var(--hotbox-text-dim)] border-b border-[var(--hotbox-border)] flex-shrink-0">
          {msgs.length} {msgs.length === 1 ? 'reply' : 'replies'}
        </div>
      )}

      {/* Thread messages */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-[var(--hotbox-text-dim)] text-sm">
            <span className="inline-block w-4 h-4 border-2 border-[var(--hotbox-text-dim)] border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--hotbox-text-dim)] text-sm">
            No replies yet
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={msgs}
            followOutput="smooth"
            style={{ height: '100%' }}
            itemContent={(_, msg) => <ThreadMessageRow key={msg.id} msg={msg} />}
          />
        )}
      </div>

      <Composer channelId={channelId} threadParentId={messageId} />
    </aside>
  );
}
