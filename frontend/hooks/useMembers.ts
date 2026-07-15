'use client';

import { useEffect, useRef, useState } from 'react';

export interface Member {
  id: string;
  name: string;
  role: 'user' | 'agent' | 'orchestrator' | 'headmaster';
  pubkey: string;
}

async function fetchMembers(): Promise<Member[]> {
  const res = await fetch('/api/hotbox/members');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function useMembers(pollMs = 30_000) {
  const [members, setMembers] = useState<Member[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchMembers().then(setMembers).catch(() => {});
    intervalRef.current = setInterval(() => {
      fetchMembers().then(setMembers).catch(() => {});
    }, pollMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [pollMs]);

  return members;
}

export function useHeadmasters(pollMs = 30_000) {
  return useMembers(pollMs).filter((m) => m.role === 'headmaster');
}

export function useOrchestrators(pollMs = 30_000) {
  return useMembers(pollMs).filter((m) => m.role === 'orchestrator');
}

export function useAgentsOnly(pollMs = 15_000) {
  return useMembers(pollMs).filter((m) => m.role === 'agent');
}

// Legacy: all non-user roles (headmaster + orchestrator + agent)
export function useAgents(pollMs = 15_000) {
  return useMembers(pollMs).filter((m) => m.role !== 'user');
}
