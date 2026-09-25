jest.mock("@/lib/db", () => ({
  prisma: {
    setting: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { MEDIA_HANDLES_DEFAULT } from "@/lib/mentions/config";
import {
  defaultMentionsSettings,
  getMentionsSettings,
  mentionTermsFor,
  saveMentionsSettings,
} from "@/lib/settings";

const findUniqueMock = prisma.setting.findUnique as jest.Mock;
const upsertMock = prisma.setting.upsert as jest.Mock;

const brand = {
  id: "b1",
  nameEn: "FixtureCo",
  nameAr: "شركة التجربة",
  aliases: ["FixtureCo"],
  xHandle: "fixtureco",
};

beforeEach(() => {
  findUniqueMock.mockReset();
  upsertMock.mockReset();
  findUniqueMock.mockResolvedValue(null);
  upsertMock.mockResolvedValue({});
});

describe("defaultMentionsSettings", () => {
  test("is off, unseeded, with the default media list (a copy)", () => {
    const d = defaultMentionsSettings();
    expect(d).toEqual({ enabled: false, terms: {}, mediaHandles: [...MEDIA_HANDLES_DEFAULT] });
    d.mediaHandles.push("x");
    expect(defaultMentionsSettings().mediaHandles).toEqual([...MEDIA_HANDLES_DEFAULT]);
  });
});

describe("getMentionsSettings", () => {
  test("returns the defaults when nothing is stored", async () => {
    expect(await getMentionsSettings()).toEqual(defaultMentionsSettings());
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { key: "mentions_settings" } });
  });

  test("validates shapes and drops unknown keys", async () => {
    findUniqueMock.mockResolvedValue({
      key: "mentions_settings",
      value: {
        enabled: "yes",
        terms: { b1: ["  Foo ", "", 42, "foo", "Bar"], b2: [], b3: "nope", b4: [7] },
        mediaHandles: ["@Argaam", "  spagov ", "", 5, "argaam"],
        extra: true,
      },
    });
    const s = await getMentionsSettings();
    expect(s).toEqual({
      enabled: false,
      terms: { b1: ["Foo", "Bar"] },
      mediaHandles: ["argaam", "spagov"],
    });
    expect(Object.keys(s)).toEqual(["enabled", "terms", "mediaHandles"]);
  });

  test("enabled only when literally true", async () => {
    findUniqueMock.mockResolvedValue({ value: { enabled: true } });
    expect((await getMentionsSettings()).enabled).toBe(true);
    findUniqueMock.mockResolvedValue({ value: { enabled: 1 } });
    expect((await getMentionsSettings()).enabled).toBe(false);
  });

  test("lowercases handles; an explicitly empty list stays empty, a missing key gets the default", async () => {
    findUniqueMock.mockResolvedValue({ value: { mediaHandles: ["ALARABIYA"] } });
    expect((await getMentionsSettings()).mediaHandles).toEqual(["alarabiya"]);
    findUniqueMock.mockResolvedValue({ value: { mediaHandles: [] } });
    expect((await getMentionsSettings()).mediaHandles).toEqual([]);
    findUniqueMock.mockResolvedValue({ value: { enabled: true } });
    expect((await getMentionsSettings()).mediaHandles).toEqual([...MEDIA_HANDLES_DEFAULT]);
  });

  test("a non-object value falls back to the defaults", async () => {
    findUniqueMock.mockResolvedValue({ value: [1, 2] });
    expect(await getMentionsSettings()).toEqual(defaultMentionsSettings());
    findUniqueMock.mockResolvedValue({ value: "junk" });
    expect(await getMentionsSettings()).toEqual(defaultMentionsSettings());
  });
});

describe("saveMentionsSettings", () => {
  test("stores the normalised shape under mentions_settings", async () => {
    await saveMentionsSettings({
      enabled: true,
      terms: { b1: [" A term ", "a term"], b2: [] },
      mediaHandles: ["@Sabqorg", "sabqorg"],
    });
    const expected = { enabled: true, terms: { b1: ["A term"] }, mediaHandles: ["sabqorg"] };
    expect(upsertMock).toHaveBeenCalledWith({
      where: { key: "mentions_settings" },
      update: { value: expected },
      create: { key: "mentions_settings", value: expected },
    });
  });
});

describe("mentionTermsFor", () => {
  const settings = () => defaultMentionsSettings();

  test("seeds from @handle then aliases", () => {
    expect(mentionTermsFor(brand, settings())).toEqual(["@fixtureco", "FixtureCo"]);
  });

  test("prefers stored terms when present", () => {
    const s = settings();
    s.terms[brand.id] = ["Fixture bank", "FixtureCo"];
    expect(mentionTermsFor(brand, s)).toEqual(["Fixture bank", "FixtureCo"]);
  });

  test("strips @@ from the handle and keeps its case", () => {
    expect(mentionTermsFor({ ...brand, xHandle: "@@BankAlbilad" }, settings())[0]).toBe("@BankAlbilad");
  });

  test("no handle → aliases only; no aliases → brand names", () => {
    expect(mentionTermsFor({ ...brand, xHandle: null }, settings())).toEqual(["FixtureCo"]);
    expect(mentionTermsFor({ ...brand, xHandle: "", aliases: [] }, settings())).toEqual([
      "FixtureCo",
      "شركة التجربة",
    ]);
  });

  test("drops terms under three characters and duplicates, stored or seeded", () => {
    // "@a" is two characters and is dropped; "@ab" would be three and kept.
    expect(mentionTermsFor({ ...brand, xHandle: "a", aliases: ["ok", "Fixture", "fixture"] }, settings())).toEqual([
      "Fixture",
    ]);
    expect(mentionTermsFor({ ...brand, xHandle: "ab", aliases: [] }, settings())[0]).toBe("@ab");
    const s = settings();
    s.terms[brand.id] = ["ab", " x "];
    // Nothing usable stored → falls back to the seed.
    expect(mentionTermsFor(brand, s)).toEqual(["@fixtureco", "FixtureCo"]);
  });
});
