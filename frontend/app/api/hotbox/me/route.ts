import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

// MVP: derive member_id from the hotbox-session cookie (set at login).
// Falls back to HOTBOX_MEMBER_ID env var for local dev.
// v2: replace with iron-session or org JWT verification.
export async function GET() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('hotbox-member-id');

  const memberId =
    sessionCookie?.value ||
    process.env.HOTBOX_MEMBER_ID ||
    `user:${process.env.HOTBOX_ORG ?? 'local'}`;

  const org = process.env.HOTBOX_ORG ?? 'toadsage';

  return NextResponse.json({ memberId, org });
}
