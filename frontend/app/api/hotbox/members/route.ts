import { NextRequest, NextResponse } from 'next/server';
import { listAllMemberDetails } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  try {
    const members = await listAllMemberDetails(org);
    return NextResponse.json(members);
  } catch {
    return NextResponse.json({ error: 'member list failed' }, { status: 500 });
  }
}
