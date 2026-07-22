'use client';

import React from 'react';
import { NeuralGlobePanel } from './NeuralGlobePanel';
import { DashboardBottomGrid } from './DashboardBottomGrid';

function TopNav() {
  return (
    <nav className="hx-nav h-12 flex items-center px-4 gap-3 flex-shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_12px_rgba(90,218,238,0.35)]">
          <span className="text-[#050C14] font-bold text-[10px] font-mono">HX</span>
        </div>
        <span className="text-[#E8F4F8] font-semibold text-sm tracking-tight">Hotbox</span>
        <span className="text-[rgba(232,244,248,0.20)] text-xs font-mono mx-1">/</span>
        <span className="text-[rgba(232,244,248,0.50)] text-xs font-mono">Dashboard</span>
      </div>
      <div className="flex-1" />
    </nav>
  );
}

export function DashboardContent() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--hotbox-bg)' }}>
      <TopNav />
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <NeuralGlobePanel />
        <DashboardBottomGrid />
      </div>
    </div>
  );
}
