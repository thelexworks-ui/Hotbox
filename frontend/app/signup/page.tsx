'use client';

import React, { useState } from 'react';
import Link from 'next/link';

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

export default function SignupPage() {
  const [name,     setName]     = useState('');
  const [orgName,  setOrgName]  = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [agreed,   setAgreed]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const disabled = loading || !name.trim() || !orgName.trim() || !email.trim()
    || password.length < 8 || password !== confirm || !agreed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
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
      window.location.href = `/auth/verify-sent?email=${encodeURIComponent(email.trim())}`;
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050C14] relative flex items-center justify-center p-6 overflow-hidden">
      <div className="bokeh w-96 h-96 bg-[#1A7AB8] opacity-20 top-[-80px] left-[-100px]" />
      <div className="bokeh w-72 h-72 bg-[#C87800] opacity-10 bottom-[-60px] right-[-60px]" />

      <div className="w-full max-w-sm relative z-10">
        <div className="glass-card rounded-2xl p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_16px_rgba(90,218,238,0.35)]">
              <span className="text-[#050C14] font-bold text-xs font-mono">HX</span>
            </div>
            <span className="text-[#E8F4F8] font-semibold text-lg tracking-tight">Hotbox</span>
          </div>

          <div className="mb-7">
            <h1 className="text-[#E8F4F8] text-2xl font-semibold tracking-tight mb-1.5">Create your workspace</h1>
            <p className="text-[rgba(232,244,248,0.45)] text-sm">Set up Hotbox for your org</p>
          </div>

          <form className="space-y-4" autoComplete="on" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                Your name
              </label>
              <input
                type="text"
                name="name"
                autoComplete="name"
                placeholder="e.g. Lex"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="hx-input w-full rounded-lg px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                Org name
              </label>
              <input
                type="text"
                name="organization"
                autoComplete="organization"
                placeholder="e.g. Optimus"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                className="hx-input w-full rounded-lg px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email username"
                placeholder="you@yourorg.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="hx-input w-full rounded-lg px-4 py-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="hx-input w-full rounded-lg px-4 py-3 text-sm pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,244,248,0.35)] hover:text-[rgba(232,244,248,0.65)] transition-colors"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
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
                Confirm password
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
                  aria-label={showConf ? 'Hide password' : 'Show password'}
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <div
                  className={`w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center ${
                    agreed
                      ? 'bg-[#5ADAEE] border-[#5ADAEE]'
                      : 'border-[rgba(90,218,238,0.30)] bg-transparent group-hover:border-[rgba(90,218,238,0.55)]'
                  }`}
                >
                  {agreed && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#050C14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-[rgba(232,244,248,0.50)] text-xs leading-relaxed">
                I agree to the{' '}
                <span className="text-[#5ADAEE]">Terms of Service</span>
                {' '}and{' '}
                <span className="text-[#5ADAEE]">Privacy Policy</span>
              </span>
            </label>

            {error && (
              <p className="text-[#FF4D4D] text-xs px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={disabled}
              className="hx-btn-primary w-full rounded-lg py-3 text-sm mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {loading ? 'Creating workspace…' : 'Create workspace'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[rgba(90,218,238,0.10)]" />
            <span className="text-[rgba(232,244,248,0.25)] text-xs font-mono">or</span>
            <div className="flex-1 h-px bg-[rgba(90,218,238,0.10)]" />
          </div>

          <p className="text-center text-[rgba(232,244,248,0.45)] text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-[#5ADAEE] hover:text-[#3BBDD1] font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
