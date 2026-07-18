'use client';

import Link from 'next/link';
import { useState } from 'react';

function EnvelopeIcon() {
  return (
    <div className="w-14 h-14 rounded-2xl bg-[rgba(90,218,238,0.08)] border border-[rgba(90,218,238,0.18)] flex items-center justify-center mb-5 mx-auto shadow-[0_0_20px_rgba(90,218,238,0.10)]">
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#5ADAEE" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="min-h-screen bg-[#050C14] relative flex items-center justify-center p-6 overflow-hidden">
        <div className="bokeh w-80 h-80 bg-[#1A7AB8] opacity-15 top-[-60px] right-[-80px]" />
        <div className="w-full max-w-sm relative z-10">
          <div className="glass-card rounded-2xl p-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-8">
              <div className="w-8 h-8 rounded-lg bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_16px_rgba(90,218,238,0.35)]">
                <span className="text-[#050C14] font-bold text-xs font-mono">HX</span>
              </div>
              <span className="text-[#E8F4F8] font-semibold text-lg tracking-tight">Hotbox</span>
            </div>
            <EnvelopeIcon />
            <h2 className="text-[#E8F4F8] text-xl font-semibold tracking-tight mb-2">Reset link sent</h2>
            <p className="text-[rgba(232,244,248,0.50)] text-sm leading-relaxed mb-2">
              We sent a password reset link to
            </p>
            <p className="text-[#5ADAEE] text-sm font-mono mb-8">{email}</p>
            <p className="text-[rgba(232,244,248,0.30)] text-xs leading-relaxed mb-6">
              Check your email and click the link to reset your password. The link expires in 1 hour.
            </p>
            <button type="button" onClick={() => setSent(false)} className="hx-btn-ghost w-full rounded-lg py-3 text-sm mb-4">
              Try a different email
            </button>
            <Link href="/login" className="text-[rgba(232,244,248,0.40)] text-sm hover:text-[rgba(232,244,248,0.70)] transition-colors">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050C14] relative flex items-center justify-center p-6 overflow-hidden">
      <div className="bokeh w-80 h-80 bg-[#1A7AB8] opacity-15 top-[-60px] right-[-80px]" />
      <div className="bokeh w-64 h-64 bg-[#C87800] opacity-10 bottom-[-40px] left-[-60px]" />
      <div className="w-full max-w-sm relative z-10">
        <div className="glass-card rounded-2xl p-8">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_16px_rgba(90,218,238,0.35)]">
              <span className="text-[#050C14] font-bold text-xs font-mono">HX</span>
            </div>
            <span className="text-[#E8F4F8] font-semibold text-lg tracking-tight">Hotbox</span>
          </div>
          <div className="mb-7">
            <h1 className="text-[#E8F4F8] text-2xl font-semibold tracking-tight mb-1.5">Reset your password</h1>
            <p className="text-[rgba(232,244,248,0.45)] text-sm leading-relaxed">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">Email</label>
              <input
                type="email" name="email" autoComplete="email" placeholder="you@yourorg.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required
                className="hx-input w-full rounded-lg px-4 py-3 text-sm"
              />
            </div>
            {error && <p className="text-[#FF4D4D] text-xs px-1">{error}</p>}
            <button
              type="submit" disabled={loading || !email.trim()}
              className="hx-btn-primary w-full rounded-lg py-3 text-sm mt-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <Link href="/login" className="text-[rgba(232,244,248,0.40)] text-sm hover:text-[rgba(232,244,248,0.70)] transition-colors">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
