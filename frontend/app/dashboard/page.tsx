'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/hotbox/AppShell';
import { CollapsibleSidebar } from '@/components/hotbox/CollapsibleSidebar';
import { DashboardContent } from '@/components/hotbox/dashboard/DashboardContent';

export default function DashboardPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('hx_sidebar_collapsed') === 'true';
  });

  const handleToggle = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('hx_sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <AppShell
      collapsedSidebar={sidebarCollapsed}
      onSidebarToggle={handleToggle}
      sidebarContent={<CollapsibleSidebar collapsed={sidebarCollapsed} onToggle={handleToggle} />}
    >
      <DashboardContent />
    </AppShell>
  );
}
