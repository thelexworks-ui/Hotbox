'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage, ServerMessageType, WsStatus } from '@/lib/hotbox/types';

const WS_URL = process.env.NEXT_PUBLIC_HOTBOX_WS_URL ?? 'ws://localhost:8080/hotbox/ws';
const BACKOFF = [0, 1_000, 2_000, 4_000, 8_000, 30_000];

// Two cursors: message_id (preferred, after_id) + ts (fallback, since)
const CURSOR_ID_KEY = 'hotbox:lastSeenId';
const CURSOR_TS_KEY = 'hotbox:lastSeenTs';

type Handler = (msg: ServerMessage) => void;

interface WsContext {
  status: WsStatus;
  /** Returns true if the message was delivered to the socket, false if the socket was not OPEN. */
  send(msg: ClientMessage): boolean;
  subscribe(type: ServerMessageType, handler: Handler): () => void;
}

const Ctx = createContext<WsContext | null>(null);

export function useWs(): WsContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWs must be inside WsProvider');
  return ctx;
}

export function WsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const deadRef = useRef(false);
  const handlersRef = useRef<Map<ServerMessageType, Set<Handler>>>(new Map());
  // Stable ref to connect so ws.onclose can schedule reconnect without stale closure
  const connectRef = useRef<() => void>(() => {});

  const dispatch = useCallback((msg: ServerMessage) => {
    const handlers = handlersRef.current.get(msg.type);
    if (!handlers) return;
    Array.from(handlers).forEach((h) => h(msg));
  }, []);

  const connect = useCallback(() => {
    if (deadRef.current) return;
    setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

    // Browser WebSocket cannot set headers — fetch a short-lived JWT first, pass as ?token=
    fetch('/api/hotbox/ws-token')
      .then((r) => r.json() as Promise<{ token: string }>)
      .then(({ token }) => {
        if (deadRef.current) return;

        const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        // A4: status stays 'connecting' until 'hello' frame confirms auth
        ws.onopen = () => { /* wait for hello */ };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data) as ServerMessage;

            // A4: gate 'open' status + replay request on hello receipt
            if (msg.type === 'hello') {
              attemptRef.current = 0;
              setStatus('open');
              const lastId = sessionStorage.getItem(CURSOR_ID_KEY);
              const lastTs = sessionStorage.getItem(CURSOR_TS_KEY);
              if (lastId || lastTs) {
                ws.send(JSON.stringify({
                  type: 'replay',
                  ...(lastId ? { after_id: lastId } : { since: lastTs }),
                }));
              }
              dispatch(msg);
              return;
            }

            // A5: auth errors — stop reconnecting, surface as closed
            if (msg.type === 'error') {
              const code = (msg as { type: string; code?: string }).code;
              if (code === 'AUTH_MISSING' || code === 'AUTH_INVALID') {
                deadRef.current = true;
                setStatus('closed');
              }
              dispatch(msg);
              return;
            }

            // Advance cursors on every msg.new
            if (msg.type === 'msg.new') {
              const m = msg.message as { id?: string; ts?: string } | undefined;
              if (m?.id) sessionStorage.setItem(CURSOR_ID_KEY, m.id);
              if (m?.ts) sessionStorage.setItem(CURSOR_TS_KEY, m.ts);
            }

            dispatch(msg);
          } catch { /* ignore malformed frames */ }
        };

        ws.onerror = () => { /* onclose fires next */ };

        ws.onclose = () => {
          if (deadRef.current) return;
          setStatus('reconnecting');
          const delay = BACKOFF[Math.min(attemptRef.current, BACKOFF.length - 1)];
          attemptRef.current++;
          setTimeout(() => connectRef.current(), delay);
        };
      })
      .catch(() => {
        // Token fetch failed — schedule reconnect via backoff
        if (deadRef.current) return;
        const delay = BACKOFF[Math.min(attemptRef.current, BACKOFF.length - 1)];
        attemptRef.current++;
        setTimeout(() => connectRef.current(), delay);
      });
  }, [dispatch]);

  // Keep connectRef stable for ws.onclose and .catch
  connectRef.current = connect;

  useEffect(() => {
    connect();
    return () => {
      deadRef.current = true;
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const subscribe = useCallback((type: ServerMessageType, handler: Handler): (() => void) => {
    if (!handlersRef.current.has(type)) handlersRef.current.set(type, new Set());
    handlersRef.current.get(type)!.add(handler);
    return () => { handlersRef.current.get(type)?.delete(handler); };
  }, []);

  return (
    <Ctx.Provider value={{ status, send, subscribe }}>
      {children}
    </Ctx.Provider>
  );
}
