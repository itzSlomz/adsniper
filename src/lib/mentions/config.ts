// Audience conversation: every constant, version and env-backed limit the
// mentions pipeline runs on, in one Prisma-free module so /methodology can
// render the live values (product law 1: the disclosure cannot drift from
// the calculation) and so pure helpers and unit tests can import it without
// a database. Only type imports from @prisma/client — erased at runtime.
import type {
  MentionKind,
  MentionLinkType,
  MentionRelevance,
  MentionSentiment,
} from "@prisma/client";

// Stamped on every MentionLabel row; a new prompt or taxonomy gets a new
// version and a fresh set of rows, never an overwrite.
export const TAXONOMY_VERSION = "banking-v1";
export const PROMPT_VERSION = "classifier/v1";

export const MAX_BATCH_ITEMS = 25;
export const MAX_ITEM_CHARS = 1000;
export const MAX_EVIDENCE_CHARS = 120;
export const MENTIONS_CLASSIFY_MAX_PER_RUN = 200;
export const CLASSIFY_MAX_REFUSED_BATCHES = 3;
export const CLASSIFY_MAX_TOKENS = 4096;

export interface Topic {
  key: string;
  labelEn: string;
  labelAr: string;
  seedLabel: string;
  keywords: readonly string[];
}

// keywords and seedLabel are copied verbatim from defaultOfferCategories() so the
// topical link (classifyOffer label → topic key) cannot drift; a unit test asserts equality.
export const TAXONOMY: readonly Topic[] = [
  { key: "personal_finance", labelEn: "Personal finance",   labelAr: "التمويل الشخصي",           seedLabel: "Personal finance",   keywords: ["تمويل شخصي", "personal finance", "تمويل", "financing", "loan"] },
  { key: "credit_cards",     labelEn: "Credit cards",       labelAr: "البطاقات الائتمانية",      seedLabel: "Credit cards",       keywords: ["بطاق", "card", "credit", "cashback", "كاش باك", "كاشباك"] },
  { key: "deposits_savings", labelEn: "Deposits & savings", labelAr: "الودائع والادخار",          seedLabel: "Deposits & savings", keywords: ["ادخار", "savings", "deposit", "وديعة", "توفير"] },
  { key: "home_finance",     labelEn: "Home finance",       labelAr: "التمويل العقاري",           seedLabel: "Home finance",       keywords: ["عقاري", "mortgage", "home finance", "سكني"] },
  { key: "auto_finance",     labelEn: "Auto finance",       labelAr: "تمويل السيارات",            seedLabel: "Auto finance",       keywords: ["سيارة", "auto", "car finance", "مركبة"] },
  { key: "business_banking", labelEn: "Business banking",   labelAr: "الخدمات المصرفية للأعمال", seedLabel: "Business banking",   keywords: ["أعمال", "business", "sme", "شركات", "corporate"] },
  { key: "digital_app",      labelEn: "Digital app",        labelAr: "التطبيق الرقمي",            seedLabel: "Digital app",        keywords: ["تطبيق", "app", "digital", "رقمي", "أونلاين", "online"] },
  { key: "transfers",        labelEn: "Transfers",          labelAr: "التحويلات",                 seedLabel: "Transfers",          keywords: ["تحويل", "transfer", "remittance", "حوالة"] },
] as const;

export const TOPIC_OTHER = { key: "other", labelEn: "Other banking topic", labelAr: "موضوع مصرفي آخر" } as const;

// Generated, feeds the classifier's JSON schema enum.
export const TOPIC_KEYS: readonly string[] = [...TAXONOMY.map((t) => t.key), TOPIC_OTHER.key];

// classifyOffer() label (an ad's offer category) → taxonomy key, so the
// topical campaign link can compare a post's modeled topic with an ad's.
// Unknown or custom category labels have no taxonomy counterpart → null.
export function topicForSeedLabel(label: string | null): string | null {
  if (!label) return null;
  return TAXONOMY.find((t) => t.seedLabel === label)?.key ?? null;
}

// Brand names that are also ordinary words; the prompt is told so it can
// mark unrelated posts irrelevant instead of guessing.
export const HOMONYMS: readonly { term: string; note: string }[] = [
  { term: "الأهلي",  note: "also Al-Ahli football club / 'national'" },
  { term: "البلاد",  note: "also 'the country' in ordinary Arabic" },
  { term: "الرياض",  note: "also the city of Riyadh" },
  { term: "الراجحي", note: "also a common family name and other Al Rajhi companies" },
  { term: "الجزيرة", note: "also the Al Jazeera channel / 'the peninsula'" },
];

// The classifier is forbidden to infer any of these about an author, and
// the label schema has nowhere to store them.
export const PROHIBITED_INFERENCES = [
  "negative financial status",
  "religion",
  "politics",
  "health",
  "crime",
  "ethnicity",
  "sexuality",
  "trade-union membership",
] as const;

// Apify actor and its list-price contract (operator-asserted until the paid
// pilot; see docs/RESEARCH.md): billed per returned item with a 20-item
// minimum per search.
export const KAITO_ACTOR = "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest";
export const KAITO_COST_PER_ITEM_USD = 0.00018;
export const KAITO_PAGE_MIN = 20;
export const KAITO_TIMEOUT_SECS = 240;

export const MENTIONS_BACKFILL_DAYS = 7;
export const MENTIONS_OVERLAP_MINUTES = 30;
export const MENTIONS_LINK_WINDOW_DAYS = 7;
export const MENTION_DUP_WINDOW_DAYS = 7;
export const MENTIONS_MAX_TERMS_PER_BRAND = 8;
export const MENTIONS_MAX_QUERY_CHARS = 450;

// Saudi news and market accounts whose posts are tagged "media" rather than
// "public"; editable per instance (Intel → Conversation), matched by
// lowercased handle equality only.
export const MEDIA_HANDLES_DEFAULT: readonly string[] = [
  "spagov",
  "argaam",
  "aleqtisadiah",
  "alarabiya",
  "alarabiya_brk",
  "okaz_online",
  "alriyadh",
  "maaal",
  "cnbcarabia",
  "alwatan_sa",
  "sabqorg",
  "ajel_news24",
];

// Env-backed integer with a default and an inclusive range; anything
// unparsable or out of range falls back to the default rather than to a
// clamped edge, so a typo cannot silently pick the most permissive value.
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return n >= min && n <= max ? n : fallback;
}

// Days after the post date at which text, raw payload, evidence spans and
// author identifiers are erased (mentions-retention, nightly).
export function mentionsRetentionDays(): number {
  return envInt("MENTIONS_RETENTION_DAYS", 90, 1, 3650);
}

// Hard per-brand daily caps on provider spend, read from MentionPull rows
// since UTC midnight. Calls and per-call items are clamped into the ranges
// the actor contract makes sensible; the daily item total is bounded only by
// the monthly ceiling, so any positive integer is honoured.
export function mentionsMaxCallsPerBrandPerDay(): number {
  return envInt("MENTIONS_MAX_CALLS_PER_BRAND_PER_DAY", 4, 1, 48);
}

export function mentionsMaxItemsPerBrandPerDay(): number {
  return envInt("MENTIONS_MAX_ITEMS_PER_BRAND_PER_DAY", 200, 1, Number.MAX_SAFE_INTEGER);
}

export function mentionsMaxItemsPerCall(): number {
  return envInt("MENTIONS_MAX_ITEMS_PER_CALL", 100, 20, 500);
}

export type ClassifierMode = "off" | "on" | "fixture";

// "fixture" only when the verification-only provider is also active, so a
// misconfigured customer instance can never run the fake classifier; "on"
// needs a key or every batch would fail; anything else leaves posts
// unlabelled (honest degradation, never a fabricated label).
export function classifierMode(): ClassifierMode {
  const llm = process.env.MENTIONS_LLM?.trim();
  if (llm === "fixture" && process.env.MENTIONS_FIXTURE === "1") return "fixture";
  if (llm === "on" && process.env.ANTHROPIC_API_KEY) return "on";
  return "off";
}

// Must be in STRUCTURED_OUTPUT_MODELS (ai.ts) — deliberately NOT aiModel():
// the brief default claude-sonnet-4-6 rejects output_config.format.
export const MENTIONS_DEFAULT_MODEL = "claude-sonnet-5";

// Never falls back to ANTHROPIC_MODEL: the brief model is chosen for prose,
// the classifier model for structured output, and they are independent.
export function classifierModel(): string {
  return process.env.MENTIONS_LLM_MODEL?.trim() || MENTIONS_DEFAULT_MODEL;
}

// Spike detection, aggregate per brand (mirrors campaignBurstBrandIds).
export const SPIKE_WINDOW_DAYS = 7;
export const SPIKE_BASELINE_WEEKS = 8;
export const SPIKE_MIN_POSTS = 10;
export const SPIKE_MIN_BASELINE_PER_WEEK = 3;
export const SPIKE_FACTOR = 2;
export const SPIKE_COOLDOWN_DAYS = 7;

export const KIND_LABELS: Record<MentionKind, { en: string; ar: string }> = {
  public: { en: "Public", ar: "عام" },
  brand_own: { en: "Brand account", ar: "حساب العلامة" },
  media: { en: "Media", ar: "إعلام" },
  unclear: { en: "Unclear", ar: "غير واضح" },
};

export const SENTIMENT_LABELS: Record<MentionSentiment, { en: string; ar: string }> = {
  positive: { en: "Positive", ar: "إيجابي" },
  negative: { en: "Negative", ar: "سلبي" },
  neutral: { en: "Neutral", ar: "محايد" },
  unclear: { en: "Unclear", ar: "غير واضح" },
};

export const RELEVANCE_LABELS: Record<MentionRelevance, { en: string; ar: string }> = {
  relevant: { en: "Relevant", ar: "ذو صلة" },
  irrelevant: { en: "Irrelevant", ar: "غير ذي صلة" },
  unclear: { en: "Unclear", ar: "غير واضح" },
};

export const LINK_LABELS: Record<MentionLinkType, { en: string; ar: string }> = {
  direct: { en: "Direct", ar: "مباشر" },
  topical: { en: "Topical", ar: "موضوعي" },
  temporal: { en: "Temporal", ar: "زمني" },
  none: { en: "None", ar: "لا شيء" },
};

// R3: an unlabelled post renders "—" with the reason as its title.
export const UNLABELLED_REASON: Record<"off" | "not_run", { en: string; ar: string }> = {
  off: {
    en: "Not labelled — classification is off for this instance",
    ar: "غير مصنّف — التصنيف غير مفعّل لهذه النسخة",
  },
  not_run: {
    en: "Not labelled — classification has not run yet",
    ar: "غير مصنّف — لم يُشغَّل التصنيف بعد",
  },
};

// R3: "unclear" is a real class, never rounded to neutral and never shown
// as unlabelled.
export const UNCLEAR_TITLE: { en: string; ar: string } = {
  en: 'The classifier could not decide — "unclear" is a real class, never rounded to neutral',
  ar: "تعذّر على المصنِّف الحسم — «غير واضح» فئة حقيقية ولا تُقرَّب إلى محايد",
};
