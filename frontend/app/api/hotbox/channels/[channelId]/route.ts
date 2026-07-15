import { NextRequest, NextResponse } from 'next/server';
import { getChannelMeta } from '@/lib/hotbox/channel-service';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

export async function GET(req: NextRequest, { params }: { params: { channelId: string } }) {
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  const meta = await getChannelMeta(org, params.channelId);
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(meta);
}
