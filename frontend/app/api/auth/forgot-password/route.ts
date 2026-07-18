import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { generateRefreshToken, hashRefreshToken } from '@/lib/fusion/auth';
import { sendEmail } from '@/lib/fusion/email';

export const runtime = 'nodejs';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { email } = body;
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const { data: user } = await db.from('users').select('id, email').eq('email', email).maybeSingle();

  // Always return 200 to prevent email enumeration
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  // Invalidate any prior unused reset tokens for this user
  await db.from('password_reset_tokens').delete().eq('user_id', user.id).is('used_at', null);

  const rawToken = generateRefreshToken(); // 48-byte base64url
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

  const { error: insertErr } = await db.from('password_reset_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (insertErr) {
    console.error('[forgot-password] token insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create reset token' }, { status: 500 });
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://hotbox-seven.vercel.app';
  const resetUrl = `${origin}/auth/set-new-password?token=${rawToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Reset your Hotbox password',
      html: `<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>If you did not request this, ignore this email.</p>`,
    });
  } catch (err) {
    console.error('[forgot-password] email send failed:', err);
    // Don't leak: still return ok. Admin can extract link from server logs.
  }

  return NextResponse.json({ ok: true });
}
