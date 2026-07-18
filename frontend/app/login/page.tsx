'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function LoginForm() {
  const searchParams  = useSearchParams();
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
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
      const data = await res.json() as { error?: string; code?: string };
      if (!res.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          window.location.href = `/auth/verify-sent?email=${encodeURIComponent(email.trim())}`;
          return;
        }
        setError(data.error ?? 'Login failed');
        return;
      }
      window.location.href = searchParams.get('redirect') ?? '/dashboard';
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
      window.location.href = searchParams.get('redirect') ?? '/dashboard';
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050C14] relative flex items-center justify-center p-6 overflow-hidden">
      <div className="bokeh w-96 h-96 bg-[#1A7AB8] opacity-20 top-[-80px] right-[-100px]" />
      <div className="bokeh w-80 h-80 bg-[#C87800] opacity-10 bottom-[-60px] left-[-80px]" />

      <div className="w-full max-w-sm relative z-10">
        <div className="glass-card rounded-2xl p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_16px_rgba(90,218,238,0.35)]">
              <span className="text-[#050C14] font-bold text-xs font-mono">HX</span>
            </div>
            <span className="text-[#E8F4F8] font-semibold text-lg tracking-tight">Hotbox</span>
          </div>

          {!showInvite ? (
            <>
              <div className="mb-7">
                <h1 className="text-[#E8F4F8] text-2xl font-semibold tracking-tight mb-1.5">Welcome back</h1>
                <p className="text-[rgba(232,244,248,0.45)] text-sm">Sign in to your workspace</p>
              </div>

              <form className="space-y-4" autoComplete="on" onSubmit={handleEmailLogin}>
                <div>
                  <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                    Email
                  </label>
                  <input
                    ref={emailRef}
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="hx-input w-full rounded-lg px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest">
                      Password
                    </label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-[#5ADAEE] text-xs hover:text-[#3BBDD1] transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="hx-input w-full rounded-lg px-4 py-3 text-sm pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,244,248,0.35)] hover:text-[rgba(232,244,248,0.65)] transition-colors"
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      <EyeIcon open={showPass} />
                    </button>
                  </div>
                </div>

                {error && (
                  <p data-testid="login-error" className="text-[#FF4D4D] text-xs px-1">{error}</p>
                )}

                <button
                  type="submit"
                  data-testid="login-submit"
                  disabled={loading || !email.trim() || !password}
                  className="hx-btn-primary w-full rounded-lg py-3 text-sm mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-7">
                <h1 className="text-[#E8F4F8] text-2xl font-semibold tracking-tight mb-1.5">Join with invite</h1>
                <p className="text-[rgba(232,244,248,0.45)] text-sm">Enter your invite code to join as a guest</p>
              </div>

              <form data-testid="login-form" className="space-y-4" autoComplete="on" onSubmit={handleInviteLogin}>
                <div>
                  <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                    Invite code
                  </label>
                  <input
                    type="text"
                    data-testid="login-code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste invite code"
                    autoComplete="off"
                    required
                    className="hx-input w-full rounded-lg px-4 py-3 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                    Your name
                  </label>
                  <input
                    type="text"
                    data-testid="login-name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Lex"
                    autoComplete="nickname"
                    required
                    className="hx-input w-full rounded-lg px-4 py-3 text-sm"
                  />
                </div>

                {error && (
                  <p data-testid="login-error" className="text-[#FF4D4D] text-xs px-1">{error}</p>
                )}

                <button
                  type="submit"
                  data-testid="login-submit"
                  disabled={loading || !inviteCode.trim() || !guestName.trim()}
                  className="hx-btn-primary w-full rounded-lg py-3 text-sm mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {loading ? 'Joining…' : 'Join workspace'}
                </button>
              </form>
            </>
          )}

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[rgba(90,218,238,0.10)]" />
            <span className="text-[rgba(232,244,248,0.25)] text-xs font-mono">or</span>
            <div className="flex-1 h-px bg-[rgba(90,218,238,0.10)]" />
          </div>

          <div className="flex flex-col gap-3 items-center">
            <button
              type="button"
              onClick={() => { setShowInvite(!showInvite); setError(null); }}
              className="text-[rgba(232,244,248,0.40)] text-xs hover:text-[rgba(232,244,248,0.70)] transition-colors"
            >
              {showInvite ? '← Sign in with email' : 'Have an invite code?'}
            </button>
            <p className="text-[rgba(232,244,248,0.45)] text-sm">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-[#5ADAEE] hover:text-[#3BBDD1] font-medium transition-colors">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
