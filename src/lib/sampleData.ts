import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import { DEMO_BRANDS } from "@/lib/demoBrands";
import type { AdPlatform, AdFormat, PostPlatform } from "@prisma/client";

// Synthetic SAMPLE dataset for demo/preview instances — never for real
// customer data. Every creative is generated locally and watermarked
// "SAMPLE CREATIVE", every row carries a sample- external ID, and loading
// is refused unless the instance has zero ads and posts, so sample rows
// can never mix into real tracking. clearSampleData removes exactly what
// loadSampleData created.

const DAY = 86400000;
const SAMPLE_FLAG = "sample_data_loaded";
// Same default as storage.ts LOCAL_ROOT — sample media is written straight
// to local disk (the media proxy's read fallback), R2 or not.
const MEDIA_ROOT = process.env.MEDIA_DIR ?? path.join(process.cwd(), ".data", "media");

const OFFERS: [string, string][] = [
  ["تمويل شخصي بدون تحويل راتب", "Personal finance, no salary transfer"],
  ["بطاقة كاش باك ٥٪", "5% cashback credit card"],
  ["تمويل عقاري بهامش ثابت", "Fixed-rate home finance"],
  ["افتح حسابك في دقائق من التطبيق", "Open your account in minutes"],
  ["حوالات دولية برسوم صفرية", "Zero-fee international transfers"],
  ["وديعة ادخار بعائد تنافسي", "Savings deposit, competitive return"],
  ["تمويل سيارتك بدفعة أولى صفر", "Auto finance, zero down payment"],
  ["حلول مصرفية للشركات الصغيرة", "SME business banking"],
];

async function makeCreative(key: string, color: string, brand: string, textAr: string): Promise<void> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg width="600" height="600" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="600" fill="${color}"/>
    <rect x="0" y="430" width="600" height="170" fill="rgba(0,0,0,0.35)"/>
    <circle cx="90" cy="90" r="52" fill="rgba(255,255,255,0.92)"/>
    <text x="90" y="108" font-family="DejaVu Sans, sans-serif" font-size="52" font-weight="bold" fill="${color}" text-anchor="middle">${esc(brand[0])}</text>
    <text x="300" y="330" font-family="DejaVu Sans, sans-serif" font-size="44" font-weight="bold" fill="#ffffff" text-anchor="middle">${esc(brand.slice(0, 20))}</text>
    <text x="300" y="510" font-family="DejaVu Sans, sans-serif" font-size="30" fill="#ffffff" text-anchor="middle" direction="rtl">${esc(textAr)}</text>
    <text x="300" y="560" font-family="DejaVu Sans, sans-serif" font-size="22" fill="rgba(255,255,255,0.75)" text-anchor="middle">SAMPLE CREATIVE — NOT A REAL AD</text>
  </svg>`;
  const file = path.join(MEDIA_ROOT, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(file);
}

// Deterministic PRNG so repeated loads produce the same dataset.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

export async function sampleDataLoaded(): Promise<boolean> {
  return getSetting<boolean>(SAMPLE_FLAG, false);
}

export async function loadSampleData(): Promise<{ ads: number; posts: number }> {
  const [adCount, postCount] = await Promise.all([prisma.ad.count(), prisma.post.count()]);
  if (adCount > 0 || postCount > 0) {
    throw new Error(
      "Refusing to load sample data: this instance already has ads or posts. Sample data is only for empty demo instances."
    );
  }

  // A brand-less instance gets the demo market so the sample has names.
  if ((await prisma.brand.count()) === 0) {
    for (const b of DEMO_BRANDS) {
      const { metaPageIds, ...rest } = b;
      await prisma.brand.create({ data: { ...rest, metaPageIds: metaPageIds ?? [] } });
    }
  }

  const brands = await prisma.brand.findMany({ where: { active: true } });
  const colorOf = new Map(DEMO_BRANDS.map((b) => [b.nameEn, b.brandColor]));
  const rand = rng(42);
  const now = Date.now();
  const platforms: AdPlatform[] = ["meta", "google", "tiktok", "snapchat"];
  const formats: AdFormat[] = ["image", "video", "carousel", "image"];
  let ads = 0;
  let posts = 0;

  for (const b of brands) {
    const color = b.brandColor ?? colorOf.get(b.nameEn) ?? "#444444";
    const isSelf = b.type === "self";
    // One competitor gets a launch-sized burst so campaign detection fires.
    const isBurst = brands.filter((x) => x.type === "competitor")[0]?.id === b.id;

    const histCount = isSelf ? 4 : isBurst ? 14 : 4 + Math.floor(rand() * 6);
    for (let i = 0; i < histCount; i++) {
      const offer = OFFERS[Math.floor(rand() * OFFERS.length)];
      const first = new Date(now - (8 + Math.floor(rand() * 62)) * DAY);
      const stopped = rand() < 0.25;
      const lastSeen = stopped
        ? new Date(now - (8 + Math.floor(rand() * 5)) * DAY)
        : new Date(now - Math.floor(rand() * 2) * DAY);
      const key = `sample/ads/${b.id}-${ads}.webp`;
      await makeCreative(key, color, b.nameEn, offer[0]);
      const platform = platforms[Math.floor(rand() * platforms.length)];
      await prisma.ad.create({
        data: {
          brandId: b.id,
          platform,
          subPlatforms: platform === "meta" ? ["facebook", "instagram"] : [],
          libraryId: `sample-${b.id}-${ads}`,
          creativePath: key,
          creativeThumbPath: key,
          adText: `${offer[0]} · ${offer[1]}`,
          cta: rand() < 0.5 ? "اعرف المزيد" : "Learn more",
          landingUrl: "https://example.com/sample",
          format: formats[Math.floor(rand() * formats.length)],
          assets: [],
          firstSeen: first,
          lastSeen,
          status: stopped ? "inactive" : "active",
          source: platform === "snapchat" ? "manual" : "provider",
          coverage: platform === "tiktok" ? "partial" : "full",
        },
      });
      ads++;
    }

    const newCount = isSelf ? 1 : isBurst ? 8 : Math.floor(rand() * 3);
    for (let i = 0; i < newCount; i++) {
      const offer = isBurst ? OFFERS[1] : OFFERS[Math.floor(rand() * OFFERS.length)];
      const key = `sample/ads/${b.id}-${ads}.webp`;
      await makeCreative(key, color, b.nameEn, offer[0]);
      const platform = platforms[Math.floor(rand() * 2)];
      await prisma.ad.create({
        data: {
          brandId: b.id,
          platform,
          subPlatforms: platform === "meta" ? ["facebook", "instagram"] : [],
          libraryId: `sample-${b.id}-${ads}`,
          creativePath: key,
          creativeThumbPath: key,
          adText: `${offer[0]} · ${offer[1]}`,
          cta: "Learn more",
          landingUrl: "https://example.com/sample",
          format: i % 2 ? "video" : "image",
          assets: [],
          firstSeen: new Date(now - Math.floor(rand() * 6) * DAY),
          lastSeen: new Date(now),
          status: "active",
          source: "provider",
          coverage: "full",
        },
      });
      ads++;
    }

    const postCountFor = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < postCountFor; i++) {
      const offer = OFFERS[Math.floor(rand() * OFFERS.length)];
      const key = `sample/posts/${b.id}-${i}.webp`;
      await makeCreative(key, color, b.nameEn, offer[0]);
      const platform: PostPlatform = rand() < 0.6 ? "x" : "linkedin";
      const post = await prisma.post.create({
        data: {
          brandId: b.id,
          platform,
          externalId: `sample-${b.id}-${i}`,
          url: "https://example.com/sample-post",
          postedAt: new Date(now - Math.floor(rand() * 7) * DAY - Math.floor(rand() * 20) * 3600000),
          text: `${offer[1]} — ${offer[0]} #${b.nameEn.split(" ")[0]}`,
          mediaType: "image",
          mediaItems: [{ originalUrl: "", cachedPath: key, thumbPath: key }],
          source: "provider",
        },
      });
      await prisma.metricSnapshot.create({
        data: {
          postId: post.id,
          likes: Math.floor(rand() * 900),
          reposts: Math.floor(rand() * 200),
          replies: Math.floor(rand() * 80),
          comments: Math.floor(rand() * 60),
          views: 2000 + Math.floor(rand() * 60000),
        },
      });
      posts++;
    }

    for (const platform of ["x", "linkedin"] as PostPlatform[]) {
      const base = 50000 + Math.floor(rand() * 900000);
      for (let d = 8; d >= 0; d--) {
        await prisma.followerSnapshot.upsert({
          where: {
            brandId_platform_date: {
              brandId: b.id,
              platform,
              date: new Date(new Date(now - d * DAY).toISOString().slice(0, 10)),
            },
          },
          update: {},
          create: {
            brandId: b.id,
            platform,
            date: new Date(new Date(now - d * DAY).toISOString().slice(0, 10)),
            followers: base + (8 - d) * Math.floor(rand() * 300),
          },
        });
      }
    }
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await prisma.dailyBrief.upsert({
    where: { date: today },
    update: {},
    create: {
      date: today,
      status: "published",
      highlightsJson: { sample: true },
      contentEn: [
        "**What competitors did**",
        "- The market's heaviest advertiser pushed its cashback card across X and LinkedIn (sample data).",
        "**Competitor ad moves**",
        "- One competitor looks like a new campaign: 8 new ads this week.",
        "**How we compare**",
        "- We published 4 posts, in line with our recent average.",
        "**One suggested action** — refresh our card creative before month-end payroll days.",
        "",
        "_Sample brief on sample data — not real market intelligence._",
      ].join("\n"),
      contentAr: [
        "**ماذا فعل المنافسون**",
        "- كثّف أكبر معلن في السوق الترويج لبطاقة الكاش باك عبر إكس ولينكدإن (بيانات تجريبية).",
        "**تحركات الإعلانات**",
        "- يبدو أن أحد المنافسين أطلق حملة جديدة: ٨ إعلانات جديدة هذا الأسبوع.",
        "**موقعنا**",
        "- نشرنا ٤ منشورات ضمن متوسطنا المعتاد.",
        "**إجراء مقترح** — تحديث تصميم إعلان البطاقة قبل أيام صرف الرواتب.",
        "",
        "_موجز تجريبي على بيانات تجريبية — ليس معلومات سوق حقيقية._",
      ].join("\n"),
    },
  });

  await setSetting(SAMPLE_FLAG, true);
  return { ads, posts };
}

export async function clearSampleData(): Promise<void> {
  const samplePosts = await prisma.post.findMany({
    where: { externalId: { startsWith: "sample-" } },
    select: { id: true },
  });
  await prisma.metricSnapshot.deleteMany({
    where: { postId: { in: samplePosts.map((p) => p.id) } },
  });
  await prisma.post.deleteMany({ where: { externalId: { startsWith: "sample-" } } });
  await prisma.ad.deleteMany({ where: { libraryId: { startsWith: "sample-" } } });
  if (await sampleDataLoaded()) {
    // Follower snapshots and weekly briefs on a sample-only instance were
    // all derived from sample data — remove them wholesale.
    await prisma.followerSnapshot.deleteMany({});
    await prisma.weeklyBrief.deleteMany({});
  }
  await prisma.dailyBrief.deleteMany({
    where: { highlightsJson: { path: ["sample"], equals: true } },
  });
  await fs.rm(path.join(MEDIA_ROOT, "sample"), { recursive: true, force: true }).catch(() => {});
  await setSetting(SAMPLE_FLAG, false);
}
