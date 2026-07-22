import { NextRequest, NextResponse } from 'next/server';
import { presenceMap } from '@/lib/hotbox/presence';
import { resolveAuthScope } from '@/lib/hotbox/auth-scope';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const scope = await resolveAuthScope(req);
  if (!scope.ok) return scope.response;
  return NextResponse.json(Object.fromEntries(presenceMap));
}
