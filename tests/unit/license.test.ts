import { FEATURES, getLicense, hasFeature, licensedFeatures } from "@/lib/license";

const originalExpiry = process.env.LICENSE_EXPIRES_AT;
const originalFeatures = process.env.LICENSE_FEATURES;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("license features", () => {
  beforeEach(() => {
    delete process.env.LICENSE_EXPIRES_AT;
    delete process.env.LICENSE_FEATURES;
  });

  afterAll(() => {
    restore("LICENSE_EXPIRES_AT", originalExpiry);
    restore("LICENSE_FEATURES", originalFeatures);
  });

  test("declares mentions as the only feature key", () => {
    expect(FEATURES).toEqual(["mentions"]);
  });

  test("opens every feature while the license is unconfigured", () => {
    expect(licensedFeatures()).toBe("all");
    expect(hasFeature("mentions")).toBe(true);
  });

  test("opens every feature while LICENSE_EXPIRES_AT is malformed", () => {
    process.env.LICENSE_EXPIRES_AT = "not-a-date";
    process.env.LICENSE_FEATURES = "";
    expect(getLicense().state).toBe("unconfigured");
    expect(hasFeature("mentions")).toBe(true);
  });

  test.each([
    ["unset", undefined],
    ["empty", ""],
    ["another key only", "ads"],
    ["whitespace", "  ,  "],
  ])("fails closed on a configured license with LICENSE_FEATURES %s", (_label, value) => {
    process.env.LICENSE_EXPIRES_AT = "2099-01-01";
    restore("LICENSE_FEATURES", value);
    expect(hasFeature("mentions")).toBe(false);
    expect(licensedFeatures()).toEqual(new Set());
  });

  test.each(["mentions", " Mentions , x", "ads,MENTIONS"])(
    "recognises the key in %j regardless of case, spacing and neighbours",
    (value) => {
      process.env.LICENSE_EXPIRES_AT = "2099-01-01";
      process.env.LICENSE_FEATURES = value;
      expect(hasFeature("mentions")).toBe(true);
    }
  );

  test("ignores unknown keys instead of failing", () => {
    process.env.LICENSE_EXPIRES_AT = "2099-01-01";
    process.env.LICENSE_FEATURES = "bogus,mentions,other";
    expect(licensedFeatures()).toEqual(new Set(["mentions"]));
  });

  test("does not let a feature list revive an expired license", () => {
    process.env.LICENSE_EXPIRES_AT = "2000-01-01";
    process.env.LICENSE_FEATURES = "mentions";
    expect(getLicense().state).toBe("expired");
    // Expiry is enforced before features by every consumer; the feature
    // itself is still parsed so the two layers can name the same reason.
    expect(hasFeature("mentions")).toBe(true);
  });

  test("leaves the expiry state untouched by LICENSE_FEATURES", () => {
    process.env.LICENSE_EXPIRES_AT = "2099-01-01";
    const without = getLicense();
    process.env.LICENSE_FEATURES = "mentions";
    const withFeatures = getLicense();
    expect(withFeatures).toEqual(without);
    expect(withFeatures.state).toBe("active");
  });
});
