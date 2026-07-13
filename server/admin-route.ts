/**
 * hotbox-admin-route.ts
 * Next.js App Router API route: /api/hotbox/admin/orchestrator-key
 * Drop into hepha-web/src/app/api/hotbox/admin/orchestrator-key/route.ts
 *
 * GET  — returns orchestrator public key for browser-side X25519 encryption
 *          (used by hepha-web client to encrypt CK for orchestrator)
 * POST — registers orchestrator public key (called by boss agent on session start)
 *
 * Both endpoints require X-Admin-Password header matching HOTBOX_ADMIN_PASSWORD env var.
 * This route is intentionally NOT JWT-scoped — orchestrator identity is established
 * via admin password, not an org-scoped member JWT (it predates the keypair bootstrap).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getOrchestratorPublicKey,
  storeOrchestratorPublicKey,
} from './hotbox-keys-service';

function checkAdminAuth(req: NextRequest): boolean {
  const adminPassword = process.env.HOTBOX_ADMIN_PASSWORD;
  if (!adminPassword) return false; // admin route disabled if password not set
  return req.headers.get('x-admin-password') === adminPassword;
}

// --------------------------------------------------------------------------
// GET /api/hotbox/admin/orchestrator-key
// Returns orchestrator public key for browser-side encryption
// --------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // org_id from query param — admin can query any org they have password for
  const { searchParams } = new URL(req.url);
  const org = searchParams.get('org');
  if (!org) {
    return NextResponse.json({ error: 'Missing ?org= parameter' }, { status: 400 });
  }

  const publicKey = getOrchestratorPublicKey(org);
  if (!publicKey) {
    return NextResponse.json({ error: 'Orchestrator public key not registered' }, { status: 404 });
  }

  return NextResponse.json({ public_key: publicKey });
}

// --------------------------------------------------------------------------
// POST /api/hotbox/admin/orchestrator-key
// Boss agent registers its X25519 public key at session start
// Body: { org: string, publicKey: string }
// --------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { org?: string; publicKey?: string };
  try {
    body = await req.json() as { org?: string; publicKey?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.org || !body.publicKey) {
    return NextResponse.json({ error: 'Body must include org and publicKey' }, { status: 400 });
  }

  storeOrchestratorPublicKey(body.org, body.publicKey);
  return NextResponse.json({ ok: true, org: body.org });
}
