import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { generateRefreshToken, hashRefreshToken, verifyAccessToken } from '@/lib/fusion/auth';
import { sendEmail } from '@/lib/fusion/email';

export const runtime = 'nodejs';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function extractToken(req: NextRequest): string | null {
  const cookieToken = req.cookies.get('hx_access')?.value;
  if (cookieToken) return cookieToken;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function POST(req: NextRequest) {
  const accessToken = extractToken(req);
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(accessToken); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user } = await db.from('users').select('id, email, email_verified_at').eq('id', claims.sub).maybeSingle();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.email_verified_at) return NextResponse.json({ ok: true, alreadyVerified: true });

  // Invalidate prior unused verification tokens
  await db.from('email_verification_tokens').delete().eq('user_id', user.id).is('used_at', null);

  const rawToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS).toISOString();

  const { error: insertErr } = await db.from('email_verification_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (insertErr) {
    console.error('[send-verification] insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create verification token' }, { status: 500 });
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://hotbox-seven.vercel.app';
  const verifyUrl = `${origin}/api/auth/verify-email?token=${rawToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Verify your Hotbox email',
      html: `<p>Click the link below to verify your email address.</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>This link expires in 24 hours.</p>`,
    });
  } catch (err) {
    console.error('[send-verification] email send failed:', err);
  }

  // SMOKE_TOKENS gate: preview-only, origin-gated. Never reaches prod (env not set there).
  if (process.env.SMOKE_TOKENS === '1' && req.headers.get('origin') === 'https://apollo-test.invalid') {
    return NextResponse.json({ ok: true, smokeTokens: { verifyToken: rawToken, verifyUrl } });
  }

  return NextResponse.json({ ok: true });
}
