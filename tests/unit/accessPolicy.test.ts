import { authConfig } from "@/auth.config";
import {
  FEATURE_PATHS,
  featureForPath,
  isLicenseExemptPath,
  isPublicPath,
  LICENSE_EXEMPT_PATHS,
  matchesPath,
  PUBLIC_CHILD_PATHS,
  PUBLIC_EXACT_PATHS,
} from "@/lib/accessPolicy";

describe("access policy", () => {
  test.each([
    "/login",
    "/api/auth",
    "/api/auth/providers",
  ])("treats %s as public", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  test.each([
    "/",
    "/compare",
    "/api/authentication",
    "/login/help",
    "/login-attempt",
    "/license-expired",
  ])("does not widen public prefixes to %s", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });

  test.each([
    "/login",
    "/api/auth/session",
    "/license-expired",
    "/license-expired/help",
  ])("treats %s as license-exempt", (pathname) => {
    expect(isLicenseExemptPath(pathname)).toBe(true);
  });

  test.each(["/mentions", "/mentions/x", "/intel/mentions", "/intel/mentions/anything"])(
    "gates %s behind the mentions feature",
    (pathname) => {
      expect(featureForPath(pathname)).toBe("mentions");
    }
  );

  test.each([
    "/",
    "/mentionsx",
    "/intel/mentions-other",
    "/intel",
    "/api/jobs/mentions-poll",
    "/compare",
    "/login",
  ])("leaves %s ungated", (pathname) => {
    expect(featureForPath(pathname)).toBeNull();
  });

  test("keeps the feature paths and the existing public/exempt lists as declared", () => {
    expect(FEATURE_PATHS).toEqual({ mentions: ["/mentions", "/intel/mentions"] });
    expect(PUBLIC_EXACT_PATHS).toEqual(["/login"]);
    expect(PUBLIC_CHILD_PATHS).toEqual(["/api/auth"]);
    expect(LICENSE_EXEMPT_PATHS).toEqual(["/login", "/license-expired", "/api/auth"]);
  });

  test("matches exact paths and their children only", () => {
    expect(matchesPath("/area", ["/area"])).toBe(true);
    expect(matchesPath("/area/child", ["/area"])).toBe(true);
    expect(matchesPath("/area-other", ["/area"])).toBe(false);
  });

  test.each([
    ["/login", null, true],
    ["/api/auth/providers", null, true],
    ["/api/authentication", null, false],
    ["/compare", null, false],
    ["/compare", { user: { email: "viewer@example.com" } }, true],
  ])(
    "uses the same public-boundary policy in Auth.js for %s",
    (pathname, auth, expected) => {
      const authorized = authConfig.callbacks.authorized as (args: {
        auth: unknown;
        request: { nextUrl: { pathname: string } };
      }) => boolean;

      expect(
        authorized({ auth, request: { nextUrl: { pathname } } })
      ).toBe(expected);
    }
  );
});
