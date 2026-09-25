import { DAILY_SPEND_ASSUMPTIONS_USD, PRESSURE_WEIGHTS } from "@/lib/estimation";
import { ALL_STAGES, PROVEN_AFTER_DAYS, TRACTION_AFTER_DAYS } from "@/lib/adStage";
import { hasFeature } from "@/lib/license";
import {
  AI_RATES_SNAPSHOT_DATE,
  AI_RATES_USD_PER_MTOK,
  AI_RATE_FALLBACK,
  STRUCTURED_OUTPUT_MODELS,
} from "@/lib/ai";
import {
  HOMONYMS,
  KAITO_COST_PER_ITEM_USD,
  KAITO_PAGE_MIN,
  KIND_LABELS,
  MAX_BATCH_ITEMS,
  MAX_ITEM_CHARS,
  MENTIONS_BACKFILL_DAYS,
  MENTIONS_DEFAULT_MODEL,
  MENTIONS_LINK_WINDOW_DAYS,
  MENTIONS_OVERLAP_MINUTES,
  MENTION_DUP_WINDOW_DAYS,
  PROHIBITED_INFERENCES,
  PROMPT_VERSION,
  SPIKE_BASELINE_WEEKS,
  SPIKE_COOLDOWN_DAYS,
  SPIKE_FACTOR,
  SPIKE_MIN_BASELINE_PER_WEEK,
  SPIKE_MIN_POSTS,
  SPIKE_WINDOW_DAYS,
  TAXONOMY,
  TAXONOMY_VERSION,
  TOPIC_OTHER,
  classifierMode,
  classifierModel,
  mentionsMaxCallsPerBrandPerDay,
  mentionsMaxItemsPerBrandPerDay,
  mentionsMaxItemsPerCall,
  mentionsRetentionDays,
} from "@/lib/mentions/config";

export const dynamic = "force-dynamic";

// The disclosure page every modeled number links to. It renders the live
// constants from src/lib/estimation.ts (and, when the audience-conversation
// add-on is licensed, from src/lib/mentions/config.ts and src/lib/ai.ts),
// so what it discloses is what the code actually uses — the two can't
// drift apart.
export default function MethodologyPage() {
  // Entitlement decides the section's existence, not its wording: an
  // un-entitled instance has no #conversation anchor at all (§7.6).
  const conversation = hasFeature("mentions");
  const mode = classifierMode();
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="section-head">
        <span className="section-kicker neutral">Reference</span>
        <h1 style={{ margin: 0, fontSize: 28 }}>How MarketingSpy counts and estimates</h1>
      </div>

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>Observed data (facts)</h2>
        <p>
          Ads, their creatives, formats, placements and dates come from public
          ad libraries (Meta Ad Library, Google Ads Transparency Center),
          TikTok&apos;s curated Top Ads chart (partial coverage only), and ads
          your team logs manually for platforms without a public library
          (X, Snapchat). Coverage is disclosed on every surface; it is never
          exhaustive.
        </p>
        <p>
          <strong>Days running</strong> is the span between the first and most
          recent time we observed the ad in a library. Libraries don&apos;t
          always expose start dates (LinkedIn doesn&apos;t), so for those the
          clock starts at first detection — durations are floors, not exact
          run lengths.
        </p>
      </section>

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>Ad lifecycle stage (observed)</h2>
        <p>
          Days running are an observation, but a raw day count needs a
          benchmark most readers don&apos;t carry. Each ad is therefore
          labelled by how long it has survived — the thresholds are editorial,
          fixed at {TRACTION_AFTER_DAYS} and {PROVEN_AFTER_DAYS} days, and the
          same everywhere the label appears.
        </p>
        <table className="table">
          <thead>
            <tr><th>Stage</th><th>Running</th><th>What it licenses you to conclude</th></tr>
          </thead>
          <tbody>
            {ALL_STAGES.map((s) => (
              <tr key={s.key}>
                <td className="font-semibold">
                  {s.labelEn} <span className="text-muted" dir="rtl">{s.labelAr}</span>
                </td>
                <td>
                  {s.key === "test"
                    ? `< ${TRACTION_AFTER_DAYS}d`
                    : s.key === "traction"
                      ? `${TRACTION_AFTER_DAYS}–${PROVEN_AFTER_DAYS - 1}d`
                      : `${PROVEN_AFTER_DAYS}d+`}
                </td>
                <td>{s.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">
          A stage is a floor, not a verdict: where a library publishes no start
          date, the clock starts at our first detection, so an ad may have been
          running longer than its label suggests — never shorter.
        </p>
      </section>

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>Ad Pressure Index (modeled, 0–100)</h2>
        <p>
          A relative ranking of advertising presence <em>within the brands
          this workspace tracks</em> — not an absolute market measure. Four
          observed components, each normalized against the market leader,
          blended with these weights:
        </p>
        <table className="table">
          <thead>
            <tr><th>Component</th><th>Weight</th><th>Signal</th></tr>
          </thead>
          <tbody>
            <tr><td>Volume</td><td>{PRESSURE_WEIGHTS.volume}</td><td>Active ads right now</td></tr>
            <tr><td>Breadth</td><td>{PRESSURE_WEIGHTS.breadth}</td><td>Platforms with ≥1 active ad</td></tr>
            <tr><td>Format commitment</td><td>{PRESSURE_WEIGHTS.formatCommitment}</td><td>Share of video/carousel (costlier formats)</td></tr>
            <tr><td>Persistence</td><td>{PRESSURE_WEIGHTS.persistence}</td><td>Median days live of active ads (capped 60)</td></tr>
          </tbody>
        </table>
        <p className="text-xs text-muted">
          The weights are editorial judgment, held fixed so the index is
          comparable week to week.
        </p>
      </section>

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>Estimated spend (modeled range)</h2>
        <p>
          Public ad libraries <strong>do not disclose commercial ad budgets
          in most regions, including Saudi Arabia</strong>. MarketingSpy therefore
          never reports spend as fact. The estimate works like this: every ad
          observed in the trailing 30 days contributes an assumed daily spend
          range for its platform and format, multiplied by the days it was
          live in the window; a brand&apos;s range is the sum. Bounds are
          rounded to two significant figures and always shown as a low–high
          range, never a single number.
        </p>
        <table className="table">
          <thead>
            <tr><th>Platform</th><th>Image</th><th>Video</th><th>Carousel</th><th>Text</th></tr>
          </thead>
          <tbody>
            {Object.entries(DAILY_SPEND_ASSUMPTIONS_USD).map(([platform, t]) => (
              <tr key={platform}>
                <td className="font-semibold">{platform}</td>
                <td>${t.image[0]}–{t.image[1]}</td>
                <td>${t.video[0]}–{t.video[1]}</td>
                <td>${t.carousel[0]}–{t.carousel[1]}</td>
                <td>${t.text[0]}–{t.text[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">
          Assumed daily USD spend per active ad. Deliberately wide, based on
          typical minimum budgets and CPM floors in GCC/MENA markets. Use the
          estimate to compare magnitude and direction between competitors —
          not as an accounting figure.
        </p>
      </section>

      {conversation && (
        <section id="conversation" className="card elev-sm space-y-2 text-sm">
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Audience conversation (observed counts, modeled labels){" "}
            <span className="text-muted" dir="rtl">حديث الجمهور</span>
          </h2>
          <p>
            Public X posts are pulled through a third-party scraper (Apify) with
            one search per brand — the brand&apos;s search terms joined with OR,
            retweets excluded, replies kept. Every count is the number of posts
            that search returned in the window: a sample, never a total. A post
            repeating the same text within {MENTION_DUP_WINDOW_DAYS} days is
            counted but classified once. One brand per post: a post naming two
            tracked brands is stored under the first brand whose search returned
            it — brands are searched in a fixed order, your own brand first, then
            competitors in the order they were added.
          </p>
          <table className="table">
            <thead>
              <tr><th>Rule (modeled unless observed)</th><th>How it is decided</th><th>Note</th></tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-semibold">Pull limits</td>
                <td className="num">
                  ≤{mentionsMaxItemsPerCall()} posts per brand per pull,
                  ≤{mentionsMaxCallsPerBrandPerDay()} pulls and
                  ≤{mentionsMaxItemsPerBrandPerDay()} posts per brand per day;
                  each pull billed ≥{KAITO_PAGE_MIN} items at ${KAITO_COST_PER_ITEM_USD}/item
                </td>
                <td className="num">window ≤{MENTIONS_BACKFILL_DAYS} days, overlap {MENTIONS_OVERLAP_MINUTES} min</td>
              </tr>
              <tr>
                <td className="font-semibold">Author type (modeled, rule-based)</td>
                <td>
                  brand account = the queried brand&apos;s @handle; media = a handle on
                  the instance&apos;s media list; public = any other handle; unclear =
                  no author returned
                </td>
                <td>
                  labels:{" "}
                  {(Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>).map((k, i) => (
                    <span key={k}>
                      {i > 0 ? " · " : ""}
                      {KIND_LABELS[k].en} <span dir="rtl" className="text-muted">{KIND_LABELS[k].ar}</span>
                    </span>
                  ))}
                </td>
              </tr>
              <tr>
                <td className="font-semibold">Campaign link (modeled)</td>
                <td>
                  direct = a URL in the post matches an active ad&apos;s landing page;
                  topical = the post and an ad active within ±{MENTIONS_LINK_WINDOW_DAYS} days
                  share an offer category; temporal = posted during a detected campaign burst
                </td>
                <td>always co-occurrence, never causation</td>
              </tr>
              <tr>
                <td className="font-semibold">Unusual volume (modeled)</td>
                <td className="num">
                  ≥{SPIKE_MIN_POSTS} posts in {SPIKE_WINDOW_DAYS} days AND ≥{SPIKE_FACTOR}× the
                  trailing {SPIKE_BASELINE_WEEKS}-week weekly average (baseline
                  ≥{SPIKE_MIN_BASELINE_PER_WEEK}/week)
                </td>
                <td className="num">one flag per {SPIKE_COOLDOWN_DAYS} days, aggregate per brand</td>
              </tr>
              <tr>
                <td className="font-semibold">Topic &amp; sentiment (modeled)</td>
                <td>
                  {mode === "on"
                    ? `on, model ${classifierModel()} (default ${MENTIONS_DEFAULT_MODEL}; structured outputs required — ${STRUCTURED_OUTPUT_MODELS.join(", ")})`
                    : mode === "fixture"
                      ? "FIXTURE (verification only)"
                      : "off — posts unlabelled"}
                  ; topics are shown as per-brand counts only, never on an individual
                  post; prompt {PROMPT_VERSION} (frozen file prompts/mentions-classifier-v1.md);
                  taxonomy {TAXONOMY_VERSION}; batches of ≤{MAX_BATCH_ITEMS} de-identified
                  posts ≤{MAX_ITEM_CHARS} chars
                </td>
                <td>
                  an invalid batch is rejected whole and nothing is stored;
                  &quot;unclear&quot; is a real class, never rounded to neutral
                </td>
              </tr>
              <tr>
                <td className="font-semibold">Retention</td>
                <td className="num">{mentionsRetentionDays()} days</td>
                <td>
                  text, raw payload, evidence spans and author identifiers erased;
                  counts, author type, labels and ad links kept
                </td>
              </tr>
              <tr>
                <td className="font-semibold">AI rates</td>
                <td className="num">snapshot {AI_RATES_SNAPSHOT_DATE}, USD per million tokens</td>
                <td>
                  unknown models charged at the fallback rate (${AI_RATE_FALLBACK.input} in / ${AI_RATE_FALLBACK.output} out);
                  stopped by MONTHLY_COST_CEILING_AI_USD
                </td>
              </tr>
            </tbody>
          </table>
          <table className="table">
            <thead>
              <tr><th>Model</th><th>Input</th><th>Output</th></tr>
            </thead>
            <tbody>
              {Object.entries(AI_RATES_USD_PER_MTOK).map(([model, rate]) => (
                <tr key={model}>
                  <td className="font-semibold">{model}</td>
                  <td className="num">${rate.input}</td>
                  <td className="num">${rate.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="table">
            <thead>
              <tr><th>Topic (modeled)</th><th>Key</th><th>Seed keywords</th></tr>
            </thead>
            <tbody>
              {TAXONOMY.map((t) => (
                <tr key={t.key}>
                  <td className="font-semibold">
                    {t.labelEn} <span className="text-muted" dir="rtl">{t.labelAr}</span>
                  </td>
                  <td><code>{t.key}</code></td>
                  <td dir="auto">{t.keywords.join(", ")}</td>
                </tr>
              ))}
              <tr>
                <td className="font-semibold">
                  {TOPIC_OTHER.labelEn} <span className="text-muted" dir="rtl">{TOPIC_OTHER.labelAr}</span>
                </td>
                <td><code>{TOPIC_OTHER.key}</code></td>
                <td className="text-muted">anything else about the bank — decided by the model, no seed keywords</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-muted">
            Before the model sees a post, handles, links, emails, phone, IBAN and
            account numbers are replaced by placeholders. Homonyms the classifier
            is told about: <span dir="auto">{HOMONYMS.map((h) => h.term).join(" · ")}</span>.
            It is forbidden to infer {PROHIBITED_INFERENCES.join(", ")} about any
            author; the schema cannot store such labels. Every value on this page
            is read from the running code.
          </p>
        </section>
      )}

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>The rule behind all of it</h2>
        <p>
          If a metric can be sourced, it is sourced and shown as fact. If it
          can&apos;t, it is either shown as &quot;—&quot; with the reason, or
          modeled under the documented assumptions above and labeled
          <em> modeled</em> everywhere it appears. Nothing in between.
        </p>
      </section>
    </main>
  );
}
