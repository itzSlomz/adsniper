import { promises as fs } from "fs";
import path from "path";
import { getStorage } from "@/lib/storage";
import type { JobContext } from "@/jobs/runner";

const LOCAL_ROOT = process.env.MEDIA_DIR ?? path.join(process.cwd(), ".data", "media");

// One-shot migration: copy media cached on local disk (pre-R2 era) into
// R2. Idempotent — re-uploading overwrites identical objects. Run from
// Intel → "Run now" after setting the R2_* variables. No-ops when R2
// isn't configured.
export async function runMediaMigrate(ctx: JobContext): Promise<void> {
  const storage = getStorage();
  if (storage.kind !== "r2") {
    ctx.errors.push("(info) R2 not configured; nothing to migrate");
    return;
  }

  async function walk(dir: string): Promise<string[]> {
    let out: string[] = [];
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out = out.concat(await walk(p));
      else out.push(p);
    }
    return out;
  }

  const files = await walk(LOCAL_ROOT);
  for (const file of files) {
    const key = path.relative(LOCAL_ROOT, file).split(path.sep).join("/");
    try {
      const body = await fs.readFile(file);
      const ext = path.extname(key).slice(1);
      const type =
        ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      await storage.put(key, body, type);
      ctx.itemsIngested++;
    } catch (err) {
      ctx.errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
