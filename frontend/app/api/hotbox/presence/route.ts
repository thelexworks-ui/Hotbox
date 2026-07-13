import { NextResponse } from 'next/server';
import { presenceMap } from '@/lib/hotbox/presence';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(Object.fromEntries(presenceMap));
}
