import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { hashRefreshToken } from '@/lib/fusion/auth';

export const runtime = 'nodejs';

// GET /api/auth/verify-email?token=<rawToken>
// Called when user clicks the verification link.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const tokenHash = hashRefreshToken(token);
  const { data: vt } = await db
    .from('email_verification_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!vt || vt.used_at || new Date(vt.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired verification link' }, { status: 400 });
  }

  await db.from('users').update({ email_verified_at: new Date().toISOString() }).eq('id', vt.user_id);
  await db.from('email_verification_tokens').update({ used_at: new Date().toISOString() }).eq('id', vt.id);

  // Redirect to verified success page
  return NextResponse.redirect(new URL('/auth/verify-email-success', req.url));
}
