"use client";

// Shared atoms for the Modernist-styled grids.

export function relTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export function num(n: number | null | undefined): string {
  if (n == null) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const PLATFORM_GLYPH: Record<string, string> = {
  x: "𝕏",
  linkedin: "in",
  meta: "f",
  google: "G",
  snapchat: "👻",
  tiktok: "♪",
  other: "•",
};

export function PlatformBadge({ platform }: { platform: string }) {
  return <span className="plat-badge">{PLATFORM_GLYPH[platform] ?? "•"}</span>;
}

export function BrandSquare({ name, self = false }: { name: string; self?: boolean }) {
  const initials = name
    .replace(/\(.*\)/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return <span className={`brand-sq${self ? " self" : ""}`}>{initials}</span>;
}

export function Dialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="dialog-backdrop z-50" onClick={onClose}>
      <div
        className="dialog max-h-full overflow-y-auto"
        style={{ width: "min(560px, 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
