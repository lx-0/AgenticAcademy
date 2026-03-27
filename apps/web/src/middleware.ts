import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simplified pass-through middleware for local dogfooding.
// Full NextAuth middleware is used in production on Railway.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
