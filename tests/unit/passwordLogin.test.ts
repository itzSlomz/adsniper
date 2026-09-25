import {
  configuredPassword,
  normalizeUsername,
  passwordMatches,
} from "@/lib/passwordLogin";

describe("username normalization", () => {
  test.each([
    ["marketingspy", "marketingspy"],
    ["  MarketingSpy \n", "marketingspy"],
    ["ops.team_1-a", "ops.team_1-a"],
    ["abc", "abc"],
    ["a".repeat(32), "a".repeat(32)],
  ])("accepts %p as %p", (raw, expected) => {
    expect(normalizeUsername(raw)).toBe(expected);
  });

  test.each([
    "someone@example.com",
    "ab",
    "",
    "   ",
    "-leading-dash",
    ".leading-dot",
    "has space",
    "a".repeat(33),
    "ünïcode",
    undefined,
    null,
    42,
  ])("rejects %p", (raw) => {
    expect(normalizeUsername(raw)).toBeNull();
  });
});

describe("instance password", () => {
  test("is read from AUTH_PASSWORD, trimmed, and never from the retired AUTH_PASSCODE", () => {
    expect(configuredPassword({ AUTH_PASSWORD: " Secret-1 \n" })).toBe("Secret-1");
    expect(configuredPassword({ AUTH_PASSWORD: "   " })).toBeUndefined();
    expect(configuredPassword({ AUTH_PASSCODE: "123456" })).toBeUndefined();
    expect(configuredPassword({})).toBeUndefined();
  });

  test("matches only the exact configured value", () => {
    expect(passwordMatches("Secret-1?", "Secret-1?")).toBe(true);
    expect(passwordMatches(" Secret-1?\n", "Secret-1?")).toBe(true);
    expect(passwordMatches("secret-1?", "Secret-1?")).toBe(false);
    expect(passwordMatches("Secret-1?x", "Secret-1?")).toBe(false);
    expect(passwordMatches("Secret-1", "Secret-1?")).toBe(false);
    expect(passwordMatches("", "Secret-1?")).toBe(false);
    expect(passwordMatches(undefined, "Secret-1?")).toBe(false);
    expect(passwordMatches(42, "Secret-1?")).toBe(false);
  });

  test("never matches when no password is configured", () => {
    expect(passwordMatches("", "")).toBe(false);
    expect(passwordMatches("anything", undefined)).toBe(false);
  });
});
