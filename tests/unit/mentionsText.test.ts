import { MAX_ITEM_CHARS, MENTIONS_MAX_QUERY_CHARS } from "@/lib/mentions/config";
import {
  assertIdentifierFree,
  contentHash,
  deidentify,
  extractUrls,
  maskHandlesForDisplay,
  mentionQueryFor,
  mentionQueryTerms,
  normalizeDigits,
  rawForStorage,
} from "@/lib/mentions/text";

// Fixture texts (spec §4.4) — the de-identifier and the hash are proven on
// the same rows the harness ingests.
const X1 = "FixtureCo raised the cashback on its credit card this week https://example.invalid/landing?utm_source=x";
const X2 = "بنك FixtureCo التطبيق يعلق كل مرة @fixtureco";
const X5 = "anyone tried FixtureCo transfers? call me 0512345678 or SA0380000000608010167519 or a.b@example.invalid";
const X6 = X1;

describe("normalizeDigits", () => {
  test("maps Arabic-Indic and Persian digits to ASCII", () => {
    expect(normalizeDigits("٠٥١٢٣٤٥٦٧٨٩")).toBe("05123456789");
    expect(normalizeDigits("۰۹")).toBe("09");
    expect(normalizeDigits("abc 12")).toBe("abc 12");
  });
});

describe("deidentify", () => {
  test("fixture X-2: handle becomes @user, words kept", () => {
    expect(deidentify(X2)).toBe("بنك FixtureCo التطبيق يعلق كل مرة @user");
  });

  test("fixture X-5: phone, IBAN and email are replaced, nothing else", () => {
    expect(deidentify(X5)).toBe("anyone tried FixtureCo transfers? call me [phone] or [iban] or [email]");
  });

  test("URL → [url]", () => {
    expect(deidentify(X1)).toBe("FixtureCo raised the cashback on its credit card this week [url]");
    expect(deidentify("see www.example.com/x now")).toBe("see [url] now");
  });

  test("email before URL and handle: a.b@x.tld is not split into a handle", () => {
    expect(deidentify("mail a.b@example.invalid now")).toBe("mail [email] now");
    expect(deidentify("a.b@example.invalid")).not.toContain("@user");
  });

  test("Saudi IBAN → [iban]", () => {
    expect(deidentify("pay to SA0380000000608010167519 please")).toBe("pay to [iban] please");
    expect(deidentify("SA03 8000 0000 6080 1016 7519")).toBe("[iban]");
  });

  test("handles → @user, only at a word start", () => {
    expect(deidentify("@alice_pub hi @Bob99")).toBe("@user hi @user");
    expect(deidentify("قال @alice شكرا")).toBe("قال @user شكرا");
  });

  test("Saudi phones in every written form → [phone]", () => {
    expect(deidentify("call 0512345678")).toBe("call [phone]");
    expect(deidentify("call +966 512345678")).toBe("call [phone]");
    expect(deidentify("call +966512345678")).toBe("call [phone]");
    expect(deidentify("call 00966512345678")).toBe("call [phone]");
    expect(deidentify("call 05 1234 5678")).toBe("call [phone]");
  });

  test("Arabic-Indic phone digits are caught too", () => {
    expect(deidentify("اتصل ٠٥١٢٣٤٥٦٧٨")).toBe("اتصل [phone]");
  });

  test("international phones → [phone]", () => {
    expect(deidentify("ring +44 20 7946 0958")).toBe("ring [phone]");
  });

  test("16-digit card number → [number]", () => {
    expect(deidentify("card 4111 1111 1111 1111 ok")).toBe("card [number] ok");
    expect(deidentify("acct 12345678901")).toBe("acct [number]");
  });

  test("phone before long numbers: a mobile is [phone], not [number]", () => {
    expect(deidentify("0512345678")).toBe("[phone]");
  });

  test("keeps ordinary words and short numbers", () => {
    expect(deidentify("waited 3 days for 2 cards, Q3 results")).toBe("waited 3 days for 2 cards, Q3 results");
    expect(deidentify("branch 12 opened at 9")).toBe("branch 12 opened at 9");
  });

  test("collapses whitespace and trims", () => {
    expect(deidentify("  a \n\t b  ")).toBe("a b");
  });

  test("is idempotent", () => {
    for (const t of [X1, X2, X5, "@a +966512345678 a@b.co https://x.y SA0380000000608010167519 4111111111111111"]) {
      const once = deidentify(t);
      expect(deidentify(once)).toBe(once);
    }
  });

  test("truncates at MAX_ITEM_CHARS", () => {
    expect(MAX_ITEM_CHARS).toBe(1000);
    const long = "x".repeat(1500);
    expect(deidentify(long)).toHaveLength(1000);
  });

  test("empty and placeholder-only input", () => {
    expect(deidentify("")).toBe("");
    expect(deidentify("   ")).toBe("");
  });
});

describe("contentHash", () => {
  test("is a sha256 hex", () => {
    expect(contentHash(X1)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("equal for X-1 and X-6", () => {
    expect(contentHash(X1)).toBe(contentHash(X6));
  });

  test("ignores case, URL, handle, diacritics and whitespace", () => {
    const base = contentHash("بنك FixtureCo التطبيق يعلق كل مرة @fixtureco https://a.b/c");
    expect(contentHash("بنك fixtureco التطبيق يعلق كل مرة @other_one")).toBe(base);
    expect(contentHash("بنك   FIXTURECO\nالتطبيق يعلق كل مرة")).toBe(base);
    expect(contentHash("بنكُ FixtureCo التطبيقُ يعلقُ كلَّ مرةٍ")).toBe(base);
    expect(contentHash("بنك FixtureCo التطبيق يعلق كل مرة!!!")).toBe(base);
    expect(contentHash("بنـــك FixtureCo التطبيق يعلق كل مرة")).toBe(base);
  });

  test("ignores phone, email and IBAN differences", () => {
    expect(contentHash("call me 0512345678")).toBe(contentHash("call me 0598765432"));
    expect(contentHash("mail a@b.co")).toBe(contentHash("mail c@d.co"));
  });

  test("differs for different words", () => {
    expect(contentHash("the app crashed")).not.toBe(contentHash("the app works"));
    expect(contentHash(X1)).not.toBe(contentHash(X2));
  });
});

describe("extractUrls", () => {
  test("finds http(s) and www URLs, deduped, trailing punctuation stripped", () => {
    expect(extractUrls(X1)).toEqual(["https://example.invalid/landing?utm_source=x"]);
    expect(extractUrls("see https://a.b/c, and https://a.b/c. also www.d.e/f)")).toEqual([
      "https://a.b/c",
      "www.d.e/f",
    ]);
    expect(extractUrls("no links here")).toEqual([]);
  });
});

describe("maskHandlesForDisplay", () => {
  test("masks third-party handles and keeps tracked ones", () => {
    const tracked = new Set(["fixtureco"]);
    expect(maskHandlesForDisplay("@bob_pub says hi to @FixtureCo and @carol", tracked)).toBe(
      "@… says hi to @FixtureCo and @…"
    );
    expect(maskHandlesForDisplay(X2, tracked)).toBe(X2);
  });

  test("does not touch emails", () => {
    expect(maskHandlesForDisplay("a.b@example.invalid", new Set())).toBe("a.b@example.invalid");
  });
});

describe("rawForStorage", () => {
  test("round-trips small payloads and marks oversized or unserialisable ones", () => {
    expect(rawForStorage(null)).toEqual({});
    expect(rawForStorage({ a: 1, d: new Date(0) })).toEqual({ a: 1, d: "1970-01-01T00:00:00.000Z" });
    const big = rawForStorage({ s: "x".repeat(130_000) }) as { _truncated?: boolean };
    expect(big._truncated).toBe(true);
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(Object.keys(rawForStorage(cyc))).toEqual(["_unserializable"]);
  });
});

describe("mentionQueryFor", () => {
  // The spec's worked example shows the Arabic phrase unquoted; its rule
  // ("a term containing whitespace is wrapped in double quotes") wins, since
  // unquoted adjacent words are an implicit AND on X search.
  test("spec example: phrases quoted, handles as typed, retweets excluded", () => {
    expect(mentionQueryFor(["Bank Albilad", "بنك البلاد", "@BankAlbilad"])).toBe(
      '("Bank Albilad" OR "بنك البلاد" OR @BankAlbilad) -filter:retweets'
    );
    expect(mentionQueryFor(["Albilad", "البلاد", "@BankAlbilad"])).toBe(
      "(Albilad OR البلاد OR @BankAlbilad) -filter:retweets"
    );
  });

  test("dedupes case-insensitively, drops empties and <3-char terms, strips inner quotes", () => {
    expect(mentionQueryFor(["", "  ", "ab", "Foo", "foo", ' say "hi" now ', "#tag"])).toBe(
      '(Foo OR "say hi now" OR #tag) -filter:retweets'
    );
  });

  test("keeps at most eight terms", () => {
    const terms = Array.from({ length: 12 }, (_, i) => `term${i}`);
    expect(mentionQueryTerms(terms)).toHaveLength(8);
    expect(mentionQueryFor(terms)).toContain("term7");
    expect(mentionQueryFor(terms)).not.toContain("term8");
  });

  test("never appends since:/until: or lang:", () => {
    const q = mentionQueryFor(["Bank Albilad"]);
    expect(q).not.toMatch(/since:|until:|lang:/);
  });

  test("truncates trailing terms to fit MENTIONS_MAX_QUERY_CHARS", () => {
    const terms = Array.from({ length: 8 }, (_, i) => `${"w".repeat(90)}${i}`);
    const q = mentionQueryFor(terms);
    expect(q.length).toBeLessThanOrEqual(MENTIONS_MAX_QUERY_CHARS);
    expect(mentionQueryTerms(terms).length).toBeLessThan(8);
    expect(mentionQueryTerms(terms).length).toBeGreaterThan(0);
    expect(q.endsWith(") -filter:retweets")).toBe(true);
  });

  test("empty input yields an empty query", () => {
    expect(mentionQueryFor([])).toBe("");
    expect(mentionQueryFor(["ab"])).toBe("");
  });
});

describe("assertIdentifierFree", () => {
  const facts = () => ({
    source: "x",
    brands: [
      {
        brandName: "FixtureCo",
        terms: ["@fixtureco", "FixtureCo"],
        samples: [{ url: "https://x.com/i/status/1", excerpt: "بنك FixtureCo التطبيق يعلق كل مرة @user" }],
      },
    ],
  });

  test("passes when terms carry the brand handle and an excerpt carries @user", () => {
    expect(() => assertIdentifierFree(facts())).not.toThrow();
  });

  test("throws on a handle in an excerpt, naming the path", () => {
    const f = facts();
    f.brands[0].samples[0].excerpt = "thanks @alice_pub";
    expect(() => assertIdentifierFree(f)).toThrow("brands[0].samples[0].excerpt");
  });

  test("throws on an identifier-bearing key anywhere", () => {
    for (const key of ["handle", "displayName", "externalAuthorId", "authors"]) {
      const f = facts() as Record<string, unknown>;
      (f.brands as Record<string, unknown>[])[0][key] = "x";
      expect(() => assertIdentifierFree(f)).toThrow(`"${key}"`);
    }
  });

  test("a handle outside brands[].terms[] is a leak even in a terms-like key", () => {
    expect(() => assertIdentifierFree({ terms: ["@someone"] })).toThrow(/@handle/);
  });
});

// --- copy.ts (owned by the same package; the brief-side test in
// weeklyBriefMentions.test.ts scans the same strings through fallbackNarrative) ---

import {
  FORBIDDEN_CAUSAL,
  allCopyStrings,
  arMatched,
  arPosts,
  countSentence,
  relTimeFor,
  termsLabel,
} from "@/lib/mentions/copy";

describe("arPosts / arMatched", () => {
  test.each([
    [0, "لا منشورات", "لا منشورات طابقت"],
    [1, "منشور واحد", "منشور واحد طابق"],
    [2, "منشوران", "منشوران طابقا"],
    [3, "3 منشورات", "3 منشورات طابقت"],
    [10, "10 منشورات", "10 منشورات طابقت"],
    [11, "11 منشورًا", "11 منشورًا طابقت"],
    [100, "100 منشورًا", "100 منشورًا طابقت"],
  ])("n=%i", (n, posts, matched) => {
    expect(arPosts(n)).toBe(posts);
    expect(arMatched(n)).toBe(matched);
  });
});

describe("countSentence", () => {
  test("EN and AR forms, dates isolated in Arabic, no arrow", () => {
    const s = countSentence(7, ["@fixtureco", "FixtureCo"], "2026-09-15", "2026-09-22");
    expect(s.en).toBe('7 posts matched "@fixtureco, FixtureCo" on X from 2026-09-15 to 2026-09-22 — a sample, not a total.');
    expect(s.ar).toBe(
      "7 منشورات طابقت «@fixtureco, FixtureCo» على X من ⁦2026-09-15⁩ إلى ⁦2026-09-22⁩ — عيّنة وليست إجمالًا."
    );
    expect(s.ar).not.toContain("→");
    expect(s.en).toContain("sample");
    expect(s.ar).toContain("عيّنة");
  });

  test("singular EN, zero AR, +k term overflow", () => {
    expect(countSentence(1, ["a"], "d1", "d2").en).toMatch(/^1 post matched/);
    expect(countSentence(0, ["a"], "d1", "d2").ar).toMatch(/^لا منشورات طابقت/);
    expect(termsLabel(["a", "b", "c", "d", "e"], "en")).toBe("a, b, c +2");
    expect(termsLabel(["a", "b", "c", "d", "e"], "ar")).toBe("a, b, c +2 أخرى");
    expect(termsLabel(["a", "b", "c"], "ar")).toBe("a, b, c");
  });
});

describe("relTimeFor", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const MIN = 60_000;

  test("minutes, hours, days in both languages", () => {
    expect(relTimeFor(at(0), now)).toEqual({ en: "just now", ar: "الآن" });
    expect(relTimeFor(at(1 * MIN), now)).toEqual({ en: "1 min ago", ar: "قبل دقيقة" });
    expect(relTimeFor(at(2 * MIN), now)).toEqual({ en: "2 min ago", ar: "قبل دقيقتين" });
    expect(relTimeFor(at(5 * MIN), now)).toEqual({ en: "5 min ago", ar: "قبل 5 دقائق" });
    expect(relTimeFor(at(30 * MIN), now)).toEqual({ en: "30 min ago", ar: "قبل 30 دقيقة" });
    expect(relTimeFor(at(60 * MIN), now)).toEqual({ en: "1 h ago", ar: "قبل ساعة" });
    expect(relTimeFor(at(3 * 60 * MIN), now)).toEqual({ en: "3 h ago", ar: "قبل 3 ساعات" });
    expect(relTimeFor(at(20 * 60 * MIN), now)).toEqual({ en: "20 h ago", ar: "قبل 20 ساعة" });
    expect(relTimeFor(at(48 * 60 * MIN), now)).toEqual({ en: "2 d ago", ar: "قبل يومين" });
    expect(relTimeFor(at(5 * 1440 * MIN), now)).toEqual({ en: "5 d ago", ar: "قبل 5 أيام" });
    expect(relTimeFor(at(20 * 1440 * MIN), now)).toEqual({ en: "20 d ago", ar: "قبل 20 يومًا" });
  });

  test("a future timestamp never goes negative", () => {
    expect(relTimeFor(at(-5 * MIN), now)).toEqual({ en: "just now", ar: "الآن" });
  });
});

describe("R4 — copy.ts carries no causal wording", () => {
  test("FORBIDDEN_CAUSAL catches the listed words in both languages", () => {
    for (const bad of ["the ad drove replies", "it caused a spike", "led to complaints", "because of the ad", "in response to", "triggered", "produced"]) {
      expect(FORBIDDEN_CAUSAL.some((re) => re.test(bad))).toBe(true);
    }
    for (const bad of ["بسبب الإعلان", "أدّى إلى", "أدى", "نتيجة الحملة", "ردًّا على", "تسبب"]) {
      expect(FORBIDDEN_CAUSAL.some((re) => re.test(bad))).toBe(true);
    }
    expect(FORBIDDEN_CAUSAL.some((re) => re.test("in the same window as the ad — co-occurrence, not cause"))).toBe(false);
    expect(FORBIDDEN_CAUSAL.some((re) => re.test("في الفترة نفسها التي — تزامن وليس سببًا"))).toBe(false);
  });

  test("every string in copy.ts passes, and no Arabic string uses an arrow between dates", () => {
    const strings = allCopyStrings();
    expect(strings.length).toBeGreaterThan(60);
    for (const s of strings) {
      for (const re of FORBIDDEN_CAUSAL) expect({ s, hit: re.test(s) }).toEqual({ s, hit: false });
      expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}\s*→/);
    }
  });
});
