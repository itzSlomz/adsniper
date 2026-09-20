jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { auth } from "@/auth";
import {
  getAdminSession,
  isAdminSession,
  requireAdmin,
} from "@/lib/authorization";

const authMock = auth as jest.Mock;

describe("admin authorization", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  test.each([
    null,
    {},
    { user: null },
    { user: {} },
    { user: { role: "viewer" } },
    { user: { role: "Admin" } },
  ])("does not accept a non-admin session", (session) => {
    expect(isAdminSession(session)).toBe(false);
  });

  test("accepts only the exact admin role", () => {
    expect(isAdminSession({ user: { role: "admin" } })).toBe(true);
  });

  test("returns null for a viewer", async () => {
    authMock.mockResolvedValue({ user: { role: "viewer" } });

    await expect(getAdminSession()).resolves.toBeNull();
    expect(authMock).toHaveBeenCalledTimes(1);
  });

  test("throws the existing forbidden error for anonymous and viewer sessions", async () => {
    for (const session of [null, { user: { role: "viewer" } }]) {
      authMock.mockResolvedValueOnce(session);
      await expect(requireAdmin()).rejects.toThrow("forbidden");
    }
    expect(authMock).toHaveBeenCalledTimes(2);
  });

  test("returns the original admin session", async () => {
    const session = {
      user: { email: "admin@example.com", role: "admin" },
      expires: "2099-01-01T00:00:00.000Z",
    };
    authMock.mockResolvedValue(session);

    await expect(requireAdmin()).resolves.toBe(session);
    expect(authMock).toHaveBeenCalledTimes(1);
  });
});
