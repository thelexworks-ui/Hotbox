'use client';

import { useEffect, useRef, useState } from 'react';

export interface Member {
  id: string;
  name: string;
  role: 'user' | 'agent' | 'orchestrator' | 'headmaster';
  pubkey: string;
}

const AGENT_ROLES: Member['role'][] = ['agent', 'orchestrator', 'headmaster'];

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

export function useAgents(pollMs = 15_000) {
  const members = useMembers(pollMs);
  return members.filter((m) => AGENT_ROLES.includes(m.role));
}
