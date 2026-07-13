import net from 'net';
import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import {
  createAgentChannel,
  bootstrapWorkspace,
  writeCursor,
  channelExists,
  appendSystemMessage,
  type AgentRole,
} from './channel-service';
import { presenceMap } from './presence';

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

export type { PresenceStatus } from './presence';
export { presenceMap } from './presence';

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
      } catch { resolve([]); }
    });
    client.on('error', () => resolve([]));
    setTimeout(() => { client.destroy(); resolve([]); }, 5000);
  });
}

function buildSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

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
  writeCursor(org, new Date().toISOString());
}

function handleAgentCreated(meta: AgentCreatedMeta): void {
  const agentRole: AgentRole =
    meta.agent_role === 'orchestrator' ? 'orchestrator'
    : meta.agent_role === 'analyst' ? 'analyst'
    : 'agent';

  const channel = createAgentChannel({ org: meta.org, agentName: meta.agent, agentRole });
  if (channel) {
    console.log(`[hotbox-onboarding] created #agent-${meta.agent} (role=${agentRole})`);
    writeCursor(meta.org, meta.timestamp);
  }
}

function handleAgentStarted(meta: AgentLifecycleMeta): void {
  presenceMap.set(meta.agent, 'online');
  const channelId = `agent-${meta.agent}`;
  if (channelExists(meta.org, channelId)) appendSystemMessage(meta.org, channelId, `${meta.agent} is online`);
}

function handleAgentStopped(meta: AgentLifecycleMeta): void {
  presenceMap.set(meta.agent, 'offline');
  const channelId = `agent-${meta.agent}`;
  if (channelExists(meta.org, channelId)) appendSystemMessage(meta.org, channelId, `${meta.agent} went offline`);
}

function handleAgentCrashed(meta: AgentLifecycleMeta): void {
  presenceMap.set(meta.agent, 'crashed');
  const channelId = `agent-${meta.agent}`;
  if (channelExists(meta.org, channelId)) appendSystemMessage(meta.org, channelId, `${meta.agent} crashed`);
}

export function subscribeToAgentLifecycle(supabase: SupabaseClient, org: string): RealtimeChannel {
  return supabase
    .channel('hotbox-agent-lifecycle')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'events', filter: `category=eq.agent_activity` },
      (payload) => {
        const row = payload.new as { event: string; org_id: string; meta: AgentCreatedMeta & AgentLifecycleMeta };
        // Ignore events from other orgs (Realtime doesn't support compound AND filters)
        if (row.org_id !== org) return;
        const meta = row.meta;
        switch (row.event) {
          case 'agent_created':  handleAgentCreated(meta as AgentCreatedMeta); break;
          case 'agent_started':  handleAgentStarted(meta); break;
          case 'agent_stopped':  handleAgentStopped(meta); break;
          case 'agent_crashed':  handleAgentCrashed(meta); break;
        }
      },
    )
    .subscribe((status) => { console.log(`[hotbox-onboarding] Realtime status: ${status}`); });
}

let _realtimeChannel: RealtimeChannel | null = null;

export async function startHotboxOnboarding(org: string): Promise<void> {
  console.log(`[hotbox-onboarding] starting for org=${org}`);
  await backfillAgentChannels(org);
  const supabase = buildSupabaseClient();
  _realtimeChannel = subscribeToAgentLifecycle(supabase, org);
  console.log('[hotbox-onboarding] boot complete — Realtime subscription active');
}

export function stopHotboxOnboarding(): void {
  if (_realtimeChannel) { _realtimeChannel.unsubscribe(); _realtimeChannel = null; }
}
