export type TaskStatus   = 'open' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string
  assigneeName: string
  assigneeInitials: string
  dueDate?: string
  isOverdue: boolean
  isAssignedToMe: boolean
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  high:   '#FF4D4D',
  medium: '#FFAF2A',
  low:    'rgba(90,218,238,0.30)',
}

export const STATUS_BADGE: Record<TaskStatus, { bg: string; text: string; dot: string }> = {
  in_progress: { bg: 'rgba(90,218,238,0.10)',  text: '#5ADAEE', dot: '#5ADAEE' },
  open:        { bg: 'rgba(232,244,248,0.04)', text: 'rgba(232,244,248,0.60)', dot: 'rgba(232,244,248,0.25)' },
  blocked:     { bg: 'rgba(255,77,77,0.08)',   text: '#FF4D4D', dot: '#FF4D4D' },
  done:        { bg: 'rgba(74,222,128,0.08)',  text: '#4ADE80', dot: '#4ADE80' },
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  in_progress: 'In Progress',
  open:        'Open',
  blocked:     'Blocked',
  done:        'Done',
}
