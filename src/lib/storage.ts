import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import path from "path";

// Small storage module (brief Section 2): R2 when credentials are present,
// local-disk fallback otherwise so ingestion and dev verification work
// before infra arrives. The bucket is never public — media is served only
// through the auth-gated /media proxy route.

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  kind: "r2" | "local";
}

const LOCAL_ROOT = process.env.MEDIA_DIR ?? path.join(process.cwd(), ".data", "media");

function contentTypeFromKey(key: string): string {
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".gif")) return "image/gif";
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
};

function r2Storage(): Storage {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
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
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        const body = Buffer.from(await res.Body!.transformToByteArray());
        return { body, contentType: res.ContentType ?? contentTypeFromKey(key) };
      } catch {
        return null;
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
