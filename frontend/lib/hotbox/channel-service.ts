import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { AegisEnvelope, HotboxMessage } from './types';

const INSTANCE_ID = process.env.CTX_INSTANCE_ID ?? 'default';

export type ChannelType = 'system' | 'agent' | 'topic' | 'dm';
export type AgentRole = 'orchestrator' | 'analyst' | 'agent';

export interface ChannelMeta {
  id: string;
  name: string;
  type: ChannelType;
  org: string;
  agent_name?: string;
  agent_role?: AgentRole;
  pinned: boolean;
  created_at: string;
  topic?: string;
  members: string[];
}

export interface CreateChannelParams {
  org: string;
  name: string;
  type: ChannelType;
  agentName?: string;
  agentRole?: AgentRole;
  pinned?: boolean;
  members?: string[];
  topic?: string;
}

function hotboxRoot(org: string): string {
  return path.join(os.homedir(), '.cortextos', INSTANCE_ID, 'orgs', org, 'hotbox');
}

function channelDir(org: string, channelId: string): string {
  return path.join(hotboxRoot(org), 'channels', channelId);
}

function metaPath(org: string, channelId: string): string {
  return path.join(channelDir(org, channelId), 'meta.json');
}

function cursorPath(org: string): string {
  return path.join(hotboxRoot(org), 'hooks-cursor.json');
}

function writeAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

export function channelExists(org: string, channelId: string): boolean {
  return fs.existsSync(metaPath(org, channelId));
}

export function getChannelMeta(org: string, channelId: string): ChannelMeta | null {
  const mp = metaPath(org, channelId);
  if (!fs.existsSync(mp)) return null;
  try { return JSON.parse(fs.readFileSync(mp, 'utf8')) as ChannelMeta; } catch { return null; }
}

export function createChannel(params: CreateChannelParams): ChannelMeta | null {
  const channelId = params.name.replace(/^#/, '');
  const mp = metaPath(params.org, channelId);

  if (fs.existsSync(mp)) {
    try { return JSON.parse(fs.readFileSync(mp, 'utf8')) as ChannelMeta; } catch { return null; }
  }

  const meta: ChannelMeta = {
    id: channelId,
    name: `#${channelId}`,
    type: params.type,
    org: params.org,
    agent_name: params.agentName,
    agent_role: params.agentRole,
    pinned: params.pinned ?? false,
    created_at: new Date().toISOString(),
    topic: params.topic,
    members: params.members ?? [],
  };

  fs.mkdirSync(path.join(channelDir(params.org, channelId), 'messages'), { recursive: true });
  writeAtomic(mp, meta);
  appendSystemMessage(params.org, channelId, `${meta.name} channel created`);
  return meta;
}

export function bootstrapWorkspace(org: string): void {
  createChannel({ org, name: 'general', type: 'system', pinned: true, topic: 'General discussion', members: [] });
  createChannel({ org, name: 'alerts',  type: 'system', pinned: true, topic: 'System alerts, watchdog events, cron notifications', members: [] });

  const wsMeta = path.join(hotboxRoot(org), 'workspaces', 'meta.json');
  if (!fs.existsSync(wsMeta)) {
    writeAtomic(wsMeta, { org, name: org, created_at: new Date().toISOString() });
  }
}

export function createAgentChannel(params: { org: string; agentName: string; agentRole?: AgentRole }): ChannelMeta | null {
  bootstrapWorkspace(params.org);
  return createChannel({
    org: params.org,
    name: `agent-${params.agentName}`,
    type: 'agent',
    agentName: params.agentName,
    agentRole: params.agentRole ?? 'agent',
    pinned: false,
    members: [params.agentName],
    topic: `${params.agentName} task inbox`,
  });
}

export function listChannels(org: string): ChannelMeta[] {
  const channelsDir = path.join(hotboxRoot(org), 'channels');
  if (!fs.existsSync(channelsDir)) return [];

  const channels: ChannelMeta[] = [];
  for (const entry of fs.readdirSync(channelsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const mp = path.join(channelsDir, entry.name, 'meta.json');
    if (!fs.existsSync(mp)) continue;
    try { channels.push(JSON.parse(fs.readFileSync(mp, 'utf8'))); } catch { /* skip corrupt */ }
  }

  return channels.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function readMessages(org: string, channelId: string, limit = 100): unknown[] {
  const messagesDir = path.join(channelDir(org, channelId), 'messages');
  if (!fs.existsSync(messagesDir)) return [];

  const files = fs.readdirSync(messagesDir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .reverse()
    .slice(0, 7); // last 7 days max

  const msgs: unknown[] = [];
  for (const f of files.reverse()) {
    const content = fs.readFileSync(path.join(messagesDir, f), 'utf8');
    for (const line of content.split('\n').filter(Boolean)) {
      try { msgs.push(JSON.parse(line)); } catch { /* skip */ }
    }
  }
  return msgs.slice(-limit);
}

export function appendSystemMessage(org: string, channelId: string, text: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(channelDir(org, channelId), 'messages', `${today}.jsonl`);
  const msg = JSON.stringify({
    id: `${Date.now()}-system-${crypto.randomBytes(3).toString('hex')}`,
    org_id: org,
    channel_id: channelId,
    sender_id: 'system',
    content: text,
    type: 'system',
    ts: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, msg + '\n', 'utf8');
}

export function appendMessage(
  org: string,
  channelId: string,
  params: { senderId: string; envelope: AegisEnvelope; threadParentId?: string },
): HotboxMessage {
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(channelDir(org, channelId), 'messages', `${today}.jsonl`);
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const msg: HotboxMessage = {
    id,
    org_id: org,
    channel_id: channelId,
    sender_id: params.senderId,
    content: null,
    crypto_envelope: params.envelope,
    type: 'message',
    ts: new Date().toISOString(),
    ...(params.threadParentId ? { thread_parent_id: params.threadParentId } : {}),
  };
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(msg) + '\n', 'utf8');

  // Increment parent thread_count in-file when this is a reply
  if (params.threadParentId) {
    bumpThreadCount(org, channelId, params.threadParentId);
  }

  return msg;
}

function bumpThreadCount(org: string, channelId: string, parentId: string): void {
  const messagesDir = path.join(channelDir(org, channelId), 'messages');
  if (!fs.existsSync(messagesDir)) return;
  for (const f of fs.readdirSync(messagesDir).filter((x) => x.endsWith('.jsonl'))) {
    const fp = path.join(messagesDir, f);
    const lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean);
    let changed = false;
    const updated = lines.map((line) => {
      try {
        const obj = JSON.parse(line) as { id?: string; thread_count?: number };
        if (obj.id === parentId) { obj.thread_count = (obj.thread_count ?? 0) + 1; changed = true; return JSON.stringify(obj); }
      } catch { /* skip */ }
      return line;
    });
    if (changed) {
      const tmp = `${fp}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, updated.join('\n') + '\n', 'utf8');
      fs.renameSync(tmp, fp);
      return;
    }
  }
}

export function readCursor(org: string): string | null {
  const cp = cursorPath(org);
  if (!fs.existsSync(cp)) return null;
  try { return (JSON.parse(fs.readFileSync(cp, 'utf8')) as { last_seen_ts?: string }).last_seen_ts ?? null; } catch { return null; }
}

export function writeCursor(org: string, ts: string): void {
  writeAtomic(cursorPath(org), { last_seen_ts: ts, updated_at: new Date().toISOString() });
}
