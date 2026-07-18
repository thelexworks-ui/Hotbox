import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { hashPassword, hashRefreshToken } from '@/lib/fusion/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { token, password } = body;
  if (!token || !password) return NextResponse.json({ error: 'token and password required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'password must be at least 8 characters' }, { status: 400 });

  const tokenHash = hashRefreshToken(token);
  const { data: rt } = await db
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!rt || rt.used_at || new Date(rt.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const { error: updateErr } = await db
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', rt.user_id);

  if (updateErr) {
    console.error('[reset-password] password update failed:', updateErr);
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
  }

  // Mark token consumed
  await db.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', rt.id);

  // Invalidate all refresh tokens for this user (security: new password = new sessions)
  await db.from('refresh_tokens').delete().eq('user_id', rt.user_id);

  return NextResponse.json({ ok: true });
}
