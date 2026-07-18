import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/fusion/supabase';
import { verifyAccessToken } from '@/lib/fusion/auth';

// Returns a 403 NextResponse if caller is not email-verified, or null if allowed.
// Use at the top of POST handlers that need verified identity.
export async function requireEmailVerified(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get('hx_access')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(token); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: user } = await db
    .from('users')
    .select('email_verified_at')
    .eq('id', claims.sub)
    .maybeSingle();

  if (!user?.email_verified_at) {
    return NextResponse.json(
      { error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 }
    );
  }

  return null;
}
