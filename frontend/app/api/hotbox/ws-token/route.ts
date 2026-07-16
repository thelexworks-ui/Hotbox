import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const runtime = 'nodejs';

// Validated at server startup via instrumentation.ts — guaranteed non-null here.
// Handler-level guard below is defense-in-depth.
const JWT_SECRET = process.env.HOTBOX_JWT_SECRET ?? '';
const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

function b64url(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64url');
}

function makeJwt(orgId: string, memberId: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    org_id: orgId,
    member_id: memberId,
    exp: Math.floor(Date.now() / 1000) + 3600, // 1h
  }));
  const sig = b64url(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

export async function GET() {
  if (!JWT_SECRET) {
    console.error('[ws-token] HOTBOX_JWT_SECRET is not set — refusing to issue token');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const cookieStore = cookies();
  const memberId =
    cookieStore.get('hotbox-member-id')?.value ||
    process.env.HOTBOX_MEMBER_ID ||
    `user:${DEFAULT_ORG}`;

  const token = makeJwt(DEFAULT_ORG, memberId);
  return NextResponse.json({ token });
}
