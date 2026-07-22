import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { verifyAccessToken } from '@/lib/fusion/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('hx_access')?.value;

  // Always clear the cookie, even if the token is absent or expired
  const clear = () => {
    const res = NextResponse.json({ ok: true });
    res.cookies.set('hx_access', '', { maxAge: 0, path: '/' });
    return res;
  };

  if (!token) return clear();

  let userId: string;
  try {
    const claims = await verifyAccessToken(token);
    userId = claims.sub;
  } catch {
    return clear();
  }

  // Delete all refresh tokens for this user (user_id is the UUID from JWT sub)
  await db.from('refresh_tokens').delete().eq('user_id', userId);

  return clear();
}
