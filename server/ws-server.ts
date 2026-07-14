/**
 * hotbox-ws-server.ts
 * Standalone WebSocket server — implements §5 wire-protocol (hotbox-architecture-v2.md).
 * Drop into hepha-web/src/lib/hotbox/ws-server.ts
 *
 * Start:  HOTBOX_JWT_SECRET=<secret> node --loader ts-node/esm hotbox-ws-server.ts
 * Or compile + run: tsc && node dist/hotbox-ws-server.js
 *
 * Default port: 8080. Override with HOTBOX_WS_PORT env var.
 * Client connects to: ws://localhost:8080/hotbox/ws
 *
 * §5 SPEC FROZEN — do not self-revise during implementation.
 * Log gaps as open items, continue against current shape.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { URL } from 'url';

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------

const PORT = parseInt(process.env.HOTBOX_WS_PORT ?? '8080', 10);
const JWT_SECRET = process.env.HOTBOX_JWT_SECRET ?? 'dev-secret-change-in-prod';
const INSTANCE_ID = process.env.CTX_INSTANCE_ID ?? 'default';
const REPLAY_MAX_EVENTS = 500;
const REPLAY_MAX_HOURS = 24;
const PING_INTERVAL_MS = 30_000;

// --------------------------------------------------------------------------
// Types — §5 wire-protocol
// --------------------------------------------------------------------------

type PresenceStatus = 'active' | 'away' | 'dnd';

interface AegisEnvelope {
  v: number; alg: string; kid: string; iv: string; ciphertext: string; tag: string;
}

interface HotboxMessage {
  id: string;
  org_id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  crypto_envelope?: AegisEnvelope;
  thread_id?: string;
  type: 'message' | 'system';
  ts: string;
}

interface ClientSession {
  ws: WebSocket;
  org_id: string;
  member_id: string;
  session_id: string;
  subscribed_channels: Set<string>;
  last_seen_ts: string;
  ping_timer: ReturnType<typeof setInterval>;
}

// Client → Server message types (§5.2)
type ClientMessage =
  | { type: 'msg.send';    channel_id: string; crypto_envelope: AegisEnvelope; thread_id?: string; nonce: string }
  | { type: 'msg.edit';    message_id: string; content: string }
  | { type: 'msg.delete';  message_id: string }
  | { type: 'msg.react';   message_id: string; emoji: string }
  | { type: 'channel.join';  channel_id: string }
  | { type: 'channel.leave'; channel_id: string }
  | { type: 'typing.start';  channel_id: string }
  | { type: 'typing.stop';   channel_id: string }
  | { type: 'presence.set';  status: PresenceStatus }
  | { type: 'replay';        since: string }
  | { type: 'ping' };

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

const sessions = new Map<string, ClientSession>();
// org_id → channel_id → Set<session_id>
const orgChannelSubs = new Map<string, Map<string, Set<string>>>();
// member_id → status
const presenceMap = new Map<string, PresenceStatus>();
// channel_id → Set<member_id> (cleared after 5s of no typing.start)
const typingMap = new Map<string, Set<string>>();
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// --------------------------------------------------------------------------
// JWT validation (no external dep — HMAC-SHA256 HS256)
// --------------------------------------------------------------------------

interface JwtPayload {
  org_id: string;
  member_id: string;
  exp?: number;
}

function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (expected !== sigB64) return null;

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as JwtPayload;

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.org_id || !payload.member_id) return null;

    return payload;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// JSONL helpers — mirrors hotbox-channel-service.ts layout
// --------------------------------------------------------------------------

function hotboxRoot(org: string): string {
  return path.join(os.homedir(), '.cortextos', INSTANCE_ID, 'orgs', org, 'hotbox');
}

function messagesDir(org: string, channelId: string): string {
  return path.join(hotboxRoot(org), 'channels', channelId, 'messages');
}

function writeMessage(msg: HotboxMessage): void {
  const today = msg.ts.slice(0, 10);
  const logPath = path.join(messagesDir(msg.org_id, msg.channel_id), `${today}.jsonl`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(msg) + '\n', 'utf8');
}

function readMessagesSince(org: string, channelId: string, since: string): HotboxMessage[] {
  const dir = messagesDir(org, channelId);
  if (!fs.existsSync(dir)) return [];

  const sinceTs = new Date(since).getTime();
  const cutoff = new Date(Date.now() - REPLAY_MAX_HOURS * 3600_000).toISOString().slice(0, 10);

  const results: HotboxMessage[] = [];

  // Walk date files from cutoff to today (ascending)
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl') && f.slice(0, 10) >= cutoff)
    .sort();

  for (const file of files) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as HotboxMessage;
        if (new Date(msg.ts).getTime() > sinceTs) results.push(msg);
        if (results.length >= REPLAY_MAX_EVENTS) return results;
      } catch { /* skip corrupt line */ }
    }
  }
  return results;
}

// --------------------------------------------------------------------------
// Subscription helpers
// --------------------------------------------------------------------------

function subscribe(session: ClientSession, channelId: string): void {
  if (!orgChannelSubs.has(session.org_id)) {
    orgChannelSubs.set(session.org_id, new Map());
  }
  const orgSubs = orgChannelSubs.get(session.org_id)!;
  if (!orgSubs.has(channelId)) orgSubs.set(channelId, new Set());
  orgSubs.get(channelId)!.add(session.session_id);
  session.subscribed_channels.add(channelId);
}

function unsubscribe(session: ClientSession, channelId: string): void {
  orgChannelSubs.get(session.org_id)?.get(channelId)?.delete(session.session_id);
  session.subscribed_channels.delete(channelId);
}

function unsubscribeAll(session: ClientSession): void {
  for (const ch of session.subscribed_channels) unsubscribe(session, ch);
}

// --------------------------------------------------------------------------
// Fan-out
// --------------------------------------------------------------------------

function send(ws: WebSocket, msg: object): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(msg)); } catch (e) { console.error('[hotbox-ws] send error:', e); }
}

function fanOut(orgId: string, channelId: string, msg: object, excludeSession?: string): void {
  const subs = orgChannelSubs.get(orgId)?.get(channelId);
  if (!subs) return;
  for (const sid of subs) {
    if (sid === excludeSession) continue;
    const s = sessions.get(sid);
    if (s) send(s.ws, msg);
  }
}

function fanOutOrg(orgId: string, msg: object, excludeSession?: string): void {
  for (const [sid, session] of sessions) {
    if (sid === excludeSession) continue;
    if (session.org_id === orgId) send(session.ws, msg);
  }
}

// --------------------------------------------------------------------------
// Typing helpers (auto-clear after 5s)
// --------------------------------------------------------------------------

function setTyping(channelId: string, memberId: string): void {
  if (!typingMap.has(channelId)) typingMap.set(channelId, new Set());
  typingMap.get(channelId)!.add(memberId);

  const key = `${channelId}:${memberId}`;
  clearTimeout(typingTimers.get(key));
  typingTimers.set(key, setTimeout(() => {
    typingMap.get(channelId)?.delete(memberId);
  }, 5000));
}

function clearTyping(channelId: string, memberId: string): void {
  typingMap.get(channelId)?.delete(memberId);
  clearTimeout(typingTimers.get(`${channelId}:${memberId}`));
}

// --------------------------------------------------------------------------
// Message handler
// --------------------------------------------------------------------------

function handleClientMessage(session: ClientSession, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    send(session.ws, { type: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON' });
    return;
  }

  switch (msg.type) {
    case 'ping':
      send(session.ws, { type: 'pong' });
      break;

    case 'channel.join': {
      subscribe(session, msg.channel_id);
      // Notify all in channel that this member joined
      fanOut(session.org_id, msg.channel_id, {
        type: 'member.join',
        channel_id: msg.channel_id,
        member_id: session.member_id,
      });
      break;
    }

    case 'channel.leave': {
      clearTyping(msg.channel_id, session.member_id);
      fanOut(session.org_id, msg.channel_id, {
        type: 'member.leave',
        channel_id: msg.channel_id,
        member_id: session.member_id,
      });
      unsubscribe(session, msg.channel_id);
      break;
    }

    case 'msg.send': {
      const message: HotboxMessage = {
        id: `${Date.now()}-${session.org_id}-${crypto.randomBytes(3).toString('hex')}`,
        org_id: session.org_id,
        channel_id: msg.channel_id,
        sender_id: session.member_id,
        content: null,
        crypto_envelope: msg.crypto_envelope,
        thread_id: msg.thread_id,
        type: 'message',
        ts: new Date().toISOString(),
      };
      try { writeMessage(message); } catch (e) { console.error('[ws] writeMessage failed:', e); }
      session.last_seen_ts = message.ts;
      // Broadcast ack to ALL sessions of this member � handles mid-reconnect race where
      // the sending session's WS may be closing before the ack can be delivered.
      const ackMsg = { type: 'msg.ack', nonce: msg.nonce, message_id: message.id, ts: message.ts, channel_id: msg.channel_id };
      for (const [, s] of sessions) {
        if (s.org_id === session.org_id && s.member_id === session.member_id) send(s.ws, ackMsg);
      }
      fanOut(session.org_id, msg.channel_id, { type: 'msg.new', message }, session.session_id);
      break;
    }

    case 'msg.edit': {
      const edited_at = new Date().toISOString();
      fanOutOrg(session.org_id, {
        type: 'msg.updated',
        message_id: msg.message_id,
        content: msg.content,
        edited_at,
      });
      break;
    }

    case 'msg.delete': {
      // §5 open item: need to know channel_id to fan-out correctly — sender must include it
      // OPEN ITEM §5-GAP-1: msg.delete client payload missing channel_id — log, continue
      // Fan-out to whole org for now (safe degradation)
      fanOutOrg(session.org_id, {
        type: 'msg.deleted',
        message_id: msg.message_id,
        channel_id: 'unknown', // gap — see §5-GAP-1
      });
      break;
    }

    case 'msg.react': {
      // §5 open item: reaction fan-out needs channel_id too — same gap class
      // OPEN ITEM §5-GAP-2: msg.react client payload missing channel_id
      fanOutOrg(session.org_id, {
        type: 'msg.reaction',
        message_id: msg.message_id,
        emoji: msg.emoji,
        sender_id: session.member_id,
        action: 'add',
      });
      break;
    }

    case 'typing.start': {
      setTyping(msg.channel_id, session.member_id);
      fanOut(session.org_id, msg.channel_id, {
        type: 'typing',
        channel_id: msg.channel_id,
        sender_id: session.member_id,
        action: 'start',
      }, session.session_id);
      break;
    }

    case 'typing.stop': {
      clearTyping(msg.channel_id, session.member_id);
      fanOut(session.org_id, msg.channel_id, {
        type: 'typing',
        channel_id: msg.channel_id,
        sender_id: session.member_id,
        action: 'stop',
      }, session.session_id);
      break;
    }

    case 'presence.set': {
      presenceMap.set(session.member_id, msg.status);
      fanOutOrg(session.org_id, {
        type: 'presence',
        user_id: session.member_id,
        status: msg.status,
      }, session.session_id);
      break;
    }

    case 'replay': {
      // Replay missed events for all subscribed channels
      for (const channelId of session.subscribed_channels) {
        const messages = readMessagesSince(session.org_id, channelId, msg.since);
        for (const m of messages) {
          send(session.ws, { type: 'msg.new', message: m });
        }
      }
      break;
    }
  }
}

// --------------------------------------------------------------------------
// Connection handler
// --------------------------------------------------------------------------

function handleConnection(ws: WebSocket, req: IncomingMessage): void {
  // Extract token from Authorization header or ?token= query param
  let token: string | null = null;

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      token = url.searchParams.get('token');
    } catch { /* ignore */ }
  }

  if (!token) {
    send(ws, { type: 'error', code: 'AUTH_MISSING', message: 'No token provided' });
    ws.close(4001, 'Unauthorized');
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    send(ws, { type: 'error', code: 'AUTH_INVALID', message: 'Invalid or expired token' });
    ws.close(4001, 'Unauthorized');
    return;
  }

  const session_id = crypto.randomBytes(8).toString('hex');
  const session: ClientSession = {
    ws,
    org_id: payload.org_id,
    member_id: payload.member_id,
    session_id,
    subscribed_channels: new Set(),
    last_seen_ts: new Date(0).toISOString(),
    ping_timer: setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, PING_INTERVAL_MS),
  };

  sessions.set(session_id, session);

  // Send hello
  send(ws, { type: 'hello', org_id: payload.org_id, session_id });

  // Set initial presence
  presenceMap.set(payload.member_id, 'active');

  ws.on('message', (data) => {
    try { handleClientMessage(session, data.toString()); }
    catch (e) { console.error('[hotbox-ws] unhandled error in message handler:', e); }
  });

  ws.on('close', () => {
    clearInterval(session.ping_timer);
    unsubscribeAll(session);
    sessions.delete(session_id);

    // Notify org of offline presence
    presenceMap.set(payload.member_id, 'away');
    fanOutOrg(payload.org_id, {
      type: 'presence',
      user_id: payload.member_id,
      status: 'away',
    });
  });

  ws.on('error', (err) => {
    console.error(`[hotbox-ws] session ${session_id} error:`, err.message);
  });

  console.log(`[hotbox-ws] ${payload.member_id}@${payload.org_id} connected (${session_id})`);
}

// --------------------------------------------------------------------------
// HTTP server + WebSocket upgrade
// --------------------------------------------------------------------------

const httpServer = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      sessions: sessions.size,
      uptime: process.uptime(),
    }));
    return;
  }
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('Upgrade Required');
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  // Only handle /hotbox/ws path
  const pathname = req.url?.split('?')[0];
  if (pathname !== '/hotbox/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', handleConnection);

httpServer.listen(PORT, () => {
  console.log(`[hotbox-ws] server listening on ws://localhost:${PORT}/hotbox/ws`);
  console.log(`[hotbox-ws] health: http://localhost:${PORT}/health`);
});

// --------------------------------------------------------------------------
// §5 OPEN ITEMS found during implementation (DO NOT self-revise spec)
// --------------------------------------------------------------------------
// §5-GAP-1: msg.delete client payload (§5.2) lacks channel_id.
//   Fan-out currently degrades to org-wide (all sessions in org receive it).
//   Fix: add channel_id to msg.delete client message type in §5.1 addendum.
//
// §5-GAP-2: msg.react client payload (§5.2) lacks channel_id.
//   Same degradation — org-wide fan-out.
//   Fix: add channel_id to msg.react client message type in §5.1 addendum.
//
// Both are correctness issues (extra clients receive delete/react notifications),
// not security issues (content is only message_id + emoji, not message content).
// Apollo-web review should catch these independently — log confirms blind-spot check.
// --------------------------------------------------------------------------

export { httpServer, wss };
