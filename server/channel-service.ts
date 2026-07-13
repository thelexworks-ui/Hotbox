/**
 * hotbox-channel-service.ts
 * Channel CRUD for the Hotbox bus-native message store.
 * Drop into hepha-web/src/lib/hotbox/channel-service.ts
 *
 * All writes are atomic (tmp → rename). Idempotent: safe to call repeatedly.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const INSTANCE_ID = process.env.CTX_INSTANCE_ID ?? 'default';
const FRAMEWORK_ROOT = process.env.CTX_FRAMEWORK_ROOT ?? path.join(os.homedir(), 'Sage');

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ChannelType = 'system' | 'agent' | 'topic' | 'dm';
export type AgentRole = 'orchestrator' | 'analyst' | 'agent';

export interface ChannelMeta {
  id: string;           // slugified name, e.g. "agent-daedalus"
  name: string;         // display name, e.g. "#agent-daedalus"
  type: ChannelType;
  org: string;
  agent_name?: string;  // set for type=agent channels
  agent_role?: AgentRole;
  pinned: boolean;      // true for system channels (#general, #alerts)
  created_at: string;   // ISO8601 UTC
  topic?: string;
  members: string[];    // agent names or "user:<email>"
}

export interface CreateChannelParams {
  org: string;
  name: string;         // e.g. "agent-daedalus" (no # prefix)
  type: ChannelType;
  agentName?: string;
  agentRole?: AgentRole;
  pinned?: boolean;
  members?: string[];
  topic?: string;
}

// --------------------------------------------------------------------------
// Paths
// --------------------------------------------------------------------------

function hotboxRoot(org: string): string {
  return path.join(
    os.homedir(), '.cortextos', INSTANCE_ID, 'orgs', org, 'hotbox'
  );
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

// --------------------------------------------------------------------------
// Atomic write helper
// --------------------------------------------------------------------------

function writeAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

// --------------------------------------------------------------------------
// Channel existence check
// --------------------------------------------------------------------------

export function channelExists(org: string, channelId: string): boolean {
  return fs.existsSync(metaPath(org, channelId));
}

// --------------------------------------------------------------------------
// Create a channel (idempotent)
// --------------------------------------------------------------------------

export function createChannel(params: CreateChannelParams): ChannelMeta | null {
  const channelId = params.name.replace(/^#/, '');
  const mp = metaPath(params.org, channelId);

  // Idempotent: already exists → skip, return existing meta
  if (fs.existsSync(mp)) {
    try {
      return JSON.parse(fs.readFileSync(mp, 'utf8')) as ChannelMeta;
    } catch {
      return null;
    }
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

  // Create channel dir + messages subdir
  fs.mkdirSync(path.join(channelDir(params.org, channelId), 'messages'), { recursive: true });

  // Write meta atomically
  writeAtomic(mp, meta);

  // Post system message: "<agent-name> channel created"
  appendSystemMessage(params.org, channelId, `${meta.name} channel created`);

  return meta;
}

// --------------------------------------------------------------------------
// Bootstrap system channels for a new org workspace
// --------------------------------------------------------------------------

export function bootstrapWorkspace(org: string): void {
  // System channels are pinned and always sort first
  createChannel({
    org,
    name: 'general',
    type: 'system',
    pinned: true,
    topic: 'General discussion',
    members: [],
  });

  createChannel({
    org,
    name: 'alerts',
    type: 'system',
    pinned: true,
    topic: 'System alerts, watchdog events, cron notifications',
    members: [],
  });

  // Write workspace meta if not present
  const wsMeta = path.join(hotboxRoot(org), 'workspaces', 'meta.json');
  if (!fs.existsSync(wsMeta)) {
    writeAtomic(wsMeta, {
      org,
      name: org,
      created_at: new Date().toISOString(),
    });
  }
}

// --------------------------------------------------------------------------
// Create an agent channel from an agent_created event payload
// --------------------------------------------------------------------------

export function createAgentChannel(params: {
  org: string;
  agentName: string;
  agentRole?: AgentRole;
}): ChannelMeta | null {
  // Bootstrap workspace if this is the first channel
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

// --------------------------------------------------------------------------
// List all channels for an org (sorted: pinned system first, then by created_at)
// --------------------------------------------------------------------------

export function listChannels(org: string): ChannelMeta[] {
  const channelsDir = path.join(hotboxRoot(org), 'channels');
  if (!fs.existsSync(channelsDir)) return [];

  const channels: ChannelMeta[] = [];
  for (const entry of fs.readdirSync(channelsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const mp = path.join(channelsDir, entry.name, 'meta.json');
    if (!fs.existsSync(mp)) continue;
    try {
      channels.push(JSON.parse(fs.readFileSync(mp, 'utf8')));
    } catch { /* skip corrupt meta */ }
  }

  return channels.sort((a, b) => {
    // Pinned channels always first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    // Then by creation time
    return a.created_at.localeCompare(b.created_at);
  });
}

// --------------------------------------------------------------------------
// Append a system message to a channel's today JSONL log
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// Cursor management for backfill
// --------------------------------------------------------------------------

export function readCursor(org: string): string | null {
  const cp = cursorPath(org);
  if (!fs.existsSync(cp)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(cp, 'utf8'));
    return data.last_seen_ts ?? null;
  } catch {
    return null;
  }
}

export function writeCursor(org: string, ts: string): void {
  writeAtomic(cursorPath(org), { last_seen_ts: ts, updated_at: new Date().toISOString() });
}
