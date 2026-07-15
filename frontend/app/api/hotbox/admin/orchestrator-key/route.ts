import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validateMasterKey } from '@/lib/hotbox/master-key';

export const runtime = 'nodejs';

function isAuthorized(req: NextRequest): boolean {
  // Server-to-server: any valid master key grants access
  if (validateMasterKey(req.headers.get('x-master-key'))) return true;
  // Cookie: Lex's browser — member must match HOTBOX_MEMBER_ID
  const cookieStore = cookies();
  const memberId = cookieStore.get('hotbox-member-id')?.value;
  const lexId = process.env.HOTBOX_MEMBER_ID;
  return !!(lexId && memberId === lexId);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const privateKey = process.env.ORCHESTRATOR_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: 'ORCHESTRATOR_PRIVATE_KEY not configured' }, { status: 503 });
  }

  return NextResponse.json({ privateKey });
}
