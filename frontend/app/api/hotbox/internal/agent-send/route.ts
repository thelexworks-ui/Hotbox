import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { createCipheriv, randomBytes } from 'node:crypto';
import { loadChannelKey } from '@/lib/hotbox/keys-store';
import { appendMessage } from '@/lib/hotbox/channel-service';
import type { AegisEnvelope } from '@/lib/hotbox/types';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

function encryptPlaintext(ckBase64: string, channelId: string, plaintext: string): AegisEnvelope {
  const key = Buffer.from(ckBase64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 2,
    alg: 'aes-256-gcm',
    kid: channelId,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export async function POST(req: NextRequest) {
  const jwtSecret = process.env.HOTBOX_JWT_SECRET;
  if (!jwtSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // Bearer JWT verification — agents call this endpoint, no browser cookie
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let agentId: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    if (payload.role !== 'agent') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    agentId = String(payload.sub ?? payload.agent_id ?? '');
    if (!agentId) throw new Error('missing sub');
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const body = await req.json() as { channel_id: string; plaintext: string; org?: string };
  const { channel_id, plaintext, org = DEFAULT_ORG } = body;

  if (!channel_id || !plaintext) {
    return NextResponse.json({ error: 'channel_id and plaintext required' }, { status: 400 });
  }

  const ck = await loadChannelKey(org, channel_id);
  if (!ck) {
    return NextResponse.json({ error: 'Channel key not found — channel may not exist' }, { status: 404 });
  }

  const envelope = encryptPlaintext(ck, channel_id, plaintext);
  const msg = await appendMessage(org, channel_id, { senderId: agentId, envelope });

  // Fire-and-forget Railway fanout (same pattern as messages/route.ts)
  const wsUrl = process.env.HOTBOX_WS_INTERNAL_URL ?? 'http://localhost:8080';
  const internalSecret = process.env.HOTBOX_INTERNAL_SECRET;
  if (internalSecret) {
    fetch(`${wsUrl}/internal/fanout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ org, channelId: channel_id, excludeSenderId: agentId, message: { type: 'msg.new', message: msg } }),
    }).catch((err) => console.warn('[agent-send] fanOut failed:', err));
  }

  return NextResponse.json({ id: msg.id, ts: msg.ts }, { status: 201 });
}
