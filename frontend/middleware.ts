import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const memberId = req.cookies.get('hotbox-member-id')?.value;
  if (!memberId) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/channels/:path*', '/dm/:path*'],
};
