'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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

const WORKSPACE = process.env.NEXT_PUBLIC_HOTBOX_WORKSPACE_NAME || 'Optimus';

function LoginForm() {
  const searchParams  = useSearchParams();
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [showInvite,  setShowInvite]  = useState(false);
  const [inviteCode,  setInviteCode]  = useState(searchParams.get('code') ?? '');
  const [guestName,   setGuestName]   = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      window.location.href = searchParams.get('redirect') ?? '/channels/general';
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleInviteLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/hotbox/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode, name: guestName }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      window.location.href = searchParams.get('redirect') ?? '/channels/general';
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  const emailDisabled  = loading || !email.trim() || !password;
  const inviteDisabled = loading || !inviteCode.trim() || !guestName.trim();

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
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--hotbox-text)' }}>
          Sign in to {WORKSPACE}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--hotbox-text-muted)', marginBottom: 24 }}>
          {showInvite ? 'Enter your invite code to join as a guest.' : 'Welcome back.'}
        </p>

        {!showInvite ? (
          <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Email</label>
              <input
                ref={emailRef}
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
                placeholder="••••••••"
                autoComplete="current-password"
                required
                style={FIELD_STYLE}
              />
            </div>
            {error && (
              <p data-testid="login-error" style={{ fontSize: 13, color: 'var(--hotbox-crashed)', marginTop: -4 }}>{error}</p>
            )}
            <button
              type="submit"
              data-testid="login-submit"
              disabled={emailDisabled}
              style={{
                background: emailDisabled ? 'var(--hotbox-border)' : 'var(--hotbox-amber)',
                color: emailDisabled ? 'var(--hotbox-text-dim)' : 'var(--hotbox-amber-fg)',
                border: 'none', borderRadius: 7, padding: '11px', fontSize: 14, fontWeight: 600,
                cursor: emailDisabled ? 'not-allowed' : 'pointer', marginTop: 4,
                width: '100%', boxSizing: 'border-box' as const, transition: 'background 150ms ease-out',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form data-testid="login-form" onSubmit={handleInviteLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Invite code</label>
              <input
                type="text"
                data-testid="login-code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Invite code"
                autoComplete="off"
                required
                style={{ ...FIELD_STYLE, fontFamily: 'monospace', letterSpacing: '0.05em' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Your name</label>
              <input
                type="text"
                data-testid="login-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Lex"
                autoComplete="nickname"
                required
                style={FIELD_STYLE}
              />
            </div>
            {error && (
              <p data-testid="login-error" style={{ fontSize: 13, color: 'var(--hotbox-crashed)', marginTop: -4 }}>{error}</p>
            )}
            <button
              type="submit"
              data-testid="login-submit"
              disabled={inviteDisabled}
              style={{
                background: inviteDisabled ? 'var(--hotbox-border)' : 'var(--hotbox-amber)',
                color: inviteDisabled ? 'var(--hotbox-text-dim)' : 'var(--hotbox-amber-fg)',
                border: 'none', borderRadius: 7, padding: '11px', fontSize: 14, fontWeight: 600,
                cursor: inviteDisabled ? 'not-allowed' : 'pointer', marginTop: 4,
                width: '100%', boxSizing: 'border-box' as const, transition: 'background 150ms ease-out',
              }}
            >
              {loading ? 'Joining…' : 'Join'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { setShowInvite(!showInvite); setError(null); }}
            style={{ fontSize: 12, color: 'var(--hotbox-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {showInvite ? '← Sign in with email' : 'Have an invite code?'}
          </button>
          <p style={{ fontSize: 13, color: 'var(--hotbox-text-dim)', margin: 0 }}>
            New here?{' '}
            <Link href="/signup" style={{ color: 'var(--hotbox-accent)', textDecoration: 'none' }}>
              Create a workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
