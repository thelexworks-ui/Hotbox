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

interface AgentPrefs {
  defaultResponseMode: 'immediate' | 'batched' | 'digest';
  agentVisibilityOnGlobe: boolean;
  activityFeedEnabled: boolean;
  agentOverrides: AgentOverride[];
}

const DEFAULTS: AgentPrefs = {
  defaultResponseMode: 'immediate',
  agentVisibilityOnGlobe: true,
  activityFeedEnabled: true,
  agentOverrides: [],
};

function extractToken(req: NextRequest): string | null {
  const cookie = req.cookies.get('hx_access')?.value;
  if (cookie) return cookie;
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function loadPrefs(orgId: string, userId: string): Promise<AgentPrefs> {
  const { data } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', orgId)
    .eq('key_type', 'agent_prefs')
    .eq('key_path', userId)
    .maybeSingle();
  return { ...DEFAULTS, ...(data?.payload as Partial<AgentPrefs> | null ?? {}) };
}

export async function GET(req: NextRequest) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(await loadPrefs(claims.org, claims.sub));
}

export async function PATCH(req: NextRequest) {
  const jwt = extractToken(req);
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Partial<AgentPrefs>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const current = await loadPrefs(claims.org, claims.sub);
  const merged = { ...current, ...body };

  await db.from('hotbox_keys').upsert(
    { org_id: claims.org, key_type: 'agent_prefs', key_path: claims.sub, payload: merged },
    { onConflict: 'org_id,key_type,key_path' },
  );

  return NextResponse.json(merged);
}
