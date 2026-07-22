'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/hotbox/AppShell';
import { CollapsibleSidebar } from '@/components/hotbox/CollapsibleSidebar';
import { DashboardContent } from '@/components/hotbox/dashboard/DashboardContent';

export default function DashboardPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('hx_sidebar_collapsed') === 'true';
  });

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleToggle = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('hx_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Edge-swipe gesture: touchstart within 24px of left edge + swipe right ≥ 40px → open
  const touchStartX = useRef<number | null>(null);
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      touchStartX.current = x < 24 ? x : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (dx > 40) setMobileSidebarOpen(true);
      touchStartX.current = null;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <AppShell
      collapsedSidebar={sidebarCollapsed}
      onSidebarToggle={handleToggle}
      sidebarContent={<CollapsibleSidebar collapsed={sidebarCollapsed} onToggle={handleToggle} />}
    >
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Fixed left-edge handle tab — mobile only, visible when sidebar closed */}
        {!mobileSidebarOpen && (
          <button
            className="md:hidden fixed left-0 top-1/2 -translate-y-1/2 z-40 flex items-center justify-center"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation"
            style={{
              width: 16,
              height: 48,
              background: 'rgba(90,218,238,0.15)',
              border: '1px solid rgba(90,218,238,0.30)',
              borderLeft: 'none',
              borderRadius: '0 6px 6px 0',
              color: '#5ADAEE',
              fontSize: 8,
              writingMode: 'vertical-rl',
              letterSpacing: '0.08em',
            }}
          >
            ◀
          </button>
        )}

        {/* Mobile sidebar drawer */}
        {mobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(5,12,20,0.60)', backdropFilter: 'blur(4px)' }}
              onClick={() => setMobileSidebarOpen(false)}
            />
            <aside
              className="relative z-10 flex flex-col h-full"
              style={{
                width: 280,
                background: 'var(--hotbox-surface)',
                borderRight: '1px solid rgba(26,74,90,0.60)',
                boxShadow: '4px 0 24px rgba(0,0,0,0.50)',
              }}
            >
              <CollapsibleSidebar collapsed={false} onToggle={() => setMobileSidebarOpen(false)} />
            </aside>
          </div>
        )}

        <DashboardContent />
      </div>
    </AppShell>
  );
}
