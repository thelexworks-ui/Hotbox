import { NextRequest, NextResponse } from 'next/server';
import { webcrypto } from 'node:crypto';
import { validateMasterKey } from '@/lib/hotbox/master-key';
import { loadChannelKey, storeChannelKey } from '@/lib/hotbox/keys-store';
import { appendMessage, createChannel, channelExists } from '@/lib/hotbox/channel-service';
import type { AegisEnvelope } from '@/lib/hotbox/types';

export const runtime = 'nodejs';

const { subtle } = webcrypto;
const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function aegisEncrypt(ckB64: string, channelId: string, plaintext: string): Promise<AegisEnvelope> {
  const ck = await subtle.importKey('raw', b64ToBytes(ckB64), { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, ck, new TextEncoder().encode(plaintext)));
  const ciphertext = enc.slice(0, enc.length - 16);
  const tag        = enc.slice(enc.length - 16);
  return {
    v: 2,
    alg: 'aes-256-gcm',
    kid: channelId,
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(ciphertext),
    tag: bytesToB64(tag),
  };
}

// POST /api/hotbox/admin/send-as
// Body: { channel: string, content: string, org?: string }
// X-Master-Key header required (orchestrator or headmaster)
export async function POST(req: NextRequest) {
  const masterRole = validateMasterKey(req.headers.get('x-master-key'));
  if (!masterRole) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { channel?: string; content?: string; org?: string };
  const { channel, content } = body;
  const org = body.org ?? DEFAULT_ORG;

  if (!channel || !content?.trim()) {
    return NextResponse.json({ error: 'channel and content are required' }, { status: 400 });
  }

  // Auto-create channel if needed (idempotent — handles DM channels not yet in hotbox_channels)
  if (!(await channelExists(org, channel))) {
    const type = channel.startsWith('dm-') ? 'dm' : 'topic';
    await createChannel({ org, name: channel, type }).catch(() => {/* race — already exists */});
  }

  // Fetch server-held channel key; auto-generate if missing (pre-pivot channel or lost race)
  let ckB64 = await loadChannelKey(org, channel);
  if (!ckB64) {
    ckB64 = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');
    await storeChannelKey(org, channel, ckB64);
    console.log('[send-as] auto-generated missing CK for channel:', channel);
  }

  let envelope: AegisEnvelope;
  try {
    envelope = await aegisEncrypt(ckB64, channel, content.trim());
  } catch (err) {
    console.error('[send-as] crypto failed', err);
    return NextResponse.json({ error: 'encryption error' }, { status: 500 });
  }

  const msg = await appendMessage(org, channel, { senderId: masterRole, envelope });
  console.log('[send-as] sent as', masterRole, '→', channel, 'msg_id:', msg.id);

  return NextResponse.json(msg, { status: 201 });
}
