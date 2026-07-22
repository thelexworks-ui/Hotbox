import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';
import { db } from '@/lib/fusion/supabase';
import type { Task } from '@/types/task';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);
  const now = new Date().toISOString().slice(0, 10);

  try {
    const { data: rows, count } = await db
      .from('tasks')
      .select('*', { count: 'exact' })
      .eq('org_id', scope.org)
      .order('status', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(limit);

    const tasks: Task[] = (rows ?? []).map((t) => ({
      id: t.id as string,
      title: (t.title ?? '') as string,
      status: (t.status ?? 'open') as Task['status'],
      priority: (t.priority ?? 'low') as Task['priority'],
      assigneeId: (t.assignee_id ?? t.agent_id ?? '') as string,
      assigneeName: (t.assignee_name ?? t.agent_id ?? '?') as string,
      assigneeInitials: ((t.assignee_name ?? t.agent_id ?? '?') as string).charAt(0).toUpperCase(),
      dueDate: (t.due_date ?? undefined) as string | undefined,
      isOverdue: !!t.due_date && (t.due_date as string) < now && t.status !== 'done',
      isAssignedToMe: (t.assignee_id ?? t.agent_id) === scope.memberId,
    }));

    return NextResponse.json({ tasks, total: count ?? 0 });
  } catch {
    return NextResponse.json({ tasks: [], total: 0 });
  }
}
