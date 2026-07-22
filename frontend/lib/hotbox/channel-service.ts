import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type { AegisEnvelope, AnyMessage, HotboxMessage, SystemMessage } from './types';
import { storeChannelKey, storeChannelMembers, getChannelMembers, hasChannelKey } from './keys-store';

// ── Singleton client ──────────────────────────────────────────────────────────

function buildClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('[hotbox-channels] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

let _client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!_client) _client = buildClient();
  return _client;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChannelType = 'system' | 'agent' | 'topic' | 'group' | 'dm';
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
  has_ck?: boolean;
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

// ── Row → ChannelMeta ─────────────────────────────────────────────────────────

function rowToMeta(row: {
  id: string; org_id: string; name: string; type: string;
  pinned: boolean; topic?: string | null; created_at: string;
}): ChannelMeta {
  return {
    id: row.id,
    name: row.name,
    type: row.type as ChannelType,
    org: row.org_id,
    pinned: row.pinned,
    created_at: row.created_at,
    topic: row.topic ?? undefined,
    members: [],
  };
}

// ── Channel ops ───────────────────────────────────────────────────────────────

export async function listChannels(org: string): Promise<ChannelMeta[]> {
  const [channelsRes, membersRes, ckRes] = await Promise.all([
    db()
      .from('hotbox_channels')
      .select('*')
      .eq('org_id', org)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: true }),
    db()
      .from('hotbox_keys')
      .select('key_path, payload')
      .eq('org_id', org)
      .eq('key_type', 'members'),
    db()
      .from('hotbox_keys')
      .select('key_path')
      .eq('org_id', org)
      .eq('key_type', 'ck'),
  ]);

  if (channelsRes.error) {
    console.error('[hotbox-channels] ERROR listing channels', { org, message: channelsRes.error.message, code: channelsRes.error.code });
    return [];
  }

  const membersByChannel = new Map<string, string[]>();
  for (const row of (membersRes.data ?? [])) {
    const m = (row.payload as { members?: string[] } | null)?.members;
    if (m) membersByChannel.set(row.key_path as string, m);
  }

  const ckSet = new Set<string>((ckRes.data ?? []).map((r) => r.key_path as string));

  return (channelsRes.data ?? []).map((r) => ({
    ...rowToMeta(r as Parameters<typeof rowToMeta>[0]),
    members: membersByChannel.get(r.id) ?? [],
    has_ck: ckSet.has(r.id),
  }));
}

export async function getChannelMeta(org: string, channelId: string): Promise<ChannelMeta | null> {
  const [channelRes, membersRes, ckRes] = await Promise.all([
    db()
      .from('hotbox_channels')
      .select('*')
      .eq('org_id', org)
      .eq('id', channelId)
      .single(),
    db()
      .from('hotbox_keys')
      .select('payload')
      .eq('org_id', org)
      .eq('key_type', 'members')
      .eq('key_path', channelId)
      .maybeSingle(),
    db()
      .from('hotbox_keys')
      .select('key_path')
      .eq('org_id', org)
      .eq('key_type', 'ck')
      .eq('key_path', channelId)
      .maybeSingle(),
  ]);

  if (channelRes.error) {
    if (channelRes.error.code !== 'PGRST116') {
      console.error('[hotbox-channels] ERROR getting channel meta', { org, channelId, message: channelRes.error.message });
    }
    return null;
  }
  if (!channelRes.data) return null;

  const members = (membersRes.data?.payload as { members?: string[] } | null)?.members ?? [];
  return { ...rowToMeta(channelRes.data as Parameters<typeof rowToMeta>[0]), members, has_ck: ckRes.data !== null };
}

export async function channelExists(org: string, channelId: string): Promise<boolean> {
  return (await getChannelMeta(org, channelId)) !== null;
}

export async function createChannel(params: CreateChannelParams): Promise<ChannelMeta | null> {
  const channelId = params.name.replace(/^#/, '');

  const existing = await getChannelMeta(params.org, channelId);
  if (existing) {
    // Top up members and CK if a prior racey createChannel left them missing.
    const [currentMembers, hasCk] = await Promise.all([
      getChannelMembers(params.org, channelId),
      hasChannelKey(params.org, channelId),
    ]);
    if (params.members && params.members.length > 0 && currentMembers.length === 0) {
      await storeChannelMembers(params.org, channelId, params.members);
    }
    if (!hasCk) {
      await storeChannelKey(params.org, channelId, crypto.randomBytes(32).toString('base64'));
    }
    return existing;
  }

  const row = {
    id: channelId,
    org_id: params.org,
    name: `#${channelId}`,
    type: params.type,
    pinned: params.pinned ?? false,
    topic: params.topic ?? null,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await db()
    .from('hotbox_channels')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Race: created between our check and insert
      return getChannelMeta(params.org, channelId);
    }
    console.error('[hotbox-channels] ERROR creating channel', { org: params.org, channelId, message: error.message });
    return null;
  }

  if (data) {
    void appendSystemMessage(params.org, channelId, `#${channelId} channel created`);
    await storeChannelKey(params.org, channelId, crypto.randomBytes(32).toString('base64'));
    if (params.members && params.members.length > 0) {
      await storeChannelMembers(params.org, channelId, params.members);
    }
  }

  return data ? rowToMeta(data as Parameters<typeof rowToMeta>[0]) : null;
}

// ── #general invariant ────────────────────────────────────────────────────────

async function getOrgRoster(org: string): Promise<string[]> {
  // Canonical: look up org UUID from slug, then query Slice A tables
  const { data: orgRow } = await db().from('orgs').select('id').eq('slug', org).maybeSingle();
  if (orgRow?.id) {
    const [agentsRes, usersRes] = await Promise.all([
      db().from('agent_accounts').select('name').eq('org_id', orgRow.id),
      db().from('users').select('email').eq('org_id', orgRow.id),
    ]);
    const names = (agentsRes.data ?? []).map((r: { name: string }) => r.name);
    const slugs = (usersRes.data ?? []).map((r: { email: string }) =>
      r.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    );
    const canonical = [...names, ...slugs].filter((v, i, a) => a.indexOf(v) === i);
    if (canonical.length > 0) return canonical;
  }

  // Fallback: union all hotbox_keys members records for this org
  const { data: allMembers } = await db()
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', org)
    .eq('key_type', 'members');
  const fallback: string[] = [];
  for (const row of (allMembers ?? [])) {
    for (const m of ((row.payload as { members?: string[] } | null)?.members ?? [])) {
      if (!fallback.includes(m)) fallback.push(m);
    }
  }
  return fallback;
}

export async function syncGeneralWithRoster(org: string): Promise<void> {
  const [roster, current] = await Promise.all([
    getOrgRoster(org),
    getChannelMembers(org, 'general'),
  ]);
  if (roster.length === 0) return;
  if (current.length < roster.length) {
    console.warn('[hotbox-channels] #general members < org roster', { org, generalCount: current.length, rosterCount: roster.length, missing: roster.filter((m) => !current.includes(m)) });
  }
  const merged = [...current, ...roster].filter((v, i, a) => a.indexOf(v) === i);
  if (merged.length !== current.length) {
    await storeChannelMembers(org, 'general', merged);
  }
}

export async function bootstrapWorkspace(org: string): Promise<void> {
  await Promise.all([
    createChannel({ org, name: 'general', type: 'system', pinned: true, topic: 'General discussion', members: [] }),
    createChannel({ org, name: 'alerts', type: 'system', pinned: true, topic: 'System alerts, watchdog events, cron notifications', members: [] }),
  ]);
  await syncGeneralWithRoster(org);
}

export async function createAgentChannel(params: { org: string; agentName: string; agentRole?: AgentRole }): Promise<ChannelMeta | null> {
  await bootstrapWorkspace(params.org);
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

// ── Message ops ───────────────────────────────────────────────────────────────

export async function listMessages(org: string, channelId: string, limit = 100): Promise<AnyMessage[]> {
  const { data, error } = await db()
    .from('hotbox_messages')
    .select('payload')
    .eq('org_id', org)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[hotbox-channels] ERROR listing messages', { org, channelId, message: error.message });
    return [];
  }

  return (data ?? []).map((r: { payload: AnyMessage }) => r.payload).reverse();
}

export const readMessages = listMessages;

export async function appendMessage(
  org: string,
  channelId: string,
  params: { senderId: string; envelope: AegisEnvelope; threadParentId?: string },
): Promise<HotboxMessage> {
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

  const { error } = await db()
    .from('hotbox_messages')
    .insert({ id, org_id: org, channel_id: channelId, payload: msg });

  if (error) {
    console.error('[hotbox-channels] ERROR appending message', { org, channelId, message: error.message, code: error.code });
    throw error;
  }

  return msg;
}

export async function appendSystemMessage(org: string, channelId: string, text: string): Promise<void> {
  const id = `${Date.now()}-system-${crypto.randomBytes(3).toString('hex')}`;
  const msg: SystemMessage = {
    id,
    org_id: org,
    channel_id: channelId,
    sender_id: 'system',
    content: text,
    type: 'system',
    ts: new Date().toISOString(),
  };

  const { error } = await db()
    .from('hotbox_messages')
    .insert({ id, org_id: org, channel_id: channelId, payload: msg });

  if (error) {
    console.error('[hotbox-channels] ERROR appending system message', { org, channelId, message: error.message });
  }
}
