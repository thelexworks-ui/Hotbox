export type CalendarEventType = 'task' | 'deadline' | 'event'

export interface CalendarEvent {
  id: string
  title: string
  date: string           // YYYY-MM-DD
  type: CalendarEventType
  taskId?: string
  href?: string
}

export const CALENDAR_EVENT_COLORS: Record<CalendarEventType, string> = {
  task:     '#5ADAEE',
  deadline: '#FFAF2A',
  event:    '#4ADE80',
}
