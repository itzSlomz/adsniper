// Every customer-facing string of the audience-conversation surfaces, in
// both languages, in one pure module: the wording rules R1–R6 (§1.1) are
// unit-tested against this file, and a string that lives here cannot drift
// between the dashboard, the brand page, /mentions, the admin page and the
// Monday brief. Templated strings are functions; everything else is a
// `{ en, ar }` pair. Arabic is a peer, never a translation layer — the AR
// forms are hand-written, including counted-noun agreement.
//
// Not here on purpose: label pairs (KIND_LABELS etc.) live in config.ts so
// /methodology renders the same values the cards do.

export interface Bilingual {
  en: string;
  ar: string;
}

// R4 — co-occurrence only. Any of these in generated copy is a bug; the
// weekly-brief fallback and this file are tested against them.
export const FORBIDDEN_CAUSAL: readonly RegExp[] = [
  /\b(?:drove|caused|led to|because of|in response to|triggered|produced)\b/i,
  /بسبب|أدّى إلى|أدى|نتيجة|ردًّا على|تسبب/,
];

// Unicode isolates (LRI … PDI): a Latin date inside an RTL sentence keeps
// its own direction and its own place, which `<bdi>` does in HTML and this
// does in plain narrative text. Never an arrow between two dates (UBA N1
// would reorder them for the reader).
export const isolate = (s: string) => `⁦${s}⁩`;

// --- Names ---

export const PRODUCT_NAME: Bilingual = { en: "Audience conversation", ar: "حديث الجمهور" };
export const SECTION_TITLE: Bilingual = { en: "What did people say?", ar: "ماذا قال الناس؟" };
export const NAV_LABEL = "Conversation";

// R2 — the word every group of modeled values carries, once per group.
export const MODELED_TAG: Bilingual = { en: "modeled", ar: "نموذجي" };
export const MODELED_TAG_TITLE = "Modeled — see /methodology";
export const MODELED_ANCHOR = "/methodology#conversation";

// --- R1: counts are samples ---

// Arabic counted noun for "posts": dual, the 3–10 plural and the 11+
// accusative singular are distinct forms.
export function arPosts(n: number): string {
  if (n === 0) return "لا منشورات";
  if (n === 1) return "منشور واحد";
  if (n === 2) return "منشوران";
  if (n <= 10) return `${n} منشورات`;
  return `${n} منشورًا`;
}

// arPosts followed by the verb agreeing with it (a broken plural takes the
// feminine singular verb).
export function arMatched(n: number): string {
  if (n === 0) return "لا منشورات طابقت";
  if (n === 1) return "منشور واحد طابق";
  if (n === 2) return "منشوران طابقا";
  return `${arPosts(n)} طابقت`;
}

const TERMS_SHOWN = 3;

// First three terms, then "+k" / "+k أخرى".
export function termsLabel(terms: string[], lang: "en" | "ar"): string {
  const shown = terms.slice(0, TERMS_SHOWN).join(", ");
  const rest = terms.length - TERMS_SHOWN;
  if (rest <= 0) return shown;
  return lang === "ar" ? `${shown} +${rest} أخرى` : `${shown} +${rest}`;
}

// The one sentence every count of posts is rendered through. Dates are ISO
// YYYY-MM-DD; in the Arabic form each is isolated so the range reads
// "from … to …" in the order written. Surfaces render one <p> per language.
export function countSentence(n: number, terms: string[], from: string, to: string): Bilingual {
  return {
    en: `${n} ${n === 1 ? "post" : "posts"} matched "${termsLabel(terms, "en")}" on X from ${from} to ${to} — a sample, not a total.`,
    ar: `${arMatched(n)} «${termsLabel(terms, "ar")}» على X من ${isolate(from)} إلى ${isolate(to)} — عيّنة وليست إجمالًا.`,
  };
}

// --- Relative time (pure, bilingual) ---

function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

// Server-side replacement for the client-only relTime() in ui.tsx: the
// clock is a parameter so a Server Component and a test agree on the answer.
export function relTimeFor(iso: string, now: Date): Bilingual {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return { en: "just now", ar: "الآن" };
  if (mins < 60) {
    return { en: `${mins} min ago`, ar: `قبل ${arCount(mins, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}` };
  }
  const hours = Math.round(mins / 60);
  if (hours < 48) {
    return { en: `${hours} h ago`, ar: `قبل ${arCount(hours, "ساعة", "ساعتين", "ساعات", "ساعة")}` };
  }
  const days = Math.round(mins / 1440);
  return { en: `${days} d ago`, ar: `قبل ${arCount(days, "يوم", "يومين", "أيام", "يومًا")}` };
}

// --- §1.2 Admin page: Intel → Conversation ---

export const ADMIN = {
  kicker: "Admin",
  intro: {
    en: "Public posts on X that mention your brand and its competitors, pulled through a third-party scraper. Counts are samples, never totals. Sentiment and topics are modeled labels, off until the vendor configures an AI key.",
    ar: "منشورات عامة على X تذكر علامتك ومنافسيها، تُسحب عبر أداة طرف ثالث. الأعداد عيّنات وليست إجماليات. المشاعر والمواضيع تصنيفات نموذجية، وتبقى متوقفة حتى يضبط المزوّد مفتاح الذكاء الاصطناعي.",
  } as Bilingual,
  cardTerms: {
    title: { en: "1 · Switch on and choose search terms", ar: "١ · التشغيل واختيار كلمات البحث" } as Bilingual,
    enabled: { en: "Track public conversation on X", ar: "تتبّع الحديث العام على X" } as Bilingual,
    colBrand: { en: "Brand", ar: "العلامة" } as Bilingual,
    colTerms: { en: "Search terms (comma-separated)", ar: "كلمات البحث" } as Bilingual,
    help: {
      en: "Seeded from each brand's aliases and @handle (Intel → Brands). Each brand is one X search: terms joined with OR, retweets excluded. Quote multi-word terms. Generic words (الأهلي، البلاد، الرياض، الراجحي، الجزيرة) match unrelated posts — every matched post is still billed.",
      ar: "مأخوذة من أسماء العلامة البديلة ومعرّف X (Intel ← Brands). كل علامة = بحث واحد على X، الكلمات مربوطة بـ OR، بلا إعادات نشر. الكلمات العامة (الأهلي، البلاد، الرياض، الراجحي، الجزيرة) تطابق منشورات غير ذات صلة — وكل منشور مطابق يُحاسب عليه.",
    } as Bilingual,
    mediaHandles: {
      en: 'Media accounts (handles, comma-separated) — their posts are tagged "media"',
      ar: "حسابات الإعلام (معرّفات مفصولة بفواصل) — تُوسم منشوراتها «إعلام»",
    } as Bilingual,
    save: { en: "Save", ar: "حفظ" } as Bilingual,
    noBrands: {
      en: "Add your brand and competitors in Intel → Brands first.",
      ar: "أضف علامتك ومنافسيك في Intel ← Brands أولًا.",
    } as Bilingual,
    missingKey: {
      en: "X_PROVIDER_API_KEY is not set — pulls will fail until the vendor sets it.",
      ar: "لم يُضبط X_PROVIDER_API_KEY — ستفشل عمليات السحب حتى يضبطه المزوّد.",
    } as Bilingual,
  },
  cardPull: {
    title: { en: "2 · Pull now", ar: "٢ · اسحب الآن" } as Bilingual,
    // Every figure is passed in from config.ts so the sentence can never
    // disagree with the caps it describes.
    help(o: { pageMin: number; pageMinCostUsd: string; maxCalls: number; maxItems: number }): Bilingual {
      return {
        en: `Runs mentions-poll, then mentions-classify when AI labelling is on. Manual only in this version — nothing is scheduled. Each pull is billed at least ${o.pageMin} posts per brand (~$${o.pageMinCostUsd}); today's cap is ${o.maxCalls} pulls and ${o.maxItems} posts per brand.`,
        ar: `يشغّل mentions-poll ثم mentions-classify عند تفعيل التصنيف الآلي. يدوي فقط في هذه النسخة — لا جدولة. يُحاسب كل سحب على ${o.pageMin} منشورًا على الأقل لكل علامة؛ الحد اليومي ${o.maxCalls} سحبات و${o.maxItems} منشورًا لكل علامة.`,
      };
    },
    lastPull(o: { startedAt: string; status: string; itemsIngested: number }): Bilingual {
      return {
        en: `Last pull: ${o.startedAt} · ${o.status} · ${o.itemsIngested} new posts`,
        ar: `آخر سحب: ${isolate(o.startedAt)} · ${o.status} · ${arPosts(o.itemsIngested)} جديدة`,
      };
    },
    lastPullNever: { en: "Last pull: never", ar: "آخر سحب: لم يُنفَّذ بعد" } as Bilingual,
    aiOn(o: { model: string; promptVersion: string; taxonomyVersion: string }): Bilingual {
      return {
        en: `AI labelling: on (${o.model}, prompt ${o.promptVersion}, taxonomy ${o.taxonomyVersion})`,
        ar: `التصنيف الآلي: مفعّل (${isolate(o.model)}، ${isolate(o.promptVersion)}، ${isolate(o.taxonomyVersion)})`,
      };
    },
    aiFixture: {
      en: "AI labelling: FIXTURE (verification only)",
      ar: "التصنيف الآلي: تجريبي (للتحقق فقط)",
    } as Bilingual,
    aiOff: {
      en: "AI labelling: off — posts are stored and counted, never labelled (—)",
      ar: "التصنيف الآلي: متوقف — تُحفظ المنشورات وتُعدّ لكن لا تُصنَّف (—)",
    } as Bilingual,
    pullNow: { en: "Pull now", ar: "اسحب الآن" } as Bilingual,
    switchOnFirst: {
      en: "Switch on tracking first (card 1).",
      ar: "فعّل التتبّع أولًا (البطاقة ١).",
    } as Bilingual,
  },
  cardRetention: {
    title: { en: "Retention & removal", ar: "الاحتفاظ والإزالة" } as Bilingual,
    retention(days: number): Bilingual {
      return {
        en: `Post text, evidence spans and author identifiers are erased ${days} days after the post date (job mentions-retention, nightly). Counts, author type, labels and ad links are kept without identifiers.`,
        ar: `يُمسح نص المنشور ومقاطع الدليل ومعرّفات الكاتب بعد ${days} يومًا من تاريخ النشر (مهمة mentions-retention، ليليًا). تبقى الأعداد ونوع الكاتب والتصنيفات وروابط الإعلانات بلا معرّفات.`,
      };
    },
    recentPosts: { en: "Recent posts (last 50)", ar: "آخر المنشورات" } as Bilingual,
    open: { en: "open ↗", ar: "افتح ↗" } as Bilingual,
    remove: { en: "Remove", ar: "إزالة" } as Bilingual,
    removedMarker: { en: "[removed]", ar: "[أُزيل]" } as Bilingual,
    erasedMarker: { en: "[erased]", ar: "[مُسح]" } as Bilingual,
    removeByLink: { en: "Remove by X link", ar: "إزالة برابط" } as Bilingual,
    refPlaceholder: "https://x.com/…/status/123 or 123",
    noMatch: {
      en: "no stored post matches that link",
      ar: "لا يوجد منشور محفوظ يطابق هذا الرابط",
    } as Bilingual,
    caption: {
      en: "Use Remove when a post was deleted or made private on X, or on request — its text, metrics and author are erased immediately, it is excluded from every count, and it is never re-ingested (X requires removal within 24 hours).",
      ar: "استخدم «إزالة» عند حذف المنشور أو جعله خاصًا على X أو بناءً على طلب — يُمسح نصه ومقاييسه وكاتبه فورًا، ويُستبعد من كل الأعداد، ولا يُعاد جلبه أبدًا (تشترط X الإزالة خلال 24 ساعة).",
    } as Bilingual,
  },
} as const;

// --- §1.6 Coverage panel (R5) ---

// The "How labels are produced →" link line of the full variant is not
// here: its wording trips the R4 scan of this file and it is a link label,
// not generated copy — MentionsCoverage carries it verbatim from §1.6.
export function coverageText(o: { maxItemsPerCall: number; retentionDays: number }): Bilingual {
  return {
    en: `Coverage: public X posts, sampled through a third-party scraper (Apify) using each brand's search terms — a sample of what the search returned, never everything posted; at most ${o.maxItemsPerCall} posts per brand per pull; replies included, reposts excluded. Not covered: Snapchat, TikTok, Instagram comments, private or protected accounts, deleted posts. Text and author identifiers are erased after ${o.retentionDays} days.`,
    ar: `التغطية: منشورات X العامة، عيّنة عبر أداة طرف ثالث (Apify) بحسب كلمات بحث كل علامة — عيّنة مما أعاده البحث وليس كل ما نُشر؛ بحد أقصى ${o.maxItemsPerCall} منشورًا لكل علامة في كل سحب؛ الردود مشمولة وإعادات النشر مستبعدة. غير مشمول: سناب شات، تيك توك، تعليقات إنستغرام، الحسابات الخاصة أو المحمية، المنشورات المحذوفة. يُمسح النص ومعرّفات الكاتب بعد ${o.retentionDays} يومًا.`,
  };
}

// --- §1.4 "What did people say?" section ---

export const SECTION = {
  kicker(windowLabel: string): string {
    return `${PRODUCT_NAME.en} · ${windowLabel}`;
  },
  // Dashboard: always the 7 days ending on the selected date.
  dashboardWindow(date: string): Bilingual {
    return { en: `7 days to ${date}`, ar: `٧ أيام حتى ${isolate(date)}` };
  },
  daysWindow(days: 7 | 30): Bilingual {
    return days === 7 ? { en: "7 days", ar: "٧ أيام" } : { en: "30 days", ar: "٣٠ يومًا" };
  },
  spike(o: { posts: number; baselinePerWeek: number | null }): Bilingual {
    const base = o.baselinePerWeek === null ? "—" : `~${o.baselinePerWeek}`;
    return {
      en: `Unusual volume (modeled): ${o.posts} posts vs ${base}/week`,
      ar: "حجم غير معتاد (نموذجي)",
    };
  },
  burst: {
    en: "In the same window as a possible new campaign — see Detected ads. Co-occurrence, not cause.",
    ar: "في الفترة نفسها التي ظهرت فيها حملة جديدة محتملة — تزامن وليس سببًا.",
  } as Bilingual,
  distinct(distinctPosts: number): Bilingual {
    return {
      en: `${distinctPosts} distinct after removing repeated text`,
      ar: `${distinctPosts} مميّزًا بعد حذف النص المكرر`,
    };
  },
  authorTypeNote: { en: "author type (modeled)", ar: "نوع الكاتب (نموذجي)" } as Bilingual,
  sentimentHeader(labelled: number): Bilingual {
    return {
      en: `Sentiment (modeled) — of ${labelled} labelled`,
      ar: `الانطباع (نموذجي) — من ${labelled} مصنّفة`,
    };
  },
  sentimentColumn: { en: "Sentiment (modeled)", ar: "الانطباع (نموذجي)" } as Bilingual,
  topicColumn: { en: "Topic (modeled)", ar: "الموضوع (نموذجي)" } as Bilingual,
  postsColumn: { en: "Posts", ar: "المنشورات" } as Bilingual,
  links(o: { direct: number; topical: number; temporal: number }): Bilingual {
    return {
      en: `Linked to ads (modeled): ${o.direct} direct · ${o.topical} topical · ${o.temporal} temporal`,
      ar: "مرتبطة بإعلانات (نموذجي)",
    };
  },
  erasedText: {
    en: "[text erased — retention]",
    ar: "[نُص محذوف — سياسة الاحتفاظ]",
  } as Bilingual,
  openOnX: { en: "Open on X ↗", ar: "افتح على X" } as Bilingual,
  allPosts(posts: number): Bilingual {
    return { en: `All ${posts} posts →`, ar: "كل المنشورات ←" };
  },
  // R4 link text: "in the same window as", never a causal verb.
  linkDirectOrTopical(o: { brandName: string; brandNameAr: string; platform: string; adText: string }): Bilingual {
    const excerpt = o.adText.length > 40 ? `${o.adText.slice(0, 40)}…` : o.adText;
    return {
      en: `in the same window as ${o.brandName}'s ${o.platform} ad "${excerpt}"`,
      ar: `في نفس فترة إعلان ${o.brandNameAr || o.brandName} «${excerpt}»`,
    };
  },
  linkTemporal(o: { brandName: string; brandNameAr: string }): Bilingual {
    return {
      en: `in the same window as ${o.brandName}'s campaign burst`,
      ar: `في نفس فترة موجة حملات ${o.brandNameAr || o.brandName}`,
    };
  },
  unclearWord: { en: "Unclear", ar: "غير واضح" } as Bilingual,
} as const;

// --- §1.5 Empty and degraded states (priority order; first match wins) ---

export const STATES = {
  switchedOff: {
    en: "Audience conversation is switched off. Admins: Intel → Conversation.",
    ar: "حديث الجمهور متوقف. للمشرفين: Intel ← Conversation.",
  } as Bilingual,
  noPulls: {
    en: "No posts pulled yet. Admins: Intel → Conversation → Pull now.",
    ar: "لم تُسحب منشورات بعد. للمشرفين: Intel ← Conversation ← اسحب الآن.",
  } as Bilingual,
  budgetStopped: {
    en: 'Monthly ceiling for "mentions" reached — no new posts until it is raised or the month rolls over.',
    ar: 'بلغ السقف الشهري لمجموعة "mentions" — لا منشورات جديدة حتى رفعه أو بداية الشهر.',
  } as Bilingual,
  lastPullFailed(o: { brandName: string; brandNameAr: string; message: string }): Bilingual {
    return {
      en: `The last pull failed for ${o.brandName}: ${o.message}. Other brands are up to date.`,
      ar: `فشل آخر سحب لـ${o.brandNameAr || o.brandName}: ${o.message}. بقية العلامات محدّثة.`,
    };
  },
  nothingInWindow: {
    en: "Nothing matched in this window — quiet, or the terms are too narrow.",
    ar: "لا شيء طابق في هذه الفترة — إمّا هدوء أو أن الكلمات ضيّقة.",
  } as Bilingual,
} as const;

// --- §8.8 Weekly export footer ---

export function exportFooter(maxItemsPerCall: number): Bilingual {
  return {
    en: `Audience conversation: a sample of public X posts via a third-party scraper (max ${maxItemsPerCall} per brand per pull); sentiment and topics are modeled; Snapchat, TikTok, Instagram comments and private channels are not covered.`,
    ar: "حديث الجمهور: عيّنة من منشورات X العامة عبر أداة طرف ثالث؛ المشاعر والمواضيع تقديرات نموذجية؛ لا تشمل سناب شات أو تيك توك أو تعليقات إنستغرام أو القنوات الخاصة.",
  };
}

// --- §9.3 Fixed lines of the deterministic weekly narrative ---

export const NARRATIVE = {
  noPosts: {
    en: "- What people said: no public X posts matched the search terms this week (sample, not a total).",
    ar: "- ماذا قال الناس: لم تطابق أي منشورات عامة على X كلمات البحث هذا الأسبوع (عيّنة وليست إجمالًا).",
  } as Bilingual,
  coverage: {
    en: "- Conversation coverage: a sample of public X posts via a third-party scraper; not Snapchat, TikTok, Instagram comments or private channels.",
    ar: "- تغطية الحديث: عيّنة من منشورات X العامة عبر أداة طرف ثالث؛ لا تشمل سناب شات أو تيك توك أو تعليقات إنستغرام أو القنوات الخاصة.",
  } as Bilingual,
  disclaimer: {
    en: "Conversation counts are a sample; sentiment and topics are modeled.",
    ar: "أعداد الحديث عيّنة؛ المشاعر والمواضيع نموذجية.",
  } as Bilingual,
} as const;

// Every string in this module, flattened, so the R4 test (and anyone adding
// a surface) can scan the lot without knowing the shape. Functions are
// sampled with representative arguments.
export function allCopyStrings(): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === "object") Object.values(v).forEach(push);
  };
  push([PRODUCT_NAME, SECTION_TITLE, NAV_LABEL, MODELED_TAG, MODELED_TAG_TITLE]);
  push(countSentence(11, ["a", "b", "c", "d"], "2026-09-01", "2026-09-08"));
  push([relTimeFor("2026-09-01T00:00:00Z", new Date("2026-09-03T00:00:00Z"))]);
  push([ADMIN.kicker, ADMIN.intro, ADMIN.cardTerms]);
  push([
    ADMIN.cardPull.title,
    ADMIN.cardPull.help({ pageMin: 20, pageMinCostUsd: "0.0036", maxCalls: 4, maxItems: 200 }),
    ADMIN.cardPull.lastPull({ startedAt: "2026-09-01", status: "success", itemsIngested: 3 }),
    ADMIN.cardPull.lastPullNever,
    ADMIN.cardPull.aiOn({ model: "m", promptVersion: "p", taxonomyVersion: "t" }),
    ADMIN.cardPull.aiFixture,
    ADMIN.cardPull.aiOff,
    ADMIN.cardPull.pullNow,
    ADMIN.cardPull.switchOnFirst,
  ]);
  push([
    ADMIN.cardRetention.title,
    ADMIN.cardRetention.retention(90),
    ADMIN.cardRetention.recentPosts,
    ADMIN.cardRetention.open,
    ADMIN.cardRetention.remove,
    ADMIN.cardRetention.removedMarker,
    ADMIN.cardRetention.erasedMarker,
    ADMIN.cardRetention.removeByLink,
    ADMIN.cardRetention.refPlaceholder,
    ADMIN.cardRetention.noMatch,
    ADMIN.cardRetention.caption,
  ]);
  push(coverageText({ maxItemsPerCall: 100, retentionDays: 90 }));
  push([
    SECTION.kicker("7 days"),
    SECTION.dashboardWindow("2026-09-01"),
    SECTION.daysWindow(7),
    SECTION.daysWindow(30),
    SECTION.spike({ posts: 12, baselinePerWeek: 4 }),
    SECTION.burst,
    SECTION.distinct(5),
    SECTION.authorTypeNote,
    SECTION.sentimentHeader(6),
    SECTION.sentimentColumn,
    SECTION.topicColumn,
    SECTION.postsColumn,
    SECTION.links({ direct: 1, topical: 2, temporal: 0 }),
    SECTION.erasedText,
    SECTION.openOnX,
    SECTION.allPosts(7),
    SECTION.linkDirectOrTopical({ brandName: "B", brandNameAr: "ب", platform: "meta", adText: "ad" }),
    SECTION.linkTemporal({ brandName: "B", brandNameAr: "ب" }),
    SECTION.unclearWord,
  ]);
  push([
    STATES.switchedOff,
    STATES.noPulls,
    STATES.budgetStopped,
    STATES.lastPullFailed({ brandName: "B", brandNameAr: "ب", message: "m" }),
    STATES.nothingInWindow,
  ]);
  push(exportFooter(100));
  push(NARRATIVE);
  return out;
}
