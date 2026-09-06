import { authConfig } from "@/auth.config";
import {
  isLicenseExemptPath,
  isPublicPath,
  matchesPath,
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
