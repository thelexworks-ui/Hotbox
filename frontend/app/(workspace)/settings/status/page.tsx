'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsSaveBtn, SettingsBanner, SettingsSkeleton } from '@/components/settings/shared';

interface UserStatus {
  emoji: string;
  text: string;
  clearAfter?: string;
  dndActive: boolean;
}

const CLEAR_AFTER_OPTIONS = [
  { value: '30m', label: '30 minutes' },
  { value: '1h',  label: '1 hour' },
  { value: '4h',  label: '4 hours' },
  { value: '1d',  label: 'Today' },
  { value: 'never', label: "Don't clear" },
];

const STATUS_PRESETS = [
  { emoji: '🎯', text: 'In deep work' },
  { emoji: '🤝', text: 'In a meeting' },
  { emoji: '🍕', text: 'Lunch break' },
  { emoji: '🚗', text: 'Commuting' },
  { emoji: '🏖️', text: 'On vacation' },
  { emoji: '🤒', text: 'Out sick' },
];

export default function StatusSettingsPage() {
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [emoji, setEmoji] = useState('');
  const [text, setText] = useState('');
  const [clearAfter, setClearAfter] = useState('never');
  const [dndActive, setDndActive] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/hotbox/me/status')
      .then((r) => r.json())
      .then((data: UserStatus) => {
        setStatus(data);
        setEmoji(data.emoji ?? '');
        setText(data.text ?? '');
        setClearAfter(data.clearAfter ?? 'never');
        setDndActive(data.dndActive ?? false);
      })
      .catch(() => setBanner({ type: 'error', message: 'Failed to load status' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!status) return;
    setDirty(
      emoji !== (status.emoji ?? '') ||
      text !== (status.text ?? '') ||
      clearAfter !== (status.clearAfter ?? 'never') ||
      dndActive !== (status.dndActive ?? false),
    );
  }, [emoji, text, clearAfter, dndActive, status]);

  const save = useCallback(async () => {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hotbox/me/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, text, clearAfter, dndActive }),
      });
      const data = await res.json();
      if (!res.ok) { setBanner({ type: 'error', message: data.error ?? 'Save failed' }); return; }
      setStatus(data);
      setDirty(false);
      setBanner({ type: 'success', message: 'Status saved' });
      setTimeout(() => setBanner(null), 2000);
    } catch {
      setBanner({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  }, [emoji, text, clearAfter, dndActive]);

  const clearStatus = async () => {
    setEmoji('');
    setText('');
    setClearAfter('never');
    await fetch('/api/hotbox/me/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '', text: '', clearAfter: 'never', dndActive }),
    }).catch(() => {});
    setStatus((s) => s ? { ...s, emoji: '', text: '', clearAfter: 'never' } : s);
    setDirty(false);
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Status & Presence</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">Set your status and control when you receive notifications</p>
      </div>

      {banner && <SettingsBanner type={banner.type} message={banner.message} />}

      {/* ── Custom status ── */}
      <SettingsSection title="Custom status">
        {/* Live preview */}
        {(emoji || text) && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-[8px]" style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}>
            <span className="text-lg">{emoji}</span>
            <span className="text-[13px] text-[var(--hotbox-text)]">{text || 'No status text'}</span>
            <button onClick={clearStatus} className="ml-auto text-[11px] text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text)]">Clear</button>
          </div>
        )}

        {/* Presets */}
        <div className="mb-4">
          <div className="text-[11px] text-[var(--hotbox-text-dim)] mb-2">Quick pick</div>
          <div className="flex flex-wrap gap-2">
            {STATUS_PRESETS.map((p) => (
              <button
                key={p.text}
                onClick={() => { setEmoji(p.emoji); setText(p.text); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] transition-colors hover:bg-[var(--hotbox-surface-hover)]"
                style={{ border: '1px solid var(--hotbox-border)', color: 'var(--hotbox-text-muted)' }}
              >
                {p.emoji} {p.text}
              </button>
            ))}
          </div>
        </div>

        <SettingsRow label="Emoji">
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="😊"
            maxLength={4}
            className="w-16 px-2 py-1.5 rounded-[7px] text-[18px] text-center focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
            style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
          />
        </SettingsRow>

        <SettingsRow label="Status text">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's your status?"
            maxLength={100}
            className="w-60 px-3 py-1.5 rounded-[7px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
            style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
          />
        </SettingsRow>

        <SettingsRow label="Clear after">
          <select
            value={clearAfter}
            onChange={(e) => setClearAfter(e.target.value)}
            className="px-3 py-1.5 rounded-[7px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
            style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
          >
            {CLEAR_AFTER_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </SettingsRow>
      </SettingsSection>

      {/* ── Do not disturb ── */}
      <SettingsSection title="Do not disturb">
        <SettingsRow label="Enable DND now" description="Pause all notifications immediately">
          <SettingsToggle checked={dndActive} onChange={(v) => { setDndActive(v); setDirty(true); }} />
        </SettingsRow>
      </SettingsSection>

      {/* ── Save bar ── */}
      {dirty && (
        <div
          className="sticky bottom-4 flex justify-end gap-3 p-3 rounded-[10px]"
          style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border-strong)', boxShadow: 'var(--hotbox-shadow-lg)' }}
        >
          <button
            onClick={() => {
              if (!status) return;
              setEmoji(status.emoji ?? '');
              setText(status.text ?? '');
              setClearAfter(status.clearAfter ?? 'never');
              setDndActive(status.dndActive ?? false);
            }}
            className="px-4 py-1.5 rounded-[7px] text-[12px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)]"
          >
            Discard
          </button>
          <SettingsSaveBtn dirty={dirty} loading={saving} onClick={save} />
        </div>
      )}
    </div>
  );
}
