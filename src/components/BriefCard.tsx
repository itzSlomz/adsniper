"use client";

import { useState } from "react";

// Minimal markdown rendering for brief bullets: bold + bullets + numbered
// section headers. Anything fancier belongs in the prompt, not here.
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
      <p key={i} className="mt-2 font-semibold" dangerouslySetInnerHTML={{ __html: html.replace(/^\s*#{1,4}\s+/, "") }} />
    );
  }
  if (line.trim() === "") return null;
  return <p key={i} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function BriefCard({
  en,
  ar,
  status,
  date,
}: {
  en: string;
  ar: string;
  status: string;
  date: string;
}) {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const content = lang === "ar" ? ar : en;
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-base font-semibold">Daily brief</h2>
        <span className="text-xs text-gray-400">{date}</span>
        {status === "draft" && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            Draft
          </span>
        )}
        <div className="ms-auto flex overflow-hidden rounded border text-xs">
          <button
            onClick={() => setLang("ar")}
            className={`px-2 py-1 ${lang === "ar" ? "bg-gray-900 text-white" : "bg-white"}`}
          >
            عربي
          </button>
          <button
            onClick={() => setLang("en")}
            className={`px-2 py-1 ${lang === "en" ? "bg-gray-900 text-white" : "bg-white"}`}
          >
            EN
          </button>
        </div>
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
