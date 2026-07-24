import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

interface AgentCapabilities {
  canReadMyChannels: boolean;
  canCreateTasks: boolean;
  canInviteToChannels: boolean;
}

interface AgentOverride {
  agentId: string;
  agentName: string;
  canDMMe: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  capabilities: AgentCapabilities;
}

interface StoredPrefs {
  agentOverrides?: AgentOverride[];
  [key: string]: unknown;
}

function extractToken(req: NextRequest): string | null {
  const cookie = req.cookies.get('hx_access')?.value;
  if (cookie) return cookie;
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

// PATCH /api/hotbox/me/agent-prefs/:agentId
export async function PATCH(
  req: NextRequest,
  { params }: { params: { agentId: string } },
) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<AgentOverride>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { agentId } = params;

  const { data: existing } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', claims.org)
    .eq('key_type', 'agent_prefs')
    .eq('key_path', claims.sub)
    .maybeSingle();

  const prefs: StoredPrefs = (existing?.payload as StoredPrefs | null) ?? {};
  const overrides: AgentOverride[] = prefs.agentOverrides ?? [];

  const idx = overrides.findIndex((o) => o.agentId === agentId);
  const DEFAULT_CAPS: AgentCapabilities = { canReadMyChannels: true, canCreateTasks: false, canInviteToChannels: false };
  const existing_override = idx >= 0 ? overrides[idx] : null;

  const updated: AgentOverride = {
    agentId,
    agentName: body.agentName ?? existing_override?.agentName ?? agentId,
    canDMMe: body.canDMMe ?? existing_override?.canDMMe ?? true,
    quietHoursEnabled: body.quietHoursEnabled ?? existing_override?.quietHoursEnabled ?? false,
    quietHoursStart: body.quietHoursStart ?? existing_override?.quietHoursStart ?? '22:00',
    quietHoursEnd: body.quietHoursEnd ?? existing_override?.quietHoursEnd ?? '08:00',
    capabilities: { ...DEFAULT_CAPS, ...existing_override?.capabilities, ...body.capabilities },
  };

  if (idx >= 0) {
    overrides[idx] = updated;
  } else {
    overrides.push(updated);
  }

  const merged = { ...prefs, agentOverrides: overrides };

  await db.from('hotbox_keys').upsert(
    { org_id: claims.org, key_type: 'agent_prefs', key_path: claims.sub, payload: merged },
    { onConflict: 'org_id,key_type,key_path' },
  );

  return NextResponse.json({ ok: true, override: updated });
}
