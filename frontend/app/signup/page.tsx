'use client';

import React, { useState } from 'react';
import Link from 'next/link';

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

export default function SignupPage() {
  const [name,     setName]     = useState('');
  const [orgName,  setOrgName]  = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const disabled = loading || !name.trim() || !orgName.trim() || !email.trim() || password.length < 8;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), orgName: orgName.trim(), email: email.trim(), password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Signup failed'); return; }
      window.location.href = '/channels/general';
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hotbox-bg)' }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        background: 'rgba(10,22,40,0.90)',
        border: '1px solid rgba(26,74,90,0.60)',
        borderRadius: 16,
        padding: '2rem',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.64), 0 4px 16px rgba(90,218,238,0.06)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--hotbox-text)' }}>
          Create your workspace
        </h1>
        <p style={{ fontSize: 13, color: 'var(--hotbox-text-muted)', marginBottom: 24 }}>
          Set up Hotbox for your org. You'll be the Headmaster.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lex"
              autoComplete="name"
              required
              style={FIELD_STYLE}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Org name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Optimus"
              autoComplete="organization"
              required
              style={FIELD_STYLE}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Email</label>
            <input
              type="email"
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
            <p style={{ fontSize: 13, color: 'var(--hotbox-crashed)', marginTop: -4 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={disabled}
            style={{
              background: disabled ? 'var(--hotbox-border)' : 'var(--hotbox-amber)',
              color: disabled ? 'var(--hotbox-text-dim)' : 'var(--hotbox-amber-fg)',
              border: 'none',
              borderRadius: 7,
              padding: '11px',
              fontSize: 14,
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              marginTop: 4,
              width: '100%',
              boxSizing: 'border-box' as const,
              transition: 'background 150ms ease-out',
            }}
          >
            {loading ? 'Creating workspace…' : 'Create workspace'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 13, textAlign: 'center', color: 'var(--hotbox-text-dim)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--hotbox-accent)', textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
