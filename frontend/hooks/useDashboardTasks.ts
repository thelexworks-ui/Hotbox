'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Task } from '@/types/task';

interface TasksResponse {
  tasks: Task[];
  total: number;
}

export function useDashboardTasks(limit = 20) {
  const [data, setData] = useState<TasksResponse>({ tasks: [], total: 0 });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/hotbox/tasks?limit=${limit}`);
      if (!r.ok) return;
      const json: TasksResponse = await r.json();
      setData(json);
    } catch {}
  }, [limit]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return data;
}
