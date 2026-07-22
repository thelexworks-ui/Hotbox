import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, hashPassword, verifyPassword } from '@/lib/fusion/auth';
import { db } from '@/lib/fusion/supabase';

export const runtime = 'nodejs';

// Stored as hotbox_keys payload: key_type='user_prefs', key_path=userId, org_id=org UUID
interface StoredUserPrefs {
  displayName?: string;
  avatarColor?: string;
  phone?: string;
  timezone?: string;
  language?: string;
}

const DEFAULT_COLORS = ['#5ADAEE', '#FFB830', '#4AE88A', '#FF4D4D', '#8B5CF6', '#F97316', '#EC4899', '#3B82F6'];

function extractToken(req: NextRequest): string | null {
  const cookie = req.cookies.get('hx_access')?.value;
  if (cookie) return cookie;
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function loadUserPrefs(orgId: string, userId: string): Promise<StoredUserPrefs> {
  const { data } = await db
    .from('hotbox_keys')
    .select('payload')
    .eq('org_id', orgId)
    .eq('key_type', 'user_prefs')
    .eq('key_path', userId)
    .maybeSingle();
  return (data?.payload as StoredUserPrefs | null) ?? {};
}

async function saveUserPrefs(orgId: string, userId: string, prefs: StoredUserPrefs): Promise<void> {
  await db.from('hotbox_keys').upsert(
    { org_id: orgId, key_type: 'user_prefs', key_path: userId, payload: prefs },
    { onConflict: 'org_id,key_type,key_path' },
  );
}

// GET /api/hotbox/me
export async function GET(req: NextRequest) {
  const jwt =
    req.cookies.get('hx_access')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(jwt); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!claims.member_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [orgRow, userRow, agentRow, prefs] = await Promise.all([
    db.from('orgs').select('id, slug').eq('id', claims.org).maybeSingle(),
    db.from('users').select('id, email, email_verified_at').eq('id', claims.sub).maybeSingle(),
    db.from('agent_accounts').select('name').eq('org_id', claims.org).eq('role', 'headmaster').maybeSingle(),
    loadUserPrefs(claims.org, claims.sub),
  ]);

  if (!orgRow.data) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = userRow.data?.email ?? '';
  const name = agentRow.data?.name ?? claims.member_id;
  const initials = (prefs.displayName ?? name)
    .split(/\s+/)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return NextResponse.json({
    // legacy fields (kept for backward compat)
    memberId:        claims.member_id,
    org:             orgRow.data.slug,
    userId:          claims.sub,
    role:            claims.role,
    name,
    email,
    emailVerifiedAt: userRow.data?.email_verified_at ?? null,
    // UserProfile shape
    id:              claims.sub,
    displayName:     prefs.displayName ?? name,
    avatarColor:     prefs.avatarColor ?? DEFAULT_COLORS[claims.sub.charCodeAt(0) % DEFAULT_COLORS.length],
    avatarInitials:  initials || name.slice(0, 2).toUpperCase(),
    phone:           prefs.phone ?? '',
    timezone:        prefs.timezone ?? 'UTC',
    language:        prefs.language ?? 'en-US',
    has2FA:          false,
    createdAt:       userRow.data?.email_verified_at ?? new Date().toISOString(),
  });
}

// PATCH /api/hotbox/me
// Accepts: { displayName?, avatarColor?, phone?, timezone?, language?, email? }
export async function PATCH(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let claims;
  try { claims = await verifyAccessToken(token); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, string | undefined>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { displayName, avatarColor, phone, timezone, language, email } = body;

  // Update name in agent_accounts if displayName provided
  if (displayName !== undefined) {
    const trimmed = displayName.trim();
    if (!trimmed) return NextResponse.json({ error: 'displayName cannot be empty' }, { status: 400 });
    await db.from('agent_accounts').update({ name: trimmed }).eq('org_id', claims.org).eq('role', 'headmaster');
  }

  // Update email in users if provided
  if (email !== undefined) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    const { data: existing } = await db.from('users').select('id').eq('email', trimmed).neq('id', claims.sub).maybeSingle();
    if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    await db.from('users').update({ email: trimmed, email_verified_at: null }).eq('id', claims.sub);
  }

  // Update extended prefs in hotbox_keys
  if (avatarColor !== undefined || phone !== undefined || timezone !== undefined || language !== undefined || displayName !== undefined) {
    const existing = await loadUserPrefs(claims.org, claims.sub);
    const merged: StoredUserPrefs = {
      ...existing,
      ...(displayName !== undefined ? { displayName: displayName.trim() } : {}),
      ...(avatarColor !== undefined ? { avatarColor } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
      ...(language !== undefined ? { language } : {}),
    };
    await saveUserPrefs(claims.org, claims.sub, merged);
  }

  // Return updated profile
  const [userRow, agentRow, prefs] = await Promise.all([
    db.from('users').select('email, email_verified_at').eq('id', claims.sub).maybeSingle(),
    db.from('agent_accounts').select('name').eq('org_id', claims.org).eq('role', 'headmaster').maybeSingle(),
    loadUserPrefs(claims.org, claims.sub),
  ]);

  const name = agentRow.data?.name ?? '';
  const initials = (prefs.displayName ?? name)
    .split(/\s+/)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return NextResponse.json({
    ok: true,
    displayName:    prefs.displayName ?? name,
    avatarColor:    prefs.avatarColor ?? DEFAULT_COLORS[claims.sub.charCodeAt(0) % DEFAULT_COLORS.length],
    avatarInitials: initials || name.slice(0, 2).toUpperCase(),
    phone:          prefs.phone ?? '',
    timezone:       prefs.timezone ?? 'UTC',
    language:       prefs.language ?? 'en-US',
    email:          userRow.data?.email ?? '',
    emailVerifiedAt: userRow.data?.email_verified_at ?? null,
  });
}
