import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Operator decision (2026-07-29): viewer surfaces are public — no login to
// see the dashboard. Auth remains ONLY on admin surfaces: Intel capture
// (user management, brief editing, manual logging) and the job-trigger
// API, so outsiders can't mutate data or spend provider budget. This
// supersedes the brief's Section 1.6 lockdown for read-only pages.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/intel/:path*", "/api/jobs/:path*"],
};
