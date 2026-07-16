import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { encryptLlmKey, validateLlmKey, type LlmProvider } from '@/lib/fusion/llm-keys';

export const runtime = 'nodejs';

// POST /api/org/llm-key
// Body: { provider: "anthropic" | "openai" | "xai" | "google", apiKey: string }
// Auth: Bearer <accessToken>
// Returns: { valid: boolean, models_available: string[] }
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!rawToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let caller: { sub: string; org: string; role: string };
  try {
    caller = await verifyAccessToken(rawToken);
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  if (caller.role !== 'headmaster' && caller.role !== 'orchestrator') {
    return NextResponse.json({ error: 'Forbidden — headmaster or orchestrator only' }, { status: 403 });
  }

  let body: { provider?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { provider, apiKey } = body;
  const VALID_PROVIDERS: LlmProvider[] = ['anthropic', 'openai', 'xai', 'google'];
  if (!provider || !VALID_PROVIDERS.includes(provider as LlmProvider)) {
    return NextResponse.json({ error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` }, { status: 400 });
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    return NextResponse.json({ error: 'apiKey required' }, { status: 400 });
  }

  // Live validation before storing
  const validation = await validateLlmKey(provider as LlmProvider, apiKey.trim());
  if (!validation.valid) {
    return NextResponse.json({ valid: false, models_available: [], error: validation.error ?? 'Key rejected by provider' }, { status: 422 });
  }

  // Encrypt and upsert
  const { ciphertext, iv } = encryptLlmKey(apiKey.trim());

  // Deactivate any existing active key for this provider
  await db.from('org_llm_keys').update({ active: false }).eq('org_id', caller.org).eq('provider', provider).eq('active', true);

  const { error: upsertErr } = await db.from('org_llm_keys').upsert({
    org_id: caller.org,
    provider,
    key_encrypted: ciphertext,
    key_iv: iv,
    active: true,
    models_available: validation.models_available,
    validated_at: new Date().toISOString(),
  }, { onConflict: 'org_id,provider' });

  if (upsertErr) {
    console.error('[llm-key] upsert error:', upsertErr);
    return NextResponse.json({ error: 'Failed to store key' }, { status: 500 });
  }

  return NextResponse.json({ valid: true, models_available: validation.models_available });
}
