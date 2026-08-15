"use client";

import { useState } from "react";

// Markdown-lite: bold + bullets + headers, nothing more.
function renderLine(line: string, i: number) {
  const html = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  if (/^\s*[-•*]\s+/.test(line)) {
    return (
      <li key={i} className="ms-4 list-disc" dangerouslySetInnerHTML={{ __html: html.replace(/^\s*[-•*]\s+/, "") }} />
    );
  }
  if (/^\s*#{1,4}\s+/.test(line)) {
    return (
      <p key={i} className="mt-2 font-bold" style={{ fontFamily: "var(--font-heading)" }} dangerouslySetInnerHTML={{ __html: html.replace(/^\s*#{1,4}\s+/, "") }} />
    );
  }
  if (line.trim() === "") return null;
  return <p key={i} style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function BriefCard({
  en,
  ar,
  status,
  date,
  kicker = "Daily brief — market moves",
}: {
  en: string;
  ar: string;
  status: string;
  date: string;
  kicker?: string;
}) {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const content = lang === "ar" ? ar : en;
  return (
    <div className="card elev-sm" style={{ borderTop: "3px solid var(--color-accent)" }}>
      <div className="flex items-center gap-2">
        <div>
          <span className="card-kicker">{kicker}</span>
          <div className="card-title">
            {date}
            {status === "draft" && <span className="tag tag-accent ms-2">Draft</span>}
          </div>
        </div>
        <span className="seg ms-auto">
          <label className="seg-opt">
            <input type="radio" checked={lang === "ar"} onChange={() => setLang("ar")} />
            عربي
          </label>
          <label className="seg-opt">
            <input type="radio" checked={lang === "en"} onChange={() => setLang("en")} />
            EN
          </label>
        </span>
      </div>
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={`space-y-1 text-sm leading-relaxed ${lang === "ar" ? "text-right" : ""}`}
      >
        {content.split("\n").map(renderLine)}
      </div>
    </div>
  );
}
