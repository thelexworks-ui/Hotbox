'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  SettingsSection, SettingsRow, SettingsToggle,
  SettingsSaveBtn, SettingsBanner, SettingsSkeleton,
} from '@/components/settings/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type DmsOption = 'all' | 'mentions' | 'none';
type PushWhen  = 'always' | 'away_only';
type Day       = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface DndSchedule {
  enabled: boolean;
  startTime: string;
  endTime: string;
  days: Day[];
}

interface ChannelOverride {
  channelId: string;
  channelName: string;
  muted: boolean;
  muteUntil?: string;
}

interface NotificationPrefs {
  dms: DmsOption;
  mentions: boolean;
  keywords: string[];
  channelOverrides: ChannelOverride[];
  mobilePush: boolean;
  mobilePushWhen: PushWhen;
  sound: boolean;
  soundName: string;
  unreadBadge: boolean;
  dndEnabled: boolean;
  dndSchedule: DndSchedule;
}

interface ChannelMeta { id: string; name: string; type?: string; }

const MUTE_UNTIL_OPTIONS = [
  { value: '1h',      label: '1 hour' },
  { value: '8h',      label: '8 hours' },
  { value: '24h',     label: '24 hours' },
  { value: 'forever', label: 'Forever' },
];

const DAYS: { value: Day; label: string }[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

// ── Radio group ───────────────────────────────────────────────────────────────

function RadioGroup<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 rounded-[7px] text-[12px] transition-all"
          style={{
            background: value === opt.value ? 'var(--hotbox-selected)' : 'var(--hotbox-surface-2)',
            border: `1px solid ${value === opt.value ? 'var(--hotbox-accent)' : 'var(--hotbox-border)'}`,
            color: value === opt.value ? 'var(--hotbox-text)' : 'var(--hotbox-text-muted)',
            fontWeight: value === opt.value ? 600 : 400,
          }}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Tag input for keywords ────────────────────────────────────────────────────

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };
  return (
    <div className="flex flex-col gap-2 w-full max-w-sm">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px]"
            style={{ background: 'var(--hotbox-accent-subtle)', color: 'var(--hotbox-accent)', border: '1px solid rgba(90,218,238,0.20)' }}>
            {tag}
            <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="hover:text-[var(--hotbox-text)] leading-none">✕</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-[12px] text-[var(--hotbox-text-dim)]">No keywords yet</span>}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Add keyword…"
          className="flex-1 px-2 py-1 rounded-[6px] text-[12px] text-[var(--hotbox-text)] focus:outline-none focus:ring-1 focus:ring-[var(--hotbox-accent)]"
          style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }} />
        <button onClick={add}
          className="px-2 py-1 rounded-[6px] text-[11px] font-medium text-[var(--hotbox-accent)] hover:bg-[var(--hotbox-accent-subtle)]"
          style={{ border: '1px solid rgba(90,218,238,0.20)' }}>
          Add
        </button>
      </div>
    </div>
  );
}

// ── Channel override row ──────────────────────────────────────────────────────

function ChannelOverrideRow({
  channel, override, onToggle, onMuteUntil,
}: {
  channel: ChannelMeta;
  override?: ChannelOverride;
  onToggle: (muted: boolean) => void;
  onMuteUntil: (v: string) => void;
}) {
  const muted = override?.muted ?? false;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[rgba(26,74,90,0.20)] last:border-0">
      <span className="text-[13px] text-[var(--hotbox-text)] flex-1 truncate">{channel.name}</span>
      {muted && (
        <select value={override?.muteUntil ?? 'forever'} onChange={(e) => onMuteUntil(e.target.value)}
          className="px-2 py-1 rounded-[6px] text-[11px] text-[var(--hotbox-text-muted)] focus:outline-none"
          style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}>
          {MUTE_UNTIL_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      )}
      <SettingsToggle checked={muted} onChange={onToggle} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [channels, setChannels] = useState<ChannelMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/hotbox/me/notifications').then((r) => r.json()),
      fetch('/api/hotbox/channels').then((r) => r.json()),
    ])
      .then(([p, ch]) => {
        setPrefs(p as NotificationPrefs);
        setChannels((ch as ChannelMeta[]).filter((c) => c.type !== 'dm'));
      })
      .catch(() => setBanner({ type: 'error', message: 'Failed to load notification settings' }))
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback(<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    setPrefs((p) => p ? { ...p, [key]: value } : p);
    setDirty(true);
  }, []);

  const updateDnd = useCallback(<K extends keyof DndSchedule>(key: K, value: DndSchedule[K]) => {
    setPrefs((p) => p ? { ...p, dndSchedule: { ...p.dndSchedule, [key]: value } } : p);
    setDirty(true);
  }, []);

  const toggleChannelMute = useCallback((channelId: string, channelName: string, muted: boolean) => {
    setPrefs((p) => {
      if (!p) return p;
      const overrides = p.channelOverrides.filter((o) => o.channelId !== channelId);
      if (muted) overrides.push({ channelId, channelName, muted: true, muteUntil: 'forever' });
      return { ...p, channelOverrides: overrides };
    });
    setDirty(true);
    fetch(`/api/hotbox/me/notifications/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted, channelName }),
    }).catch(() => {});
  }, []);

  const setChannelMuteUntil = useCallback((channelId: string, muteUntil: string) => {
    setPrefs((p) => {
      if (!p) return p;
      return { ...p, channelOverrides: p.channelOverrides.map((o) => o.channelId === channelId ? { ...o, muteUntil } : o) };
    });
    fetch(`/api/hotbox/me/notifications/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted: true, muteUntil }),
    }).catch(() => {});
  }, []);

  const save = useCallback(async () => {
    if (!prefs) return;
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hotbox/me/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) { setBanner({ type: 'error', message: 'Save failed' }); return; }
      setDirty(false);
      setBanner({ type: 'success', message: 'Notification preferences saved' });
      setTimeout(() => setBanner(null), 2000);
    } catch {
      setBanner({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  if (loading) return <SettingsSkeleton />;
  if (!prefs) return <div className="text-[var(--hotbox-crashed)] text-[13px]">Failed to load</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Notifications</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">Control how and when Hotbox notifies you</p>
      </div>

      {banner && <SettingsBanner type={banner.type} message={banner.message} />}

      {/* ── DMs & mentions ── */}
      <SettingsSection title="Direct messages & mentions">
        <SettingsRow label="DM notifications" description="When someone sends you a direct message">
          <RadioGroup<DmsOption>
            value={prefs.dms}
            onChange={(v) => update('dms', v)}
            options={[
              { value: 'all',      label: 'All' },
              { value: 'mentions', label: 'Mentions only' },
              { value: 'none',     label: 'None' },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="@mentions" description="Get notified when someone mentions you in a channel">
          <SettingsToggle checked={prefs.mentions} onChange={(v) => update('mentions', v)} />
        </SettingsRow>

        <div className="py-[14px] border-b border-[rgba(26,74,90,0.25)] last:border-0">
          <div className="mb-3">
            <div className="text-[13px] font-medium text-[var(--hotbox-text)]">Keywords</div>
            <div className="text-[12px] text-[var(--hotbox-text-muted)] mt-[2px]">Get notified when these words appear in any message</div>
          </div>
          <TagInput tags={prefs.keywords} onChange={(t) => update('keywords', t)} />
        </div>
      </SettingsSection>

      {/* ── Channel overrides ── */}
      <SettingsSection title="Channel notifications">
        <p className="text-[12px] text-[var(--hotbox-text-muted)] mb-3">
          Mute individual channels — no notifications for new messages there.
        </p>
        {channels.length === 0 ? (
          <div className="text-[12px] text-[var(--hotbox-text-dim)] py-3">No channels yet</div>
        ) : (
          channels.map((ch) => (
            <ChannelOverrideRow
              key={ch.id}
              channel={ch}
              override={prefs.channelOverrides.find((o) => o.channelId === ch.id)}
              onToggle={(muted) => toggleChannelMute(ch.id, ch.name, muted)}
              onMuteUntil={(v) => setChannelMuteUntil(ch.id, v)}
            />
          ))
        )}
      </SettingsSection>

      {/* ── Mobile push ── */}
      <SettingsSection title="Mobile push">
        <SettingsRow label="Enable push notifications">
          <SettingsToggle checked={prefs.mobilePush} onChange={(v) => update('mobilePush', v)} />
        </SettingsRow>
        {prefs.mobilePush && (
          <SettingsRow label="Send when">
            <RadioGroup<PushWhen>
              value={prefs.mobilePushWhen}
              onChange={(v) => update('mobilePushWhen', v)}
              options={[
                { value: 'always',    label: 'Always' },
                { value: 'away_only', label: 'Away only' },
              ]}
            />
          </SettingsRow>
        )}
      </SettingsSection>

      {/* ── Sound & badge ── */}
      <SettingsSection title="Sound & badge">
        <SettingsRow label="Notification sound">
          <div className="flex items-center gap-3">
            <SettingsToggle checked={prefs.sound} onChange={(v) => update('sound', v)} />
            {prefs.sound && (
              <select value={prefs.soundName} onChange={(e) => update('soundName', e.target.value)}
                className="px-2 py-1 rounded-[6px] text-[12px] text-[var(--hotbox-text)] focus:outline-none focus:ring-1 focus:ring-[var(--hotbox-accent)]"
                style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}>
                <option value="default">Default</option>
                <option value="subtle">Subtle</option>
                <option value="none">Silent</option>
              </select>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label="Unread badge" description="Show unread count on browser tab">
          <SettingsToggle checked={prefs.unreadBadge} onChange={(v) => update('unreadBadge', v)} />
        </SettingsRow>
      </SettingsSection>

      {/* ── Do not disturb ── */}
      <SettingsSection title="Do not disturb">
        <SettingsRow label="Enable DND now" description="Pause all notifications immediately">
          <SettingsToggle checked={prefs.dndEnabled} onChange={(v) => update('dndEnabled', v)} />
        </SettingsRow>

        {prefs.dndEnabled && (
          <div className="mb-3 px-3 py-2 rounded-[8px] text-[12px]"
            style={{ background: 'rgba(255,184,48,0.08)', border: '1px solid rgba(255,184,48,0.20)', color: 'var(--hotbox-mention)' }}>
            DND is active — notifications are paused
          </div>
        )}

        <SettingsRow label="Scheduled DND" description="Automatically pause notifications on a schedule">
          <SettingsToggle checked={prefs.dndSchedule.enabled} onChange={(v) => updateDnd('enabled', v)} />
        </SettingsRow>

        {prefs.dndSchedule.enabled && (
          <div className="mt-3 ml-2 p-4 rounded-[8px] space-y-4"
            style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}>
            <div className="flex items-center gap-4">
              <div>
                <label className="text-[11px] text-[var(--hotbox-text-muted)] block mb-1">From</label>
                <input type="time" value={prefs.dndSchedule.startTime}
                  onChange={(e) => updateDnd('startTime', e.target.value)}
                  className="px-2 py-1 rounded-[6px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-1 focus:ring-[var(--hotbox-accent)]"
                  style={{ background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)' }} />
              </div>
              <div>
                <label className="text-[11px] text-[var(--hotbox-text-muted)] block mb-1">To</label>
                <input type="time" value={prefs.dndSchedule.endTime}
                  onChange={(e) => updateDnd('endTime', e.target.value)}
                  className="px-2 py-1 rounded-[6px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-1 focus:ring-[var(--hotbox-accent)]"
                  style={{ background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)' }} />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-[var(--hotbox-text-muted)] block mb-2">Active on</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(({ value, label }) => {
                  const active = prefs.dndSchedule.days.includes(value);
                  return (
                    <button key={value}
                      onClick={() => {
                        const days = active
                          ? prefs.dndSchedule.days.filter((d) => d !== value)
                          : [...prefs.dndSchedule.days, value];
                        updateDnd('days', days);
                      }}
                      className="w-10 h-8 rounded-[6px] text-[11px] font-medium transition-all"
                      style={{
                        background: active ? 'var(--hotbox-accent)' : 'var(--hotbox-bg)',
                        color: active ? '#050C14' : 'var(--hotbox-text-muted)',
                        border: `1px solid ${active ? 'transparent' : 'var(--hotbox-border)'}`,
                      }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-[var(--hotbox-text-dim)]">
              DND active {prefs.dndSchedule.startTime}–{prefs.dndSchedule.endTime} on selected days
            </p>
          </div>
        )}
      </SettingsSection>

      {/* ── Save bar ── */}
      {dirty && (
        <div className="sticky bottom-4 flex justify-end gap-3 p-3 rounded-[10px]"
          style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border-strong)', boxShadow: 'var(--hotbox-shadow-lg)' }}>
          <button onClick={() => { setDirty(false); window.location.reload(); }}
            className="px-4 py-1.5 rounded-[7px] text-[12px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)]">
            Discard
          </button>
          <SettingsSaveBtn dirty={dirty} loading={saving} onClick={save} />
        </div>
      )}
    </div>
  );
}
