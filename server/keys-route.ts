/**
 * hotbox-keys-route.ts
 * Next.js App Router API route: /api/hotbox/keys
 * Drop into hepha-web/src/app/api/hotbox/keys/route.ts
 *
 * GET  /api/hotbox/keys?chat=<channelId>
 *   Returns caller's wrapped key bundle for the chat: { wk, epk, wiv }
 *   Requires: Authorization: Bearer <org-scoped JWT>
 *
 * POST /api/hotbox/keys
 *   Body A — publish member public key:
 *     { publicKey: base64 }
 *   Body B — store wrapped key bundle (orchestrator wraps CK for a member):
 *     { chatId, memberId, wk, epk, wiv }
 *   Requires: Authorization: Bearer <org-scoped JWT>
 *   POST body B additionally requires: caller must be orchestrator member_id OR
 *   ADMIN_PASSWORD header (for bootstrap scenarios).
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  storeMemberPublicKey,
  getMemberPublicKey,
  storeWrappedKey,
  getWrappedKey,
  type WrappedKeyPost,
} from './hotbox-keys-service';

// --------------------------------------------------------------------------
// JWT auth (same verifyJwt as ws-server — no external dep)
// --------------------------------------------------------------------------

const JWT_SECRET = process.env.HOTBOX_JWT_SECRET ?? 'dev-secret-change-in-prod';

interface JwtPayload {
  org_id: string;
  member_id: string;
  exp?: number;
}

function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (expected !== sigB64) return null;
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as JwtPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.org_id || !payload.member_id) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCallerJwt(req: NextRequest): JwtPayload | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return verifyJwt(auth.slice(7));
  return null;
}

// --------------------------------------------------------------------------
// GET /api/hotbox/keys?chat=<channelId>
// Returns caller's wrapped key bundle for the requested chat
// --------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = getCallerJwt(req);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get('chat');

  if (!chatId) {
    return NextResponse.json({ error: 'Missing ?chat= parameter' }, { status: 400 });
  }

  const bundle = getWrappedKey(caller.org_id, chatId, caller.member_id);
  if (!bundle) {
    return NextResponse.json({ error: 'No wrapped key for this chat' }, { status: 404 });
  }

  // Return only the fields the client needs to unwrap CK
  return NextResponse.json({
    chat_id: bundle.chat_id,
    wk:  bundle.wk,
    epk: bundle.epk,
    wiv: bundle.wiv,
  });
}

// --------------------------------------------------------------------------
// POST /api/hotbox/keys
// Body A: { publicKey: string }           → register member pubkey
// Body B: { chatId, memberId, wk, epk, wiv } → store wrapped bundle
// --------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = getCallerJwt(req);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Body A: member publishing their own public key
  if ('publicKey' in body) {
    const publicKey = body.publicKey as string;
    if (typeof publicKey !== 'string' || !publicKey) {
      return NextResponse.json({ error: 'publicKey must be a non-empty string' }, { status: 400 });
    }
    storeMemberPublicKey(caller.org_id, caller.member_id, publicKey);
    return NextResponse.json({ ok: true, member_id: caller.member_id });
  }

  // Body B: store wrapped key bundle
  // Only orchestrator or ADMIN_PASSWORD bearer may wrap keys for others
  if ('chatId' in body && 'memberId' in body && 'wk' in body && 'epk' in body && 'wiv' in body) {
    const adminPassword = process.env.HOTBOX_ADMIN_PASSWORD;
    const adminHeader   = req.headers.get('x-admin-password');
    const isOrchestrator = caller.member_id === 'orchestrator';
    const isAdmin = adminPassword && adminHeader === adminPassword;

    if (!isOrchestrator && !isAdmin) {
      return NextResponse.json(
        { error: 'Only orchestrator or admin may store wrapped keys' },
        { status: 403 },
      );
    }

    const post: WrappedKeyPost = {
      chatId:    body.chatId    as string,
      memberId:  body.memberId  as string,
      wk:        body.wk        as string,
      epk:       body.epk       as string,
      wiv:       body.wiv       as string,
    };

    if (!post.chatId || !post.memberId || !post.wk || !post.epk || !post.wiv) {
      return NextResponse.json({ error: 'Missing required fields: chatId, memberId, wk, epk, wiv' }, { status: 400 });
    }

    storeWrappedKey(caller.org_id, post);
    return NextResponse.json({ ok: true, chat_id: post.chatId, member_id: post.memberId });
  }

  return NextResponse.json(
    { error: 'Body must be { publicKey } or { chatId, memberId, wk, epk, wiv }' },
    { status: 400 },
  );
}
