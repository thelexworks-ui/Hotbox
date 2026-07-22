import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

// POST /api/hotbox/issues
// Body: { description: string, url?: string, userAgent?: string, diagnostics?: unknown }
export async function POST(req: NextRequest) {
  const jwt =
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { description?: string; url?: string; userAgent?: string; diagnostics?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.description?.trim()) {
    return NextResponse.json({ error: 'description required' }, { status: 400 });
  }

  const payload = {
    userId: claims.sub,
    org: claims.org,
    description: body.description.trim(),
    url: body.url ?? null,
    userAgent: body.userAgent ?? null,
    diagnostics: body.diagnostics ?? null,
    submittedAt: new Date().toISOString(),
  };

  // Log to activity bus for agent triage (hepha-web or clank inbox)
  try {
    await db.from('hotbox_keys').upsert(
      {
        org_id: claims.org,
        key_type: 'issue_report',
        key_path: `${claims.sub}-${Date.now()}`,
        payload,
      },
      { onConflict: 'org_id,key_type,key_path' },
    );
  } catch (err) {
    console.error('[issues] failed to store issue report:', err);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
