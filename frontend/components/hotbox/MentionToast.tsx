'use client';

import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { MentionEvent } from '@/hooks/useMentionDetect';

const DISMISS_MS = 4000;

interface ToastItem extends MentionEvent {
  key: string;
  count: number;
  timerId: ReturnType<typeof setTimeout>;
}

type Action =
  | { type: 'ADD'; event: MentionEvent; timerId: ReturnType<typeof setTimeout> }
  | { type: 'DISMISS'; key: string };

function toastReducer(state: ToastItem[], action: Action): ToastItem[] {
  if (action.type === 'ADD') {
    const existing = state.find((t) => t.key === action.event.channelId);
    if (existing) {
      clearTimeout(existing.timerId);
      return state.map((t) =>
        t.key === action.event.channelId
          ? { ...t, count: t.count + 1, preview: action.event.preview, timerId: action.timerId }
          : t
      );
    }
    return [...state, { ...action.event, key: action.event.channelId, count: 1, timerId: action.timerId }];
  }
  if (action.type === 'DISMISS') {
    return state.filter((t) => t.key !== action.key);
  }
  return state;
}

export function useMentionToasts() {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const dismiss = useCallback((key: string) => {
    const item = toastsRef.current.find((t) => t.key === key);
    if (item) clearTimeout(item.timerId);
    dispatch({ type: 'DISMISS', key });
  }, []);

  const add = useCallback((event: MentionEvent) => {
    // Clear existing timer for this channel before replacing
    const existing = toastsRef.current.find((t) => t.key === event.channelId);
    if (existing) clearTimeout(existing.timerId);
    const timerId = setTimeout(() => dispatch({ type: 'DISMISS', key: event.channelId }), DISMISS_MS);
    dispatch({ type: 'ADD', event, timerId });
  }, []);

  return { toasts, add, dismiss };
}

// ── SingleToast ───────────────────────────────────────────────────────────────

function SingleToast({ item, onDismiss }: { item: ToastItem; onDismiss: (key: string) => void }) {
  const router = useRouter();
  const progressRef = useRef<HTMLDivElement>(null);

  // Restart progress bar animation on each count update (collapsed mention)
  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.width = '100%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `width ${DISMISS_MS}ms linear`;
        el.style.width = '0%';
      });
    });
  }, [item.count]);

  const handleClick = () => {
    onDismiss(item.key);
    const href = item.threadParentId
      ? `/channels/${item.channelId}/${item.threadParentId}`
      : item.isDm
      ? `/dm/${item.channelId.replace(/^dm-/, '')}`
      : `/channels/${item.channelId}`;
    router.push(href);
  };

  const label = item.isDm
    ? `DM from ${item.senderName}`
    : `@mention in #${item.channelName.replace(/^#/, '')}`;

  return (
    <div
      role="alert"
      aria-live="polite"
      onClick={handleClick}
      className="relative overflow-hidden rounded-lg cursor-pointer select-none w-full"
      style={{
        background: 'var(--hotbox-surface-2)',
        border: '1px solid var(--hotbox-mention)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
      }}
    >
      <div className="px-3.5 pt-3 pb-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--hotbox-mention)', fontFamily: "'JetBrains Mono', monospace" }}
              >
                {item.isDm ? 'DM' : '@mention'}
              </span>
              {item.count > 1 && (
                <span
                  className="text-[10px] font-bold px-1 py-0.5 rounded-sm leading-none"
                  style={{ background: 'var(--hotbox-mention)', color: '#fff' }}
                >
                  ×{item.count}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-[var(--hotbox-text)] truncate">{label}</p>
            {item.preview && (
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--hotbox-text-muted)' }}>
                {item.preview}
              </p>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(item.key); }}
            aria-label="Dismiss notification"
            className="flex-shrink-0 leading-none hover:opacity-70 transition-opacity mt-0.5"
            style={{ color: 'var(--hotbox-text-dim)', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>
      {/* Countdown progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--hotbox-border)' }}>
        <div ref={progressRef} className="h-full" style={{ background: 'var(--hotbox-mention)', width: '100%' }} />
      </div>
    </div>
  );
}

// ── MentionToastLayer ─────────────────────────────────────────────────────────

interface ToastLayerProps {
  toasts: ToastItem[];
  onDismiss: (key: string) => void;
}

export function MentionToastLayer({ toasts, onDismiss }: ToastLayerProps) {
  if (toasts.length === 0) return null;
  return (
    <>
      {/* Desktop: top-right stack */}
      <div
        className="hidden md:flex fixed flex-col gap-2 z-50"
        style={{ top: 16, right: 16, width: 320 }}
        aria-label="Notifications"
      >
        {toasts.map((t) => <SingleToast key={t.key} item={t} onDismiss={onDismiss} />)}
      </div>

      {/* Mobile ≤md: bottom-center, edge-to-edge with padding */}
      <div
        className="flex md:hidden fixed flex-col gap-2 z-50"
        style={{ bottom: 16, left: 12, right: 12 }}
        aria-label="Notifications"
      >
        {toasts.map((t) => <SingleToast key={t.key} item={t} onDismiss={onDismiss} />)}
      </div>
    </>
  );
}
