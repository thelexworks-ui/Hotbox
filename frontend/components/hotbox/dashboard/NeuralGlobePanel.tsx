'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const NeuralGlobe = dynamic(() => import('@/components/hotbox/NeuralGlobe'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100%', background: '#050C14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#5ADAEE', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, opacity: 0.7, letterSpacing: '0.06em' }}>
        Initialising neural link…
      </span>
    </div>
  ),
});

// Simplified AgentData for online count overlay
interface AgentEntry { id: string; state: string }

function useOnlineAgents() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const [mRes, pRes] = await Promise.all([
        fetch('/api/hotbox/members'),
        fetch('/api/hotbox/presence'),
      ]);
      if (!mRes.ok || !pRes.ok) return;
      const members: { id: string }[] = await mRes.json();
      const presence: Record<string, string> = await pRes.json();
      setAgents(members.map((m) => ({
        id: m.id,
        state: presence[m.id] === 'online' ? 'fresh' : presence[m.id] === 'crashed' ? 'warming' : 'cold',
      })));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return agents;
}

function NeuralGlobeOnlineCount() {
  const agents = useOnlineAgents();
  const online = agents.filter((a) => a.state === 'fresh' || a.state === 'warming').length;
  return (
    <div
      className="absolute top-[14px] left-4 text-[10px] font-mono pointer-events-none"
      style={{ color: 'rgba(232,244,248,0.35)' }}
    >
      Online: <span style={{ color: '#4ADE80' }}>{online}</span> of {agents.length}
    </div>
  );
}

function LegendItem({ color, label, glow }: { color: string; label: string; glow?: boolean }) {
  return (
    <span className="flex items-center gap-[5px]">
      <span
        className="w-[6px] h-[6px] rounded-full flex-shrink-0"
        style={{
          background: color,
          boxShadow: glow ? `0 0 5px ${color}` : undefined,
        }}
      />
      {label}
    </span>
  );
}

function ZoomControls() {
  const [zoom, setZoom] = useState(100);
  return (
    <div
      className="absolute bottom-[10px] right-4 flex items-center gap-1 px-2 py-[5px] rounded-lg text-[11px] font-mono"
      style={{ background: 'rgba(10,22,40,0.80)', border: '1px solid rgba(26,74,90,0.50)', color: 'rgba(232,244,248,0.35)' }}
    >
      <button
        onClick={() => setZoom((z) => Math.max(50, z - 10))}
        className="hover:text-[#5ADAEE] transition-colors px-0.5"
      >
        −
      </button>
      <span className="min-w-[36px] text-center">{zoom}%</span>
      <button
        onClick={() => setZoom((z) => Math.min(200, z + 10))}
        className="hover:text-[#5ADAEE] transition-colors px-0.5"
      >
        +
      </button>
    </div>
  );
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function PlusIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NeuralGlobeOverlay() {
  return (
    <>
      {/* Online count — top left */}
      <NeuralGlobeOnlineCount />

      {/* Search — top center */}
      <div
        className="absolute top-[14px] left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-[6px] rounded-[10px] w-[280px] text-[12px] cursor-text"
        style={{
          background: 'rgba(5,12,20,0.72)',
          border: '1px solid rgba(90,218,238,0.18)',
          backdropFilter: 'blur(12px)',
          color: 'rgba(232,244,248,0.35)',
        }}
      >
        <SearchIcon size={12} />
        Search agents…
      </div>

      {/* New Agent — top right */}
      <button
        className="absolute top-[10px] right-4 flex items-center gap-[5px] px-[13px] py-[6px] rounded-lg text-[12px] cursor-pointer transition-colors hover:bg-[rgba(90,218,238,0.14)]"
        style={{
          background: 'rgba(90,218,238,0.08)',
          border: '1px solid rgba(90,218,238,0.25)',
          color: '#5ADAEE',
        }}
      >
        <PlusIcon size={12} />
        New agent
      </button>

      {/* Legend — bottom left */}
      <div
        className="absolute bottom-[14px] left-4 flex gap-[14px] text-[10px] font-mono pointer-events-none"
        style={{ color: 'rgba(232,244,248,0.35)' }}
      >
        <LegendItem color="#5ADAEE" label="Fresh" glow />
        <LegendItem color="#FFAF2A" label="Warming" glow />
        <LegendItem color="rgba(232,244,248,0.30)" label="Stale" />
        <LegendItem color="rgba(232,244,248,0.12)" label="Cold" />
      </div>

      {/* Zoom controls — bottom right */}
      <ZoomControls />
    </>
  );
}

export function NeuralGlobePanel() {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  return (
    <div className="relative overflow-hidden" style={{ flex: '0 0 54%' }}>
      <NeuralGlobe prefersReduced={prefersReduced} />
      <NeuralGlobeOverlay />
    </div>
  );
}
