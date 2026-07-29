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
