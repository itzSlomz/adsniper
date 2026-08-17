// sharp is a native module: it needs a prebuilt binary matching the host's
// platform and libc. Where that binary can't load (some build images, musl
// hosts, an npm that skipped the optional platform package), importing it
// at module scope takes the whole process down — including `next build`,
// which loads every route module to collect page data.
//
// Thumbnails are an optimization, never a source of truth: full-size media
// is always stored, and the UI falls back to it when thumbPath is null. So
// sharp is loaded lazily and treated as optional — if it isn't available,
// we log once and carry on without thumbnails rather than failing the
// build, the job, or the upload.

type SharpFactory = (typeof import("sharp"))["default"];

let cached: SharpFactory | null | undefined;
let warned = false;

export async function getSharp(): Promise<SharpFactory | null> {
  if (cached !== undefined) return cached ?? null;
  try {
    cached = (await import("sharp")).default;
  } catch (err) {
    cached = null;
    if (!warned) {
      warned = true;
      console.warn(
        `[media] sharp unavailable — storing full-size media without thumbnails: ${
          err instanceof Error ? err.message.split("\n")[0] : String(err)
        }`
      );
    }
  }
  return cached ?? null;
}

// Returns a webp thumbnail, or null when sharp is unavailable or the input
// isn't a decodable image. Never throws — callers store what they can.
export async function makeThumbnail(
  buf: Buffer,
  width: number,
  quality = 80
): Promise<Buffer | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    return await sharp(buf)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
  } catch {
    return null;
  }
}
