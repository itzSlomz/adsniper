import Link from "next/link";
import type { MentionKind, MentionSentiment } from "@prisma/client";
import { BrandSquare } from "@/components/ui";
import MentionsCoverage from "@/components/MentionsCoverage";
import type { BrandConversation, ConversationResult, MentionCard } from "@/lib/mentions/queries";
import { KIND_LABELS, SENTIMENT_LABELS, UNCLEAR_TITLE, UNLABELLED_REASON } from "@/lib/mentions/config";
import {
  MODELED_ANCHOR,
  MODELED_TAG,
  MODELED_TAG_TITLE,
  SECTION,
  SECTION_TITLE,
  STATES,
  countSentence,
} from "@/lib/mentions/copy";
import type { Bilingual } from "@/lib/mentions/copy";

// "What did people say?" — one Server Component for the dashboard, the
// brand page and /mentions (§1.4), so the three placements cannot drift in
// wording or in honesty rules. Everything shown is read from `result`: the
// window, the counts, the relative times and the labels were computed in
// queries.ts against one clock, and this file adds no data of its own.
//
// Honesty rules enforced here rather than in the read model, because they
// are about rendering: a count is always the R1 sample sentence; every
// group of modeled values carries the "modeled" tag once (R2); a post with
// no effective label is "—" with the reason as its title, while an
// "unclear" label is a real class shown by name (R3); link text is
// co-occurrence wording only (R4); no per-post topic is ever placed next to
// a post URL, and the only handles shown belong to brand and media accounts
// (R6). Sentiment and topics are counts, never percentages and never a
// colour.

export interface MentionsSectionProps {
  result: ConversationResult;
  variant: "dashboard" | "brand" | "page";
  // The /mentions page already lists up to 50 posts per brand, so it has no
  // "All posts" footer link and no compact coverage panel (it renders the
  // full one above the section).
  showAll?: boolean;
}

const KINDS: readonly MentionKind[] = ["public", "brand_own", "media", "unclear"];
const SENTIMENTS: readonly MentionSentiment[] = ["positive", "negative", "neutral", "unclear"];

// A title attribute is one string, so the two languages are joined; body
// text always renders them as separate direction-scoped nodes instead.
const titleOf = (s: Bilingual) => `${s.en} · ${s.ar}`;

function Pair({ s }: { s: Bilingual }) {
  return (
    <>
      {s.en} · <span dir="rtl">{s.ar}</span>
    </>
  );
}

// R2 — the word every group of modeled values carries, once per group,
// linking to the methodology section that explains the method.
function ModeledTag() {
  return (
    <Link
      href={MODELED_ANCHOR}
      className="tag tag-outline"
      title={MODELED_TAG_TITLE}
      style={{ textDecoration: "none" }}
    >
      <Pair s={MODELED_TAG} />
    </Link>
  );
}

// R3 — "—" only when there is no effective label at all; "unclear" is a
// class and is shown by name, with the title that says so.
function SentimentValue({
  sentiment,
  reason,
}: {
  sentiment: MentionSentiment | null;
  reason: BrandConversation["unlabelledReason"];
}) {
  if (sentiment === null) {
    return <span title={titleOf(UNLABELLED_REASON[reason ?? "not_run"])}>—</span>;
  }
  return (
    <span title={sentiment === "unclear" ? titleOf(UNCLEAR_TITLE) : undefined}>
      <Pair s={SENTIMENT_LABELS[sentiment]} />
    </span>
  );
}

function Callout({ s, neutral = false }: { s: Bilingual; neutral?: boolean }) {
  return (
    <p className={neutral ? "callout-neutral" : "callout"} style={{ margin: 0 }}>
      <Pair s={s} />
    </p>
  );
}

function Chip({ value, label, title }: { value: string; label: Bilingual; title?: string }) {
  return (
    <div className="kpi-chip">
      <b title={title}>{value}</b>
      <span>
        <Pair s={label} />
      </span>
    </div>
  );
}

function linkTextFor(card: MentionCard, b: BrandConversation): Bilingual | null {
  const names = { brandName: b.brandName, brandNameAr: b.brandNameAr };
  if (card.linkType === "direct" || card.linkType === "topical") {
    return SECTION.linkDirectOrTopical({
      ...names,
      platform: card.adPlatform ?? "",
      adText: card.adText ?? "",
    });
  }
  if (card.linkType === "temporal") return SECTION.linkTemporal(names);
  return null;
}

function Card({ card, b }: { card: MentionCard; b: BrandConversation }) {
  const erased = card.erased !== "none" || card.displayText === "";
  const link = linkTextFor(card, b);
  return (
    <div className="space-y-1" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
      {erased ? (
        <blockquote className="text-sm text-muted mention-text" dir="auto">
          <Pair s={SECTION.erasedText} />
        </blockquote>
      ) : (
        <blockquote className="text-sm mention-text" dir="auto">
          {card.displayText}
        </blockquote>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>
          <span className="num">{card.postedAtRel.en}</span> <span dir="rtl">{card.postedAtRel.ar}</span>
        </span>
        {card.authorHandleShown && <span dir="ltr">@{card.authorHandleShown}</span>}
        <span className="tag tag-outline">
          <Pair s={KIND_LABELS[card.kind]} />
        </span>
        <span>
          <Pair s={SECTION.sentimentColumn} />: <SentimentValue sentiment={card.sentiment} reason={b.unlabelledReason} />
        </span>
        {link && (
          <span>
            <Pair s={link} />
          </span>
        )}
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          style={{ textDecoration: "underline" }}
        >
          <Pair s={SECTION.openOnX} />
        </a>
      </div>
    </div>
  );
}

function BrandBlock({
  b,
  days,
  showAll,
}: {
  b: BrandConversation;
  days: 7 | 30;
  showAll: boolean;
}) {
  const sentence = countSentence(b.posts, b.terms, b.window.from, b.window.to);
  const flagged = b.spike || b.coOccursWithBurst;
  const anyLinks = b.links.direct + b.links.topical + b.links.temporal > 0;
  const unlabelledTitle = titleOf(UNLABELLED_REASON[b.unlabelledReason ?? "not_run"]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <BrandSquare name={b.brandName} self={b.isSelf} />
        <b>{b.brandName}</b>
        <span dir="rtl" className="text-muted">
          {b.brandNameAr}
        </span>
        {b.spike && (
          <span className="callout">
            <Pair s={SECTION.spike({ posts: b.posts, baselinePerWeek: b.baselinePerWeek })} />
          </span>
        )}
        {b.coOccursWithBurst && (
          <span className="callout-neutral">
            <Pair s={SECTION.burst} />
          </span>
        )}
        {flagged && <ModeledTag />}
      </div>

      {b.lastPollStatus === "partial" && b.lastPollError && (
        <Callout
          neutral
          s={STATES.lastPullFailed({
            brandName: b.brandName,
            brandNameAr: b.brandNameAr,
            message: b.lastPollError,
          })}
        />
      )}

      <div>
        <p className="text-sm num" style={{ margin: 0 }}>
          {sentence.en}
        </p>
        <p className="text-sm num" dir="rtl" style={{ margin: 0 }}>
          {sentence.ar}
        </p>
        {b.posts > 0 && b.distinctPosts < b.posts && (
          <p className="text-xs text-muted" style={{ margin: 0 }}>
            (<Pair s={SECTION.distinct(b.distinctPosts)} />)
          </p>
        )}
      </div>

      {b.posts === 0 ? (
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          <Pair s={STATES.nothingInWindow} />
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                <Pair s={SECTION.authorTypeNote} />
              </span>
              <ModeledTag />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {KINDS.map((k) => (
                <Chip key={k} value={String(b.byKind[k])} label={KIND_LABELS[k]} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                <Pair s={SECTION.sentimentHeader(b.labelled)} />
              </span>
              <ModeledTag />
            </div>
            {b.sentiment ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {SENTIMENTS.map((s) => (
                  <Chip key={s} value={String(b.sentiment?.[s] ?? 0)} label={SENTIMENT_LABELS[s]} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Chip value="—" label={SECTION.sentimentColumn} title={unlabelledTitle} />
              </div>
            )}
          </div>

          {b.topTopics && b.topTopics.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  <Pair s={SECTION.topicColumn} />
                </span>
                <ModeledTag />
              </div>
              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>
                      <Pair s={SECTION.topicColumn} />
                    </th>
                    <th>
                      <Pair s={SECTION.postsColumn} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {b.topTopics.map((t) => (
                    <tr key={t.key}>
                      <td>
                        {t.labelEn} <span dir="rtl">{t.labelAr}</span>
                      </td>
                      <td className="num">{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {anyLinks && (
            <p className="flex flex-wrap items-center gap-2 text-xs" style={{ margin: 0 }}>
              <span className="num">
                <Pair s={SECTION.links(b.links)} />
              </span>
              <ModeledTag />
            </p>
          )}

          {b.samples.length > 0 && (
            <div className="space-y-2">
              {b.samples.map((card) => (
                <Card key={card.id} card={card} b={b} />
              ))}
            </div>
          )}

          {!showAll && (
            <p style={{ margin: 0 }}>
              <Link
                href={`/mentions?brand=${encodeURIComponent(b.brandId)}&days=${days}`}
                className="text-sm"
                style={{ textDecoration: "underline" }}
              >
                <Pair s={SECTION.allPosts(b.posts)} />
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function MentionsSection({ result, variant, showAll = false }: MentionsSectionProps) {
  const brands = result.brands;
  // A dashboard or brand page with nothing to say shows nothing rather than
  // an empty card; the /mentions page keeps its frame so the coverage
  // disclosure is still there.
  if (brands.length === 0 && variant !== "page") return null;

  const windowLabel =
    variant === "dashboard" ? SECTION.dashboardWindow(result.window.to) : SECTION.daysWindow(result.days);

  // §1.5, first match wins. The poll status is instance-wide, so the first
  // brand speaks for all; "no rows yet" is approximated from the result —
  // a brand with a post in the window or before it has rows.
  const status = brands[0]?.lastPollStatus ?? "never";
  const hasRows = brands.some((b) => b.posts > 0 || b.prevPosts !== null);
  // An unknown ?brand= yields no brands at all; that is not "never pulled".
  const noPulls = brands.length > 0 && status === "never" && !hasRows;
  const budgetStopped = !noPulls && status === "stopped_budget";

  return (
    <section className="card elev-sm space-y-5">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <span className="section-kicker">
          {SECTION.kicker(windowLabel.en)} · <span dir="rtl">{windowLabel.ar}</span>
        </span>
        <h2 style={{ margin: 0 }}>
          {SECTION_TITLE.en}{" "}
          <span className="text-muted" style={{ fontWeight: 400 }}>
            ·
          </span>{" "}
          <span dir="rtl">{SECTION_TITLE.ar}</span>
        </h2>
      </div>

      {variant !== "page" && <MentionsCoverage variant="compact" />}

      {noPulls && <Callout s={STATES.noPulls} />}
      {budgetStopped && <Callout s={STATES.budgetStopped} />}

      {!noPulls && brands.map((b) => <BrandBlock key={b.brandId} b={b} days={result.days} showAll={showAll} />)}
    </section>
  );
}
