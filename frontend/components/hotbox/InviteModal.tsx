'use client';

import React, { useState } from 'react';

interface Props {
  onClose: () => void;
}

export function InviteModal({ onClose }: Props) {
  const [loading,    setLoading]    = useState(false);
  const [inviteUrl,  setInviteUrl]  = useState<string | null>(null);
  const [expiresAt,  setExpiresAt]  = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/invite', { method: 'POST' });
      const data = await res.json() as { inviteUrl?: string; expiresAt?: string; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to create invite'); return; }
      setInviteUrl(data.inviteUrl ?? null);
      setExpiresAt(data.expiresAt ?? null);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  }

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <div
      data-testid="invite-modal-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        data-testid="invite-modal"
        style={{
          width: '100%', maxWidth: 420,
          background: 'rgba(10,22,40,0.98)',
          border: '1px solid rgba(26,74,90,0.70)',
          borderRadius: 14, padding: '1.75rem',
          boxShadow: '0 24px 64px rgba(0,0,0,0.72), 0 4px 16px rgba(90,218,238,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--hotbox-text)', margin: 0 }}>
            Invite member
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hotbox-text-dim)', fontSize: 18, lineHeight: 1, padding: 4 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--hotbox-text-muted)', marginBottom: 20 }}>
          Generate a single-use invite link valid for 72 hours.
          The invited person will create their own account.
        </p>

        {!inviteUrl ? (
          <>
            {error && (
              <p data-testid="invite-modal-error" style={{ fontSize: 13, color: 'var(--hotbox-crashed)', marginBottom: 14 }}>{error}</p>
            )}
            <button
              data-testid="invite-modal-generate"
              onClick={handleGenerate}
              disabled={loading}
              style={{
                width: '100%', padding: '11px', borderRadius: 7, border: 'none',
                background: loading ? 'var(--hotbox-border)' : 'var(--hotbox-amber)',
                color: loading ? 'var(--hotbox-text-dim)' : 'var(--hotbox-amber-fg)',
                fontSize: 14, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 150ms ease-out',
              }}
            >
              {loading ? 'Generating…' : 'Generate invite link'}
            </button>
          </>
        ) : (
          <>
            <div style={{
              background: 'var(--hotbox-surface-2)',
              border: '1px solid var(--hotbox-border)',
              borderRadius: 7, padding: '10px 12px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, color: 'var(--hotbox-accent)',
              wordBreak: 'break-all', marginBottom: 12,
              lineHeight: 1.5,
            }}>
              <span data-testid="invite-modal-url">{inviteUrl}</span>
            </div>
            {expiryLabel && (
              <p style={{ fontSize: 12, color: 'var(--hotbox-text-dim)', marginBottom: 14 }}>
                Expires {expiryLabel}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                data-testid="invite-modal-copy"
                onClick={handleCopy}
                style={{
                  flex: 1, padding: '10px', borderRadius: 7, border: 'none',
                  background: copied ? 'rgba(90,218,238,0.15)' : 'var(--hotbox-amber)',
                  color: copied ? 'var(--hotbox-accent)' : 'var(--hotbox-amber-fg)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 150ms ease-out',
                }}
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  padding: '10px 14px', borderRadius: 7,
                  border: '1px solid var(--hotbox-border)',
                  background: 'transparent',
                  color: 'var(--hotbox-text-muted)',
                  fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                }}
                title="Generate a new link"
              >
                {loading ? '…' : 'New'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
