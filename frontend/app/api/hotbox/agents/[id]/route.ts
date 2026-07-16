import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;

  if (id.startsWith('ghost-')) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: account } = await db
    .from('agent_accounts')
    .select('id, name, role, skills, org_id')
    .eq('id', id)
    .maybeSingle();

  if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Channel membership: hotbox_keys rows where key_type='members' and payload.members[] contains agent name
  const { data: memberRows } = await db
    .from('hotbox_keys')
    .select('key_path, payload')
    .eq('org_id', account.org_id)
    .eq('key_type', 'members')
    .limit(100);

  const channels = (memberRows ?? [])
    .filter((r) => ((r.payload as { members?: string[] } | null)?.members ?? []).includes(account.name as string))
    .map((r) => r.key_path as string)
    .slice(0, 10);

  // Task count (open + in_progress) — 0 if table absent
  let taskCount = 0;
  try {
    const { count } = await db
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', account.id)
      .in('status', ['open', 'in_progress']);
    taskCount = count ?? 0;
  } catch {}

  // Last active — null if heartbeats table absent
  let lastActiveMsAgo: number | null = null;
  try {
    const { data: hb } = await db
      .from('heartbeats')
      .select('updated_at')
      .eq('agent_id', account.id)
      .maybeSingle();
    if (hb?.updated_at) lastActiveMsAgo = Date.now() - new Date(hb.updated_at).getTime();
  } catch {}

  return NextResponse.json({
    id: account.id,
    name: account.name,
    role: (account.role as string) ?? 'agent',
    skills: (account.skills as string[] | null) ?? [],
    channels,
    taskCount,
    lastActiveMsAgo,
  });
}
