import { NextRequest, NextResponse } from 'next/server';
import { readMessages, appendMessage } from '@/lib/hotbox/channel-service';
import type { AegisEnvelope, AnyMessage, HotboxMessage } from '@/lib/hotbox/types';

function isChatMsg(m: AnyMessage): m is HotboxMessage {
  return m.type === 'message';
}

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

export async function GET(req: NextRequest, { params }: { params: { channelId: string } }) {
  const org = req.nextUrl.searchParams.get('org') ?? DEFAULT_ORG;
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100);
  const threadParentId = req.nextUrl.searchParams.get('thread') ?? undefined;

  const msgs = readMessages(org, params.channelId, limit) as AnyMessage[];

  if (threadParentId) {
    return NextResponse.json(msgs.filter((m) => isChatMsg(m) && m.thread_parent_id === threadParentId));
  }
  // Top-level messages only (no thread replies in main feed); system messages always pass through
  return NextResponse.json(msgs.filter((m) => !isChatMsg(m) || !m.thread_parent_id));
}

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const body = await req.json() as { crypto_envelope: AegisEnvelope; sender_id: string; thread_parent_id?: string; org?: string };
  const { crypto_envelope, sender_id, thread_parent_id } = body;
  const org = body.org ?? DEFAULT_ORG;

  if (!crypto_envelope || !sender_id) {
    return NextResponse.json({ error: 'crypto_envelope and sender_id required' }, { status: 400 });
  }

  const msg = appendMessage(org, params.channelId, {
    senderId: sender_id,
    envelope: crypto_envelope,
    threadParentId: thread_parent_id,
  });

  return NextResponse.json(msg, { status: 201 });
}
