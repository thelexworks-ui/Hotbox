import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const VALID_CODES = (process.env.HOTBOX_INVITE_CODES ?? 'HOTBOXBETA')
  .split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

export async function POST(req: NextRequest) {
  const body = await req.json() as { code?: string; name?: string };
  const { code, name } = body;

  if (!code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'Invite code and name are required' }, { status: 400 });
  }
  if (!VALID_CODES.includes(code.trim().toUpperCase())) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 401 });
  }

  // Slugify name for use as member_id (preserves readability in channel feeds)
  const memberId = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const res = NextResponse.json({ ok: true, memberId });
  res.cookies.set('hotbox-member-id', memberId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
