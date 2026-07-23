import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login')) return NextResponse.next();
  // ponytail: token checked client-side via Zustand; middleware only handles static redirect
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico|api).*)'] };
