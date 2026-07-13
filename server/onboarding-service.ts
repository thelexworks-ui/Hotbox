/**
 * hotbox-onboarding-service.ts
 * Subscribes to agent lifecycle events and provisions Hotbox channels.
 * Drop into hepha-web/src/lib/hotbox/onboarding-service.ts
 *
 * Boot sequence:
 *   1. IPC list-agents → backfill any missing agent channels
 *   2. Supabase Realtime → react to future agent_created events
 *   3. Lifecycle events (agent_started/stopped/crashed) → update presence
 */

import net from 'net';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  createAgentChannel,
  bootstrapWorkspace,
  readCursor,
  writeCursor,
  channelExists,
  appendSystemMessage,
  type AgentRole,
} from './hotbox-channel-service';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface AgentCreatedMeta {
  agent: string;
  org: string;
  template?: string;
  agent_role?: AgentRole;
  agent_dir?: string;
  timestamp: string;
}

interface AgentLifecycleMeta {
  agent: string;
  org: string;
  timestamp: string;
}

interface IpcListAgentsResponse {
  success: boolean;
  data: string[];
}

// Presence state: keyed by agent name
type PresenceStatus = 'online' | 'offline' | 'crashed';
export const presenceMap = new Map<string, PresenceStatus>();

// --------------------------------------------------------------------------
// IPC call to daemon: list-agents for an org
// --------------------------------------------------------------------------

async function ipcListAgents(org: string): Promise<string[]> {
  return new Promise((resolve) => {
    const socketPath = process.env.CTX_IPC_SOCKET ?? '\\\\.\\pipe\\cortextos-daemon';
    const client = net.createConnection(socketPath, () => {
      client.write(JSON.stringify({ type: 'list-agents', org }) + '\n');
    });

    let buf = '';
    client.on('data', (chunk) => { buf += chunk.toString(); });
    client.on('end', () => {
      try {
        const res: IpcListAgentsResponse = JSON.parse(buf);
        resolve(res.success ? res.data : []);
      } catch {
        resolve([]);
      }
    });
    client.on('error', () => resolve([]));

    // 5s timeout — non-fatal if daemon is unreachable
    setTimeout(() => { client.destroy(); resolve([]); }, 5000);
  });
}

// --------------------------------------------------------------------------
// Supabase Realtime subscription for agent lifecycle events
// --------------------------------------------------------------------------

function buildSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

// --------------------------------------------------------------------------
// Boot backfill: ensure every existing agent has a channel
// --------------------------------------------------------------------------

export async function backfillAgentChannels(org: string): Promise<void> {
  bootstrapWorkspace(org);

  const agents = await ipcListAgents(org);
  for (const agentName of agents) {
    const channelId = `agent-${agentName}`;
    if (!channelExists(org, channelId)) {
      createAgentChannel({ org, agentName });
      console.log(`[hotbox-onboarding] backfill: created #${channelId}`);
    }
  }

  // Advance cursor to now so Realtime subscription only delivers deltas
  writeCursor(org, new Date().toISOString());
}

// --------------------------------------------------------------------------
// Handle a single agent_created event
// --------------------------------------------------------------------------

function handleAgentCreated(meta: AgentCreatedMeta): void {
  const agentRole: AgentRole =
    meta.agent_role === 'orchestrator' ? 'orchestrator'
    : meta.agent_role === 'analyst' ? 'analyst'
    : 'agent';

  const channel = createAgentChannel({
    org: meta.org,
    agentName: meta.agent,
    agentRole,
  });

  if (channel) {
    console.log(`[hotbox-onboarding] created #agent-${meta.agent} (role=${agentRole})`);
    writeCursor(meta.org, meta.timestamp);
  }
}

// --------------------------------------------------------------------------
// Handle lifecycle events → presence map + system message
// --------------------------------------------------------------------------

function handleAgentStarted(meta: AgentLifecycleMeta): void {
  presenceMap.set(meta.agent, 'online');
  const channelId = `agent-${meta.agent}`;
  if (channelExists(meta.org, channelId)) {
    appendSystemMessage(meta.org, channelId, `${meta.agent} is online`);
  }
}

function handleAgentStopped(meta: AgentLifecycleMeta): void {
  presenceMap.set(meta.agent, 'offline');
  const channelId = `agent-${meta.agent}`;
  if (channelExists(meta.org, channelId)) {
    appendSystemMessage(meta.org, channelId, `${meta.agent} went offline`);
  }
}

function handleAgentCrashed(meta: AgentLifecycleMeta): void {
  presenceMap.set(meta.agent, 'crashed');
  const channelId = `agent-${meta.agent}`;
  if (channelExists(meta.org, channelId)) {
    appendSystemMessage(meta.org, channelId, `${meta.agent} crashed`);
  }
}

// --------------------------------------------------------------------------
// Subscribe to Supabase Realtime for all agent lifecycle events
// --------------------------------------------------------------------------

export function subscribeToAgentLifecycle(
  supabase: SupabaseClient,
  org: string,
): RealtimeChannel {
  return supabase
    .channel('hotbox-agent-lifecycle')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
        filter: `category=eq.agent_activity AND org=eq.${org}`,
      },
      (payload) => {
        const row = payload.new as {
          event: string;
          metadata: AgentCreatedMeta & AgentLifecycleMeta;
        };
        const meta = row.metadata;

        switch (row.event) {
          case 'agent_created':
            handleAgentCreated(meta as AgentCreatedMeta);
            break;
          case 'agent_started':
            handleAgentStarted(meta);
            break;
          case 'agent_stopped':
            handleAgentStopped(meta);
            break;
          case 'agent_crashed':
            handleAgentCrashed(meta);
            break;
        }
      },
    )
    .subscribe((status) => {
      console.log(`[hotbox-onboarding] Realtime status: ${status}`);
    });
}

// --------------------------------------------------------------------------
// Top-level boot: backfill then subscribe
// Intended to be called once from hepha-web server startup (e.g. instrumentation.ts)
// --------------------------------------------------------------------------

let _realtimeChannel: RealtimeChannel | null = null;

export async function startHotboxOnboarding(org: string): Promise<void> {
  console.log(`[hotbox-onboarding] starting for org=${org}`);

  // Step 1: backfill all existing agents via IPC list-agents
  await backfillAgentChannels(org);

  // Step 2: subscribe to Realtime for future events
  const supabase = buildSupabaseClient();
  _realtimeChannel = subscribeToAgentLifecycle(supabase, org);

  console.log('[hotbox-onboarding] boot complete — Realtime subscription active');
}

export function stopHotboxOnboarding(): void {
  if (_realtimeChannel) {
    _realtimeChannel.unsubscribe();
    _realtimeChannel = null;
  }
}
