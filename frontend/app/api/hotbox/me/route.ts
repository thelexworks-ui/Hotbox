import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = cookies();

  // Path 1: JWT via hx_access cookie (new auth)
  const accessCookie = cookieStore.get('hx_access');
  if (accessCookie?.value) {
    try {
      const claims = await verifyAccessToken(accessCookie.value);
      if (claims.member_id) {
        const { data: orgRow } = await db.from('orgs').select('slug').eq('id', claims.org).maybeSingle();
        return NextResponse.json({
          memberId: claims.member_id,
          org: orgRow?.slug ?? process.env.HOTBOX_ORG ?? 'toadsage',
          userId: claims.sub,
          role: claims.role,
        });
      }
    } catch {
      // Token expired or invalid — fall through to legacy path
    }
  }

  // Path 2: Legacy invite-code cookie (HOTBOXBETA beta path)
  const sessionCookie = cookieStore.get('hotbox-member-id');
  const memberId =
    sessionCookie?.value ||
    process.env.HOTBOX_MEMBER_ID ||
    `user:${process.env.HOTBOX_ORG ?? 'local'}`;
  const org = process.env.HOTBOX_ORG ?? 'toadsage';

  return NextResponse.json({ memberId, org });
}
