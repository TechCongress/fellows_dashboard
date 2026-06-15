import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const auth = req.cookies.get('tc-auth');
  const isLoginPage = req.nextUrl.pathname === '/';
  const isApiAuth = req.nextUrl.pathname === '/api/auth';
  if (isLoginPage || isApiAuth) return NextResponse.next();
  if (!auth || auth.value !== 'authenticated') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
