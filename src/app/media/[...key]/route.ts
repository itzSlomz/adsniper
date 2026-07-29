import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Media proxy: the bucket itself is never public — everything serves
// through here. Public read access per operator decision (2026-07-29).
export async function GET(
  _req: Request,
  { params }: { params: { key: string[] } }
) {
  const key = params.key.join("/");
  if (key.includes("..")) {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }
  const obj = await getStorage().get(key);
  if (!obj) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
