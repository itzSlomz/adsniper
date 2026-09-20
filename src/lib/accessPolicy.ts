// Keep this module dependency-free: Auth.js loads it in the Edge middleware
// bundle as well as in the Node application.
export const PUBLIC_EXACT_PATHS = ["/login"] as const;
export const PUBLIC_CHILD_PATHS = ["/api/auth"] as const;
export const LICENSE_EXEMPT_PATHS = [
  "/login",
  "/license-expired",
  "/api/auth",
] as const;

export function matchesPath(
  pathname: string,
  paths: readonly string[]
): boolean {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT_PATHS.some((path) => pathname === path) ||
    matchesPath(pathname, PUBLIC_CHILD_PATHS)
  );
}

export function isLicenseExemptPath(pathname: string): boolean {
  return matchesPath(pathname, LICENSE_EXEMPT_PATHS);
}
