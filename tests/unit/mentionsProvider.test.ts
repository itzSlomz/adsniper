jest.mock("@/lib/apify", () => ({ runApifyActorSync: jest.fn() }));

import { runApifyActorSync } from "@/lib/apify";
import { KAITO_ACTOR, KAITO_COST_PER_ITEM_USD, KAITO_PAGE_MIN, KAITO_TIMEOUT_SECS } from "@/lib/mentions/config";
import { apifyKaitoMentionsProvider, toResult } from "@/lib/providers/mentions/apifyKaito";
import { fixtureMentionsProvider } from "@/lib/providers/mentions/fixture";

const runMock = runApifyActorSync as jest.Mock;

const ENV_KEYS = ["X_PROVIDER_API_KEY", "MENTIONS_FIXTURE", "MENTIONS_FIXTURE_PHASE", "MENTIONS_FIXTURE_FAIL"];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  runMock.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const sinceTime = new Date("2026-09-15T00:00:00Z");
const untilTime = new Date("2026-09-22T00:00:00Z");
const inWindow = "2026-09-18T12:00:00.000Z";

function tweet(over: Record<string, unknown> = {}) {
  return {
    type: "tweet",
    id: "1001",
    url: "https://x.com/alice_pub/status/1001",
    createdAt: inWindow,
    text: "hello @bob",
    likeCount: 3,
    retweetCount: 1,
    replyCount: 0,
    viewCount: 90,
    author: { id: "9001", userName: "alice_pub", name: "Alice Public", followers: 12 },
    entities: { urls: [{ expanded_url: "https://example.invalid/landing", url: "https://t.co/abc" }] },
    ...over,
  };
}

describe("apifyKaitoMentionsProvider", () => {
  test("declares the cost-group name and platform", () => {
    expect(apifyKaitoMentionsProvider.name).toBe("mentions:apify-kaito");
    expect(apifyKaitoMentionsProvider.platform).toBe("x");
  });

  test("throws a specific error without X_PROVIDER_API_KEY and never calls the actor", async () => {
    await expect(
      apifyKaitoMentionsProvider.searchMentions("(FixtureCo) -filter:retweets", { sinceTime, untilTime, maxItems: 100 })
    ).rejects.toThrow("X_PROVIDER_API_KEY is not set (needed for mentions:apify-kaito)");
    expect(runMock).not.toHaveBeenCalled();
  });

  test("sends since_time/until_time as UNIX seconds, queryType Latest, and no since:/until: text", async () => {
    process.env.X_PROVIDER_API_KEY = "k";
    runMock.mockResolvedValue([tweet()]);
    const query = "(FixtureCo OR @fixtureco) -filter:retweets";
    await apifyKaitoMentionsProvider.searchMentions(query, { sinceTime, untilTime, maxItems: 42 });
    expect(runMock).toHaveBeenCalledTimes(1);
    const [actor, input, key, timeout] = runMock.mock.calls[0];
    expect(actor).toBe(KAITO_ACTOR);
    expect(key).toBe("k");
    expect(timeout).toBe(KAITO_TIMEOUT_SECS);
    expect(input).toEqual({
      searchTerms: [query],
      maxItems: 42,
      queryType: "Latest",
      since_time: Math.floor(sinceTime.getTime() / 1000),
      until_time: Math.floor(untilTime.getTime() / 1000),
    });
    expect(Number.isInteger(input.since_time)).toBe(true);
    expect(Number.isInteger(input.until_time)).toBe(true);
    expect(input.searchTerms[0]).not.toMatch(/since:|until:/);
  });

  test("maps a tweet: metrics observed, urls from entities, author without name, raw kept", async () => {
    process.env.X_PROVIDER_API_KEY = "k";
    runMock.mockResolvedValue([tweet()]);
    const r = await apifyKaitoMentionsProvider.searchMentions("q", { sinceTime, untilTime, maxItems: 100 });
    expect(r.items).toHaveLength(1);
    const m = r.items[0];
    expect(m.externalId).toBe("1001");
    expect(m.url).toBe("https://x.com/alice_pub/status/1001");
    expect(m.postedAt.toISOString()).toBe(inWindow);
    expect(m.text).toBe("hello @bob");
    expect(m.isReply).toBe(false);
    expect(m.isRetweet).toBe(false);
    // quotes/bookmarks were not in the payload → absent, never 0.
    expect(m.publicMetrics).toEqual({ likes: 3, reposts: 1, replies: 0, views: 90 });
    expect(m.urls).toEqual(["https://example.invalid/landing"]);
    expect(m.author).toEqual({ handle: "alice_pub", externalAuthorId: "9001", followers: 12 });
    expect(m.author).not.toHaveProperty("name");
    expect(m.author).not.toHaveProperty("displayName");
    expect(m.raw).toEqual(tweet());
    expect(r.dropped).toBe(0);
  });

  test("author is null when userName is absent; name alone is never mapped", () => {
    const r = toResult([tweet({ author: { id: "9", name: "Only Name" } })], { sinceTime, untilTime });
    expect(r.items[0].author).toBeNull();
  });

  test("isRetweet from either flag; urls fall back to url and dedupe", () => {
    const r = toResult(
      [
        tweet({ id: "1", isRetweet: true }),
        tweet({ id: "2", retweeted_tweet: { id: "x" } }),
        tweet({
          id: "3",
          entities: { urls: [{ url: "https://t.co/a" }, { expanded_url: "https://e.x/a" }, { expanded_url: "https://e.x/a" }] },
        }),
      ],
      { sinceTime, untilTime }
    );
    expect(r.items.map((m) => m.isRetweet)).toEqual([true, true, false]);
    expect(r.items[2].urls).toEqual(["https://t.co/a", "https://e.x/a"]);
  });

  test("filters mock_tweet filler and rows without id/createdAt, keeps the billing floor", () => {
    const r = toResult(
      [tweet({ type: "mock_tweet" }), tweet({ id: undefined }), tweet({ createdAt: undefined }), tweet({ id: "7" })],
      { sinceTime, untilTime }
    );
    expect(r.items.map((m) => m.externalId)).toEqual(["7"]);
    expect(r.units).toBe(KAITO_PAGE_MIN);
    expect(r.estCostUsd).toBeCloseTo(KAITO_PAGE_MIN * KAITO_COST_PER_ITEM_USD, 10);
  });

  test("drops out-of-window rows (±1 h tolerance) and reports the count", () => {
    const r = toResult(
      [
        tweet({ id: "a", createdAt: "2026-09-14T22:59:00Z" }), // before since − 1h → dropped
        tweet({ id: "b", createdAt: "2026-09-14T23:30:00Z" }), // inside tolerance → kept
        tweet({ id: "c", createdAt: "2026-09-22T00:30:00Z" }), // inside tolerance → kept
        tweet({ id: "d", createdAt: "2026-09-22T01:01:00Z" }), // after until + 1h → dropped
        tweet({ id: "e", createdAt: "not a date" }), // unparsable → dropped
      ],
      { sinceTime, untilTime }
    );
    expect(r.items.map((m) => m.externalId)).toEqual(["b", "c"]);
    expect(r.dropped).toBe(3);
  });

  test("units = max(kept + dropped, 20 per term)", () => {
    const rows = Array.from({ length: 25 }, (_, i) => tweet({ id: String(i) }));
    rows.push(tweet({ id: "late", createdAt: "2026-09-30T00:00:00Z" }));
    const r = toResult(rows, { sinceTime, untilTime });
    expect(r.items).toHaveLength(25);
    expect(r.dropped).toBe(1);
    expect(r.units).toBe(26);
    expect(r.estCostUsd).toBeCloseTo(26 * KAITO_COST_PER_ITEM_USD, 10);
    expect(toResult(rows.slice(0, 5), { sinceTime, untilTime, terms: 3 }).units).toBe(60);
  });
});

describe("getMentionsProvider", () => {
  test("returns the Kaito adapter by default", () => {
    jest.isolateModules(() => {
      const { getMentionsProvider } = require("@/lib/providers/mentions");
      expect(getMentionsProvider().name).toBe("mentions:apify-kaito");
    });
  });

  test("returns the fixture only when MENTIONS_FIXTURE=1, and warns loudly", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    process.env.MENTIONS_FIXTURE = "1";
    jest.isolateModules(() => {
      const { getMentionsProvider } = require("@/lib/providers/mentions");
      expect(getMentionsProvider().name).toBe("mentions:fixture-x");
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("VERIFICATION-ONLY"));
    warn.mockRestore();
  });

  test('any other value ("true", "0") keeps the real adapter', () => {
    for (const v of ["true", "0", ""]) {
      process.env.MENTIONS_FIXTURE = v;
      jest.isolateModules(() => {
        const { getMentionsProvider } = require("@/lib/providers/mentions");
        expect(getMentionsProvider().name).toBe("mentions:apify-kaito");
      });
    }
  });
});

describe("fixtureMentionsProvider", () => {
  const search = (q: string) => fixtureMentionsProvider.searchMentions(q, { sinceTime, untilTime, maxItems: 100 });

  test("declares the fixture name and platform", () => {
    expect(fixtureMentionsProvider.name).toBe("mentions:fixture-x");
    expect(fixtureMentionsProvider.platform).toBe("x");
  });

  test("returns nothing for a query naming a real brand", async () => {
    const r = await search('("Bank Albilad" OR بنك البلاد) -filter:retweets');
    expect(r).toEqual({ items: [], units: 0, estCostUsd: 0 });
  });

  test("phase 1: FixtureCo gets X-1…X-6 and X-9, RivalCo gets X-7", async () => {
    const self = await search("(@fixtureco OR FixtureCo) -filter:retweets");
    expect(self.items.map((m) => m.externalId)).toEqual([1, 2, 3, 4, 5, 6, 9].map((n) => `FIXTURE-X-${n}`));
    const rival = await search("(RivalCo) -filter:retweets");
    expect(rival.items.map((m) => m.externalId)).toEqual(["FIXTURE-X-7"]);
  });

  test("phase 2 adds exactly X-8 and bumps metrics on known rows", async () => {
    const p1 = await search("(FixtureCo) -filter:retweets");
    process.env.MENTIONS_FIXTURE_PHASE = "2";
    const p2 = await search("(FixtureCo) -filter:retweets");
    const ids = (r: typeof p1) => r.items.map((m) => m.externalId);
    expect(ids(p2)).toEqual([...ids(p1).slice(0, 6), "FIXTURE-X-8", "FIXTURE-X-9"]);
    expect(p2.items[0].publicMetrics).not.toEqual(p1.items[0].publicMetrics);
    expect(p2.items[0].text).toBe(p1.items[0].text);
  });

  test("rows are loudly fixture: ids, urls, raw, authors and window", async () => {
    const r = await search("(FixtureCo) -filter:retweets");
    for (const m of r.items) {
      expect(m.externalId).toMatch(/^FIXTURE-X-\d+$/);
      expect(m.url).toBe(`https://example.invalid/x/${m.externalId}`);
      expect((m.raw as { _fixture: boolean })._fixture).toBe(true);
      expect(m.isRetweet).toBe(false);
    }
    const by = Object.fromEntries(r.items.map((m) => [m.externalId, m]));
    expect(by["FIXTURE-X-5"].author).toBeNull();
    expect(by["FIXTURE-X-1"].author).toEqual({ handle: "alice_pub", externalAuthorId: "9001" });
    expect(by["FIXTURE-X-3"].author?.handle).toBe("fixtureco");
    expect(by["FIXTURE-X-4"].author?.handle).toBe("fixturenews");
    expect(by["FIXTURE-X-6"].text).toBe(by["FIXTURE-X-1"].text);
    expect(by["FIXTURE-X-1"].urls).toEqual(["https://example.invalid/landing?utm_source=x"]);
    // X-9 is 20 days old: outside a 7-day window on purpose (retention target).
    expect(Date.now() - by["FIXTURE-X-9"].postedAt.getTime()).toBeGreaterThan(19 * 86_400_000);
    expect(Date.now() - by["FIXTURE-X-1"].postedAt.getTime()).toBeLessThan(3 * 86_400_000);
  });

  test("bills the 20-item floor", async () => {
    const r = await search("(RivalCo) -filter:retweets");
    expect(r.units).toBe(KAITO_PAGE_MIN);
    expect(r.estCostUsd).toBeCloseTo(KAITO_PAGE_MIN * KAITO_COST_PER_ITEM_USD, 10);
  });

  test("MENTIONS_FIXTURE_FAIL=1 throws for RivalCo only", async () => {
    process.env.MENTIONS_FIXTURE_FAIL = "1";
    await expect(search("(RivalCo) -filter:retweets")).rejects.toThrow(
      "simulated provider failure (mentions fixture)"
    );
    await expect(search("(FixtureCo) -filter:retweets")).resolves.toMatchObject({ units: KAITO_PAGE_MIN });
  });
});
