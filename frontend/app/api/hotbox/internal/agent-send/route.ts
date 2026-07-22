import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadChannelKey } from '@/lib/hotbox/keys-store';
import { appendMessage } from '@/lib/hotbox/channel-service';
import type { AegisEnvelope } from '@/lib/hotbox/types';

export const runtime = 'nodejs';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function verifyAgentJwt(token: string, secret: string): { sub: string; role: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;

  // Verify signature — constant-time compare to prevent timing attacks
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(b64urlDecode(payload).toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp < now) return null;

  return { sub: String(claims.sub ?? ''), role: String(claims.role ?? '') };
}

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

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const claims = verifyAgentJwt(token, jwtSecret);
  if (!claims || claims.role !== 'agent' || !claims.sub) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const agentId = claims.sub;
  const body = await req.json() as { channel_id: string; plaintext: string; org?: string; keys_org?: string };
  const { channel_id, plaintext, org = DEFAULT_ORG, keys_org = org } = body;

  if (!channel_id || !plaintext) {
    return NextResponse.json({ error: 'channel_id and plaintext required' }, { status: 400 });
  }

  // keys_org separates CK namespace from message-storage org (needed when client keys live in a
  // different org than the JWT-scoped message store, e.g. toadsage keys + optimus messages).
  const ck = await loadChannelKey(keys_org, channel_id);
  if (!ck) {
    return NextResponse.json({ error: 'Channel key not found' }, { status: 404 });
  }

  const envelope = encryptPlaintext(ck, channel_id, plaintext);
  const msg = await appendMessage(org, channel_id, { senderId: agentId, envelope });

  const wsUrl = process.env.HOTBOX_WS_INTERNAL_URL ?? 'http://localhost:8080';
  const internalSecret = process.env.HOTBOX_INTERNAL_SECRET;
  if (internalSecret) {
    fetch(`${wsUrl}/internal/fanout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ org, channelId: channel_id, excludeSenderId: agentId, message: { type: 'msg.new', message: msg } }),
    }).catch((err: unknown) => console.warn('[agent-send] fanOut failed:', err));
  }

  return NextResponse.json({ id: msg.id, ts: msg.ts }, { status: 201 });
}
