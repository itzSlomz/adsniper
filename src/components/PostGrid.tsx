"use client";

import { useMemo, useState } from "react";
import type { PostCardData } from "@/lib/dashboard";
import { Badge, Lightbox, PlatformIcon, num, relTime } from "@/components/ui";

function PostThumb({ post }: { post: PostCardData }) {
  if (post.thumbPath) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/media/${post.thumbPath}`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
        {post.mediaType === "video" && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-white">▶</span>
          </span>
        )}
        {post.mediaType === "carousel" && (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 text-xs text-white">
            ⧉ {post.mediaCount}
          </span>
        )}
      </div>
    );
  }
  // Text-only posts render as a styled quote card so the grid stays uniform.
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-t-lg bg-gradient-to-br from-gray-100 to-gray-200 p-4">
      <p dir="auto" className="line-clamp-4 text-center text-sm font-medium text-gray-700">
        {post.text || "—"}
      </p>
    </div>
  );
}

export default function PostGrid({
  posts,
  showFilters = true,
  defaultSort = "engagement",
}: {
  posts: PostCardData[];
  showFilters?: boolean;
  defaultSort?: "engagement" | "newest";
}) {
  const brands = useMemo(
    () => Array.from(new Set(posts.map((p) => p.brandName))).sort(),
    [posts]
  );
  const [brandSel, setBrandSel] = useState<string[]>([]);
  const [platform, setPlatform] = useState("all");
  const [mediaType, setMediaType] = useState("all");
  const [sort, setSort] = useState<string>(defaultSort);
  const [open, setOpen] = useState<PostCardData | null>(null);

  const filtered = useMemo(() => {
    let out = posts.filter(
      (p) =>
        (brandSel.length === 0 || brandSel.includes(p.brandName)) &&
        (platform === "all" || p.platform === platform) &&
        (mediaType === "all" || p.mediaType === mediaType)
    );
    out = out
      .slice()
      .sort((a, b) =>
        sort === "engagement"
          ? b.engagement - a.engagement
          : +new Date(b.postedAt) - +new Date(a.postedAt)
      );
    return out;
  }, [posts, brandSel, platform, mediaType, sort]);

  return (
    <div>
      {showFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <div className="flex flex-wrap gap-1">
            {brands.map((b) => (
              <button
                key={b}
                onClick={() =>
                  setBrandSel((cur) =>
                    cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]
                  )
                }
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  brandSel.includes(b) ? "border-gray-900 bg-gray-900 text-white" : "bg-white"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded border px-2 py-1">
            <option value="all">All platforms</option>
            <option value="x">X</option>
            <option value="linkedin">LinkedIn</option>
          </select>
          <select value={mediaType} onChange={(e) => setMediaType(e.target.value)} className="rounded border px-2 py-1">
            <option value="all">All media</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="carousel">Carousel</option>
            <option value="text">Text</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded border px-2 py-1">
            <option value="engagement">Top engagement</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
          No posts for this selection.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="rounded-lg border bg-white text-left shadow-sm transition hover:shadow">
              <PostThumb post={p} />
              <div className="space-y-1 p-2">
                <div className="flex items-center gap-1.5">
                  <PlatformIcon platform={p.platform} />
                  <span className="truncate text-xs font-medium">{p.brandName}</span>
                  <span className="ms-auto text-[10px] text-gray-400">{relTime(p.postedAt)}</span>
                </div>
                {p.thumbPath && (
                  <p dir="auto" className="line-clamp-2 text-xs text-gray-600">
                    {p.text}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  {p.highPerformer && <Badge tone="green">High performer</Badge>}
                  {p.possibleCampaign && <Badge tone="blue">Possible campaign</Badge>}
                </div>
                <div className="flex gap-2 text-[11px] text-gray-500">
                  <span>♥ {num(p.likes)}</span>
                  <span>↺ {num(p.reposts)}</span>
                  <span>💬 {num(p.replies + p.comments)}</span>
                  {p.views != null && <span>👁 {num(p.views)}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <Lightbox onClose={() => setOpen(null)}>
          {open.thumbPath && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/media/${open.thumbPath}`} alt="" className="mb-3 w-full rounded" />
          )}
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <PlatformIcon platform={open.platform} /> {open.brandName}
            <span className="ms-auto text-xs font-normal text-gray-400">
              {new Date(open.postedAt).toLocaleString()}
            </span>
          </div>
          <p dir="auto" className="mb-3 whitespace-pre-wrap text-sm">{open.text}</p>
          <div className="mb-3 flex gap-3 text-sm text-gray-600">
            <span>♥ {num(open.likes)}</span>
            <span>↺ {num(open.reposts)}</span>
            <span>💬 {num(open.replies + open.comments)}</span>
            {open.views != null && <span>👁 {num(open.views)}</span>}
          </div>
          <a href={open.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
            Open original ↗
          </a>
        </Lightbox>
      )}
    </div>
  );
}
