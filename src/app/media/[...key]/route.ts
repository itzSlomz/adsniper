import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Media proxy: the bucket itself is never public — everything serves
// through here. Public read access per operator decision (2026-07-29).
export async function GET(
  req: Request,
  { params }: { params: { key: string[] } }
) {
  const key = params.key.join("/");
  const url = new URL(req.url);
  // ?download=1 forces a save dialog; ?name= supplies a readable filename.
  const asDownload = url.searchParams.get("download") === "1";
  const rawName = url.searchParams.get("name");
  if (key.includes("..")) {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }
  const obj = await getStorage().get(key);
  if (!obj) return NextResponse.json({ error: "not found" }, { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": obj.contentType,
    "Cache-Control": "private, max-age=86400",
  };
  if (asDownload) {
    const ext = key.split(".").pop() ?? "bin";
    const safe = (rawName ?? key.split("/").slice(-2).join("-"))
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 80);
    const filename = safe.endsWith(ext) ? safe : `${safe}.${ext}`;
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }
  return new NextResponse(new Uint8Array(obj.body), { headers });
}
