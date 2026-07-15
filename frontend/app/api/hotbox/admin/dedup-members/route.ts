import { NextRequest, NextResponse } from 'next/server';
import { validateMasterKey } from '@/lib/hotbox/master-key';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

function buildClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

// POST /api/hotbox/admin/dedup-members
// Merges a synthetic identity into a real user account.
// Body: { primary: "lex", synthetic: "headmaster", role: "headmaster", org?: string }
// Effect: UPDATE primary's payload.role → role, DELETE synthetic record.
export async function POST(req: NextRequest) {
  const masterRole = validateMasterKey(req.headers.get('x-master-key'));
  if (!masterRole) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { primary?: string; synthetic?: string; role?: string; org?: string };
  const { primary, synthetic, role } = body;
  const org = body.org ?? DEFAULT_ORG;

  if (!primary || !synthetic || !role) {
    return NextResponse.json({ error: 'primary, synthetic, and role are required' }, { status: 400 });
  }

  const db = buildClient();

  // SELECT both records first for verification
  const { data: rows, error: selectErr } = await db
    .from('hotbox_keys')
    .select('key_path, payload')
    .eq('org_id', org)
    .eq('key_type', 'pubkey')
    .in('key_path', [primary, synthetic]);

  if (selectErr) {
    console.error('[dedup-members] SELECT failed', selectErr.message);
    return NextResponse.json({ error: 'select failed', detail: selectErr.message }, { status: 500 });
  }

  const primaryRow = (rows ?? []).find((r: { key_path: string }) => r.key_path === primary);
  const syntheticRow = (rows ?? []).find((r: { key_path: string }) => r.key_path === synthetic);

  if (!primaryRow) {
    return NextResponse.json({ error: `primary '${primary}' not found in hotbox_keys` }, { status: 404 });
  }

  // UPDATE primary's role
  const updatedPayload = { ...(primaryRow.payload as object), role };
  const { error: updateErr } = await db
    .from('hotbox_keys')
    .update({ payload: updatedPayload, updated_at: new Date().toISOString() })
    .eq('org_id', org)
    .eq('key_type', 'pubkey')
    .eq('key_path', primary);

  if (updateErr) {
    console.error('[dedup-members] UPDATE failed', updateErr.message);
    return NextResponse.json({ error: 'update failed', detail: updateErr.message }, { status: 500 });
  }

  // DELETE synthetic (only if it existed)
  let deleted = false;
  if (syntheticRow) {
    const { error: deleteErr } = await db
      .from('hotbox_keys')
      .delete()
      .eq('org_id', org)
      .eq('key_type', 'pubkey')
      .eq('key_path', synthetic);

    if (deleteErr) {
      console.error('[dedup-members] DELETE failed', deleteErr.message);
      return NextResponse.json({ error: 'delete failed', detail: deleteErr.message }, { status: 500 });
    }
    deleted = true;
  }

  console.log('[dedup-members] merged', primary, '→ role:', role, '| synthetic deleted:', deleted);

  return NextResponse.json({
    primary,
    role,
    synthetic,
    syntheticDeleted: deleted,
    primaryPayload: updatedPayload,
  });
}
