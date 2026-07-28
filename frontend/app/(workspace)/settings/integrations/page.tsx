'use client';

import React, { useState, useEffect } from 'react';
import { SettingsBanner } from '@/components/settings/shared';

type LlmProvider = 'anthropic' | 'openai' | 'xai' | 'google';

const PROVIDERS: { id: LlmProvider; label: string; placeholder: string }[] = [
  { id: 'anthropic', label: 'Anthropic',    placeholder: 'sk-ant-...' },
  { id: 'openai',    label: 'OpenAI',       placeholder: 'sk-...' },
  { id: 'xai',       label: 'xAI (Grok)',   placeholder: 'xai-...' },
  { id: 'google',    label: 'Google Gemini',placeholder: 'AIzaSy...' },
];

interface ConfiguredProvider {
  provider: LlmProvider;
  models_available: string[];
  validated_at: string;
}

export default function IntegrationsSettingsPage() {
  const [configured, setConfigured] = useState<ConfiguredProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<LlmProvider | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<LlmProvider, string>>({
    anthropic: '', openai: '', xai: '', google: '',
  });
  const [banners, setBanners] = useState<Partial<Record<LlmProvider, { type: 'success' | 'error'; message: string }>>>({});

  useEffect(() => {
    fetch('/api/org/llm-key')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setConfigured(d.keys ?? []))
      .catch(() => setConfigured([]))
      .finally(() => setLoading(false));
  }, []);

  const save = async (provider: LlmProvider) => {
    const apiKey = apiKeys[provider].trim();
    if (!apiKey) return;
    setSaving(provider);
    setBanners(b => ({ ...b, [provider]: undefined }));
    try {
      const res = await fetch('/api/org/llm-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setBanners(b => ({ ...b, [provider]: { type: 'success', message: `Key valid — ${data.models_available?.length ?? 0} models available` } }));
        setConfigured(c => {
          const others = c.filter(x => x.provider !== provider);
          return [...others, { provider, models_available: data.models_available ?? [], validated_at: new Date().toISOString() }];
        });
        setApiKeys(k => ({ ...k, [provider]: '' }));
      } else {
        setBanners(b => ({ ...b, [provider]: { type: 'error', message: data.error ?? 'Key validation failed' } }));
      }
    } catch {
      setBanners(b => ({ ...b, [provider]: { type: 'error', message: 'Network error — please try again' } }));
    } finally {
      setSaving(null);
    }
  };

  const getCfg = (id: LlmProvider) => configured.find(c => c.provider === id);

  if (loading) {
    return (
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Integrations</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-4">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Integrations</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">
          Configure LLM providers for your workspace. Keys are encrypted at rest (AES-256-GCM) and never exposed after saving.
        </p>
      </div>

      <h2 className="text-[11px] font-semibold text-[var(--hotbox-text-dim)] uppercase tracking-[0.10em] mb-3">LLM Providers</h2>
      <div className="flex flex-col gap-3 mb-8">
        {PROVIDERS.map(({ id, label, placeholder }) => {
          const cfg = getCfg(id);
          const banner = banners[id];
          return (
            <div
              key={id}
              className="p-5 rounded-[12px]"
              style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[14px] font-medium text-[var(--hotbox-text)]">{label}</span>
                {cfg && (
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--hotbox-green, #34d399)' }}
                  >
                    ✓ Configured
                  </span>
                )}
              </div>
              {cfg && (
                <p className="text-[11px] text-[var(--hotbox-text-dim)] mb-3">
                  {cfg.models_available.length} model{cfg.models_available.length !== 1 ? 's' : ''} available · validated {new Date(cfg.validated_at).toLocaleDateString()}
                </p>
              )}
              {banner && <SettingsBanner type={banner.type} message={banner.message} />}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeys[id]}
                  onChange={e => setApiKeys(k => ({ ...k, [id]: e.target.value }))}
                  placeholder={cfg ? `Replace existing key (${placeholder})` : placeholder}
                  className="flex-1 px-3 py-2 rounded-[8px] text-[13px] text-[var(--hotbox-text)] focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
                  style={{ background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)' }}
                  onKeyDown={e => { if (e.key === 'Enter') save(id); }}
                />
                <button
                  onClick={() => save(id)}
                  disabled={saving === id || !apiKeys[id].trim()}
                  className="px-4 py-2 rounded-[8px] text-[13px] font-semibold transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--hotbox-accent)', color: 'var(--hotbox-accent-fg, #000)' }}
                >
                  {saving === id ? 'Validating…' : cfg ? 'Replace' : 'Save'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="flex flex-col items-center justify-center h-20 gap-1 rounded-[12px]"
        style={{ border: '1px dashed var(--hotbox-border)' }}
      >
        <span className="text-[12px] text-[var(--hotbox-text-dim)]">More integrations coming</span>
        <span className="text-[11px] text-[var(--hotbox-text-dim)] opacity-60">Zapier · Google Calendar · Linear</span>
      </div>
    </div>
  );
}
