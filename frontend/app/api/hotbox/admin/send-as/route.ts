import { NextRequest, NextResponse } from 'next/server';
import { webcrypto } from 'node:crypto';
import { validateMasterKey, type MasterKeyRole } from '@/lib/hotbox/master-key';
import { loadWrappedBundle } from '@/lib/hotbox/keys-store';
import { appendMessage, createChannel, channelExists } from '@/lib/hotbox/channel-service';
import type { AegisEnvelope } from '@/lib/hotbox/types';

export const runtime = 'nodejs';

const { subtle } = webcrypto;
const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

// Convert standard base64 → base64url (JWK `d` and `x` fields require base64url)
function b64ToB64url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function getSenderKeys(role: MasterKeyRole): { privB64: string; pubB64: string } | null {
  if (role === 'orchestrator') {
    const privB64 = process.env.ORCHESTRATOR_PRIVATE_KEY;
    const pubB64  = process.env.ORCHESTRATOR_PUBLIC_KEY;
    if (!privB64 || !pubB64) return null;
    return { privB64, pubB64 };
  }
  if (role === 'headmaster') {
    const privB64 = process.env.HEADMASTER_PRIVATE_KEY;
    const pubB64  = process.env.HEADMASTER_PUBLIC_KEY;
    if (!privB64 || !pubB64) return null;
    return { privB64, pubB64 };
  }
  return null;
}

async function serverUnwrapCK(
  chatId: string,
  memberId: string,
  privB64: string,
  pubB64: string,
  bundle: { wk: string; epk: string; wiv: string },
): Promise<Uint8Array> {
  // Reconstruct X25519 private key as JWK (requires both d + x)
  const privKey = await subtle.importKey(
    'jwk',
    { kty: 'OKP', crv: 'X25519', d: b64ToB64url(privB64), x: b64ToB64url(pubB64) },
    { name: 'X25519' },
    false,
    ['deriveKey', 'deriveBits'],
  );

  // Import ephemeral public key (raw X25519)
  const epkKey = await subtle.importKey('raw', b64ToBytes(bundle.epk), { name: 'X25519' }, false, []);

  // ECDH shared secret
  const sharedBits = await subtle.deriveBits({ name: 'X25519', public: epkKey }, privKey, 256);

  // HKDF → wrapping key (must match client: salt=32 zero bytes, info=hotbox-ck:<chatId>:<memberId>)
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const wrapKey = await subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(`hotbox-ck:${chatId}:${memberId}`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['unwrapKey'],
  );

  // AES-GCM unwrap → raw CK bytes
  const ck = await subtle.unwrapKey(
    'raw',
    b64ToBytes(bundle.wk),
    wrapKey,
    { name: 'AES-GCM', iv: b64ToBytes(bundle.wiv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  );

  return new Uint8Array(await subtle.exportKey('raw', ck));
}

async function aegisEncrypt(ckBytes: Uint8Array, channelId: string, plaintext: string): Promise<AegisEnvelope> {
  const ck = await subtle.importKey('raw', ckBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, ck, new TextEncoder().encode(plaintext)));
  // WebCrypto AES-GCM output = ciphertext || 16-byte auth tag
  const ciphertext = enc.slice(0, enc.length - 16);
  const tag = enc.slice(enc.length - 16);
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
// Body: { channel: string, content: string, sender?: "orchestrator" | "headmaster", org?: string }
// X-Master-Key header: determines sender identity (orchestrator key → sender=orchestrator)
//
// Requires a wrapped CK bundle already stored for this channel+sender.
// If the channel does not exist in hotbox_channels it is auto-created (DM channels).
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

  const senderKeys = getSenderKeys(masterRole);
  if (!senderKeys) {
    return NextResponse.json(
      { error: `${masterRole} private/public key not configured in env` },
      { status: 503 },
    );
  }

  // Auto-create channel if needed (idempotent — handles DM channels not yet in hotbox_channels)
  if (!(await channelExists(org, channel))) {
    const type = channel.startsWith('dm-') ? 'dm' : 'topic';
    await createChannel({ org, name: channel, type }).catch(() => {/* race — already exists */});
  }

  // Load wrapped bundle for sender in this channel
  const bundle = await loadWrappedBundle(org, channel, masterRole);
  if (!bundle) {
    return NextResponse.json(
      {
        error: 'no wrapped key bundle for sender in this channel',
        hint: 'Have a member open the channel to initialize the CK, then retry.',
      },
      { status: 404 },
    );
  }

  // Server-side unwrap → encrypt
  let envelope: AegisEnvelope;
  try {
    const ckBytes = await serverUnwrapCK(channel, masterRole, senderKeys.privB64, senderKeys.pubB64, bundle);
    envelope = await aegisEncrypt(ckBytes, channel, content.trim());
  } catch (err) {
    console.error('[send-as] crypto failed', err);
    return NextResponse.json({ error: 'crypto error — key mismatch or corrupted bundle' }, { status: 500 });
  }

  // Store message
  const msg = await appendMessage(org, channel, { senderId: masterRole, envelope });
  console.log('[send-as] sent as', masterRole, '→', channel, 'msg_id:', msg.id);

  return NextResponse.json(msg, { status: 201 });
}
