import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { storePublicKey, loadPublicKey, storeWrappedBundle, loadWrappedBundle } from '@/lib/hotbox/channel-service';

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
  const chat = req.nextUrl.searchParams.get('chat');
  const member = req.nextUrl.searchParams.get('member');
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;

  // Public key lookup: /api/hotbox/keys?member=<memberId>
  if (member && !chat) {
    const publicKey = loadPublicKey(org, member);
    if (!publicKey) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ memberId: member, publicKey });
  }

  // Wrapped bundle lookup: /api/hotbox/keys?chat=<chatId>[&member=<memberId>]
  if (chat) {
    const memberId = member ?? getRequestingMemberId();
    const bundle = loadWrappedBundle(org, chat, memberId);
    if (!bundle) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(bundle);
  }

  return NextResponse.json({ error: 'chat or member param required' }, { status: 400 });
}

export async function POST(req: NextRequest) {
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
    storeWrappedBundle(org, body.chatId, memberId, body.wk, body.epk, body.wiv);
    return NextResponse.json({ ok: true });
  }

  // Public key registration: { memberId, publicKey }
  if (body.memberId && body.publicKey) {
    storePublicKey(org, body.memberId, body.publicKey);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'provide {memberId, publicKey} or {chatId, memberId, wk, epk, wiv}' }, { status: 400 });
}
