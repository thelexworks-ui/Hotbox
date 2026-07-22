'use client';

import React, { useState } from 'react';
import { SettingsBanner } from '@/components/settings/shared';

export default function ReportProblemPage() {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hotbox/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, url: window.location.href, userAgent: navigator.userAgent }),
      });
      if (!res.ok) throw new Error('Server error');
      setBanner({ type: 'success', message: 'Report submitted — the team will look into it. Thank you!' });
      setDescription('');
    } catch {
      setBanner({ type: 'error', message: 'Failed to submit. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Report a Problem</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">Describe what went wrong and we'll investigate</p>
      </div>

      {banner && <SettingsBanner type={banner.type} message={banner.message} />}

      <div
        className="p-6 rounded-[12px]"
        style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
      >
        <label className="block text-[12px] text-[var(--hotbox-text-muted)] mb-2">
          What happened? <span className="text-[var(--hotbox-crashed)]">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the problem in as much detail as possible — what you were doing, what you expected, and what actually happened..."
          rows={6}
          className="w-full px-3 py-2 rounded-[8px] text-[13px] text-[var(--hotbox-text)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--hotbox-accent)]"
          style={{ background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)' }}
        />

        <div className="mt-2 mb-5 text-[11px] text-[var(--hotbox-text-dim)]">
          Your current URL and browser info will be included automatically.
        </div>

        <button
          onClick={submit}
          disabled={submitting || !description.trim()}
          className="px-5 py-2 rounded-[8px] text-[13px] font-semibold transition-opacity disabled:opacity-40"
          style={{ background: 'var(--hotbox-amber)', color: 'var(--hotbox-amber-fg)' }}
        >
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
      </div>
    </div>
  );
}
