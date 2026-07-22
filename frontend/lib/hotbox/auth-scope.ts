import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { validateMasterKey, type MasterKeyRole } from '@/lib/hotbox/master-key';
import { db } from '@/lib/fusion/supabase';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

export type AuthScope =
  | { ok: true; masterRole: MasterKeyRole; memberId: null; org: string }
  | { ok: true; masterRole: null; memberId: string; org: string }
  | { ok: false; response: NextResponse };

export async function resolveAuthScope(req: NextRequest, fallbackOrg?: string): Promise<AuthScope> {
  const masterRole = validateMasterKey(req.headers.get('x-master-key'));
  if (masterRole) {
    return { ok: true, masterRole, memberId: null, org: fallbackOrg ?? DEFAULT_ORG };
  }

  // JWT path (hx_access cookie or Bearer header)
  const jwt =
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (jwt) {
    try {
      const claims = await verifyAccessToken(jwt);
      const memberId = claims.member_id ?? null;
      if (!memberId) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
      // Resolve org UUID → slug so caller cannot inject cross-org scope via ?org param.
      const { data: orgRow } = await db.from('orgs').select('slug').eq('id', claims.org).maybeSingle();
      if (!orgRow?.slug) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
      return { ok: true, masterRole: null, memberId, org: orgRow.slug };
    } catch {
      return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
  }

  // Legacy cookie path (pre-fusion invite-code login).
  // Only honour an explicitly-set cookie value — never synthesise a member identity.
  const memberId = req.cookies.get('hotbox-member-id')?.value ?? null;
  if (memberId) {
    return { ok: true, masterRole: null, memberId, org: fallbackOrg ?? DEFAULT_ORG };
  }

  return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
}
