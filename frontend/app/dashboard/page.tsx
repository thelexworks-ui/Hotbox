'use client'

import Link from 'next/link'
import { useState } from 'react'

const MOCK_AGENTS = [
  { id: 'orchestrator', name: 'orchestrator', state: 'fresh',   x: 50, y: 42 },
  { id: 'daedalus',    name: 'daedalus',    state: 'fresh',   x: 34, y: 58 },
  { id: 'hades',       name: 'hades',       state: 'warming', x: 66, y: 58 },
  { id: 'analyst',     name: 'analyst',     state: 'fresh',   x: 42, y: 72 },
  { id: 'watchdog',    name: 'watchdog',    state: 'warming', x: 58, y: 72 },
  { id: 'hermes',      name: 'hermes',      state: 'stale',   x: 28, y: 44 },
  { id: 'security',    name: 'security',    state: 'fresh',   x: 72, y: 44 },
]

const EDGE_PAIRS = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
  [1, 3], [2, 4], [3, 4],
]

const STATE_COLOR: Record<string, string> = {
  fresh:   '#5ADAEE',
  warming: '#FFAF2A',
  stale:   'rgba(232,244,248,0.30)',
  cold:    'rgba(232,244,248,0.12)',
}

const MOCK_TASKS = [
  { id: 'T-041', title: 'Neurolink member window',    status: 'in_progress', assignee: 'daedalus', due: 'Jul 18' },
  { id: 'T-042', title: 'Dashboard prod integration', status: 'open',        assignee: 'hepha',    due: 'Jul 18' },
  { id: 'T-039', title: 'Phase 2a channel bootstrap', status: 'completed',   assignee: 'hepha',    due: 'Jul 17' },
  { id: 'T-038', title: 'Login portal mockup',        status: 'completed',   assignee: 'daedalus', due: 'Jul 18' },
  { id: 'T-037', title: 'Gold V4 session halt SLA',   status: 'completed',   assignee: 'hermes',   due: 'Jul 17' },
]

const STATUS_STYLE: Record<string, { dot: string; label: string; bg: string }> = {
  open:        { dot: 'bg-[rgba(232,244,248,0.30)]', label: 'Open',        bg: 'bg-[rgba(232,244,248,0.06)]' },
  in_progress: { dot: 'bg-[#5ADAEE]',                label: 'In Progress', bg: 'bg-[rgba(90,218,238,0.08)]' },
  completed:   { dot: 'bg-[#4ADE80]',                label: 'Done',        bg: 'bg-[rgba(74,222,128,0.08)]' },
  blocked:     { dot: 'bg-[#FF4D4D]',                label: 'Blocked',     bg: 'bg-[rgba(255,77,77,0.08)]' },
}

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const TODAY = 18
const EVENTS: Record<number, string> = { 18: 'cyan', 19: 'amber', 22: 'cyan', 25: 'amber' }

function TopNav() {
  return (
    <nav className="hx-nav h-12 flex items-center px-4 gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_12px_rgba(90,218,238,0.35)]">
          <span className="text-[#050C14] font-bold text-[10px] font-mono">HX</span>
        </div>
        <span className="text-[#E8F4F8] font-semibold text-sm tracking-tight">Hotbox</span>
        <span className="text-[rgba(232,244,248,0.20)] text-xs font-mono mx-1">/</span>
        <span className="text-[rgba(232,244,248,0.50)] text-xs font-mono">toadsage</span>
      </div>

      <div className="flex-1" />

      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(5,12,20,0.60)] border border-[rgba(90,218,238,0.12)] text-[rgba(232,244,248,0.35)] text-xs font-mono w-52">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <span>Search nodes…</span>
        <span className="ml-auto text-[rgba(232,244,248,0.20)]">⌘K</span>
      </div>

      <button className="w-7 h-7 rounded-lg flex items-center justify-center text-[rgba(232,244,248,0.45)] hover:text-[#E8F4F8] hover:bg-[rgba(90,218,238,0.08)] transition-colors relative">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#5ADAEE]" />
      </button>

      <Link href="/account">
        <div className="w-7 h-7 rounded-full bg-[rgba(90,218,238,0.20)] border border-[rgba(90,218,238,0.30)] flex items-center justify-center text-[#5ADAEE] text-[10px] font-bold font-mono cursor-pointer hover:border-[#5ADAEE] transition-colors">
          L
        </div>
      </Link>
    </nav>
  )
}

function NeurolinkCanvas({ zoom }: { zoom: number }) {
  return (
    <div className="relative w-full h-full bg-[#050C14] overflow-hidden">
      <div className="bokeh w-[500px] h-[500px] bg-[#1A7AB8] opacity-[0.07] top-[-100px] left-[20%]" />
      <div className="bokeh w-[300px] h-[300px] bg-[#5ADAEE] opacity-[0.04] bottom-[10%] right-[10%]" />

      <svg
        className="absolute inset-0 w-full h-full"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 300ms cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {EDGE_PAIRS.map(([a, b], i) => {
          const nodeA = MOCK_AGENTS[a]
          const nodeB = MOCK_AGENTS[b]
          return (
            <line
              key={i}
              x1={`${nodeA.x}%`} y1={`${nodeA.y}%`}
              x2={`${nodeB.x}%`} y2={`${nodeB.y}%`}
              stroke="rgba(90,218,238,0.12)"
              strokeWidth="1"
            />
          )
        })}

        {MOCK_AGENTS.map((agent) => (
          <g key={agent.id} style={{ cursor: 'pointer' }}>
            <circle
              cx={`${agent.x}%`} cy={`${agent.y}%`}
              r={agent.state === 'fresh' ? 18 : 14}
              fill="none"
              stroke={STATE_COLOR[agent.state]}
              strokeWidth="0.5"
              opacity="0.25"
            />
            <circle
              cx={`${agent.x}%`} cy={`${agent.y}%`}
              r={8}
              fill={STATE_COLOR[agent.state]}
              opacity={agent.state === 'fresh' ? 0.9 : agent.state === 'warming' ? 0.6 : 0.25}
            />
            <text
              x={`${agent.x}%`} y={`${agent.y}%`}
              dy="24"
              textAnchor="middle"
              fill="rgba(232,244,248,0.60)"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              {agent.name}
            </text>
          </g>
        ))}
      </svg>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-xl bg-[rgba(5,12,20,0.72)] border border-[rgba(90,218,238,0.18)] backdrop-blur-md text-[rgba(232,244,248,0.35)] text-xs font-mono w-64 shadow-[0_4px_16px_rgba(0,0,0,0.40)]">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <span>Search nodes, messages, agents…</span>
      </div>

      <button className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgba(90,218,238,0.10)] border border-[rgba(90,218,238,0.25)] text-[#5ADAEE] text-xs font-mono hover:bg-[rgba(90,218,238,0.16)] transition-colors">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1v8M1 5h8" stroke="#5ADAEE" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Create
      </button>

      <div className="absolute bottom-3 left-3 flex items-center gap-3">
        {Object.entries(STATE_COLOR).map(([state, color]) => (
          <div key={state} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[rgba(232,244,248,0.35)] text-[10px] font-mono">{state}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarPanel() {
  const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  const startDay = 3 // July 2026 starts on Wednesday

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-[#E8F4F8] text-sm font-semibold">July 2026</span>
        <div className="flex gap-1">
          <button className="w-5 h-5 flex items-center justify-center text-[rgba(232,244,248,0.40)] hover:text-[#E8F4F8] transition-colors">
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button className="w-5 h-5 flex items-center justify-center text-[rgba(232,244,248,0.40)] hover:text-[#E8F4F8] transition-colors">
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0">
        {days.map(d => (
          <div key={d} className="text-center text-[rgba(232,244,248,0.30)] text-[10px] font-mono pb-1">{d}</div>
        ))}
        {Array.from({ length: startDay }).map((_, i) => <div key={`e${i}`} />)}
        {MONTH_DAYS.map(day => (
          <button
            key={day}
            className={`aspect-square flex items-center justify-center text-[11px] font-mono rounded-md transition-colors relative
              ${day === TODAY
                ? 'bg-[#5ADAEE] text-[#050C14] font-bold'
                : 'text-[rgba(232,244,248,0.55)] hover:text-[#E8F4F8] hover:bg-[rgba(90,218,238,0.08)]'}`}
          >
            {day}
            {EVENTS[day] && day !== TODAY && (
              <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${EVENTS[day] === 'cyan' ? 'bg-[#5ADAEE]' : 'bg-[#FFAF2A]'}`} />
            )}
          </button>
        ))}
      </div>

      <div className="border-t border-[rgba(90,218,238,0.08)] pt-3 space-y-2">
        <p className="text-[rgba(232,244,248,0.35)] text-[10px] font-mono uppercase tracking-widest">Upcoming</p>
        {[
          { day: 'Today',  label: 'Dashboard integration',  color: '#5ADAEE' },
          { day: 'Jul 19', label: 'Hermes strategy review',  color: '#FFAF2A' },
          { day: 'Jul 22', label: 'Phase 2 spec review',     color: '#5ADAEE' },
        ].map((ev) => (
          <div key={ev.label} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: ev.color }} />
            <div>
              <p className="text-[rgba(232,244,248,0.45)] text-[10px] font-mono">{ev.day}</p>
              <p className="text-[rgba(232,244,248,0.75)] text-xs">{ev.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskTable() {
  return (
    <div className="glass-card rounded-xl overflow-hidden flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(90,218,238,0.08)] shrink-0">
        <span className="text-[#E8F4F8] text-sm font-semibold">Tasks</span>
        <button className="flex items-center gap-1.5 text-[#5ADAEE] text-xs font-mono hover:opacity-80 transition-opacity">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke="#5ADAEE" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          New task
        </button>
      </div>

      <div className="grid grid-cols-[2fr_1fr_1fr_80px] gap-2 px-4 py-2 border-b border-[rgba(90,218,238,0.06)] shrink-0">
        {['Title', 'Status', 'Assignee', 'Due'].map(h => (
          <span key={h} className="text-[rgba(232,244,248,0.30)] text-[10px] font-mono uppercase tracking-widest">{h}</span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {MOCK_TASKS.map((task) => {
          const s = STATUS_STYLE[task.status]
          return (
            <div key={task.id} className="hx-table-row grid grid-cols-[2fr_1fr_1fr_80px] gap-2 px-4 py-2.5 items-center">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[rgba(232,244,248,0.25)] text-[10px] font-mono shrink-0">{task.id}</span>
                <span className="text-[rgba(232,244,248,0.80)] text-xs truncate">{task.title}</span>
              </div>
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${s.bg} w-fit`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                <span className="text-[rgba(232,244,248,0.65)] text-[10px] font-mono">{s.label}</span>
              </div>
              <span className="text-[rgba(232,244,248,0.45)] text-xs font-mono">{task.assignee}</span>
              <span className="text-[rgba(232,244,248,0.35)] text-[10px] font-mono">{task.due}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [zoom, setZoom] = useState(1)

  const zoomIn    = () => setZoom(z => Math.min(z + 0.2, 2.0))
  const zoomOut   = () => setZoom(z => Math.max(z - 0.2, 0.5))
  const zoomReset = () => setZoom(1)

  return (
    <div className="h-screen bg-[#050C14] flex flex-col overflow-hidden">
      <TopNav />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Neurolink — top ~55vh */}
        <div className="relative" style={{ height: '55vh', minHeight: 320 }}>
          <NeurolinkCanvas zoom={zoom} />

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 glass-card rounded-lg px-2 py-1.5">
            <button
              onClick={zoomOut}
              className="w-6 h-6 flex items-center justify-center text-[rgba(232,244,248,0.55)] hover:text-[#5ADAEE] transition-colors font-mono text-sm"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              onClick={zoomReset}
              className="px-2 text-[rgba(232,244,248,0.35)] text-[10px] font-mono hover:text-[rgba(232,244,248,0.70)] transition-colors"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              className="w-6 h-6 flex items-center justify-center text-[rgba(232,244,248,0.55)] hover:text-[#5ADAEE] transition-colors font-mono text-sm"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </div>

        {/* Lower panels — calendar + tasks */}
        <div className="flex-1 grid grid-cols-[280px_1fr] gap-3 p-3 overflow-hidden min-h-0">
          <CalendarPanel />
          <TaskTable />
        </div>
      </div>
    </div>
  )
}
