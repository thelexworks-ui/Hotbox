'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const WORKSPACE = process.env.NEXT_PUBLIC_HOTBOX_WORKSPACE_NAME ?? 'Optimus';

function LoginForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchParams.get('code')) nameRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/hotbox/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
      });
      const data = await res.json() as { error?: string; ok?: boolean };
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      // Full navigation so AuthProvider re-fetches /api/hotbox/me with the new cookie
      window.location.href = searchParams.get('redirect') ?? '/channels/general';
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !code.trim() || !name.trim();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hotbox-bg)' }}>
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--hotbox-surface)', border: '1px solid var(--hotbox-border)', borderRadius: 12, padding: '2rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--hotbox-text)' }}>
          Join {WORKSPACE}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--hotbox-text-muted)', marginBottom: 24 }}>
          Enter your invite code and pick a display name.
        </p>
        <form data-testid="login-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="login-code" style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Invite code</label>
            <input
              id="login-code"
              name="code"
              data-testid="login-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="HOTBOXBETA"
              autoComplete="off"
              required
              style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)', borderRadius: 6, padding: '8px 10px', fontSize: 14, color: 'var(--hotbox-text)', outline: 'none', fontFamily: 'monospace', letterSpacing: '0.05em', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="login-name" style={{ fontSize: 12, fontWeight: 500, color: 'var(--hotbox-text-dim)' }}>Your name</label>
            <input
              ref={nameRef}
              id="login-name"
              name="name"
              data-testid="login-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lex"
              autoComplete="nickname"
              required
              style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)', borderRadius: 6, padding: '8px 10px', fontSize: 14, color: 'var(--hotbox-text)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          {error && (
            <p data-testid="login-error" style={{ fontSize: 13, color: 'var(--hotbox-mention)', marginTop: -4 }}>{error}</p>
          )}
          <button
            type="submit"
            data-testid="login-submit"
            disabled={disabled}
            style={{ background: 'var(--hotbox-accent)', color: 'white', border: 'none', borderRadius: 6, padding: '10px', fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, marginTop: 4 }}
          >
            {loading ? 'Joining…' : 'Join'}
          </button>
        </form>
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
