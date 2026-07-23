'use client';

import React from 'react';

// ── Section wrapper ───────────────────────────────────────────────────────────

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hotbox-text-dim)] mb-4 pb-3 border-b border-[var(--hotbox-border)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Row (label/desc on left, control on right) ────────────────────────────────

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-[14px] border-b border-[rgba(26,74,90,0.25)] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--hotbox-text)]">{label}</div>
        {description && (
          <div className="text-[12px] text-[var(--hotbox-text-muted)] mt-[2px]">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

export function SettingsToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hotbox-accent)] disabled:opacity-40"
      style={{
        background: checked ? 'var(--hotbox-accent)' : 'var(--hotbox-surface-2)',
        border: '1px solid',
        borderColor: checked ? 'var(--hotbox-accent)' : 'var(--hotbox-border-strong)',
      }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

// ── Save button ───────────────────────────────────────────────────────────────

export function SettingsSaveBtn({
  dirty,
  loading,
  onClick,
  label = 'Save',
}: {
  dirty: boolean;
  loading?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!dirty || loading}
      className="px-4 py-1.5 rounded-[7px] text-[12px] font-semibold transition-all disabled:opacity-40"
      style={{
        background: dirty ? 'var(--hotbox-amber)' : 'var(--hotbox-surface-2)',
        color: dirty ? 'var(--hotbox-amber-fg)' : 'var(--hotbox-text-dim)',
        border: '1px solid',
        borderColor: dirty ? 'transparent' : 'var(--hotbox-border)',
        cursor: dirty ? 'pointer' : 'default',
      }}
    >
      {loading ? 'Saving…' : label}
    </button>
  );
}

// ── Text input ────────────────────────────────────────────────────────────────

export function SettingsInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-48 px-3 py-1.5 rounded-[7px] text-[13px] text-[var(--hotbox-text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)] disabled:opacity-50"
      style={{
        background: 'var(--hotbox-surface-2)',
        border: '1px solid var(--hotbox-border)',
      }}
    />
  );
}

// ── Error / success banner ─────────────────────────────────────────────────────

export function SettingsBanner({ type, message }: { type: 'error' | 'success'; message: string }) {
  return (
    <div
      className="mb-6 px-4 py-3 rounded-[8px] text-[13px]"
      style={{
        background: type === 'error' ? 'rgba(255,77,77,0.10)' : 'rgba(74,232,138,0.10)',
        border: `1px solid ${type === 'error' ? 'rgba(255,77,77,0.30)' : 'rgba(74,232,138,0.30)'}`,
        color: type === 'error' ? 'var(--hotbox-crashed)' : 'var(--hotbox-online)',
      }}
    >
      {message}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function SettingsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 rounded-[8px]" style={{ background: 'var(--hotbox-surface-2)' }} />
      ))}
    </div>
  );
}
