'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsBanner } from '@/components/settings/shared';

interface AppPrefs {
  theme: 'dark' | 'light' | 'auto';
  sidebarLayout: 'default' | 'compact' | 'icon-only';
  messageDensity: 'comfortable' | 'compact' | 'cozy';
  linkPreview: boolean;
  openLinksIn: 'new_tab' | 'same_tab';
  keyboardShortcutsEnabled: boolean;
  spellcheck: boolean;
}

const DEFAULTS: AppPrefs = {
  theme: 'dark',
  sidebarLayout: 'default',
  messageDensity: 'comfortable',
  linkPreview: true,
  openLinksIn: 'new_tab',
  keyboardShortcutsEnabled: true,
  spellcheck: true,
};

const STORAGE_KEY = 'hx_prefs';

function loadPrefs(): AppPrefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function savePrefs(prefs: AppPrefs) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  // Sync to server for cross-device (fire-and-forget)
  fetch('/api/hotbox/me/prefs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  }).catch(() => {});
}

// ── Theme icon ────────────────────────────────────────────────────────────────

function ThemeIcon({ name }: { name: string }) {
  if (name === 'dark') return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
  if (name === 'light') return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" opacity="0.4" />
    </svg>
  );
}

// ── Radio group ───────────────────────────────────────────────────────────────

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 rounded-[7px] text-[12px] transition-all"
          style={{
            background: value === opt.value ? 'var(--hotbox-selected)' : 'var(--hotbox-surface-2)',
            border: `1px solid ${value === opt.value ? 'var(--hotbox-accent)' : 'var(--hotbox-border)'}`,
            color: value === opt.value ? 'var(--hotbox-text)' : 'var(--hotbox-text-muted)',
            fontWeight: value === opt.value ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GeneralSettingsPage() {
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULTS);
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setMounted(true);
  }, []);

  const update = useCallback(<K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      savePrefs(next);
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  if (!mounted) return null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">App & Display</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">Customize how Hotbox looks and behaves</p>
      </div>

      {saved && <SettingsBanner type="success" message="Preferences saved" />}

      {/* ── Appearance ── */}
      <SettingsSection title="Appearance">
        <div className="py-[14px] border-b border-[rgba(26,74,90,0.25)]">
          <div className="text-[13px] font-medium text-[var(--hotbox-text)] mb-3">Theme</div>
          <div className="grid grid-cols-3 gap-3">
            {(['dark', 'light', 'auto'] as const).map((t) => (
              <button
                key={t}
                onClick={() => update('theme', t)}
                className="p-3 rounded-[10px] text-[12px] text-center transition-all"
                style={{
                  border: `1px solid ${prefs.theme === t ? 'var(--hotbox-accent)' : 'var(--hotbox-border)'}`,
                  background: prefs.theme === t ? 'var(--hotbox-selected)' : 'var(--hotbox-surface-2)',
                  color: prefs.theme === t ? 'var(--hotbox-text)' : 'var(--hotbox-text-muted)',
                }}
              >
                <ThemeIcon name={t} />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <SettingsRow label="Sidebar layout">
          <RadioGroup
            value={prefs.sidebarLayout}
            onChange={(v) => update('sidebarLayout', v)}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'compact', label: 'Compact' },
              { value: 'icon-only', label: 'Icon only' },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="Message density" description="Controls spacing between messages">
          <RadioGroup
            value={prefs.messageDensity}
            onChange={(v) => update('messageDensity', v)}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
              { value: 'cozy', label: 'Cozy' },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Links & media ── */}
      <SettingsSection title="Links & media">
        <SettingsRow label="Link previews" description="Show inline previews for pasted URLs">
          <SettingsToggle checked={prefs.linkPreview} onChange={(v) => update('linkPreview', v)} />
        </SettingsRow>

        <SettingsRow label="Open links in">
          <RadioGroup
            value={prefs.openLinksIn}
            onChange={(v) => update('openLinksIn', v)}
            options={[
              { value: 'new_tab', label: 'New tab' },
              { value: 'same_tab', label: 'Same tab' },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Accessibility ── */}
      <SettingsSection title="Accessibility">
        <SettingsRow label="Keyboard shortcuts" description="Enable global keyboard shortcuts">
          <SettingsToggle checked={prefs.keyboardShortcutsEnabled} onChange={(v) => update('keyboardShortcutsEnabled', v)} />
        </SettingsRow>

        <SettingsRow label="Spellcheck">
          <SettingsToggle checked={prefs.spellcheck} onChange={(v) => update('spellcheck', v)} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
