import { NextRequest, NextResponse } from 'next/server';
import { readMessages, appendMessage } from '@/lib/hotbox/channel-service';
import type { AegisEnvelope, AnyMessage, HotboxMessage } from '@/lib/hotbox/types';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';

function isChatMsg(m: AnyMessage): m is HotboxMessage {
  return m.type === 'message';
}

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { channelId: string } }) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 100);
  const threadParentId = req.nextUrl.searchParams.get('thread') ?? undefined;

  const msgs = await readMessages(scope.org, params.channelId, limit);

  let filtered: AnyMessage[];
  if (threadParentId) {
    filtered = msgs.filter((m) => isChatMsg(m) && m.thread_parent_id === threadParentId);
  } else {
    filtered = msgs.filter((m) => !isChatMsg(m) || !m.thread_parent_id);
  }

  const res = NextResponse.json(filtered);
  if (scope.masterRole) res.headers.set('X-Role', scope.masterRole);
  return res;
}

const WS_INTERNAL_URL = process.env.HOTBOX_WS_INTERNAL_URL ?? 'http://localhost:8080';
const INTERNAL_SECRET  = process.env.HOTBOX_INTERNAL_SECRET;

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;

  const body = await req.json() as { crypto_envelope: AegisEnvelope; sender_id: string; thread_parent_id?: string; org?: string };
  const { crypto_envelope, sender_id, thread_parent_id } = body;
  const org = scope.org; // always from auth scope; ignore caller-supplied body.org

  if (!crypto_envelope || !sender_id) {
    return NextResponse.json({ error: 'crypto_envelope and sender_id required' }, { status: 400 });
  }

  const msg = await appendMessage(org, params.channelId, {
    senderId: sender_id,
    envelope: crypto_envelope,
    threadParentId: thread_parent_id,
  });

  // Push msg.new to WS subscribers via internal fanOut endpoint.
  // Fire-and-forget — response already returned; log failures but never block.
  if (INTERNAL_SECRET) {
    fetch(`${WS_INTERNAL_URL}/internal/fanout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ org, channelId: params.channelId, excludeSenderId: sender_id, message: { type: 'msg.new', message: msg } }),
    }).then((r) => {
      if (!r.ok) console.warn(`[messages-route] internal fanOut rejected: ${r.status} ${r.statusText} (${WS_INTERNAL_URL})`);
    }).catch((err) => console.warn('[messages-route] internal fanOut failed:', err));
  } else {
    console.warn('[messages-route] HOTBOX_INTERNAL_SECRET not set — WS fanOut skipped on HTTP fallback');
  }

  return NextResponse.json(msg, { status: 201 });
}
