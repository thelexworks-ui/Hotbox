import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { verifyAccessToken, hashPassword, generateApiToken, generateAgentPassword } from '@/lib/fusion/auth';
import { addMemberToGeneral, storeChannelMembers, getChannelMembers } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

const VALID_PROVIDERS = ['anthropic', 'openai', 'xai', 'google'] as const;
const VALID_ROLES = ['agent', 'orchestrator', 'analyst', 'worker'] as const;
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,38}$/;

// POST /api/agents/create
// Body: { name, role?, llm_provider?, llm_model?, channelIds? }
// Auth: hx_access cookie OR Authorization: Bearer <accessToken> — headmaster or orchestrator only
// Returns: { agentId, apiToken, email }
// Note: api_token is stored plaintext (pre-existing pattern — dedicated security PR pending)
export async function POST(req: NextRequest) {
  const jwt =
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let caller: { sub: string; org: string; role: string };
  try {
    caller = await verifyAccessToken(jwt);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (caller.role !== 'headmaster' && caller.role !== 'orchestrator') {
    return NextResponse.json({ error: 'Forbidden — headmaster or orchestrator only' }, { status: 403 });
  }

  let body: {
    name?: string;
    role?: string;
    llm_provider?: string;
    llm_model?: string;
    channelIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, role = 'agent', llm_provider, llm_model, channelIds = [] } = body;

  if (!name || typeof name !== 'string' || !NAME_RE.test(name.trim())) {
    return NextResponse.json(
      { error: 'name required — 1-40 chars, alphanumeric/space/underscore/hyphen, must start with alphanumeric' },
      { status: 400 },
    );
  }
  if (llm_provider && !VALID_PROVIDERS.includes(llm_provider as typeof VALID_PROVIDERS[number])) {
    return NextResponse.json({ error: `llm_provider must be one of: ${VALID_PROVIDERS.join(', ')}` }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }
  if (llm_model && (typeof llm_model !== 'string' || llm_model.length > 100)) {
    return NextResponse.json({ error: 'llm_model must be a string under 100 chars' }, { status: 400 });
  }

  const agentName = name.trim();

  const { data: org, error: orgErr } = await db.from('orgs').select('slug').eq('id', caller.org).single();
  if (orgErr || !org) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 });
  }

  const emailSlug = agentName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const email = `${emailSlug}@${org.slug}.internal`;
  const apiToken = generateApiToken();
  const passwordHash = await hashPassword(generateAgentPassword());

  // Step 1: Create agent_accounts
  const { data: agent, error: agentErr } = await db.from('agent_accounts').insert({
    org_id: caller.org,
    name: agentName,
    role,
    email,
    password_hash: passwordHash,
    api_token: apiToken,
    llm_provider: llm_provider ?? null,
    llm_model: llm_model ?? null,
  }).select('id').single();

  if (agentErr || !agent) {
    if (agentErr?.code === '23505') {
      return NextResponse.json({ error: `Agent name '${agentName}' already exists in this org` }, { status: 409 });
    }
    console.error('[agents/create] agent_accounts insert error:', agentErr);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }

  // Step 2: Create member_pages
  const { error: mpErr } = await db.from('member_pages').insert({
    agent_id: agent.id,
    display_name: agentName,
  });

  if (mpErr) {
    await db.from('agent_accounts').delete().eq('id', agent.id);
    console.error('[agents/create] member_pages insert error:', mpErr);
    return NextResponse.json({ error: 'Failed to create member page — agent creation rolled back' }, { status: 500 });
  }

  // Step 3: Add to #general (invariant — fire-and-forget)
  void addMemberToGeneral(org.slug, agentName);

  // Step 4: Add to selected channels (non-fatal; org.slug binding prevents cross-org injection)
  const extraChannels = (channelIds ?? []).filter(id => id !== 'general');
  for (const channelId of extraChannels) {
    try {
      const current = await getChannelMembers(org.slug, channelId);
      if (!current.includes(agentName)) {
        await storeChannelMembers(org.slug, channelId, [...current, agentName]);
      }
    } catch (err) {
      console.error('[agents/create] failed to add agent to channel', channelId, err);
    }
  }

  // Step 5: Log spawn event (non-fatal)
  try {
    await db.from('events').insert({
      org_id: caller.org,
      agent_name: 'system',
      event: 'agent_spawn_requested',
      category: 'action',
      meta: {
        agent_id: agent.id,
        agent_name: agentName,
        role,
        llm_provider: llm_provider ?? null,
        channels: ['general', ...extraChannels],
        requested_by: caller.sub,
      },
    });
  } catch (err) {
    console.error('[agents/create] failed to log spawn event:', err);
  }

  const response = NextResponse.json({ agentId: agent.id, apiToken, email }, { status: 201 });
  // Prevent browser from caching the one-time token in the HTTP response cache
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
