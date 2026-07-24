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
      {/* Header row */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
          style={{ background: 'var(--hotbox-surface-2)', color: 'var(--hotbox-text-muted)' }}
        >
          {agent.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Name */}
        <span className="flex-1 text-[13px] font-medium text-[var(--hotbox-text)]">{agent.name}</span>

        {/* Compact toggles */}
        <span className="text-[11px] text-[var(--hotbox-text-dim)] mr-1">DMs</span>
        <SettingsToggle
          checked={override.canDMMe}
          onChange={(v) => patch({ canDMMe: v })}
        />

        {/* Expand capabilities */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="ml-2 text-[11px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)] transition-colors px-2 py-0.5 rounded"
          style={{ background: 'var(--hotbox-surface-2)' }}
        >
          {expanded ? 'Less ▴' : 'More ▾'}
        </button>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="ml-10 mt-3 space-y-3">
          {/* Quiet hours */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[12px] text-[var(--hotbox-text-muted)] flex-1">Quiet hours</span>
              <SettingsToggle
                checked={override.quietHoursEnabled}
                onChange={(v) => patch({ quietHoursEnabled: v })}
              />
            </div>
            {override.quietHoursEnabled && (
              <div className="flex items-center gap-3 mt-1">
                <TimeInput
                  label="From"
                  value={override.quietHoursStart}
                  onChange={(v) => patch({ quietHoursStart: v })}
                />
                <TimeInput
                  label="To"
                  value={override.quietHoursEnd}
                  onChange={(v) => patch({ quietHoursEnd: v })}
                />
              </div>
            )}
          </div>

          {/* Capabilities */}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentsSettingsPage() {
  const [prefs, setPrefs] = useState<AgentPrefs>(DEFAULTS);
  const [agents, setAgents] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [globalDirty, setGlobalDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/hotbox/me/agent-prefs').then((r) => r.json()),
      fetch('/api/hotbox/members').then((r) => r.json()),
    ])
      .then(([p, m]) => {
        setPrefs({ ...DEFAULTS, ...p });
        setAgents(Array.isArray(m) ? m : []);
      })
      .catch(() => setError('Failed to load agent preferences.'))
      .finally(() => setLoading(false));
  }, []);

  function patchGlobal(update: Partial<AgentPrefs>) {
    setPrefs((p) => ({ ...p, ...update }));
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
      const found = prefs.agentOverrides.find((o) => o.agentId === agentId);
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

      // Optimistic local update
      setPrefs((p) => {
        const overrides = p.agentOverrides.filter((o) => o.agentId !== agentId);
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

  if (loading) return <div className="mb-8"><div className="mb-6"><h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Agents</h1></div><SettingsSkeleton /></div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Agents</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">
          Control how agents interact with you across Hotbox.
        </p>
      </div>

      {error && <SettingsBanner type="error" message={error} />}

      {/* Global behavior */}
      <SettingsSection title="Global agent behavior">
        <SettingsRow
          label="Default response mode"
          description="How agents deliver messages to you by default."
        >
          <div className="w-64">
            <RadioGroup
              value={prefs.defaultResponseMode}
              onChange={(v) => patchGlobal({ defaultResponseMode: v })}
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
          <SettingsToggle
            checked={prefs.agentVisibilityOnGlobe}
            onChange={(v) => patchGlobal({ agentVisibilityOnGlobe: v })}
          />
        </SettingsRow>

        <SettingsRow
          label="Activity feed"
          description="Show agent actions in your sidebar activity feed."
        >
          <SettingsToggle
            checked={prefs.activityFeedEnabled}
            onChange={(v) => patchGlobal({ activityFeedEnabled: v })}
          />
        </SettingsRow>

        {globalDirty && (
          <div className="flex justify-end pt-2">
            <button
              onClick={saveGlobal}
              disabled={saving}
              className="px-4 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all disabled:opacity-50"
              style={{
                background: 'var(--hotbox-amber)',
                color: 'var(--hotbox-amber-fg)',
                border: '1px solid transparent',
              }}
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
            {agents.map((agent) => (
              <AgentOverrideRow
                key={agent.id}
                agent={agent}
                override={getOverride(agent.id)}
                onSave={(update) => saveOverride(agent.id, agent.name, update)}
              />
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
