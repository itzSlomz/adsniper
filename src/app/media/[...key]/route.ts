import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth-gated media proxy (brief Section 10): the bucket is never public;
// all cached media is served through here, session required.
export async function GET(
  _req: Request,
  { params }: { params: { key: string[] } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
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
