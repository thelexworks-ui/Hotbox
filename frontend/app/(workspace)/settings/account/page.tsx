'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  SettingsSection, SettingsRow, SettingsToggle,
  SettingsSaveBtn, SettingsInput, SettingsBanner, SettingsSkeleton,
} from '@/components/settings/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  avatarColor: string;
  avatarInitials: string;
  phone: string;
  timezone: string;
  language: string;
  has2FA: boolean;
}

// ── Avatar swatch colors ──────────────────────────────────────────────────────

const AVATAR_SWATCHES = ['#5ADAEE', '#FFB830', '#4AE88A', '#FF4D4D', '#8B5CF6', '#F97316', '#EC4899', '#3B82F6'];

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo',
  'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney',
];

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es',    label: 'Español' },
  { value: 'fr',    label: 'Français' },
  { value: 'pt-BR', label: 'Português (BR)' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function AvatarPreview({ color, initials }: { color: string; initials: string }) {
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold flex-shrink-0"
      style={{ background: color, color: '#050C14' }}
    >
      {initials}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {AVATAR_SWATCHES.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          style={{
            background: c,
            outline: value === c ? '2px solid white' : undefined,
            outlineOffset: value === c ? 2 : undefined,
          }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (next.length < 8) { setError('New password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/hotbox/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, new: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      setDone(true);
      setTimeout(onClose, 1200);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(5,12,20,0.80)' }}>
      <div
        className="w-full max-w-md rounded-[12px] p-6"
        style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border-strong)' }}
      >
        <h3 className="text-[15px] font-semibold text-[var(--hotbox-text)] mb-4">Change password</h3>
        {error && <div className="mb-3 text-[12px] text-[var(--hotbox-crashed)]">{error}</div>}
        {done && <div className="mb-3 text-[12px] text-[var(--hotbox-online)]">Password updated!</div>}
        <div className="space-y-3 mb-5">
          <div>
            <label className="text-[12px] text-[var(--hotbox-text-muted)] mb-1 block">Current password</label>
            <input
              type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
              className="w-full px-3 py-2 rounded-[7px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
              style={{ background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)' }}
            />
          </div>
          <div>
            <label className="text-[12px] text-[var(--hotbox-text-muted)] mb-1 block">New password</label>
            <input
              type="password" value={next} onChange={(e) => setNext(e.target.value)}
              className="w-full px-3 py-2 rounded-[7px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
              style={{ background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)' }}
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 rounded-[7px] text-[12px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)]">
            Cancel
          </button>
          <button
            onClick={submit} disabled={loading || done || !current || !next}
            className="px-4 py-1.5 rounded-[7px] text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'var(--hotbox-amber)', color: 'var(--hotbox-amber-fg)' }}
          >
            {loading ? 'Saving…' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountSettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [displayName, setDisplayName] = useState('');
  const [avatarColor, setAvatarColor] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [language, setLanguage] = useState('en-US');

  // Dirty tracking
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Modals
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    fetch('/api/hotbox/me')
      .then((r) => r.json())
      .then((data: UserProfile) => {
        setProfile(data);
        setDisplayName(data.displayName ?? '');
        setAvatarColor(data.avatarColor ?? AVATAR_SWATCHES[0]);
        setPhone(data.phone ?? '');
        setTimezone(data.timezone ?? 'UTC');
        setLanguage(data.language ?? 'en-US');
      })
      .catch(() => setBanner({ type: 'error', message: 'Failed to load profile' }))
      .finally(() => setLoading(false));
  }, []);

  // Mark dirty on any field change
  useEffect(() => {
    if (!profile) return;
    setDirty(
      displayName !== (profile.displayName ?? '') ||
      avatarColor !== (profile.avatarColor ?? '') ||
      phone !== (profile.phone ?? '') ||
      timezone !== (profile.timezone ?? 'UTC') ||
      language !== (profile.language ?? 'en-US'),
    );
  }, [displayName, avatarColor, phone, timezone, language, profile]);

  const save = useCallback(async () => {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hotbox/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, avatarColor, phone, timezone, language }),
      });
      const data = await res.json();
      if (!res.ok) { setBanner({ type: 'error', message: data.error ?? 'Save failed' }); return; }
      setProfile((p) => p ? { ...p, ...data } : p);
      setDirty(false);
      setBanner({ type: 'success', message: 'Saved successfully' });
      setTimeout(() => setBanner(null), 2500);
    } catch {
      setBanner({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  }, [displayName, avatarColor, phone, timezone, language]);

  if (loading) return <SettingsSkeleton />;

  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('') || displayName.slice(0, 2).toUpperCase() || '??';

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Account</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">Manage your identity and security settings</p>
      </div>

      {banner && <SettingsBanner type={banner.type} message={banner.message} />}

      {/* ── Profile ── */}
      <SettingsSection title="Profile">
        <div className="flex items-start gap-6 py-4 border-b border-[rgba(26,74,90,0.25)]">
          <AvatarPreview color={avatarColor} initials={initials} />
          <div className="flex-1">
            <div className="text-[12px] text-[var(--hotbox-text-muted)] mb-2">Avatar color</div>
            <ColorPicker value={avatarColor} onChange={(c) => setAvatarColor(c)} />
          </div>
        </div>

        <SettingsRow label="Display name" description="How you appear in channels and DMs">
          <SettingsInput value={displayName} onChange={setDisplayName} placeholder="Your name" />
        </SettingsRow>

        <SettingsRow label="Email" description={profile?.email ?? ''}>
          <span className="text-[12px] px-2 py-1 rounded-[5px] text-[var(--hotbox-text-muted)]" style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}>
            Verified
          </span>
        </SettingsRow>
      </SettingsSection>

      {/* ── Security ── */}
      <SettingsSection title="Security">
        <SettingsRow label="Password" description="Last changed: unknown">
          <button
            onClick={() => setShowPasswordModal(true)}
            className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium text-[var(--hotbox-text)] hover:bg-[var(--hotbox-surface-hover)] transition-colors"
            style={{ border: '1px solid var(--hotbox-border)' }}
          >
            Change password
          </button>
        </SettingsRow>

        <SettingsRow label="Two-factor authentication" description="Add an extra layer of security">
          <button
            className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium text-[var(--hotbox-text-muted)] cursor-not-allowed"
            style={{ border: '1px solid var(--hotbox-border)', opacity: 0.5 }}
            title="Coming soon"
          >
            Set up 2FA
          </button>
        </SettingsRow>
      </SettingsSection>

      {/* ── Contact ── */}
      <SettingsSection title="Contact">
        <SettingsRow label="Phone" description="Optional — not visible to other members">
          <SettingsInput value={phone} onChange={setPhone} placeholder="+1 555 000 0000" type="tel" />
        </SettingsRow>
      </SettingsSection>

      {/* ── Preferences ── */}
      <SettingsSection title="Preferences">
        <SettingsRow label="Timezone" description="Used for scheduled notifications and DND">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="px-3 py-1.5 rounded-[7px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
            style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </SettingsRow>

        <SettingsRow label="Language">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3 py-1.5 rounded-[7px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
            style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
          >
            {LANGUAGES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
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
              if (!profile) return;
              setDisplayName(profile.displayName ?? '');
              setAvatarColor(profile.avatarColor ?? AVATAR_SWATCHES[0]);
              setPhone(profile.phone ?? '');
              setTimezone(profile.timezone ?? 'UTC');
              setLanguage(profile.language ?? 'en-US');
            }}
            className="px-4 py-1.5 rounded-[7px] text-[12px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)]"
          >
            Discard
          </button>
          <SettingsSaveBtn dirty={dirty} loading={saving} onClick={save} />
        </div>
      )}

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  );
}
