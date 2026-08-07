import sharp from "sharp";
import { getStorage } from "@/lib/storage";
import type { FetchedMediaItem } from "@/lib/providers/types";

// Media pipeline (brief Section 4): download each image (or video poster)
// to our storage, keep the original URL, and generate a ~800px webp display
// thumbnail for grid performance. Failures degrade gracefully: the item is
// kept with cachedPath/thumbPath null and the UI shows a placeholder.

export interface StoredMediaItem {
  originalUrl: string;
  cachedPath: string | null;
  thumbPath: string | null;
}

const THUMB_WIDTH = 800;

function extFromUrl(url: string): string {
  const m = /\.(jpe?g|png|gif|webp)(?:[?:]|$)/i.exec(url);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

export async function cacheMediaItems(
  keyPrefix: string,
  items: FetchedMediaItem[]
): Promise<{ stored: StoredMediaItem[]; failures: string[] }> {
  const storage = getStorage();
  const stored: StoredMediaItem[] = [];
  const failures: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const res = await fetch(item.downloadUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());

      const ext = extFromUrl(item.downloadUrl);
      const fullKey = `${keyPrefix}/${i}.${ext}`;
      const thumbKey = `${keyPrefix}/${i}_thumb.webp`;

      await storage.put(fullKey, buf, `image/${ext === "jpg" ? "jpeg" : ext}`);
      const thumb = await sharp(buf)
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      await storage.put(thumbKey, thumb, "image/webp");

      stored.push({ originalUrl: item.originalUrl, cachedPath: fullKey, thumbPath: thumbKey });
    } catch (err) {
      failures.push(`${item.downloadUrl}: ${err instanceof Error ? err.message : String(err)}`);
      stored.push({ originalUrl: item.originalUrl, cachedPath: null, thumbPath: null });
    }
  }
  return { stored, failures };
}

// --- Ad creative archive -------------------------------------------------
// Ads store every creative file, video included. Platform CDN links expire
// within weeks, so an ad archive that keeps only URLs decays into dead
// links; the files themselves are the asset.

export interface StoredAdAsset {
  kind: "image" | "video";
  originalUrl: string;
  cachedPath: string | null;
  thumbPath: string | null;
  bytes: number | null;
  contentType: string | null;
}

// Cap per file so one pathological creative can't blow up storage or stall
// a poll; ad videos are typically 2-20MB.
const MAX_ASSET_BYTES = 60 * 1024 * 1024;
const ASSET_TIMEOUT_MS = 120_000;

function extFromContentType(ct: string | null, url: string): string {
  if (ct?.includes("mp4")) return "mp4";
  if (ct?.includes("webm")) return "webm";
  if (ct?.includes("quicktime")) return "mov";
  if (ct?.includes("png")) return "png";
  if (ct?.includes("gif")) return "gif";
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("jpeg") || ct?.includes("jpg")) return "jpg";
  const m = /\.(mp4|webm|mov|jpe?g|png|gif|webp)(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "bin";
}

async function fetchCapped(
  url: string
): Promise<{ buf: Buffer; contentType: string | null }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ASSET_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_ASSET_BYTES) {
    throw new Error(`too large (${Math.round(declared / 1e6)}MB)`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ASSET_BYTES) {
    throw new Error(`too large (${Math.round(buf.length / 1e6)}MB)`);
  }
  return { buf, contentType: res.headers.get("content-type") };
}

export async function cacheAdAssets(
  keyPrefix: string,
  assets: { kind: "image" | "video"; url: string; posterUrl?: string }[]
): Promise<{ stored: StoredAdAsset[]; failures: string[] }> {
  const storage = getStorage();
  const stored: StoredAdAsset[] = [];
  const failures: string[] = [];

  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    let cachedPath: string | null = null;
    let thumbPath: string | null = null;
    let bytes: number | null = null;
    let contentType: string | null = null;

    try {
      const { buf, contentType: ct } = await fetchCapped(a.url);
      const ext = extFromContentType(ct, a.url);
      contentType = ct ?? (a.kind === "video" ? "video/mp4" : "image/jpeg");
      bytes = buf.length;
      cachedPath = `${keyPrefix}/${i}.${ext}`;
      await storage.put(cachedPath, buf, contentType);

      if (a.kind === "image") {
        thumbPath = `${keyPrefix}/${i}_thumb.webp`;
        const thumb = await sharp(buf)
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        await storage.put(thumbPath, thumb, "image/webp");
      }
    } catch (err) {
      failures.push(`${a.url.slice(0, 90)}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Videos get their poster cached separately so grids stay fast — and so
    // a failed video download still leaves something visible.
    if (a.kind === "video" && a.posterUrl) {
      try {
        const { buf } = await fetchCapped(a.posterUrl);
        thumbPath = `${keyPrefix}/${i}_thumb.webp`;
        const thumb = await sharp(buf)
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        await storage.put(thumbPath, thumb, "image/webp");
      } catch (err) {
        failures.push(`poster ${a.posterUrl.slice(0, 70)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    stored.push({ kind: a.kind, originalUrl: a.url, cachedPath, thumbPath, bytes, contentType });
  }
  return { stored, failures };
}
