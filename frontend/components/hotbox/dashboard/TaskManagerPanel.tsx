'use client';

import React, { useState } from 'react';
import { useDashboardTasks } from '@/hooks/useDashboardTasks';
import type { Task, TaskStatus, TaskPriority } from '@/types/task';
import { PRIORITY_COLORS, STATUS_BADGE, STATUS_LABEL } from '@/types/task';
import { useAuth } from '@/components/hotbox/AuthProvider';

type FilterChip = 'all' | 'in_progress' | 'open' | 'done' | 'mine' | 'overdue';

const CHIPS: { id: FilterChip; label: string }[] = [
  { id: 'all',         label: 'All' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'open',        label: 'Open' },
  { id: 'done',        label: 'Done' },
  { id: 'mine',        label: 'Mine' },
  { id: 'overdue',     label: 'Overdue' },
];

function filterTasks(tasks: Task[], chip: FilterChip, myId: string): Task[] {
  switch (chip) {
    case 'all':         return tasks;
    case 'in_progress': return tasks.filter((t) => t.status === 'in_progress');
    case 'open':        return tasks.filter((t) => t.status === 'open');
    case 'done':        return tasks.filter((t) => t.status === 'done');
    case 'mine':        return tasks.filter((t) => t.assigneeId === myId);
    case 'overdue':     return tasks.filter((t) => t.isOverdue);
    default:            return tasks;
  }
}

function PriorityDot({ priority }: { priority: TaskPriority }) {
  return (
    <div className="flex items-center justify-center">
      <span
        className="w-[7px] h-[7px] rounded-full"
        style={{ background: PRIORITY_COLORS[priority] }}
        title={priority}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const s = STATUS_BADGE[status];
  return (
    <div className="flex items-center gap-[5px] min-w-0">
      <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: s.dot }} />
      <span
        className="text-[10px] font-mono px-[6px] py-[2px] rounded-[4px] truncate"
        style={{ background: s.bg, color: s.text }}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

function AssigneeCell({ initials, name }: { initials: string; name: string }) {
  return (
    <div className="flex items-center gap-[5px] text-[11px] font-mono min-w-0" style={{ color: 'rgba(232,244,248,0.60)' }}>
      <div
        className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0"
        style={{ background: 'rgba(90,218,238,0.10)', border: '1px solid rgba(90,218,238,0.18)', color: '#5ADAEE' }}
      >
        {initials}
      </div>
      <span className="truncate">{name}</span>
    </div>
  );
}

function DueCell({ date, overdue }: { date?: string; overdue: boolean }) {
  if (!date) return <div />;
  return (
    <div
      className="text-[10px] font-mono truncate"
      style={{ color: overdue ? '#FF4D4D' : 'rgba(232,244,248,0.35)' }}
    >
      {date}
    </div>
  );
}

function RowActions() {
  return (
    <div className="flex gap-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-100 justify-end">
      <button
        className="w-[22px] h-[22px] rounded-[4px] flex items-center justify-center text-[12px] hover:bg-[rgba(90,218,238,0.12)] transition-colors"
        style={{ color: 'rgba(232,244,248,0.35)' }}
        title="Edit"
      >
        ✎
      </button>
      <button
        className="w-[22px] h-[22px] rounded-[4px] flex items-center justify-center text-[13px] hover:bg-[rgba(90,218,238,0.12)] transition-colors"
        style={{ color: 'rgba(232,244,248,0.35)' }}
        title="More"
      >
        ⋯
      </button>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <div
      className="relative grid items-center px-[18px] py-[9px] border-b cursor-pointer hover:bg-[rgba(90,218,238,0.04)] group transition-colors duration-100"
      style={{
        borderColor: 'rgba(90,218,238,0.04)',
        gridTemplateColumns: '22px 1fr 150px 130px 90px 54px',
      }}
    >
      {/* Priority stripe — visible on hover */}
      <div
        className="absolute left-0 top-[4px] bottom-[4px] w-[2px] rounded-r-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ background: PRIORITY_COLORS[task.priority] }}
      />
      <PriorityDot priority={task.priority} />
      <div className="min-w-0 pr-2">
        <div className="text-[11px] font-mono" style={{ color: 'rgba(232,244,248,0.25)' }}>{task.id}</div>
        <div className="text-[12px] truncate" style={{ color: 'rgba(232,244,248,0.80)' }}>{task.title}</div>
      </div>
      <StatusBadge status={task.status} />
      <AssigneeCell initials={task.assigneeInitials} name={task.assigneeName} />
      <DueCell date={task.dueDate} overdue={task.isOverdue} />
      <RowActions />
    </div>
  );
}

export function TaskManagerPanel() {
  const { memberId } = useAuth();
  const { tasks, total } = useDashboardTasks(20);
  const [activeChip, setActiveChip] = useState<FilterChip>('all');

  const visible = filterTasks(tasks, activeChip, memberId);

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden" style={{ background: 'var(--hotbox-surface)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-[18px] py-[12px] border-b flex-shrink-0"
        style={{ borderColor: 'rgba(26,74,90,0.50)' }}
      >
        <div className="flex items-center gap-[8px]">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--hotbox-text)' }}>
            Tasks
          </span>
          <span
            className="text-[10px] font-mono px-[6px] py-[2px] rounded-full"
            style={{ background: 'rgba(90,218,238,0.08)', color: 'rgba(90,218,238,0.70)' }}
          >
            {total}
          </span>
        </div>
        <button
          className="text-[11px] px-[10px] py-[4px] rounded-[6px] transition-colors hover:bg-[rgba(90,218,238,0.14)]"
          style={{ background: 'rgba(90,218,238,0.08)', border: '1px solid rgba(90,218,238,0.25)', color: '#5ADAEE' }}
        >
          + New task
        </button>
      </div>

      {/* Filter chips */}
      <div
        className="flex items-center gap-[6px] px-[18px] py-[10px] border-b flex-shrink-0 flex-wrap"
        style={{ borderColor: 'rgba(26,74,90,0.50)' }}
      >
        {CHIPS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveChip(c.id)}
            className="text-[11px] px-[10px] py-[4px] rounded-[6px] transition-colors"
            style={
              activeChip === c.id
                ? { background: 'rgba(90,218,238,0.12)', color: '#5ADAEE', border: '1px solid rgba(90,218,238,0.30)' }
                : { background: 'transparent', color: 'rgba(232,244,248,0.40)', border: '1px solid rgba(26,74,90,0.40)' }
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div
        className="grid items-center px-[18px] py-[8px] border-b flex-shrink-0"
        style={{
          gridTemplateColumns: '22px 1fr 150px 130px 90px 54px',
          borderColor: 'rgba(26,74,90,0.50)',
        }}
      >
        {['', 'Task', 'Status', 'Assignee', 'Due', ''].map((h, i) => (
          <span key={i} className="text-[9px] font-mono uppercase tracking-[0.06em]" style={{ color: 'rgba(232,244,248,0.25)' }}>
            {h}
          </span>
        ))}
      </div>

      {/* Task rows (scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[12px]" style={{ color: 'rgba(232,244,248,0.25)' }}>
            No tasks
          </div>
        ) : (
          visible.map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-[18px] py-[8px] border-t flex-shrink-0"
        style={{ borderColor: 'rgba(26,74,90,0.50)' }}
      >
        <span className="text-[10px] font-mono" style={{ color: 'rgba(232,244,248,0.25)' }}>
          {visible.length} of {total}
        </span>
      </div>
    </div>
  );
}
