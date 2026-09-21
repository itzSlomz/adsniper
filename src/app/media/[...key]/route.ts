import { NextResponse } from "next/server";
import { Readable } from "stream";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Media proxy: the bucket itself is never public — everything serves
// through here. Public read access per operator decision (2026-07-29).
// Responses stream rather than buffer, and honour HTTP Range, so a 50MB
// video creative never sits in the server's memory and can be scrubbed.
export async function GET(req: Request, props: { params: Promise<{ key: string[] }> }) {
  const params = await props.params;
  const key = params.key.join("/");
  const url = new URL(req.url);
  // ?download=1 forces a save dialog; ?name= supplies a readable filename.
  const asDownload = url.searchParams.get("download") === "1";
  const rawName = url.searchParams.get("name");
  if (key.includes("..")) {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }

  const rangeHeader = req.headers.get("range");
  const m = rangeHeader ? /bytes=(\d+)-(\d*)/.exec(rangeHeader) : null;
  const range = m
    ? { start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined }
    : undefined;

  const obj = await getStorage().getStream(key, range);
  if (!obj) return NextResponse.json({ error: "not found" }, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": obj.contentType,
    "Cache-Control": "public, max-age=86400",
    "Accept-Ranges": "bytes",
  };
  if (obj.contentLength) headers["Content-Length"] = String(obj.contentLength);
  if (obj.contentRange) headers["Content-Range"] = obj.contentRange;
  if (asDownload) {
    const ext = key.split(".").pop() ?? "bin";
    const safe = (rawName ?? key.split("/").slice(-2).join("-"))
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 80);
    const filename = safe.endsWith(ext) ? safe : `${safe}.${ext}`;
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(
    Readable.toWeb(obj.stream as Readable) as ReadableStream,
    { status: obj.contentRange ? 206 : 200, headers }
  );
}
