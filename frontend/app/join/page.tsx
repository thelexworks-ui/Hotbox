'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const FIELD_STYLE: React.CSSProperties = {
  background: 'var(--hotbox-surface-2)',
  border: '1px solid var(--hotbox-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 14,
  color: 'var(--hotbox-text)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

function JoinForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [orgName, setOrgName]   = useState<string | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) { setInfoError('No invite token in URL.'); return; }
    fetch(`/api/auth/invite-info?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: { orgName?: string; error?: string }) => {
        if (data.error) { setInfoError(data.error); return; }
        setOrgName(data.orgName ?? 'your workspace');
        nameRef.current?.focus();
      })
      .catch(() => setInfoError('Could not load invite details.'));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Join failed'); return; }
      window.location.href = '/channels/general';
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !name.trim() || !email.trim() || password.length < 8;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hotbox-bg)' }}>
      <div style={{
        width: '100%',
        maxWidth: 360,
        background: 'rgba(10,22,40,0.90)',
        border: '1px solid rgba(26,74,90,0.60)',
        borderRadius: 16,
        padding: '2rem',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.64), 0 4px 16px rgba(90,218,238,0.06)',
      }}>
        {infoError ? (
          <>
            <h1 data-testid="join-invalid-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--hotbox-text)' }}>
              Invalid invite
            </h1>
            <p data-testid="join-invalid-error" style={{ fontSize: 13, color: 'var(--hotbox-crashed)' }}>{infoError}</p>
          </>
        ) : orgName === null ? (
          <p style={{ fontSize: 13, color: 'var(--hotbox-text-muted)' }}>Loading invite…</p>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--hotbox-text)' }}>
              Join {orgName}
            </h1>
            <p data-testid="join-org-name" style={{ fontSize: 13, color: 'var(--hotbox-text-muted)', marginBottom: 24 }}>
              You are joining <strong style={{ color: 'var(--hotbox-accent)' }}>{orgName}</strong>. Create your account below.
            </p>

            <form data-testid="join-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Your name</label>
                <input
                  ref={nameRef}
                  type="text"
                  data-testid="join-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lex"
                  autoComplete="name"
                  required
                  style={FIELD_STYLE}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Email</label>
                <input
                  type="email"
                  data-testid="join-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  style={FIELD_STYLE}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Password</label>
                <input
                  type="password"
                  data-testid="join-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  style={FIELD_STYLE}
                />
              </div>
              {error && (
                <p data-testid="join-error" style={{ fontSize: 13, color: 'var(--hotbox-crashed)', marginTop: -4 }}>{error}</p>
              )}
              <button
                type="submit"
                data-testid="join-submit"
                disabled={disabled}
                style={{
                  background: disabled ? 'var(--hotbox-border)' : 'var(--hotbox-amber)',
                  color: disabled ? 'var(--hotbox-text-dim)' : 'var(--hotbox-amber-fg)',
                  border: 'none', borderRadius: 7, padding: '11px', fontSize: 14, fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer', marginTop: 4,
                  width: '100%', boxSizing: 'border-box' as const, transition: 'background 150ms ease-out',
                }}
              >
                {loading ? 'Creating account…' : 'Create account & join'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
