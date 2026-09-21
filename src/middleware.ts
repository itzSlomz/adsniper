import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { isLicenseExemptPath, isPublicPath } from "@/lib/accessPolicy";
import { getLicense } from "@/lib/license";

// MarketingSpy is a per-customer SaaS instance: every surface requires login,
// reversing Watchtower's public-viewer posture. On top of auth, an
// expired license locks the whole instance to /license-expired;
// in-process cron is gated separately in the job runner, since it never
// passes through middleware.
//
// IMPORTANT: when Auth.js wraps a custom middleware function, it skips
// its own "redirect unauthenticated users to sign-in" behavior (the
// authorized-callback result only short-circuits when it is a Response).
// Both gates are therefore enforced explicitly here — do not rely on the
// authorized callback for page protection.
export type AccessRequest = Pick<NextRequest, "nextUrl"> & {
  auth?: { user?: unknown } | null;
};

export function handleAccessRequest(req: AccessRequest) {
  const { pathname } = req.nextUrl;
  if (!req.auth?.user && !isPublicPath(pathname)) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (getLicense().state === "expired" && !isLicenseExemptPath(pathname)) {
    return NextResponse.redirect(new URL("/license-expired", req.nextUrl));
  }
  return NextResponse.next();
}

export default NextAuth(authConfig).auth(handleAccessRequest);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
