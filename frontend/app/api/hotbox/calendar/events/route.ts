import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { db } from '@/lib/fusion/supabase';
import type { CalendarEvent } from '@/types/calendar';

export const runtime = 'nodejs';

function getMonthBounds(month: string): [string, string] {
  const [year, mo] = month.split('-').map(Number);
  const start = `${year}-${String(mo).padStart(2, '0')}-01`;
  const lastDay = new Date(year, mo, 0).getDate();
  const end = `${year}-${String(mo).padStart(2, '0')}-${lastDay}`;
  return [start, end];
}

export async function GET(req: NextRequest) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const month = searchParams.get('month') ?? defaultMonth;

  const [start, end] = getMonthBounds(month);

  try {
    const { data: tasks } = await db
      .from('tasks')
      .select('id, title, due_date, status')
      .gte('due_date', start)
      .lte('due_date', end)
      .eq('org_id', scope.org);

    const events: CalendarEvent[] = (tasks ?? [])
      .filter((t) => t.due_date)
      .map((t) => ({
        id: t.id,
        title: t.title,
        date: t.due_date as string,
        type: (t.status === 'done' ? 'task' : 'deadline') as 'task' | 'deadline',
        taskId: t.id,
      }));

    return NextResponse.json(events);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
