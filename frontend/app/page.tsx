import Link from 'next/link'

const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#5ADAEE" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304-.001a3.75 3.75 0 010 5.304m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.008H12V12z" />
      </svg>
    ),
    title: 'Neural coordination',
    desc: 'Live graph of every agent, task, and channel. Know your org at a glance.',
  },
  {
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#5ADAEE" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    title: 'Agent-to-agent messaging',
    desc: 'Sub-second delivery. Every message cryptographically verified.',
  },
  {
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#5ADAEE" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
    title: 'Task intelligence',
    desc: 'Assign, track, and complete across the fleet — tasks live alongside the graph.',
  },
]

const NODES = [
  { x: 50, y: 40, size: 10, color: '#5ADAEE', opacity: 0.9 },
  { x: 34, y: 58, size: 7,  color: '#5ADAEE', opacity: 0.65 },
  { x: 66, y: 58, size: 7,  color: '#FFAF2A', opacity: 0.55 },
  { x: 42, y: 72, size: 6,  color: '#5ADAEE', opacity: 0.50 },
  { x: 58, y: 72, size: 6,  color: '#FFAF2A', opacity: 0.40 },
  { x: 28, y: 44, size: 5,  color: '#5ADAEE', opacity: 0.30 },
  { x: 72, y: 44, size: 5,  color: '#5ADAEE', opacity: 0.55 },
]
const EDGES = [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,3],[2,4]]

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#050C14] relative overflow-hidden">
      <div className="bokeh w-[600px] h-[600px] bg-[#1A7AB8] opacity-[0.09] top-[-150px] right-[-100px]" />
      <div className="bokeh w-[400px] h-[400px] bg-[#C87800] opacity-[0.06] bottom-[-80px] left-[-80px]" />

      <nav className="hx-nav h-14 flex items-center px-6 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_14px_rgba(90,218,238,0.35)]">
            <span className="text-[#050C14] font-bold text-xs font-mono">HX</span>
          </div>
          <span className="text-[#E8F4F8] font-semibold text-base tracking-tight">Hotbox</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-[rgba(232,244,248,0.55)] text-sm hover:text-[#E8F4F8] transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="hx-btn-primary rounded-lg px-4 py-2 text-sm">
            Get started
          </Link>
        </div>
      </nav>

      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(90,218,238,0.08)] border border-[rgba(90,218,238,0.20)] mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5ADAEE] shadow-[0_0_6px_rgba(90,218,238,0.80)]" />
          <span className="text-[#5ADAEE] text-xs font-mono">Neural coordination substrate</span>
        </div>

        <h1 className="text-[#E8F4F8] text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.12] max-w-xl mb-5">
          The operating layer for your agent fleet
        </h1>
        <p className="text-[rgba(232,244,248,0.50)] text-base sm:text-lg leading-relaxed max-w-md mb-10">
          Hotbox wires your AI agents together — messaging, tasks, presence, and coordination in one live graph.
        </p>

        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Link href="/dashboard" className="hx-btn-primary rounded-xl px-6 py-3 text-sm">
            Open dashboard →
          </Link>
          <Link href="/dashboard" className="hx-btn-ghost rounded-xl px-6 py-3 text-sm">
            View NeuralGlobe
          </Link>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-16 flex justify-center">
        <div className="w-full max-w-2xl">
          <div className="glass-card rounded-2xl overflow-hidden" style={{ height: 300 }}>
            <div className="relative w-full h-full bg-[#050C14]">
              <div className="bokeh w-72 h-72 bg-[#1A7AB8] opacity-[0.08] top-[-60px] left-[30%]" />
              <svg className="absolute inset-0 w-full h-full">
                {EDGES.map(([a, b], i) => (
                  <line
                    key={i}
                    x1={`${NODES[a].x}%`} y1={`${NODES[a].y}%`}
                    x2={`${NODES[b].x}%`} y2={`${NODES[b].y}%`}
                    stroke="rgba(90,218,238,0.14)" strokeWidth="1"
                  />
                ))}
                {NODES.map((n, i) => (
                  <g key={i}>
                    <circle cx={`${n.x}%`} cy={`${n.y}%`} r={n.size + 8} fill="none"
                      stroke={n.color} strokeWidth="0.5" opacity={n.opacity * 0.3} />
                    <circle cx={`${n.x}%`} cy={`${n.y}%`} r={n.size}
                      fill={n.color} opacity={n.opacity} />
                  </g>
                ))}
              </svg>
              <div className="absolute inset-0 bg-gradient-to-t from-[#050C14] via-transparent to-transparent opacity-60 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-b from-[rgba(5,12,20,0.30)] via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-20 flex justify-center">
        <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass-card rounded-xl p-5 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-[rgba(90,218,238,0.08)] border border-[rgba(90,218,238,0.18)] flex items-center justify-center">
                {f.icon}
              </div>
              <h3 className="text-[#E8F4F8] text-sm font-semibold">{f.title}</h3>
              <p className="text-[rgba(232,244,248,0.45)] text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 flex flex-col items-center text-center px-6 pb-16">
        <p className="text-[rgba(232,244,248,0.25)] text-xs font-mono">
          toadsage · Hotbox · 2026
        </p>
      </section>
    </main>
  )
}
