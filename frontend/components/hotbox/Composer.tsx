'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWs } from './WsProvider';
import { useKeystore } from './KeystoreProvider';
import { useAuth } from './AuthProvider';
import { useHotboxStore } from '@/store/hotbox';
import type { HotboxMessage, ServerMessage } from '@/lib/hotbox/types';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG ?? 'toadsage';

interface Props {
  channelId: string;
  threadParentId?: string;
  disabled?: boolean;
}

interface MsgAck {
  nonce: string;
  message_id: string;
  ts: string;
  channel_id: string;
}

export function Composer({ channelId, threadParentId, disabled }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const { send, status, subscribe } = useWs();
  const { encrypt, ready: keystoreReady, keyLossAckRequired } = useKeystore();
  const { memberId } = useAuth();
  const appendMessage = useHotboxStore((s) => s.appendMessage);
  const reconcilePending = useHotboxStore((s) => s.reconcilePending);
  const removeMessage = useHotboxStore((s) => s.removeMessage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const pendingRef = useRef<Map<string, HotboxMessage>>(new Map());

  const isDisabled = disabled || !keystoreReady || keyLossAckRequired || sending;

  // Reconcile optimistic messages on msg.ack
  useEffect(() => {
    return subscribe('msg.ack', (msg: ServerMessage) => {
      const ack = msg as unknown as MsgAck;
      const pending = pendingRef.current.get(ack.nonce);
      if (!pending) return;
      pendingRef.current.delete(ack.nonce);
      const confirmed: HotboxMessage = { ...pending, id: ack.message_id, ts: ack.ts, _pending: false };
      reconcilePending(ack.channel_id, ack.nonce, confirmed);
    });
  }, [subscribe, reconcilePending]);

  // Emit typing start/stop — intent tracked before connectivity guard (§ref intent-tracks-always)
  const emitTyping = useCallback((active: boolean) => {
    isTypingRef.current = active;
    if (status !== 'open') return;
    send({ type: active ? 'typing.start' : 'typing.stop', channel_id: channelId });
  }, [status, send, channelId]);

  // Stable ref so unmount cleanup always calls the latest emitTyping without
  // taking it as a dep (which would cause cleanup to fire on every status change).
  const emitTypingStableRef = useRef(emitTyping);
  useEffect(() => { emitTypingStableRef.current = emitTyping; }, [emitTyping]);

  // Re-assert typing.start after reconnect — server loses ephemeral typing state
  // on disconnect; re-send if the user's intent is still active.
  useEffect(() => {
    if (status === 'open' && isTypingRef.current) {
      send({ type: 'typing.start', channel_id: channelId });
    }
  }, [status, send, channelId]);

  // Clear typing timer on true component unmount only (empty deps).
  // Previously had [emitTyping] here, which caused cleanup to fire on every
  // status change and falsely clear isTypingRef.current mid-session.
  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (isTypingRef.current) emitTypingStableRef.current(false);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isDisabled) return;
    setSending(true);
    setSendError(null);
    let nonce: string | null = null;
    try {
      const envelope = await encrypt(channelId, trimmed);
      nonce = crypto.randomUUID();

      // Optimistic message — shows immediately with typed text, pending flag for opacity
      const optimistic: HotboxMessage = {
        id: nonce,
        org_id: ORG,
        channel_id: channelId,
        sender_id: memberId,
        content: null,
        crypto_envelope: envelope,
        type: 'message',
        ts: new Date().toISOString(),
        _pending: true,
        _text: trimmed,
        ...(threadParentId ? { thread_parent_id: threadParentId } : {}),
      };
      appendMessage(channelId, optimistic);
      pendingRef.current.set(nonce, optimistic);

      // Check live readyState, not stale React status — WS may drop between renders
      const wsSent = send({
        type: 'msg.send',
        channel_id: channelId,
        crypto_envelope: envelope,
        nonce,
        ...(threadParentId ? { thread_id: threadParentId } : {}),
      });

      if (!wsSent) {
        // WS not OPEN (disconnected or closing) — fall through to HTTP
        const res = await fetch(`/api/hotbox/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crypto_envelope: envelope,
            sender_id: memberId,
            ...(threadParentId ? { thread_parent_id: threadParentId } : {}),
          }),
        });
        pendingRef.current.delete(nonce);
        if (res.ok) {
          const confirmed = await res.json() as HotboxMessage;
          reconcilePending(channelId, nonce, confirmed);
        } else {
          // HTTP also failed — retract optimistic message rather than leaving it stuck
          removeMessage(channelId, nonce);
          throw new Error(`HTTP send failed: ${res.status}`);
        }
      }

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (isTypingRef.current) emitTyping(false);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    } catch (err) {
      console.error('[composer] send failed:', err);
      if (nonce) removeMessage(channelId, nonce);
      setSendError('Failed to send — keystore unavailable or connection lost. Try again.');
    } finally {
      setSending(false);
    }
  }, [text, isDisabled, encrypt, send, channelId, threadParentId, memberId, appendMessage, reconcilePending, removeMessage, emitTyping]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const placeholder =
    keyLossAckRequired  ? 'Acknowledge the key-loss warning above to start messaging' :
    !keystoreReady      ? 'Keystore initialising…' :
    status !== 'open'   ? `#${channelId} (sending via HTTP…)` :
    `Message #${channelId}`;

  return (
    <div className="px-4 pb-4">
      <div
        className={[
          'flex items-end gap-2 rounded-lg px-3 py-2',
          'border border-[var(--hotbox-border)] bg-[var(--hotbox-surface-2)]',
          isDisabled ? 'opacity-60' : '',
        ].join(' ')}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm text-[var(--hotbox-text)] placeholder:text-[var(--hotbox-text-dim)] max-h-40 overflow-y-auto hotbox-scrollbar"
          placeholder={placeholder}
          value={text}
          disabled={isDisabled}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
            if (!isTypingRef.current) emitTyping(true);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => emitTyping(false), 5000);
          }}
          onBlur={() => {
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            if (isTypingRef.current) emitTyping(false);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          className={[
            'flex-shrink-0 rounded px-2.5 py-1 text-sm font-medium',
            text.trim() && !isDisabled
              ? 'bg-[var(--hotbox-accent)] text-white hover:bg-[var(--hotbox-accent-hover)]'
              : 'bg-[var(--hotbox-border)] text-[var(--hotbox-text-dim)] cursor-not-allowed',
          ].join(' ')}
          onClick={handleSend}
          disabled={!text.trim() || isDisabled}
        >
          ↑
        </button>
      </div>
      {status !== 'open' && !keyLossAckRequired && (
        <p className="text-[11px] text-[var(--hotbox-mention)] mt-1 px-1">
          WS {status} — messages routing via HTTP
        </p>
      )}
      {sendError && (
        <p className="text-[11px] text-[var(--hotbox-crashed)] mt-1 px-1">
          {sendError}
        </p>
      )}
    </div>
  );
}
