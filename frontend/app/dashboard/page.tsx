export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[#050C14] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-7 w-40 bg-[rgba(90,218,238,0.08)] rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-64 bg-[rgba(232,244,248,0.05)] rounded animate-pulse" />
        </div>

        {/* Stat cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card rounded-2xl p-6">
              <div className="h-3 w-20 bg-[rgba(90,218,238,0.10)] rounded animate-pulse mb-4" />
              <div className="h-8 w-16 bg-[rgba(90,218,238,0.08)] rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Main grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Neurolink panel */}
          <div className="lg:col-span-2 glass-card rounded-2xl p-6 h-80">
            <div className="h-4 w-24 bg-[rgba(90,218,238,0.10)] rounded animate-pulse mb-4" />
            <div className="flex items-center justify-center h-56">
              <div className="w-48 h-48 rounded-full bg-[rgba(90,218,238,0.05)] border border-[rgba(90,218,238,0.10)] animate-pulse flex items-center justify-center">
                <span className="text-[rgba(232,244,248,0.20)] text-xs font-mono">Dashboard loading…</span>
              </div>
            </div>
          </div>

          {/* Calendar panel */}
          <div className="glass-card rounded-2xl p-6 h-80">
            <div className="h-4 w-20 bg-[rgba(90,218,238,0.10)] rounded animate-pulse mb-4" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-[rgba(232,244,248,0.04)] rounded-lg animate-pulse" />
              ))}
            </div>
          </div>

          {/* Task table skeleton */}
          <div className="lg:col-span-3 glass-card rounded-2xl p-6">
            <div className="h-4 w-16 bg-[rgba(90,218,238,0.10)] rounded animate-pulse mb-4" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-[rgba(232,244,248,0.03)] rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
