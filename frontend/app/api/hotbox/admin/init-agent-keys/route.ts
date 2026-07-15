import { NextRequest, NextResponse } from 'next/server';
import { validateMasterKey } from '@/lib/hotbox/master-key';
import { storePublicKey, loadPublicKey } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

export async function POST(req: NextRequest) {
  const role = validateMasterKey(req.headers.get('x-master-key'));
  if (role !== 'orchestrator') {
    return NextResponse.json({ error: 'unauthorized — ORCHESTRATOR_MASTER_KEY required' }, { status: 401 });
  }

  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  const results: Record<string, string> = {};

  for (const agentRole of ['orchestrator', 'headmaster'] as const) {
    const pubKey = process.env[`${agentRole.toUpperCase()}_PUBLIC_KEY`];
    if (!pubKey) {
      results[agentRole] = 'skipped — env var missing';
      continue;
    }

    const existing = await loadPublicKey(org, agentRole);
    if (existing) {
      results[agentRole] = 'already registered';
      continue;
    }

    try {
      await storePublicKey(org, agentRole, pubKey, agentRole);
      results[agentRole] = 'registered';
    } catch (err) {
      results[agentRole] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({ ok: true, org, results });
}
