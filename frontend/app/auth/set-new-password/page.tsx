'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function PasswordStrength({ password }: { password: string }) {
  const score = password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < 10 ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4
    : 3;

  const colors = ['', '#FF4D4D', '#FFAF2A', '#5ADAEE', '#5ADAEE'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  if (score === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((b) => (
          <div
            key={b}
            className="flex-1 h-0.5 rounded-full transition-all duration-300"
            style={{ background: b <= score ? colors[score] : 'rgba(232,244,248,0.10)' }}
          />
        ))}
      </div>
      <p className="text-xs font-mono" style={{ color: colors[score] }}>{labels[score]}</p>
    </div>
  );
}

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showNew,  setShowNew]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState(false);

  const reqs = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter',  met: /[A-Z]/.test(password) },
    { label: 'One number',            met: /[0-9]/.test(password) },
  ];
  const allMet = reqs.every((r) => r.met);
  const disabled = loading || !allMet || password !== confirm || !token;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => { window.location.href = '/login'; }, 2000);
      } else {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Failed to reset password');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <h1 className="text-[#E8F4F8] text-xl font-semibold mb-3">Invalid link</h1>
        <p className="text-[rgba(232,244,248,0.50)] text-sm mb-6">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/auth/forgot-password" className="text-[#5ADAEE] text-sm hover:text-[#3BBDD1] transition-colors">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-[rgba(90,218,238,0.10)] border border-[rgba(90,218,238,0.25)] flex items-center justify-center mb-5 mx-auto">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#5ADAEE" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-[#E8F4F8] text-xl font-semibold mb-2">Password updated</h2>
        <p className="text-[rgba(232,244,248,0.50)] text-sm">Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-8">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_16px_rgba(90,218,238,0.35)]">
          <span className="text-[#050C14] font-bold text-xs font-mono">HX</span>
        </div>
        <span className="text-[#E8F4F8] font-semibold text-lg tracking-tight">Hotbox</span>
      </div>

      {/* Lock icon */}
      <div className="w-12 h-12 rounded-xl bg-[rgba(90,218,238,0.08)] border border-[rgba(90,218,238,0.18)] flex items-center justify-center mb-7 shadow-[0_0_18px_rgba(90,218,238,0.10)]">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#5ADAEE" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>

      <div className="mb-7">
        <h1 className="text-[#E8F4F8] text-2xl font-semibold tracking-tight mb-1.5">Set new password</h1>
        <p className="text-[rgba(232,244,248,0.45)] text-sm">Choose a strong password for your account.</p>
      </div>

      <form className="space-y-4" autoComplete="on" onSubmit={handleSubmit}>
        <div>
          <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
            New password
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              name="new-password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="hx-input w-full rounded-lg px-4 py-3 text-sm pr-11"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,244,248,0.35)] hover:text-[rgba(232,244,248,0.65)] transition-colors"
              aria-label="Toggle password visibility"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <PasswordStrength password={password} />
        </div>

        <div>
          <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
            Confirm new password
          </label>
          <div className="relative">
            <input
              type={showConf ? 'text' : 'password'}
              name="confirm-password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="hx-input w-full rounded-lg px-4 py-3 text-sm pr-11"
            />
            <button
              type="button"
              onClick={() => setShowConf(!showConf)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,244,248,0.35)] hover:text-[rgba(232,244,248,0.65)] transition-colors"
              aria-label="Toggle confirm password visibility"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Requirements checklist */}
        <div className="rounded-lg bg-[rgba(90,218,238,0.04)] border border-[rgba(90,218,238,0.10)] p-3 space-y-1.5">
          {reqs.map((req) => (
            <div key={req.label} className="flex items-center gap-2">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${req.met ? 'bg-[#5ADAEE]' : 'bg-[rgba(232,244,248,0.08)] border border-[rgba(232,244,248,0.15)]'}`}>
                {req.met && (
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                    <path d="M1 3L2.8 5L7 1" stroke="#050C14" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className={`text-xs transition-colors duration-200 ${req.met ? 'text-[rgba(232,244,248,0.60)]' : 'text-[rgba(232,244,248,0.30)]'}`}>
                {req.label}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-[#FF4D4D] text-xs px-1">{error}</p>
        )}

        <button
          type="submit"
          disabled={disabled}
          className="hx-btn-primary w-full rounded-lg py-3 text-sm mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

export default function SetNewPasswordPage() {
  return (
    <main className="min-h-screen bg-[#050C14] relative flex items-center justify-center p-6 overflow-hidden">
      <div className="bokeh w-96 h-96 bg-[#1A7AB8] opacity-15 top-[-80px] left-[-100px]" />
      <div className="bokeh w-72 h-72 bg-[#C87800] opacity-[0.08] bottom-[-60px] right-[-60px]" />
      <div className="w-full max-w-sm relative z-10">
        <Suspense>
          <SetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
