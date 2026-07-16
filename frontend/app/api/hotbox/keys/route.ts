import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { persistenceProbe, loadChannelKey, storeChannelKey } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

export async function GET(req: NextRequest) {
  // Finding 4: identity check — must present a member-id cookie.
  // Prevents unauthenticated key fetch. Middleware also enforces this at the edge;
  // this is defense-in-depth at the handler layer.
  const memberId = req.cookies.get('hotbox-member-id')?.value;
  if (!memberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await persistenceProbe;
  } catch {
    return NextResponse.json({ error: 'Key storage unavailable' }, { status: 503 });
  }

  const chat = req.nextUrl.searchParams.get('chat');
  const org  = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;

  if (!chat) {
    return NextResponse.json({ error: 'chat param required' }, { status: 400 });
  }

  try {
    let ck = await loadChannelKey(org, chat);
    if (!ck) {
      // Self-heal: channel exists but key was never written (fire-and-forget race at
      // create time, or channel predates the server-key pivot). Generate and store now.
      ck = randomBytes(32).toString('base64');
      await storeChannelKey(org, chat, ck);
      console.log('[keys-route] auto-generated missing CK for channel:', chat);
    }
    return NextResponse.json({ ck });
  } catch {
    return NextResponse.json({ error: 'key lookup failed' }, { status: 500 });
  }
}
