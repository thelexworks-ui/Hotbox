import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateMasterKey } from '@/lib/hotbox/master-key';
import { verifyAccessToken } from '@/lib/fusion/auth';

export const runtime = 'nodejs';

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Server-to-server: any valid master key grants access
  if (validateMasterKey(req.headers.get('x-master-key'))) return true;
  // Browser: resolve memberId from hx_access JWT or legacy cookie
  const cookieStore = cookies();
  let memberId: string | null = null;
  const jwt = cookieStore.get('hx_access')?.value;
  if (jwt) {
    try { memberId = (await verifyAccessToken(jwt)).member_id ?? null; } catch { /* expired */ }
  }
  memberId ??= cookieStore.get('hotbox-member-id')?.value ?? null;
  const lexId = process.env.HOTBOX_MEMBER_ID;
  return !!(lexId && memberId === lexId);
}

export async function GET(req: NextRequest) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const privateKey = process.env.ORCHESTRATOR_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: 'ORCHESTRATOR_PRIVATE_KEY not configured' }, { status: 503 });
  }

  return NextResponse.json({ privateKey });
}
