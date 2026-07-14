import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  persistenceProbe,
  storePublicKey,
  loadPublicKey,
  storeWrappedBundle,
  loadWrappedBundle,
} from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

function getRequestingMemberId(): string {
  const cookieStore = cookies();
  return (
    cookieStore.get('hotbox-member-id')?.value ||
    process.env.HOTBOX_MEMBER_ID ||
    `user:${process.env.HOTBOX_ORG ?? 'local'}`
  );
}

export async function GET(req: NextRequest) {
  try {
    await persistenceProbe;
  } catch {
    return NextResponse.json({ error: 'Key storage unavailable' }, { status: 503 });
  }

  const chat = req.nextUrl.searchParams.get('chat');
  const member = req.nextUrl.searchParams.get('member');
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;

  // Public key lookup: /api/hotbox/keys?member=<memberId>
  if (member && !chat) {
    try {
      const publicKey = await loadPublicKey(org, member);
      if (!publicKey) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json({ memberId: member, publicKey });
    } catch {
      return NextResponse.json({ error: 'key lookup failed' }, { status: 500 });
    }
  }

  // Wrapped bundle lookup: /api/hotbox/keys?chat=<chatId>[&member=<memberId>]
  if (chat) {
    const memberId = member ?? getRequestingMemberId();
    try {
      const bundle = await loadWrappedBundle(org, chat, memberId);
      if (!bundle) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json(bundle);
    } catch {
      return NextResponse.json({ error: 'key lookup failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'chat or member param required' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    await persistenceProbe;
  } catch {
    return NextResponse.json({ error: 'Key storage unavailable' }, { status: 503 });
  }

  const body = await req.json() as {
    memberId?: string;
    publicKey?: string;
    chatId?: string;
    wk?: string;
    epk?: string;
    wiv?: string;
    org?: string;
  };
  const org = body.org ?? DEFAULT_ORG;

  // Wrapped bundle write: { chatId, memberId, wk, epk, wiv }
  if (body.chatId && body.wk && body.epk && body.wiv) {
    const memberId = body.memberId ?? getRequestingMemberId();
    try {
      await storeWrappedBundle(org, body.chatId, memberId, body.wk, body.epk, body.wiv);
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'failed to store wrapped key' }, { status: 500 });
    }
  }

  // Public key registration: { memberId, publicKey }
  // Identity check: caller may only register their own pubkey.
  if (body.memberId && body.publicKey) {
    const requesterId = getRequestingMemberId();
    if (body.memberId !== requesterId) {
      console.warn('[hotbox-keys] pubkey registration rejected — memberId mismatch', {
        attempted: body.memberId, actual: requesterId,
      });
      return NextResponse.json({ error: 'cannot register pubkey for another member' }, { status: 403 });
    }
    try {
      await storePublicKey(org, body.memberId, body.publicKey);
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'failed to store public key' }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: 'provide {memberId, publicKey} or {chatId, memberId, wk, epk, wiv}' },
    { status: 400 },
  );
}
