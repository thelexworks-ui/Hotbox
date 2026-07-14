'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHotboxStore, type ChannelMeta, type PresenceStatus } from '@/store/hotbox';
import { useWs } from './WsProvider';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG || 'toadsage';
const WORKSPACE_NAME = process.env.NEXT_PUBLIC_HOTBOX_WORKSPACE_NAME || ORG;

function PresenceDot({ status }: { status: PresenceStatus }) {
  const color =
    status === 'online'  ? 'var(--hotbox-online)'  :
    status === 'crashed' ? 'var(--hotbox-crashed)' : 'var(--hotbox-offline)';
  const pulse = status === 'online' || status === 'crashed';
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        width: 8, height: 8, background: color,
        animation: pulse ? 'pulse-dot 2s ease-in-out infinite' : undefined,
      }}
    />
  );
}

function ChannelItem({ channel, onItemClick }: { channel: ChannelMeta; onItemClick?: () => void }) {
  const pathname = usePathname();
  const presence = useHotboxStore((s) => s.presence[channel.agent_name ?? '']);
  const href = channel.type === 'dm'
    ? `/dm/${channel.id.replace(/^dm-/, '')}`
    : `/channels/${channel.id}`;
  const active = pathname.includes(channel.id);

  return (
    <Link
      href={href}
      onClick={onItemClick}
      className={[
        'flex items-center gap-2 px-2 py-[3px] rounded mx-1 group',
        active
          ? 'bg-[var(--hotbox-surface-2)] text-[var(--hotbox-text)]'
          : 'text-[var(--hotbox-text-muted)] hover:bg-[var(--hotbox-surface)] hover:text-[var(--hotbox-text)]',
      ].join(' ')}
    >
      {channel.agent_name && presence && (
        <PresenceDot status={presence} />
      )}
      {!channel.agent_name && (
        <span className="text-[var(--hotbox-text-dim)] text-xs leading-none">#</span>
      )}
      <span className="truncate flex-1 text-sm">{channel.name.replace(/^#/, '')}</span>
      {(channel.unread ?? 0) > 0 && (
        <span className="ml-auto bg-[var(--hotbox-accent)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          {channel.unread}
        </span>
      )}
    </Link>
  );
}

function ChannelGroup({ label, channels, onItemClick }: { label: string; channels: ChannelMeta[]; onItemClick?: () => void }) {
  if (channels.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--hotbox-text-dim)]">
        {label}
      </div>
      {channels.map((ch) => <ChannelItem key={ch.id} channel={ch} onItemClick={onItemClick} />)}
    </div>
  );
}

function CreateChannelModal({ onClose, onCreated }: { onClose(): void; onCreated(ch: ChannelMeta): void }) {
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr]   = React.useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().replace(/^#/, '');
    if (!trimmed) { setErr('Channel name required'); return; }
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/hotbox/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org: ORG, name: `#${trimmed}`, type: 'topic' }),
      });
      if (res.ok) {
        const ch: ChannelMeta = await res.json();
        onCreated(ch);
      } else if (res.status === 409) {
        setErr('A channel with that name already exists');
        setBusy(false);
      } else {
        // Optimistic: create local channel even if server 500s
        const optimistic: ChannelMeta = {
          id: trimmed.toLowerCase().replace(/\s+/g, '-'),
          name: `#${trimmed}`,
          type: 'topic',
          org: ORG,
          pinned: false,
          created_at: new Date().toISOString(),
          members: [],
        };
        onCreated(optimistic);
      }
    } catch {
      // Network failure — still add optimistically
      const optimistic: ChannelMeta = {
        id: name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name: `#${name.trim().replace(/^#/, '')}`,
        type: 'topic',
        org: ORG,
        pinned: false,
        created_at: new Date().toISOString(),
        members: [],
      };
      onCreated(optimistic);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-lg shadow-xl p-5 flex flex-col gap-4"
        style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
      >
        <h2 className="font-semibold text-base text-[var(--hotbox-text)]">Create a channel</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--hotbox-text-muted)]" htmlFor="new-channel-name">
              Channel name
            </label>
            <div
              className="flex items-center gap-1.5 rounded px-3 py-2 border"
              style={{ borderColor: err ? 'var(--hotbox-crashed)' : 'var(--hotbox-border)', background: 'var(--hotbox-surface)' }}
            >
              <span className="text-[var(--hotbox-text-dim)] text-sm">#</span>
              <input
                ref={inputRef}
                id="new-channel-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setErr(''); }}
                placeholder="new-channel"
                className="flex-1 bg-transparent text-sm text-[var(--hotbox-text)] outline-none placeholder:text-[var(--hotbox-text-dim)]"
                maxLength={64}
                disabled={busy}
              />
            </div>
            {err && <p className="text-xs text-[var(--hotbox-crashed)]">{err}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-sm text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)]"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="px-4 py-1.5 rounded text-sm font-medium bg-[var(--hotbox-accent)] text-white hover:bg-[var(--hotbox-accent-hover)] disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({ onItemClick }: { onItemClick?: () => void }) {
  const channels    = useHotboxStore((s) => s.channels);
  const setChannels = useHotboxStore((s) => s.setChannels);
  const appendChannel = useHotboxStore((s) => s.appendChannel);
  const setPresence = useHotboxStore((s) => s.setPresence);
  const { subscribe } = useWs();

  const [showCreate, setShowCreate] = React.useState(false);

  useEffect(() => {
    fetch(`/api/hotbox/channels?org=${ORG}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setChannels(data); })
      .catch(() => {});
  }, [setChannels]);

  useEffect(() => {
    fetch('/api/hotbox/presence')
      .then((r) => r.json())
      .then((data: Record<string, PresenceStatus>) => {
        if (data && typeof data === 'object') {
          Object.entries(data).forEach(([agent, status]) => setPresence(agent, status));
        }
      })
      .catch(() => {});
  }, [setPresence]);

  useEffect(() => {
    const unsub1 = subscribe('channel.new', (msg) => {
      const ch = msg.channel as ChannelMeta;
      if (ch) appendChannel(ch);
    });
    const unsub2 = subscribe('presence', (msg) => {
      const { agent, status } = msg as unknown as { agent: string; status: PresenceStatus };
      if (agent && status) setPresence(agent, status);
    });
    return () => { unsub1(); unsub2(); };
  }, [subscribe, appendChannel, setPresence]);

  const handleChannelCreated = (ch: ChannelMeta) => {
    appendChannel(ch);
    setShowCreate(false);
  };

  const agents = channels.filter((c) => c.type === 'agent');
  const system = channels.filter((c) => c.type === 'system');
  const topics = channels.filter((c) => c.type === 'topic');
  const dms    = channels.filter((c) => c.type === 'dm');

  return (
    <>
      {showCreate && (
        <CreateChannelModal
          onClose={() => setShowCreate(false)}
          onCreated={handleChannelCreated}
        />
      )}

      <nav
        className="flex flex-col h-full overflow-y-auto hotbox-scrollbar pt-2 pb-4"
        style={{ background: 'var(--hotbox-surface)' }}
      >
        {/* Workspace header */}
        <div className="px-4 py-2 mb-2 flex items-center justify-between border-b border-[var(--hotbox-border)]">
          <span data-testid="workspace-label" className="font-semibold text-sm text-[var(--hotbox-text)] truncate">{WORKSPACE_NAME}</span>
        </div>

        <ChannelGroup label="Agents"          channels={agents}                 onItemClick={onItemClick} />
        <ChannelGroup label="Channels"        channels={[...system, ...topics]} onItemClick={onItemClick} />
        <ChannelGroup label="Direct Messages" channels={dms}                    onItemClick={onItemClick} />

        <div className="mt-auto px-3 pt-2 border-t border-[var(--hotbox-border)]">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full text-left text-xs text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-accent)] py-1 transition-colors"
          >
            + New Channel
          </button>
        </div>
      </nav>
    </>
  );
}
