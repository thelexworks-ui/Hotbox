'use client';

import React from 'react';
import { CalendarPanel } from './CalendarPanel';
import { TaskManagerPanel } from './TaskManagerPanel';

export function DashboardBottomGrid() {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <CalendarPanel />
      <TaskManagerPanel />
    </div>
  );
}
