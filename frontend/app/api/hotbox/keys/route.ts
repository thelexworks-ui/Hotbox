import { NextRequest, NextResponse } from 'next/server';
import { persistenceProbe, loadChannelKey } from '@/lib/hotbox/keys-store';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

export async function GET(req: NextRequest) {
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
    const ck = await loadChannelKey(org, chat);
    if (!ck) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ck });
  } catch {
    return NextResponse.json({ error: 'key lookup failed' }, { status: 500 });
  }
}
