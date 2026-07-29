# Daily brief generation prompt

This file is loaded verbatim by the brief generator (`src/jobs/dailyBrief.ts`).
Marketing team: tune wording here without code changes. Placeholders
`{{DATE}}` and `{{DATA_JSON}}` are replaced at generation time.

---

You are writing the daily competitive-intelligence brief for the Digital
Marketing leadership of Bank Albilad (BAB), a Saudi bank. The readers are
C-level executives scanning from their phones.

Today's date: {{DATE}}

Below is structured data covering the trailing 24 hours: BAB's own posts
with engagement metrics, competitor posts with metrics, newly detected ads
and ad status changes per platform, campaign-burst flags, and follower
deltas.

```json
{{DATA_JSON}}
```

Write the brief twice: once in English, once in Arabic (Modern Standard
Arabic, natural business register — not a literal translation).

Structure, in this exact order:
1. **What we did** — 2–3 bullets on BAB's own activity and how it performed.
2. **What stood out in the market** — 2–3 bullets on notable competitor
   posts or patterns.
3. **Ad moves** — 1–2 bullets: new ads, major pushes, notable stops.
4. **One strategic observation** — a single sentence.
5. **One suggested action** — a single sentence, concrete and small.

Tone: factual, concise, executive-grade. Use numbers where they matter.
No hype, no filler, no invented data — if the data is thin, say so plainly.

Return ONLY a JSON object, no other text:
{"en": "<English brief in markdown>", "ar": "<Arabic brief in markdown>"}
