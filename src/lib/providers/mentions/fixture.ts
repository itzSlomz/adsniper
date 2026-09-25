import type { FetchedMention, MentionsProvider } from "@/lib/providers/types";
import { KAITO_COST_PER_ITEM_USD, KAITO_PAGE_MIN } from "@/lib/mentions/config";

// VERIFICATION-ONLY mentions provider. This is not a data source and never
// runs in a customer instance: it is selected only when MENTIONS_FIXTURE=1,
// which the provisioning runbook never sets. It exists so the launch-
// readiness harness can exercise the *real* ingestion path (runMentionsPoll
// → adapter interface → Postgres → cost log → classify → retention) end to
// end without a paid provider call, proving dedup, author kinds, campaign
// links, repeated-text detection, takedown and erasure against a real
// database.
//
// Everything it emits is loudly identifiable so a fixture run can never be
// mistaken for real public posts: ids are prefixed "FIXTURE-X-", URLs point
// at example.invalid, and the raw payload carries `_fixture: true`. Only
// queries naming the two fixture brands return anything, so pointing a
// fixture run at a real brand list cannot fabricate posts for a real brand.

const FIXTURE_BRANDS = { self: "FixtureCo", rival: "RivalCo" } as const;

const HOUR = 60 * 60 * 1000;

interface Row {
  n: number;
  brand: (typeof FIXTURE_BRANDS)[keyof typeof FIXTURE_BRANDS];
  hoursAgo: number;
  author: { handle: string; externalAuthorId: string } | null;
  text: string;
  urls: string[];
  // Phase 2 only (a second pull adds exactly one row).
  phase2Only?: boolean;
}

// Kept as data so the harness table in the spec (§4.4) and this list are
// the same thing. X-6 repeats X-1's text byte for byte (duplicate path);
// X-5 carries PII of every kind the de-identifier must catch; X-9 sits
// outside the 7-day window and is the retention target.
const ROWS: Row[] = [
  {
    n: 1,
    brand: "FixtureCo",
    hoursAgo: 48,
    author: { handle: "alice_pub", externalAuthorId: "9001" },
    text: "FixtureCo raised the cashback on its credit card this week https://example.invalid/landing?utm_source=x",
    urls: ["https://example.invalid/landing?utm_source=x"],
  },
  {
    n: 2,
    brand: "FixtureCo",
    hoursAgo: 48,
    author: { handle: "bob_pub", externalAuthorId: "9002" },
    text: "بنك FixtureCo التطبيق يعلق كل مرة @fixtureco",
    urls: [],
  },
  {
    n: 3,
    brand: "FixtureCo",
    hoursAgo: 24,
    author: { handle: "fixtureco", externalAuthorId: "9003" },
    text: "We just launched our new savings account — FixtureCo",
    urls: [],
  },
  {
    n: 4,
    brand: "FixtureCo",
    hoursAgo: 24,
    author: { handle: "fixturenews", externalAuthorId: "9004" },
    text: "FixtureCo reports Q3 results — Fixture News",
    urls: [],
  },
  {
    n: 5,
    brand: "FixtureCo",
    hoursAgo: 72,
    author: null,
    text: "anyone tried FixtureCo transfers? call me 0512345678 or SA0380000000608010167519 or a.b@example.invalid",
    urls: [],
  },
  {
    n: 6,
    brand: "FixtureCo",
    hoursAgo: 24,
    author: { handle: "carol_pub", externalAuthorId: "9006" },
    text: "FixtureCo raised the cashback on its credit card this week https://example.invalid/landing?utm_source=x",
    urls: ["https://example.invalid/landing?utm_source=x"],
  },
  {
    n: 7,
    brand: "RivalCo",
    hoursAgo: 24,
    author: { handle: "dan_pub", externalAuthorId: "9007" },
    text: "RivalCo mortgage rates are up again",
    urls: [],
  },
  {
    n: 8,
    brand: "FixtureCo",
    hoursAgo: 12,
    author: { handle: "erin_pub", externalAuthorId: "9008" },
    text: "FixtureCo app update fixed the login bug",
    urls: [],
    phase2Only: true,
  },
  {
    n: 9,
    brand: "FixtureCo",
    hoursAgo: 20 * 24,
    author: { handle: "frank_pub", externalAuthorId: "9009" },
    text: "FixtureCo branch in Riyadh was quick today, good service",
    urls: [],
  },
];

const phase = () => (process.env.MENTIONS_FIXTURE_PHASE === "2" ? 2 : 1);

function toMention(row: Row, now: number, ph: 1 | 2): FetchedMention {
  const id = `FIXTURE-X-${row.n}`;
  // Metrics move between phases so the harness can prove a re-pull updates
  // publicMetrics on a known row without touching its text or authors.
  const bump = ph === 2 ? 1 : 0;
  return {
    externalId: id,
    url: `https://example.invalid/x/${id}`,
    postedAt: new Date(now - row.hoursAgo * HOUR),
    text: row.text,
    isReply: false,
    isRetweet: false,
    publicMetrics: { likes: row.n + bump, reposts: bump, replies: row.n % 3 },
    urls: [...row.urls],
    author: row.author ? { ...row.author } : null,
    raw: { _fixture: true, id, phase: ph, brand: row.brand, unmappedField: `keep-me-${id}` },
  };
}

export const fixtureMentionsProvider: MentionsProvider = {
  name: "mentions:fixture-x",
  platform: "x",

  async searchMentions(query) {
    const q = query.toLowerCase();
    const brand = q.includes(FIXTURE_BRANDS.self.toLowerCase())
      ? FIXTURE_BRANDS.self
      : q.includes(FIXTURE_BRANDS.rival.toLowerCase())
        ? FIXTURE_BRANDS.rival
        : null;
    if (!brand) return { items: [], units: 0, estCostUsd: 0 };
    // MENTIONS_FIXTURE_FAIL=1 makes one brand's pull throw, so the harness
    // can prove a provider failure is caught per brand (status "partial")
    // while every other brand still ingests — the "degrade honestly" rule.
    if (process.env.MENTIONS_FIXTURE_FAIL === "1" && brand === FIXTURE_BRANDS.rival) {
      throw new Error("simulated provider failure (mentions fixture)");
    }
    const ph = phase();
    const now = Date.now();
    // The window is deliberately not applied: X-9 (−20 d) must be ingested
    // so retention has something to erase. The real adapter drops
    // out-of-window rows; this one models an actor that returns them.
    const items = ROWS.filter((r) => r.brand === brand && (ph === 2 || !r.phase2Only)).map((r) =>
      toMention(r, now, ph)
    );
    const units = Math.max(items.length, KAITO_PAGE_MIN);
    return { items, units, estCostUsd: units * KAITO_COST_PER_ITEM_USD };
  },
};
