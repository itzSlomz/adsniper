import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import type { StoredAdAsset } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bulk ad-archive export: a ZIP containing every cached creative file
// (images and videos) organised brand/platform, plus a CSV manifest with the
// ad text, CTA, landing URL, dates and status. This is the "download
// everything" surface — the archive is the deliverable, so it ships as
// files, not links that expire.
//
// Filters (all optional): ?brand=<id>&platform=<meta|google|...>&days=<n>
// &status=<active|inactive|stale>. Default: everything currently stored.

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeSeg(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 60) || "unknown";
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const days = Number(q.get("days") ?? "0");
  const where = {
    ...(q.get("brand") ? { brandId: q.get("brand")! } : {}),
    ...(q.get("platform")
      ? { platform: q.get("platform") as "meta" | "google" | "linkedin" | "x" | "snapchat" | "tiktok" | "other" }
      : {}),
    ...(q.get("status")
      ? { status: q.get("status") as "active" | "inactive" | "stale" }
      : {}),
    ...(Number.isFinite(days) && days > 0
      ? { firstSeen: { gte: new Date(Date.now() - days * 86400000) } }
      : {}),
  };

  const ads = await prisma.ad.findMany({
    where,
    include: { brand: true },
    orderBy: [{ brandId: "asc" }, { firstSeen: "desc" }],
  });
  if (ads.length === 0) {
    return NextResponse.json({ error: "no ads match this selection" }, { status: 404 });
  }

  const storage = getStorage();
  // Minimal compression: creative files are already-compressed media, so
  // deflate costs CPU for no meaningful size gain.
  const archive = archiver("zip", { zlib: { level: 1 } });
  const pass = new PassThrough();
  archive.pipe(pass);

  // Manifest first so the ZIP is useful even if a file fetch fails.
  const header = [
    "brand", "platform", "library_id", "status", "coverage", "source",
    "first_seen", "last_seen", "format", "cta", "offer_type",
    "landing_url", "library_url", "ad_text", "files",
  ];
  const rows: string[] = [header.join(",")];

  // Streamed so a large archive never buffers entirely in memory.
  (async () => {
    try {
      for (const ad of ads) {
        const brandDir = safeSeg(ad.brand.nameEn);
        const adDir = `${brandDir}/${ad.platform}/${safeSeg(ad.libraryId ?? ad.id)}`;
        const assets = (ad.assets as unknown as StoredAdAsset[]) ?? [];
        // Fall back to the display creative for ads ingested before the
        // full-asset archive existed.
        const paths: { path: string; kind: string }[] = assets
          .filter((a) => a.cachedPath)
          .map((a) => ({ path: a.cachedPath!, kind: a.kind }));
        if (paths.length === 0 && ad.creativePath) {
          paths.push({ path: ad.creativePath, kind: "image" });
        }

        const names: string[] = [];
        for (const p of paths) {
          const obj = await storage.get(p.path);
          if (!obj) continue;
          const name = p.path.split("/").pop()!;
          names.push(name);
          archive.append(obj.body, { name: `${adDir}/${name}` });
        }

        if (ad.adText) {
          archive.append(Buffer.from(ad.adText, "utf8"), { name: `${adDir}/ad-text.txt` });
        }

        rows.push(
          [
            ad.brand.nameEn, ad.platform, ad.libraryId ?? "", ad.status, ad.coverage,
            ad.source, ad.firstSeen.toISOString().slice(0, 10),
            ad.lastSeen.toISOString().slice(0, 10), ad.format, ad.cta ?? "",
            ad.offerType ?? "", ad.landingUrl ?? "", ad.libraryUrl ?? "",
            (ad.adText ?? "").replace(/\s+/g, " ").slice(0, 500), names.join(" | "),
          ]
            .map(csvCell)
            .join(",")
        );
      }
      // UTF-8 BOM so Excel opens the Arabic ad text correctly.
      archive.append(Buffer.from("﻿" + rows.join("\n"), "utf8"), { name: "ads-manifest.csv" });
      await archive.finalize();
    } catch (err) {
      archive.abort();
      pass.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(Readable.toWeb(pass) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="marketingspy-ads-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
