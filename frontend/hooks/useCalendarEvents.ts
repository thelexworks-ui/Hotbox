'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CalendarEvent } from '@/types/calendar';

export function useCalendarEvents(month: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/hotbox/calendar/events?month=${month}`);
      if (!r.ok) return;
      const data: CalendarEvent[] = await r.json();
      setEvents(data);
    } catch {}
  }, [month]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return events;
}
