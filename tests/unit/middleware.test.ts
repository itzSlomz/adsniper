jest.mock("next-auth", () => ({
  __esModule: true,
  default: () => ({
    auth: (handler: unknown) => handler,
  }),
}));

import { NextRequest } from "next/server";
import {
  config,
  handleAccessRequest,
  type AccessRequest,
} from "@/middleware";

const originalExpiry = process.env.LICENSE_EXPIRES_AT;
const originalFeatures = process.env.LICENSE_FEATURES;

function request(pathname: string, authenticated = false): AccessRequest {
  const req = new NextRequest(`https://adsniper.test${pathname}`);
  Object.defineProperty(req, "auth", {
    configurable: true,
    value: authenticated
      ? { user: { email: "viewer@example.com", role: "viewer" } }
      : null,
  });
  return req as AccessRequest;
}

function expectNext(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
}

function expectRedirect(
  response: Response,
  pathname: string,
  callbackUrl?: string
) {
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get("location")!);
  expect(location.origin).toBe("https://adsniper.test");
  expect(location.pathname).toBe(pathname);
  expect(location.searchParams.get("callbackUrl")).toBe(callbackUrl ?? null);
}

describe("access middleware handler", () => {
  beforeEach(() => {
    delete process.env.LICENSE_EXPIRES_AT;
    delete process.env.LICENSE_FEATURES;
  });

  afterAll(() => {
    if (originalExpiry === undefined) delete process.env.LICENSE_EXPIRES_AT;
    else process.env.LICENSE_EXPIRES_AT = originalExpiry;
    if (originalFeatures === undefined) delete process.env.LICENSE_FEATURES;
    else process.env.LICENSE_FEATURES = originalFeatures;
  });

  test("keeps only framework assets, favicon and robots outside the matcher", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
    ]);
  });

  test.each([
    "/",
    "/brand/missing",
    "/compare",
    "/methodology",
    "/media/missing.jpg",
    "/export/daily/2026-09-01",
    "/export/weekly/2026-09-01",
    "/api/export/ads",
    "/api/export/daily/2026-09-01",
    "/api/export/weekly/2026-09-01",
    "/api/jobs/not-a-job",
    "/intel/users",
    "/license-expired",
    "/api/authentication",
    "/login/help",
  ])("redirects an anonymous request for %s to login", (pathname) => {
    const response = handleAccessRequest(request(pathname));
    expectRedirect(response, "/login", pathname);
  });

  test.each([
    "/login",
    "/api/auth",
    "/api/auth/providers",
  ])("lets the public path %s continue", (pathname) => {
    expectNext(handleAccessRequest(request(pathname)));
  });

  test("lets an authenticated request continue when the license is not configured", () => {
    expectNext(handleAccessRequest(request("/compare", true)));
  });

  test("redirects an authenticated request when the license is expired", () => {
    process.env.LICENSE_EXPIRES_AT = "2000-01-01";

    const response = handleAccessRequest(request("/compare", true));
    expectRedirect(response, "/license-expired");
  });

  test("checks authentication before the expired-license redirect", () => {
    process.env.LICENSE_EXPIRES_AT = "2000-01-01";

    const response = handleAccessRequest(request("/compare"));
    expectRedirect(response, "/login", "/compare");
  });

  test.each([
    ["/login", false],
    ["/api/auth/providers", false],
    ["/license-expired", true],
  ])(
    "keeps the license-exempt path %s reachable with its required auth state",
    (pathname, authenticated) => {
      process.env.LICENSE_EXPIRES_AT = "2000-01-01";
      expectNext(handleAccessRequest(request(pathname, authenticated)));
    }
  );

  describe("feature gate", () => {
    test("lets an entitled authenticated request reach /mentions", () => {
      process.env.LICENSE_EXPIRES_AT = "2099-01-01";
      process.env.LICENSE_FEATURES = "mentions";
      expectNext(handleAccessRequest(request("/mentions", true)));
      expectNext(handleAccessRequest(request("/intel/mentions", true)));
    });

    test("lets an unconfigured (dev/demo) instance reach /mentions", () => {
      expectNext(handleAccessRequest(request("/mentions", true)));
    });

    test.each(["/mentions", "/intel/mentions", "/mentions/anything"])(
      "sends an un-entitled authenticated request for %s home",
      (pathname) => {
        process.env.LICENSE_EXPIRES_AT = "2099-01-01";
        const response = handleAccessRequest(request(pathname, true));
        expectRedirect(response, "/");
      }
    );

    test("does not touch ungated surfaces when the feature is off", () => {
      process.env.LICENSE_EXPIRES_AT = "2099-01-01";
      expectNext(handleAccessRequest(request("/compare", true)));
      expectNext(handleAccessRequest(request("/intel", true)));
    });

    test("checks authentication before the feature gate", () => {
      process.env.LICENSE_EXPIRES_AT = "2099-01-01";
      const response = handleAccessRequest(request("/mentions"));
      expectRedirect(response, "/login", "/mentions");
    });

    test("checks expiry before the feature gate", () => {
      process.env.LICENSE_EXPIRES_AT = "2000-01-01";
      process.env.LICENSE_FEATURES = "mentions";
      const response = handleAccessRequest(request("/mentions", true));
      expectRedirect(response, "/license-expired");
    });
  });
});
