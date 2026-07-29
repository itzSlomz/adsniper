"use client";

import { useMemo, useState } from "react";
import type { AdCardData } from "@/lib/dashboard";
import { Badge, Lightbox, PlatformIcon, relTime } from "@/components/ui";

const TABS = [
  { key: "all", label: "All" },
  { key: "meta", label: "Meta" },
  { key: "google", label: "Google" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "snapchat", label: "Snap" },
  { key: "tiktok", label: "TikTok" },
];

export default function AdWatchGallery({ ads }: { ads: AdCardData[] }) {
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState<AdCardData | null>(null);

  const groups = useMemo(() => {
    const filtered = ads.filter((a) => tab === "all" || a.platform === tab);
    const byBrand = new Map<string, AdCardData[]>();
    for (const a of filtered) {
      byBrand.set(a.brandName, [...(byBrand.get(a.brandName) ?? []), a]);
    }
    return Array.from(byBrand.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [ads, tab]);

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-base font-semibold">
          Detected ads <span className="text-gray-400">·</span>{" "}
          <span dir="rtl">الإعلانات المرصودة</span>
        </h2>
      </div>
      {/* Coverage disclosure (brief Section 5.3): never imply exhaustive coverage. */}
      <p className="mb-3 text-xs text-gray-500">
        Automated: Meta, Google, LinkedIn ad libraries. Manual: X, Snapchat, TikTok (no
        public ad library covers KSA for these). Not exhaustive.
      </p>
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              tab === t.key ? "border-gray-900 bg-gray-900 text-white" : "bg-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="rounded border border-dashed p-6 text-center text-sm text-gray-500">
          No detected ads on this platform.
        </p>
      ) : (
        groups.map(([brandName, brandAds]) => (
          <div key={brandName} className="mb-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {brandName}
              <span className="text-xs font-normal text-gray-400">{brandAds.length} active</span>
              {brandAds[0]?.majorPush && <Badge tone="red">Major push</Badge>}
            </h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {brandAds.map((a) => (
                <button key={a.id} onClick={() => setOpen(a)} className="group relative overflow-hidden rounded-lg border bg-white text-left shadow-sm">
                  {a.thumbPath ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={`/media/${a.thumbPath}`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-gray-100 p-2">
                      <span dir="auto" className="line-clamp-4 text-[10px] text-gray-600">
                        {a.adText ?? a.format}
                      </span>
                    </div>
                  )}
                  <span className="absolute left-1 top-1"><PlatformIcon platform={a.platform} /></span>
                  <span className="absolute right-1 top-1 flex gap-1">
                    {a.isNew && <Badge tone="green">New</Badge>}
                    {a.status === "stale" && <Badge tone="amber">Stale</Badge>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {open && (
        <Lightbox onClose={() => setOpen(null)}>
          {open.thumbPath && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/media/${open.thumbPath}`} alt="" className="mb-3 w-full rounded" />
          )}
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <PlatformIcon platform={open.platform} /> {open.brandName}
            {open.subPlatforms.length > 0 && (
              <span className="text-xs font-normal text-gray-400">
                {open.subPlatforms.join(" · ")}
              </span>
            )}
          </div>
          {open.adText && <p dir="auto" className="mb-2 whitespace-pre-wrap text-sm">{open.adText}</p>}
          {open.cta && <p className="mb-2 text-sm"><span className="text-gray-500">CTA:</span> {open.cta}</p>}
          {open.landingUrl && (
            <p className="mb-2 truncate text-sm">
              <span className="text-gray-500">Lands on:</span>{" "}
              <a href={open.landingUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">{open.landingUrl}</a>
            </p>
          )}
          <p className="mb-2 text-xs text-gray-500">
            First seen {relTime(open.firstSeen)} ago · last seen {relTime(open.lastSeen)} ago ·{" "}
            {open.source === "manual" ? "manually logged" : "from ad library"}
          </p>
          {open.libraryUrl && (
            <a href={open.libraryUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
              View in ad library ↗
            </a>
          )}
        </Lightbox>
      )}
    </div>
  );
}
