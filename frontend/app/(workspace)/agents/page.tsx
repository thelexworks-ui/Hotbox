'use client';

import React from 'react';
import Link from 'next/link';
import { useHotboxStore } from '@/store/hotbox';

export default function AgentsPage() {
  const channels = useHotboxStore((s) => s.channels);
  const presence = useHotboxStore((s) => s.presence);
  const agents   = channels.filter((c) => c.type === 'agent');

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-y-auto"
      style={{ background: 'var(--hotbox-bg)' }}
    >
      <div className="px-4 pt-5 pb-3 border-b border-[var(--hotbox-border)]">
        <h1 className="text-base font-semibold text-[var(--hotbox-text)]">Agents</h1>
        <p className="text-xs text-[var(--hotbox-text-dim)] mt-0.5">Active agents in this workspace</p>
      </div>

      {agents.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-[var(--hotbox-text-dim)] px-4">
          No agents connected
        </div>
      ) : (
        <ul className="py-2">
          {agents.map((agent) => {
            const status = presence[agent.agent_name ?? ''];
            const color =
              status === 'online'  ? 'var(--hotbox-online)'  :
              status === 'crashed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-offline)';
            return (
              <li key={agent.id}>
                <Link
                  href={`/channels/${agent.id}`}
                  className="flex items-center gap-3 px-4 py-3 border-b border-[var(--hotbox-border)] hover:bg-[var(--hotbox-surface)] transition-colors"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--hotbox-text)] truncate">
                      {agent.name.replace(/^#/, '')}
                    </div>
                    {agent.agent_role && (
                      <div className="text-xs text-[var(--hotbox-text-dim)] mt-0.5 capitalize">
                        {agent.agent_role}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-[var(--hotbox-text-dim)] capitalize">{status ?? 'offline'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
