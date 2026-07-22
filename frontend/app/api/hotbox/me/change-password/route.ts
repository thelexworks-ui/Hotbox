import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, verifyPassword, hashPassword } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

// POST /api/hotbox/me/change-password
// Body: { current: string, new: string }
export async function POST(req: NextRequest) {
  const jwt =
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { current?: string; new?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.current || !body.new) {
    return NextResponse.json({ error: 'current and new required' }, { status: 400 });
  }
  if (body.new.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const { data: user } = await db
    .from('users')
    .select('password_hash')
    .eq('id', claims.sub)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const valid = await verifyPassword(body.current, user.password_hash);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  const newHash = await hashPassword(body.new);
  const { error } = await db.from('users').update({ password_hash: newHash }).eq('id', claims.sub);
  if (error) {
    console.error('[change-password] update failed:', error);
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
