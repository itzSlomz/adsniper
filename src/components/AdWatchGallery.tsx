"use client";

import { useMemo, useState } from "react";
import type { AdCardData } from "@/lib/dashboard";
import { BrandSquare, Dialog, PlatformBadge, relTime } from "@/components/ui";
import { daysRunning, stageForDays } from "@/lib/adStage";

const TABS = [
  { key: "all", label: "All" },
  { key: "meta", label: "Meta" },
  { key: "google", label: "Google" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "snapchat", label: "Snap" },
  { key: "tiktok", label: "TikTok" },
];

function daysActive(a: AdCardData): number {
  return daysRunning(a.firstSeen, a.lastSeen);
}

function fmtBytes(n: number | null): string {
  if (!n) return "";
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function AdCard({ ad, onOpen }: { ad: AdCardData; onOpen: () => void }) {
  const title = (ad.adText ?? "").split("\n")[0].slice(0, 60);
  return (
    <div className="flex cursor-pointer flex-col border bg-white" style={{ borderColor: "var(--color-divider)" }} onClick={onOpen}>
      <div className="media-frame aspect-square">
        <PlatformBadge platform={ad.platform} />
        {ad.thumbPath ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`/media/${ad.thumbPath}`} alt="" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center p-2" style={{ background: "var(--color-surface)" }}>
            <span dir="auto" className="line-clamp-4 text-center text-[11px] font-semibold">
              {ad.adText ?? ad.format.toUpperCase()}
            </span>
          </div>
        )}
        {ad.assets.some((x) => x.kind === "video") && (
          <span className="absolute inset-0 z-[1] flex items-center justify-center">
            <span
              className="flex h-9 w-9 items-center justify-center border-2 text-sm"
              style={{ borderColor: "var(--color-bg)", color: "var(--color-bg)", background: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}
            >
              ▶
            </span>
          </span>
        )}
        <div className="media-strip">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: stageForDays(daysActive(ad)).color }} />
            {stageForDays(daysActive(ad)).labelEn}
          </span>
          <span>{daysActive(ad)}d running</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        {title && (
          <p dir="auto" className="line-clamp-1 text-xs font-bold" style={{ fontFamily: "var(--font-heading)", margin: 0 }}>
            {title}
          </p>
        )}
        {ad.isNew && <span className="callout">Newly detected</span>}
        {ad.coverage === "partial" && (
          <span className="callout-neutral" title="TikTok Creative Center shows only curated Top Ads — this is not full coverage">
            Top Ads only
          </span>
        )}
        {ad.status === "stale" && <span className="callout-neutral">Stale — needs recheck</span>}
        <div className="statrow mt-auto border-t pt-1.5" style={{ borderColor: "var(--color-divider)" }}>
          <span className="stat"><b>{ad.format}</b><span>Format</span></span>
          <span className="stat" title={stageForDays(daysActive(ad)).meaning}>
            <b>{stageForDays(daysActive(ad)).labelEn}</b><span>Stage</span>
          </span>
          {ad.subPlatforms.length > 0 && (
            <span className="stat"><b>{ad.subPlatforms.length}</b><span>Placements</span></span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdWatchGallery({ ads }: { ads: AdCardData[] }) {
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState<AdCardData | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const PER_BRAND = 8;

  const groups = useMemo(() => {
    const filtered = ads.filter((a) => tab === "all" || a.platform === tab);
    const byBrand = new Map<string, AdCardData[]>();
    for (const a of filtered) byBrand.set(a.brandName, [...(byBrand.get(a.brandName) ?? []), a]);
    for (const list of Array.from(byBrand.values())) {
      list.sort(
        (a, b) =>
          Number(!!b.thumbPath) - Number(!!a.thumbPath) ||
          +new Date(b.firstSeen) - +new Date(a.firstSeen)
      );
    }
    return Array.from(byBrand.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [ads, tab]);

  return (
    <div>
      <div className="section-head">
        <span className="section-kicker">Paid media</span>
        <h2 style={{ margin: 0 }}>
          Detected ads <span className="text-muted" style={{ fontWeight: 400 }}>·</span>{" "}
          <span dir="rtl">الإعلانات المرصودة</span>
        </h2>
        <a
          className="btn btn-secondary ms-auto"
          href={`/api/export/ads${tab === "all" ? "" : `?platform=${tab}`}`}
          title="ZIP of every archived creative file plus a CSV manifest"
        >
          ↓ Export archive
        </a>
      </div>
      {/* Coverage disclosure (brief Section 5.3): never imply exhaustive coverage. */}
      <p className="mb-3 text-xs text-muted">
        Automated: Meta and Google ad libraries, plus TikTok Top Ads (curated chart — partial
        coverage). Manual: X, Snapchat, TikTok. LinkedIn ads currently disabled. Not exhaustive.
      </p>
      <div className="seg mb-4">
        {TABS.map((t) => (
          <label className="seg-opt" key={t.key}>
            <input type="radio" checked={tab === t.key} onChange={() => setTab(t.key)} />
            {t.label}
          </label>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="card text-sm text-muted">No detected ads on this platform.</p>
      ) : (
        groups.map(([brandName, brandAds]) => (
          <div key={brandName} className="mb-6">
            <div className="mb-2 flex items-center gap-2 border-b pb-1.5" style={{ borderColor: "var(--color-divider)" }}>
              <BrandSquare name={brandName} />
              <h3 style={{ fontSize: 16, margin: 0 }}>{brandName}</h3>
              <span className="text-xs text-muted">{brandAds.length} active</span>
              {brandAds[0]?.majorPush && <span className="section-kicker">Major push</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(expanded[brandName] ? brandAds : brandAds.slice(0, PER_BRAND)).map((a) => (
                <AdCard key={a.id} ad={a} onOpen={() => setOpen(a)} />
              ))}
            </div>
            {brandAds.length > PER_BRAND && (
              <button
                className="btn btn-ghost mt-1"
                style={{ fontSize: 12 }}
                onClick={() => setExpanded((e) => ({ ...e, [brandName]: !e[brandName] }))}
              >
                {expanded[brandName] ? "Show fewer" : `Show all ${brandAds.length} →`}
              </button>
            )}
          </div>
        ))
      )}

      {open && (
        <Dialog onClose={() => setOpen(null)}>
          {(() => {
            const video = open.assets.find((x) => x.kind === "video" && x.cachedPath);
            if (video) {
              return (
                <video
                  controls
                  playsInline
                  poster={video.thumbPath ? `/media/${video.thumbPath}` : undefined}
                  src={`/media/${video.cachedPath}`}
                  className="w-full"
                />
              );
            }
            return open.thumbPath ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={`/media/${open.thumbPath}`} alt="" className="w-full" />
            ) : null;
          })()}
          <div className="flex items-center gap-2">
            <BrandSquare name={open.brandName} />
            <span className="dialog-title" style={{ fontSize: 16 }}>{open.brandName}</span>
            <span className="ms-auto"><PlatformBadge platform={open.platform} /></span>
          </div>
          {open.adText && <p dir="auto" className="dialog-body whitespace-pre-wrap">{open.adText}</p>}
          <div className="statrow">
            <span className="stat"><b>{open.format}</b><span>Format</span></span>
            <span className="stat" title={stageForDays(daysActive(open)).meaning}>
              <b>{daysActive(open)}d · {stageForDays(daysActive(open)).labelEn}</b>
              <span>Running</span>
            </span>
            <span className="stat"><b>{relTime(open.firstSeen)}</b><span>First seen</span></span>
            <span className="stat"><b>{relTime(open.lastSeen)}</b><span>Last seen</span></span>
            <span className="stat"><b>{open.source === "manual" ? "Manual" : "Library"}</b><span>Source</span></span>
          </div>
          {open.cta && <p className="dialog-body" style={{ margin: 0 }}><span className="text-muted">CTA:</span> {open.cta}</p>}
          {open.subPlatforms.length > 0 && (
            <p className="dialog-body" style={{ margin: 0 }}>
              <span className="text-muted">Placements:</span> {open.subPlatforms.join(" · ")}
            </p>
          )}
          {domainOf(open.landingUrl) && (
            <p className="dialog-body" style={{ margin: 0 }}>
              <span className="text-muted">Lands on:</span>{" "}
              <a href={open.landingUrl!} target="_blank" rel="noreferrer">{domainOf(open.landingUrl)}</a>
            </p>
          )}
          {open.assets.length > 0 && (
            <div>
              <p className="card-kicker" style={{ marginBottom: 4 }}>
                Archived files ({open.assets.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {open.assets.map((a, i) => (
                  <a
                    key={i}
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    href={`/media/${a.cachedPath}?download=1&name=${encodeURIComponent(
                      `${open.brandName}-${open.platform}-${i + 1}`
                    )}`}
                  >
                    ↓ {a.kind === "video" ? "Video" : "Image"} {i + 1}
                    {a.bytes ? ` · ${fmtBytes(a.bytes)}` : ""}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="dialog-actions">
            <button className="btn btn-secondary" onClick={() => setOpen(null)}>Close</button>
            {open.libraryUrl && (
              <a className="btn btn-primary" href={open.libraryUrl} target="_blank" rel="noreferrer">
                View ad ↗
              </a>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
