import { NextRequest, NextResponse } from 'next/server';

// Routes exempt from member-id auth (login flow + master-key admin only).
// ws-token is NOT exempt — it must see a valid member-id cookie to issue a JWT.
const PUBLIC_API_PREFIXES = [
  '/api/hotbox/login',
  '/api/hotbox/admin/',
  '/api/hotbox/internal/', // agent-to-server calls; each handler verifies Bearer JWT
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Accept legacy invite-code cookie, new JWT cookie, or Authorization: Bearer header.
  // Signature verification is deferred to route handlers (Node runtime); middleware
  // only checks presence so it can run on Edge without jose latency per request.
  const memberId    = req.cookies.get('hotbox-member-id')?.value;
  const jwtAccess   = req.cookies.get('hx_access')?.value;
  const bearerToken = req.headers.get('authorization')?.startsWith('Bearer ')
    ? req.headers.get('authorization')!.slice(7) : undefined;
  const authed = !!(memberId || jwtAccess || bearerToken);

  // API guard: all /api/hotbox/* require auth except login/admin/internal paths.
  if (pathname.startsWith('/api/hotbox/')) {
    const isPublic = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
    if (!isPublic && !authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Page guard: channel + DM pages require auth → redirect to /login
  if (!authed) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/account/:path*', '/channels/:path*', '/dm/:path*', '/api/hotbox/:path*'],
};
