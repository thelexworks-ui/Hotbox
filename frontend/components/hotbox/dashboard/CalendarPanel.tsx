'use client';

import React, { useState } from 'react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import type { CalendarEvent } from '@/types/calendar';
import { CALENDAR_EVENT_COLORS } from '@/types/calendar';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function padMonth(n: number) {
  return String(n).padStart(2, '0');
}

function getMonthKey(year: number, month: number): string {
  return `${year}-${padMonth(month + 1)}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function DayPopover({ events, flip }: { events: CalendarEvent[]; flip: boolean }) {
  return (
    <div
      className="day-popup absolute left-1/2 -translate-x-1/2 z-20 w-[140px] rounded-[6px] p-[8px] pointer-events-none hidden group-hover:block"
      style={{
        background: 'rgba(10,22,40,0.96)',
        border: '1px solid rgba(26,74,90,0.60)',
        backdropFilter: 'blur(12px)',
        ...(flip
          ? { top: 'calc(100% + 5px)' }
          : { bottom: 'calc(100% + 5px)' }),
      }}
    >
      {events.map((e) => (
        <div key={e.id} className="flex items-center gap-[5px] py-[3px]">
          <span
            className="w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{ background: CALENDAR_EVENT_COLORS[e.type] }}
          />
          <span
            className="text-[10px] truncate"
            style={{ color: 'rgba(232,244,248,0.70)' }}
          >
            {e.title}
          </span>
        </div>
      ))}
    </div>
  );
}

function CalendarCell({
  day,
  events,
  isToday,
  isCurrentMonth,
  flip,
}: {
  day: number;
  events: CalendarEvent[];
  isToday: boolean;
  isCurrentMonth: boolean;
  flip: boolean;
}) {
  const typeSet = new Set(events.map((e) => e.type));

  return (
    <div
      className={[
        'relative aspect-square flex flex-col items-center justify-center',
        'rounded-[5px] text-[11px] cursor-pointer group',
        'hover:bg-[rgba(90,218,238,0.06)]',
        isToday
          ? 'font-bold'
          : isCurrentMonth
          ? 'text-[rgba(232,244,248,0.60)]'
          : 'text-[rgba(232,244,248,0.20)]',
      ].join(' ')}
      style={
        isToday
          ? {
              background: '#5ADAEE',
              color: '#050C14',
              boxShadow: '0 0 10px rgba(90,218,238,0.50)',
            }
          : undefined
      }
    >
      {day}
      {typeSet.size > 0 && (
        <div className="absolute bottom-[2px] left-1/2 -translate-x-1/2 flex gap-[2px]">
          {Array.from(typeSet).map((t) => (
            <span
              key={t}
              className="w-[4px] h-[4px] rounded-full"
              style={{ background: CALENDAR_EVENT_COLORS[t] }}
            />
          ))}
        </div>
      )}
      {events.length > 0 && <DayPopover events={events} flip={flip} />}
    </div>
  );
}

function TypeBadge({ type }: { type: CalendarEvent['type'] }) {
  const labels: Record<string, string> = { task: 'Task', deadline: 'Due', event: 'Event' };
  return (
    <span
      className="text-[8px] font-mono uppercase px-[5px] py-[2px] rounded-[3px] flex-shrink-0"
      style={{
        background: `${CALENDAR_EVENT_COLORS[type]}18`,
        color: CALENDAR_EVENT_COLORS[type],
        border: `1px solid ${CALENDAR_EVENT_COLORS[type]}40`,
      }}
    >
      {labels[type]}
    </span>
  );
}

export function CalendarPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const monthKey = getMonthKey(year, month);
  const events = useCalendarEvents(monthKey);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayDay = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : -1;

  // Build grid (42 cells = 6 rows × 7 cols)
  const cells: Array<{ day: number; currentMonth: boolean }> = [];
  const prevDays = getDaysInMonth(year, month === 0 ? 11 : month - 1);
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true });
  }
  while (cells.length < 42) {
    cells.push({ day: cells.length - daysInMonth - firstDay + 1, currentMonth: false });
  }

  // Events indexed by day
  const eventsByDay: Record<number, CalendarEvent[]> = {};
  for (const e of events) {
    const [, , dd] = e.date.split('-').map(Number);
    if (!eventsByDay[dd]) eventsByDay[dd] = [];
    eventsByDay[dd].push(e);
  }

  // Upcoming: next 4 events sorted ascending
  const today = `${year}-${padMonth(month + 1)}-${padMonth(todayDay > 0 ? todayDay : 1)}`;
  const upcoming = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  return (
    <div
      className="flex flex-col overflow-y-auto"
      style={{
        width: 272,
        flexShrink: 0,
        borderRight: '1px solid rgba(26,74,90,0.50)',
        padding: 14,
        background: 'var(--hotbox-surface)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-[10px]">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--hotbox-text)' }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <div className="flex gap-1">
          <button
            onClick={prevMonth}
            className="w-[22px] h-[22px] flex items-center justify-center rounded transition-colors hover:bg-[rgba(90,218,238,0.08)]"
            style={{ color: 'rgba(232,244,248,0.35)' }}
          >
            ‹
          </button>
          <button
            onClick={nextMonth}
            className="w-[22px] h-[22px] flex items-center justify-center rounded transition-colors hover:bg-[rgba(90,218,238,0.08)]"
            style={{ color: 'rgba(232,244,248,0.35)' }}
          >
            ›
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-[10px] mb-[10px]">
        {(['task', 'deadline', 'event'] as const).map((t) => (
          <span key={t} className="flex items-center gap-[4px] text-[9px] uppercase tracking-[0.04em]" style={{ color: 'rgba(232,244,248,0.35)' }}>
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: CALENDAR_EVENT_COLORS[t] }} />
            {t === 'task' ? 'Task' : t === 'deadline' ? 'Deadline' : 'Event'}
          </span>
        ))}
      </div>

      {/* Day of week labels */}
      <div className="grid grid-cols-7 gap-[2px] mb-[2px]">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[9px] font-mono py-[2px]" style={{ color: 'rgba(232,244,248,0.25)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-[2px] mb-[14px]">
        {cells.map((cell, i) => {
          const dayEvents = cell.currentMonth ? (eventsByDay[cell.day] ?? []) : [];
          const rowIndex = Math.floor(i / 7);
          return (
            <CalendarCell
              key={i}
              day={cell.day}
              events={dayEvents}
              isToday={cell.currentMonth && cell.day === todayDay}
              isCurrentMonth={cell.currentMonth}
              flip={rowIndex < 2}
            />
          );
        })}
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <div
            className="text-[9px] uppercase tracking-[0.08em] mb-[8px] font-mono"
            style={{ color: 'rgba(232,244,248,0.25)' }}
          >
            Upcoming
          </div>
          <div className="flex flex-col gap-[6px]">
            {upcoming.map((e) => (
              <div key={e.id} className="flex items-center gap-[6px]">
                <span
                  className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                  style={{ background: CALENDAR_EVENT_COLORS[e.type] }}
                />
                <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'rgba(232,244,248,0.35)' }}>
                  {e.date.slice(5).replace('-', '/')}
                </span>
                <span className="text-[10px] truncate flex-1" style={{ color: 'rgba(232,244,248,0.60)' }}>
                  {e.title}
                </span>
                <TypeBadge type={e.type} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
