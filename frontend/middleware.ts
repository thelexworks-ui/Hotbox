import { NextRequest, NextResponse } from 'next/server';

// Routes exempt from member-id auth (login flow + master-key admin only).
// ws-token is NOT exempt — it must see a valid member-id cookie to issue a JWT.
const PUBLIC_API_PREFIXES = [
  '/api/hotbox/login',
  '/api/hotbox/admin/',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API guard (Findings 6+7): all /api/hotbox/* require a member-id cookie except
  // login/token/admin paths. Returns 401 so the client can redirect to /login.
  if (pathname.startsWith('/api/hotbox/')) {
    const isPublic = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
    if (!isPublic) {
      const memberId = req.cookies.get('hotbox-member-id')?.value;
      if (!memberId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.next();
  }

  // Page guard: channel + DM pages require auth → redirect to /login
  const memberId = req.cookies.get('hotbox-member-id')?.value;
  if (!memberId) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/channels/:path*', '/dm/:path*', '/api/hotbox/:path*'],
};
