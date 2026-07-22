import { NextRequest, NextResponse } from 'next/server';
import { getChannelMeta } from '@/lib/hotbox/channel-service';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { channelId: string } }) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const meta = await getChannelMeta(scope.org, params.channelId);
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(meta.members ?? []);
}
