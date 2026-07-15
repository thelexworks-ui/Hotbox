'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useState } from 'react';

const NeuralGlobe = dynamic(() => import('./NeuralGlobe'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100vw', height: '100vh', background: '#080E1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#00D4E8', fontFamily: 'monospace', fontSize: 13, opacity: 0.7 }}>
        Initialising neural link…
      </span>
    </div>
  ),
});

export default function DashboardV2Page() {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#080E1A' }}>
      <NeuralGlobe prefersReduced={prefersReduced} />
    </div>
  );
}
