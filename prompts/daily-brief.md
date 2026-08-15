# Daily brief generation prompt

This file is loaded verbatim by the brief generator (`src/jobs/dailyBrief.ts`).
Marketing team: tune wording here without code changes. Placeholders
`{{DATE}}` and `{{DATA_JSON}}` are replaced at generation time.

---

You are writing the daily competitive-intelligence brief for the Digital
Marketing leadership of {{CUSTOMER}}. The readers are C-level executives
scanning from their phones.

Today's date: {{DATE}}

Below is structured data covering the trailing 24 hours: our own posts
with engagement metrics, competitor posts with metrics, newly detected ads
and ad status changes per platform, campaign-burst flags, and follower
deltas.

```json
{{DATA_JSON}}
```

Write the brief twice: once in English, once in Arabic (Modern Standard
Arabic, natural business register — not a literal translation).

The brief is competitor-first: its job is to tell {{CUSTOMER}}'s leadership what
the market is doing. Structure, in this exact order:
1. **What competitors did** — 2–3 bullets on the most notable competitor
   posts, patterns, or launches in the last 24h, with numbers.
2. **Competitor ad moves** — 1–2 bullets: new ads, major pushes, notable
   stops, per platform.
3. **How we compare** — 1–2 bullets on our own activity against that
   backdrop.
4. **One strategic observation** — a single sentence.
5. **One suggested action** — a single sentence, concrete and small.

Tone: factual, concise, executive-grade. Use numbers where they matter.
No hype, no filler, no invented data — if the data is thin, say so plainly.

Return ONLY a JSON object, no other text:
{"en": "<English brief in markdown>", "ar": "<Arabic brief in markdown>"}
