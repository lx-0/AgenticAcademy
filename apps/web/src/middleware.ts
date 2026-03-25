import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Use edge-safe config in middleware — no bcryptjs or Prisma imports
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
