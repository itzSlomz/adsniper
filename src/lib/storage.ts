import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { promises as fs, createReadStream } from "fs";
import path from "path";

// Small storage module (brief Section 2): R2 when credentials are present,
// local-disk fallback otherwise so ingestion and dev verification work
// before infra arrives. The bucket is never public — media is served only
// through the auth-gated /media proxy route.

export interface StreamedObject {
  stream: NodeJS.ReadableStream;
  contentType: string;
  // Size of the bytes being returned; total size of the object.
  contentLength: number;
  totalSize: number;
  // Present when a Range request was satisfied.
  contentRange?: string;
}

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  // Streaming read with optional byte range — video creatives are far too
  // large to buffer in the server's memory, and range support is what lets
  // a browser seek within a video.
  getStream(
    key: string,
    range?: { start: number; end?: number }
  ): Promise<StreamedObject | null>;
  // Bulk delete under a key prefix. Only used to remove the sample dataset
  // — real archived creatives are never deleted by the app.
  removePrefix(prefix: string): Promise<void>;
  kind: "r2" | "local";
}

const LOCAL_ROOT = process.env.MEDIA_DIR ?? path.join(process.cwd(), ".data", "media");

function contentTypeFromKey(key: string): string {
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".gif")) return "image/gif";
  if (key.endsWith(".svg")) return "image/svg+xml";
  // Video creatives must serve with a video type or <video> refuses to play.
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".webm")) return "video/webm";
  if (key.endsWith(".mov")) return "video/quicktime";
  return "image/jpeg";
}

const localStorage: Storage = {
  kind: "local",
  async put(key, body) {
    const file = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  },
  async get(key) {
    try {
      const body = await fs.readFile(path.join(LOCAL_ROOT, key));
      return { body, contentType: contentTypeFromKey(key) };
    } catch {
      return null;
    }
  },
  async removePrefix(prefix) {
    await fs.rm(path.join(LOCAL_ROOT, prefix), { recursive: true, force: true }).catch(() => {});
  },
  async getStream(key, range) {
    const file = path.join(LOCAL_ROOT, key);
    try {
      const stat = await fs.stat(file);
      const start = range?.start ?? 0;
      const end = Math.min(range?.end ?? stat.size - 1, stat.size - 1);
      if (start >= stat.size) return null;
      return {
        stream: createReadStream(file, range ? { start, end } : undefined),
        contentType: contentTypeFromKey(key),
        contentLength: range ? end - start + 1 : stat.size,
        totalSize: stat.size,
        ...(range ? { contentRange: `bytes ${start}-${end}/${stat.size}` } : {}),
      };
    } catch {
      return null;
    }
  },
};

function r2Storage(): Storage {
  const client = new S3Client({
    region: "auto",
    // R2's standard endpoint is derived from the account id; R2_ENDPOINT
    // overrides it for jurisdiction-specific endpoints, another
    // S3-compatible provider, or a local server in tests.
    endpoint:
      process.env.R2_ENDPOINT?.trim() ||
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: !!process.env.R2_ENDPOINT?.trim(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const Bucket = process.env.R2_BUCKET!;
  return {
    kind: "r2",
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType })
      );
    },
    async removePrefix(prefix) {
      let ContinuationToken: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken })
        );
        const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key);
        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } })
          );
        }
        ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (ContinuationToken);
      // Sample media written before R2 was configured lives on local disk.
      await localStorage.removePrefix(prefix);
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        const body = Buffer.from(await res.Body!.transformToByteArray());
        return { body, contentType: res.ContentType ?? contentTypeFromKey(key) };
      } catch {
        // Migration aid: media cached to local disk before R2 was configured
        // stays readable until the media-migrate job moves it over.
        return localStorage.get(key);
      }
    },
    async getStream(key, range) {
      try {
        const res = await client.send(
          new GetObjectCommand({
            Bucket,
            Key: key,
            ...(range
              ? { Range: `bytes=${range.start}-${range.end ?? ""}` }
              : {}),
          })
        );
        const total = res.ContentRange
          ? Number(res.ContentRange.split("/")[1])
          : (res.ContentLength ?? 0);
        return {
          stream: res.Body as unknown as NodeJS.ReadableStream,
          contentType: res.ContentType ?? contentTypeFromKey(key),
          contentLength: res.ContentLength ?? 0,
          totalSize: total,
          ...(res.ContentRange ? { contentRange: res.ContentRange } : {}),
        };
      } catch {
        return localStorage.getStream(key, range);
      }
    },
  };
}

let instance: Storage | undefined;

export function getStorage(): Storage {
  if (!instance) {
    const hasR2 =
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET;
    instance = hasR2 ? r2Storage() : localStorage;
  }
  return instance;
}

// Where this instance's media actually lands. Shown to admins so the
// bucket a deployment writes to is verifiable from inside the product —
// each customer instance must have its own, and reading the name back is
// the only way an operator can confirm they didn't paste another
// deployment's credentials.
export function storageTarget(): { kind: "r2" | "local"; target: string; account?: string } {
  const s = getStorage();
  if (s.kind === "r2") {
    return {
      kind: "r2",
      target: process.env.R2_BUCKET ?? "(unset)",
      account: process.env.R2_ACCOUNT_ID?.slice(0, 8),
    };
  }
  return { kind: "local", target: LOCAL_ROOT };
}

export interface StorageCheck {
  ok: boolean;
  kind: "r2" | "local";
  target: string;
  detail: string;
}

// Write → read → delete round trip. Credentials that authenticate but
// can't write, or a bucket that doesn't exist, otherwise stay invisible
// until the first ad ingest silently fails to archive its creatives.
export async function checkStorage(): Promise<StorageCheck> {
  const { kind, target } = storageTarget();
  const key = `_healthcheck/${Date.now()}.txt`;
  const payload = Buffer.from(`adsniper storage check ${new Date().toISOString()}`);
  try {
    const s = getStorage();
    await s.put(key, payload, "text/plain");
    const back = await s.get(key);
    if (!back) throw new Error("wrote the object but could not read it back");
    if (!back.body.equals(payload)) throw new Error("read back different bytes than were written");
    await s.removePrefix("_healthcheck/");
    return { ok: true, kind, target, detail: "write, read and delete all succeeded" };
  } catch (err) {
    return {
      ok: false,
      kind,
      target,
      detail: err instanceof Error ? err.message.split("\n")[0].slice(0, 220) : String(err),
    };
  }
}
