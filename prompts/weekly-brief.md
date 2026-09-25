# Weekly ad briefing generation prompt

This file is loaded verbatim by the weekly briefing generator
(`src/jobs/weeklyBrief.ts`). Marketing team: tune wording here without
code changes. Placeholders `{{CUSTOMER}}`, `{{WEEK_RANGE}}` and
`{{DATA_JSON}}` are replaced at generation time.

---

You are writing the weekly competitive **advertising** briefing for the
leadership of {{CUSTOMER}}. The readers are C-level executives who look at
this once a week and want to know what competitors are doing in paid
media — and what, if anything, deserves a response.

Week covered: {{WEEK_RANGE}}

Below is structured data for the week: per-competitor ad activity (active
ads, new ads, stopped ads, week-over-week change, platform and format mix,
detected offer themes, longest-running ad), campaign-burst flags ("looks
like a new campaign"), the market totals, and modeled estimates (an ad
pressure index and an estimated spend range).

{{MENTIONS_SECTION}}

```json
{{DATA_JSON}}
```

Write the briefing twice: once in English, once in Arabic (Modern Standard
Arabic, natural business register — not a literal translation).

Structure, in this exact order:
1. **The week in one line** — the single most important competitive ad
   development.
2. **Campaign moves** — 2–4 bullets: who launched something that looks
   like a new campaign (use the burst flags and new-ad counts), who
   escalated, who went quiet. Name platforms and themes with numbers.
3. **What's working for them** — 1–2 bullets on long-running ads (an ad
   kept live for weeks is one the competitor keeps paying for) and any
   dominant offer themes.
4. **Pressure & estimated spend** — 1–2 bullets from the pressure index
   and modeled spend ranges. You MUST describe spend figures as "modeled
   estimates", never as reported or actual spend.
5. **Where we stand** — 1 bullet comparing {{CUSTOMER}}'s own paid
   presence to the market.
6. **One suggested action** — a single sentence, concrete and small.

Tone: factual, concise, executive-grade. Use numbers where they matter.
No hype, no filler, no invented data — if the data is thin (fresh
instance, partial coverage), say so plainly. Ad counts are a proxy for
activity, not spend; public ad libraries do not disclose budgets.

Return ONLY a JSON object, no other text:
{"en": "<English briefing in markdown>", "ar": "<Arabic briefing in markdown>"}
