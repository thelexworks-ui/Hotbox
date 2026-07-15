import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Pubkey ceremony removed — server now holds symmetric channel keys.
// Agent key registration is no longer required.
export async function POST() {
  return NextResponse.json({ error: 'pubkey ceremony removed — server now holds symmetric channel keys' }, { status: 410 });
}
