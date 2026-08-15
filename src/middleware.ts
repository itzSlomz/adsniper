import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { getLicense } from "@/lib/license";

// AdSniper is a per-customer SaaS instance: every surface requires login
// (auth.config's authorized callback), reversing Watchtower's
// public-viewer posture. On top of auth, an expired license locks the
// whole instance to /license-expired; in-process cron is gated separately
// in the job runner, since it never passes through middleware.
const LICENSE_EXEMPT = ["/login", "/license-expired", "/api/auth"];

export default NextAuth(authConfig).auth((req) => {
  const { pathname } = req.nextUrl;
  if (
    getLicense().state === "expired" &&
    !LICENSE_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.redirect(new URL("/license-expired", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
