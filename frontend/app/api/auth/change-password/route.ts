import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken, verifyPassword, hashPassword } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

function extractToken(req: NextRequest): string | null {
  const cookieToken = cookies().get('hx_access')?.value;
  if (cookieToken) return cookieToken;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(token); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'currentPassword and newPassword required' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'newPassword must be at least 8 characters' }, { status: 400 });
  }

  const { data: user } = await db
    .from('users')
    .select('id, password_hash')
    .eq('id', claims.sub)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const match = await verifyPassword(currentPassword, user.password_hash);
  if (!match) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  const newHash = await hashPassword(newPassword);

  const { error: updateErr } = await db
    .from('users')
    .update({ password_hash: newHash, updated_at: new Date().toISOString() })
    .eq('id', user.id);
  if (updateErr) {
    console.error('[change-password] update failed:', updateErr);
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }

  // Invalidate all refresh tokens — all sessions terminated on password change
  await db.from('refresh_tokens').delete().eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
