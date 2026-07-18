'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifySentContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const [resending, setResending] = useState(false);
  const [resent,    setResent]    = useState(false);
  const [resendErr, setResendErr] = useState<string | null>(null);

  async function handleResend() {
    setResending(true);
    setResendErr(null);
    try {
      const res = await fetch('/api/auth/send-verification', { method: 'POST' });
      if (res.ok) { setResent(true); }
      else {
        const d = await res.json() as { error?: string };
        setResendErr(d.error ?? 'Failed to resend — try again');
      }
    } catch {
      setResendErr('Network error — please try again');
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050C14] relative flex items-center justify-center p-6 overflow-hidden">
      <div className="bokeh w-80 h-80 bg-[#1A7AB8] opacity-15 top-[-60px] right-[-80px]" />
      <div className="bokeh w-72 h-72 bg-[#C87800] opacity-10 bottom-[-50px] left-[-60px]" />

      <div className="w-full max-w-sm relative z-10">
        <div className="glass-card rounded-2xl p-8 text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_16px_rgba(90,218,238,0.35)]">
              <span className="text-[#050C14] font-bold text-xs font-mono">HX</span>
            </div>
            <span className="text-[#E8F4F8] font-semibold text-lg tracking-tight">Hotbox</span>
          </div>

          {/* Envelope icon */}
          <div className="w-16 h-16 rounded-2xl bg-[rgba(90,218,238,0.08)] border border-[rgba(90,218,238,0.18)] flex items-center justify-center mb-6 mx-auto shadow-[0_0_24px_rgba(90,218,238,0.12)]">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#5ADAEE" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>

          <h1 className="text-[#E8F4F8] text-2xl font-semibold tracking-tight mb-3">Check your inbox</h1>
          <p className="text-[rgba(232,244,248,0.50)] text-sm leading-relaxed mb-2">
            We sent a verification link to
          </p>
          {email && (
            <p className="text-[#5ADAEE] text-sm font-mono mb-8">{email}</p>
          )}

          <p className="text-[rgba(232,244,248,0.35)] text-xs leading-relaxed mb-6">
            Click the link in the email to verify your account. Check your spam folder if you don&apos;t see it within a few minutes.
          </p>

          {resent ? (
            <p className="text-[#5ADAEE] text-sm mb-4">Verification email resent.</p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="hx-btn-ghost w-full rounded-lg py-3 text-sm mb-4 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resending ? 'Resending…' : 'Resend verification email'}
            </button>
          )}

          {resendErr && (
            <p className="text-[#FF4D4D] text-xs mb-4">{resendErr}</p>
          )}

          <Link
            href="/login"
            className="text-[rgba(232,244,248,0.40)] text-sm hover:text-[rgba(232,244,248,0.70)] transition-colors"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function VerifySentPage() {
  return (
    <Suspense>
      <VerifySentContent />
    </Suspense>
  );
}
