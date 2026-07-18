import Link from 'next/link';

export default function VerifyEmailSuccessPage() {
  return (
    <main className="min-h-screen bg-[#050C14] relative flex items-center justify-center p-6 overflow-hidden">
      <div className="bokeh w-96 h-96 bg-[#5ADAEE] opacity-[0.06] top-[-100px] right-[-100px]" />
      <div className="bokeh w-72 h-72 bg-[#C87800] opacity-[0.08] bottom-[-60px] left-[-80px]" />

      <div className="w-full max-w-sm relative z-10">
        <div className="glass-card rounded-2xl p-8 text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_16px_rgba(90,218,238,0.35)]">
              <span className="text-[#050C14] font-bold text-xs font-mono">HX</span>
            </div>
            <span className="text-[#E8F4F8] font-semibold text-lg tracking-tight">Hotbox</span>
          </div>

          {/* Check icon */}
          <div className="w-16 h-16 rounded-full bg-[rgba(90,218,238,0.10)] border border-[rgba(90,218,238,0.25)] flex items-center justify-center mb-6 mx-auto shadow-[0_0_28px_rgba(90,218,238,0.18)]">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#5ADAEE" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <h1 className="text-[#E8F4F8] text-2xl font-semibold tracking-tight mb-2">Email verified</h1>
          <p className="text-[rgba(232,244,248,0.50)] text-sm leading-relaxed mb-8">
            Your account is ready. Welcome to Hotbox.
          </p>

          <Link
            href="/channels/general"
            className="hx-btn-primary w-full rounded-lg py-3 text-sm inline-block"
          >
            Continue to Hotbox →
          </Link>
        </div>
      </div>
    </main>
  );
}
