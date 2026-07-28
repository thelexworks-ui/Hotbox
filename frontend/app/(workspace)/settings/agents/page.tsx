'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsBanner, SettingsSkeleton } from '@/components/settings/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentCapabilities {
  canReadMyChannels: boolean;
  canCreateTasks: boolean;
  canInviteToChannels: boolean;
}

interface AgentOverride {
  agentId: string;
  agentName: string;
  canDMMe: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  capabilities: AgentCapabilities;
}

interface AgentPrefs {
  defaultResponseMode: 'immediate' | 'batched' | 'digest';
  agentVisibilityOnGlobe: boolean;
  activityFeedEnabled: boolean;
  agentOverrides: AgentOverride[];
}

interface Member {
  id: string;
  name: string;
  role: string;
}

interface OrgAgent {
  id: string;
  name: string;
  role: string;
  email: string;
  llm_provider: string | null;
  llm_model: string | null;
  created_at: string;
}

interface Channel {
  id: string;
  name: string;
}

const DEFAULTS: AgentPrefs = {
  defaultResponseMode: 'immediate',
  agentVisibilityOnGlobe: true,
  activityFeedEnabled: true,
  agentOverrides: [],
};

const DEFAULT_CAP: AgentCapabilities = {
  canReadMyChannels: true,
  canCreateTasks: false,
  canInviteToChannels: false,
};

const LLM_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai',    label: 'OpenAI' },
  { id: 'xai',       label: 'xAI (Grok)' },
  { id: 'google',    label: 'Google Gemini' },
] as const;

const AGENT_ROLES = [
  { id: 'agent',       label: 'Agent' },
  { id: 'orchestrator',label: 'Orchestrator' },
  { id: 'analyst',     label: 'Analyst' },
  { id: 'worker',      label: 'Worker' },
] as const;

// ── Radio group ───────────────────────────────────────────────────────────────

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; description: string }[];
}) {
  return (
    <div className="space-y-2 w-full">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-start gap-3 cursor-pointer group"
          onClick={() => onChange(opt.value)}
        >
          <span
            className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
            style={{
              borderColor: value === opt.value ? 'var(--hotbox-accent)' : 'var(--hotbox-border-strong)',
              background: value === opt.value ? 'var(--hotbox-accent)' : 'transparent',
            }}
          >
            {value === opt.value && (
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </span>
          <span>
            <span className="block text-[13px] font-medium text-[var(--hotbox-text)]">{opt.label}</span>
            <span className="block text-[12px] text-[var(--hotbox-text-muted)] mt-0.5">{opt.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ── Time input ────────────────────────────────────────────────────────────────

function TimeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-[var(--hotbox-text-muted)]">
      {label}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded-[6px] text-[12px] text-[var(--hotbox-text)] focus:outline-none focus:ring-1 focus:ring-[var(--hotbox-accent)]"
        style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
      />
    </label>
  );
}

// ── Per-agent override row ────────────────────────────────────────────────────

function AgentOverrideRow({
  agent,
  override,
  onSave,
}: {
  agent: Member;
  override: AgentOverride;
  onSave: (update: Partial<AgentOverride>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  async function patch(update: Partial<AgentOverride>) {
    setSaving(true);
    try {
      await onSave(update);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="border-b border-[rgba(26,74,90,0.25)] last:border-0 py-3"
      style={{ opacity: saving ? 0.6 : 1, transition: 'opacity 0.15s' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
          style={{ background: 'var(--hotbox-surface-2)', color: 'var(--hotbox-text-muted)' }}
        >
          {agent.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="flex-1 text-[13px] font-medium text-[var(--hotbox-text)]">{agent.name}</span>
        <span className="text-[11px] text-[var(--hotbox-text-dim)] mr-1">DMs</span>
        <SettingsToggle checked={override.canDMMe} onChange={(v) => patch({ canDMMe: v })} />
        <button
          onClick={() => setExpanded((e) => !e)}
          className="ml-2 text-[11px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)] transition-colors px-2 py-0.5 rounded"
          style={{ background: 'var(--hotbox-surface-2)' }}
        >
          {expanded ? 'Less ▴' : 'More ▾'}
        </button>
      </div>

      {expanded && (
        <div className="ml-10 mt-3 space-y-3">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[12px] text-[var(--hotbox-text-muted)] flex-1">Quiet hours</span>
              <SettingsToggle checked={override.quietHoursEnabled} onChange={(v) => patch({ quietHoursEnabled: v })} />
            </div>
            {override.quietHoursEnabled && (
              <div className="flex items-center gap-3 mt-1">
                <TimeInput label="From" value={override.quietHoursStart} onChange={(v) => patch({ quietHoursStart: v })} />
                <TimeInput label="To" value={override.quietHoursEnd} onChange={(v) => patch({ quietHoursEnd: v })} />
              </div>
            )}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hotbox-text-dim)] mb-2">
              Capabilities
            </div>
            {([
              ['canReadMyChannels', 'Can read my channels'],
              ['canCreateTasks', 'Can create tasks'],
              ['canInviteToChannels', 'Can invite to channels'],
            ] as [keyof AgentCapabilities, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-1.5">
                <span className="text-[12px] text-[var(--hotbox-text-muted)]">{label}</span>
                <SettingsToggle
                  checked={override.capabilities[key]}
                  onChange={(v) => patch({ capabilities: { ...override.capabilities, [key]: v } })}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── New Agent Form ────────────────────────────────────────────────────────────

function NewAgentForm({
  channels,
  onCreated,
  onCancel,
}: {
  channels: Channel[];
  onCreated: (agent: OrgAgent, apiToken: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('agent');
  const [llmProvider, setLlmProvider] = useState<string>('');
  const [llmModel, setLlmModel] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleChannel = (id: string) => {
    setSelectedChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const submit = async () => {
    if (!name.trim()) { setError('Agent name is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role,
          llm_provider: llmProvider || undefined,
          llm_model: llmModel.trim() || undefined,
          channelIds: selectedChannels,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create agent'); return; }
      onCreated(
        { id: data.agentId, name: name.trim(), role, email: data.email, llm_provider: llmProvider || null, llm_model: llmModel.trim() || null, created_at: new Date().toISOString() },
        data.apiToken,
      );
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 rounded-[8px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]';
  const inputStyle = { background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)' };

  return (
    <div className="p-5 rounded-[12px] mt-4" style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}>
      <h3 className="text-[14px] font-semibold text-[var(--hotbox-text)] mb-4">New Agent</h3>

      {error && <SettingsBanner type="error" message={error} />}

      <div className="space-y-4">
        <div>
          <label className="block text-[11px] text-[var(--hotbox-text-muted)] mb-1">Name <span style={{ color: 'var(--hotbox-crashed)' }}>*</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales Agent" className={inputClass} style={inputStyle} />
        </div>

        <div>
          <label className="block text-[11px] text-[var(--hotbox-text-muted)] mb-1">Role</label>
          <select value={role} onChange={e => setRole(e.target.value)} className={inputClass} style={inputStyle}>
            {AGENT_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[11px] text-[var(--hotbox-text-muted)] mb-1">LLM Provider</label>
          <select value={llmProvider} onChange={e => setLlmProvider(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">None / inherit org default</option>
            {LLM_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        {llmProvider && (
          <div>
            <label className="block text-[11px] text-[var(--hotbox-text-muted)] mb-1">Model (optional)</label>
            <input type="text" value={llmModel} onChange={e => setLlmModel(e.target.value)} placeholder="e.g. claude-sonnet-5" className={inputClass} style={inputStyle} />
          </div>
        )}

        {channels.filter(c => c.id !== 'general').length > 0 && (
          <div>
            <label className="block text-[11px] text-[var(--hotbox-text-muted)] mb-2">
              Additional channels <span className="text-[var(--hotbox-text-dim)]">(#general is always included)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {channels.filter(c => c.id !== 'general').map(ch => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => toggleChannel(ch.id)}
                  className="px-3 py-1 rounded-full text-[12px] transition-all"
                  style={{
                    background: selectedChannels.includes(ch.id) ? 'var(--hotbox-accent)' : 'var(--hotbox-surface)',
                    color: selectedChannels.includes(ch.id) ? 'var(--hotbox-accent-fg, #000)' : 'var(--hotbox-text-muted)',
                    border: '1px solid var(--hotbox-border)',
                  }}
                >
                  {ch.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={submit}
          disabled={submitting || !name.trim()}
          className="px-4 py-2 rounded-[8px] text-[13px] font-semibold transition-opacity disabled:opacity-40"
          style={{ background: 'var(--hotbox-accent)', color: 'var(--hotbox-accent-fg, #000)' }}
        >
          {submitting ? 'Creating…' : 'Create Agent'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-[8px] text-[13px] text-[var(--hotbox-text-muted)] transition-colors hover:text-[var(--hotbox-text)]"
          style={{ background: 'var(--hotbox-surface)', border: '1px solid var(--hotbox-border)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── API Token reveal ──────────────────────────────────────────────────────────

function ApiTokenReveal({ token, agentName, onDismiss }: { token: string; agentName: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-5 rounded-[12px] mt-4" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--hotbox-green, #34d399)' }}>✓ {agentName} created</span>
      </div>
      <p className="text-[12px] text-[var(--hotbox-text-muted)] mb-3">
        Save this API token now — it will not be shown again.
      </p>
      <div className="flex gap-2">
        <code
          className="flex-1 px-3 py-2 rounded-[8px] text-[11px] font-mono overflow-x-auto"
          style={{ background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)', color: 'var(--hotbox-text)' }}
        >
          {token}
        </code>
        <button
          onClick={copy}
          className="px-3 py-2 rounded-[8px] text-[12px] font-semibold flex-shrink-0 transition-all"
          style={{ background: 'var(--hotbox-accent)', color: 'var(--hotbox-accent-fg, #000)' }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <button onClick={onDismiss} className="mt-3 text-[11px] text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text-muted)] transition-colors">
        I've saved the token →
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentsSettingsPage() {
  const [prefs, setPrefs] = useState<AgentPrefs>(DEFAULTS);
  const [agents, setAgents] = useState<Member[]>([]);
  const [orgAgents, setOrgAgents] = useState<OrgAgent[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isHeadmaster, setIsHeadmaster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [globalDirty, setGlobalDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; agentName: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/hotbox/me/agent-prefs').then(r => r.json()),
      fetch('/api/hotbox/members').then(r => r.json()),
      fetch('/api/org/agents').then(r => r.json()),
      fetch('/api/hotbox/channels').then(r => r.json()),
    ])
      .then(([p, m, oa, ch]) => {
        setPrefs({ ...DEFAULTS, ...p });
        setAgents(Array.isArray(m) ? m : []);
        setOrgAgents(oa.agents ?? []);
        setIsHeadmaster(oa.callerRole === 'headmaster' || oa.callerRole === 'orchestrator');
        setChannels(Array.isArray(ch) ? ch : []);
      })
      .catch(() => setError('Failed to load agent preferences.'))
      .finally(() => setLoading(false));
  }, []);

  function patchGlobal(update: Partial<AgentPrefs>) {
    setPrefs(p => ({ ...p, ...update }));
    setGlobalDirty(true);
  }

  async function saveGlobal() {
    setSaving(true);
    try {
      const { defaultResponseMode, agentVisibilityOnGlobe, activityFeedEnabled } = prefs;
      const res = await fetch('/api/hotbox/me/agent-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultResponseMode, agentVisibilityOnGlobe, activityFeedEnabled }),
      });
      if (!res.ok) throw new Error();
      setGlobalDirty(false);
    } catch {
      setError('Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  }

  const getOverride = useCallback(
    (agentId: string): AgentOverride => {
      const found = prefs.agentOverrides.find(o => o.agentId === agentId);
      return found ?? {
        agentId,
        agentName: agentId,
        canDMMe: true,
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        capabilities: { ...DEFAULT_CAP },
      };
    },
    [prefs.agentOverrides],
  );

  const saveOverride = useCallback(
    async (agentId: string, agentName: string, update: Partial<AgentOverride>) => {
      const current = getOverride(agentId);
      const merged = { ...current, ...update, agentId, agentName };
      setPrefs(p => {
        const overrides = p.agentOverrides.filter(o => o.agentId !== agentId);
        return { ...p, agentOverrides: [...overrides, merged] };
      });
      await fetch(`/api/hotbox/me/agent-prefs/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...merged, agentName }),
      });
    },
    [getOverride],
  );

  const handleAgentCreated = (agent: OrgAgent, apiToken: string) => {
    setOrgAgents(prev => [...prev, agent]);
    setShowNewAgentForm(false);
    setNewToken({ token: apiToken, agentName: agent.name });
  };

  if (loading) {
    return (
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Agents</h1>
        <SettingsSkeleton />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Agents</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">
          Manage workspace agents and control how they interact with you.
        </p>
      </div>

      {error && <SettingsBanner type="error" message={error} />}

      {/* Workspace Agents — headmaster/orchestrator only */}
      {isHeadmaster && (
        <SettingsSection title="Workspace agents">
          {orgAgents.length === 0 ? (
            <p className="text-[13px] text-[var(--hotbox-text-dim)] py-2">No agents in this workspace yet.</p>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {orgAgents.map(a => (
                <div key={a.id} className="flex items-center gap-3 py-2 border-b border-[rgba(26,74,90,0.2)] last:border-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                    style={{ background: 'var(--hotbox-surface-2)', color: 'var(--hotbox-text-muted)' }}
                  >
                    {a.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[var(--hotbox-text)]">{a.name}</div>
                    <div className="text-[11px] text-[var(--hotbox-text-dim)]">{a.role}{a.llm_provider ? ` · ${a.llm_provider}` : ''}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--hotbox-surface-2)', color: 'var(--hotbox-text-dim)' }}>
                    {a.email.split('@')[1]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!showNewAgentForm && !newToken && (
            <button
              onClick={() => setShowNewAgentForm(true)}
              className="px-4 py-2 rounded-[8px] text-[13px] font-semibold transition-opacity"
              style={{ background: 'var(--hotbox-accent)', color: 'var(--hotbox-accent-fg, #000)' }}
            >
              + New Agent
            </button>
          )}

          {showNewAgentForm && (
            <NewAgentForm
              channels={channels}
              onCreated={handleAgentCreated}
              onCancel={() => setShowNewAgentForm(false)}
            />
          )}

          {newToken && (
            <ApiTokenReveal
              token={newToken.token}
              agentName={newToken.agentName}
              onDismiss={() => setNewToken(null)}
            />
          )}
        </SettingsSection>
      )}

      {/* Global behavior */}
      <SettingsSection title="Global agent behavior">
        <SettingsRow
          label="Default response mode"
          description="How agents deliver messages to you by default."
        >
          <div className="w-64">
            <RadioGroup
              value={prefs.defaultResponseMode}
              onChange={v => patchGlobal({ defaultResponseMode: v })}
              options={[
                { value: 'immediate', label: 'Immediate', description: 'Agents DM you as events happen' },
                { value: 'batched', label: 'Batched', description: 'Agents queue messages, deliver every 15 min' },
                { value: 'digest', label: 'Digest', description: 'Agents send one summary at end of day' },
              ]}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          label="Show me on Neural Link globe"
          description="Display your presence on the Neural Link visualization."
        >
          <SettingsToggle checked={prefs.agentVisibilityOnGlobe} onChange={v => patchGlobal({ agentVisibilityOnGlobe: v })} />
        </SettingsRow>

        <SettingsRow
          label="Activity feed"
          description="Show agent actions in your sidebar activity feed."
        >
          <SettingsToggle checked={prefs.activityFeedEnabled} onChange={v => patchGlobal({ activityFeedEnabled: v })} />
        </SettingsRow>

        {globalDirty && (
          <div className="flex justify-end pt-2">
            <button
              onClick={saveGlobal}
              disabled={saving}
              className="px-4 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all disabled:opacity-50"
              style={{ background: 'var(--hotbox-amber)', color: 'var(--hotbox-amber-fg)', border: '1px solid transparent' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </SettingsSection>

      {/* Per-agent permissions */}
      <SettingsSection title="Per-agent permissions">
        {agents.length === 0 ? (
          <p className="text-[13px] text-[var(--hotbox-text-dim)] py-4">No agents connected yet.</p>
        ) : (
          <div>
            {agents.map(agent => (
              <AgentOverrideRow
                key={agent.id}
                agent={agent}
                override={getOverride(agent.id)}
                onSave={update => saveOverride(agent.id, agent.name, update)}
              />
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
