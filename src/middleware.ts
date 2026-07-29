import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Every route is auth-gated except the login page, auth API, and static assets.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
