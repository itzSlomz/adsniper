"use client";

import { useMemo, useState } from "react";
import type { PostCardData } from "@/lib/dashboard";
import { BrandSquare, Dialog, PlatformBadge, num, relTime } from "@/components/ui";

function erOf(p: PostCardData): string | null {
  if (!p.views) return null;
  return `${((p.engagement / p.views) * 100).toFixed(1)}% ER`;
}

function PostCard({ post, onOpen }: { post: PostCardData; onOpen: () => void }) {
  return (
    <div className="flex cursor-pointer flex-col border bg-white" style={{ borderColor: "var(--color-divider)" }} onClick={onOpen}>
      <div className="media-frame aspect-video">
        <PlatformBadge platform={post.platform} />
        {post.thumbPath ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/media/${post.thumbPath}`} alt="" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center p-3" style={{ background: "var(--color-surface)" }}>
            <p dir="auto" className="line-clamp-3 text-center text-xs font-semibold">
              {post.text || "—"}
            </p>
          </div>
        )}
        {post.mediaType === "video" && (
          <span className="absolute inset-0 z-[1] flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center border-2 text-sm" style={{ borderColor: "var(--color-bg)", color: "var(--color-bg)", background: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
              ▶
            </span>
          </span>
        )}
        {post.mediaType === "carousel" && (
          <span className="absolute right-1.5 top-1.5 z-[1] px-1.5 text-[10px] font-bold" style={{ background: "var(--color-text)", color: "var(--color-bg)" }}>
            ⧉ {post.mediaCount}
          </span>
        )}
        <div className="media-strip">
          <span>Organic</span>
          <span>{erOf(post) ?? relTime(post.postedAt)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="flex items-center gap-2">
          <BrandSquare name={post.brandName} self={post.brandType === "self"} />
          <span className="truncate text-xs font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            {post.brandName}
          </span>
          <span className="ms-auto text-[10px] text-muted">{relTime(post.postedAt)}</span>
        </div>
        {post.thumbPath && (
          <p dir="auto" className="line-clamp-2 text-xs" style={{ opacity: 0.8 }}>
            {post.text}
          </p>
        )}
        {post.highPerformer && <span className="callout">High performer — top decile for this brand</span>}
        {post.possibleCampaign && <span className="callout-neutral">Possible campaign — new or repeated hashtag</span>}
        <div className="statrow mt-1 border-t pt-1.5" style={{ borderColor: "var(--color-divider)" }}>
          <span className="stat"><b>{num(post.likes)}</b><span>Likes</span></span>
          <span className="stat"><b>{num(post.replies + post.comments)}</b><span>Comments</span></span>
          <span className="stat"><b>{num(post.reposts)}</b><span>Reposts</span></span>
          {post.views != null && <span className="stat"><b>{num(post.views)}</b><span>Views</span></span>}
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ms-auto self-end text-[11px] font-semibold"
          >
            Open original ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function PostDialog({ post, onClose }: { post: PostCardData; onClose: () => void }) {
  return (
    <Dialog onClose={onClose}>
      {post.thumbPath && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`/media/${post.thumbPath}`} alt="" className="w-full" />
      )}
      <div className="flex items-center gap-2">
        <BrandSquare name={post.brandName} self={post.brandType === "self"} />
        <span className="dialog-title" style={{ fontSize: 16 }}>{post.brandName}</span>
        <span className="ms-auto text-xs text-muted">{new Date(post.postedAt).toLocaleString()}</span>
      </div>
      <p dir="auto" className="dialog-body whitespace-pre-wrap">{post.text}</p>
      <div className="statrow">
        <span className="stat"><b>{num(post.likes)}</b><span>Likes</span></span>
        <span className="stat"><b>{num(post.replies + post.comments)}</b><span>Comments</span></span>
        <span className="stat"><b>{num(post.reposts)}</b><span>Reposts</span></span>
        {post.views != null && <span className="stat"><b>{num(post.views)}</b><span>Views</span></span>}
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
        <a className="btn btn-primary" href={post.url} target="_blank" rel="noreferrer">
          Open original ↗
        </a>
      </div>
    </Dialog>
  );
}

export default function PostGrid({
  posts,
  showFilters = true,
  defaultSort = "engagement",
  groupByBrand = false,
}: {
  posts: PostCardData[];
  showFilters?: boolean;
  defaultSort?: "engagement" | "newest";
  groupByBrand?: boolean;
}) {
  const [platform, setPlatform] = useState("all");
  const [mediaType, setMediaType] = useState("all");
  const [sort, setSort] = useState<string>(defaultSort);
  const [open, setOpen] = useState<PostCardData | null>(null);

  const filtered = useMemo(() => {
    const out = posts.filter(
      (p) =>
        (platform === "all" || p.platform === platform) &&
        (mediaType === "all" || p.mediaType === mediaType)
    );
    return out
      .slice()
      .sort((a, b) =>
        sort === "engagement"
          ? b.engagement - a.engagement
          : +new Date(b.postedAt) - +new Date(a.postedAt)
      );
  }, [posts, platform, mediaType, sort]);

  const groups = useMemo(() => {
    if (!groupByBrand) return null;
    const map = new Map<string, PostCardData[]>();
    for (const p of filtered) map.set(p.brandName, [...(map.get(p.brandName) ?? []), p]);
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered, groupByBrand]);

  const seg = (value: string, current: string, set: (v: string) => void, label: string) => (
    <label className="seg-opt" key={value}>
      <input type="radio" checked={current === value} onChange={() => set(value)} />
      {label}
    </label>
  );

  const grid = (list: PostCardData[]) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((p) => (
        <PostCard key={p.id} post={p} onOpen={() => setOpen(p)} />
      ))}
    </div>
  );

  return (
    <div>
      {showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="seg">
            {seg("all", platform, setPlatform, "All platforms")}
            {seg("x", platform, setPlatform, "X")}
            {seg("linkedin", platform, setPlatform, "LinkedIn")}
          </span>
          <span className="seg">
            {seg("all", mediaType, setMediaType, "All media")}
            {seg("image", mediaType, setMediaType, "Image")}
            {seg("video", mediaType, setMediaType, "Video")}
            {seg("carousel", mediaType, setMediaType, "Carousel")}
            {seg("text", mediaType, setMediaType, "Text")}
          </span>
          <span className="seg">
            {seg("engagement", sort, setSort, "Top engagement")}
            {seg("newest", sort, setSort, "Newest")}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="card text-sm text-muted">No posts match these filters.</p>
      ) : groups ? (
        groups.map(([brandName, list]) => (
          <div key={brandName} className="mb-6">
            <div className="mb-2 flex items-center gap-2 border-b pb-1.5" style={{ borderColor: "var(--color-divider)" }}>
              <BrandSquare name={brandName} />
              <h3 style={{ fontSize: 16, margin: 0 }}>{brandName}</h3>
              <span className="text-xs text-muted">{list.length} today</span>
            </div>
            {grid(list)}
          </div>
        ))
      ) : (
        grid(filtered)
      )}

      {open && <PostDialog post={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
