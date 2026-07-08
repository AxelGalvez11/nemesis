# PharmaOrb Plan: Beautiful Deliverables + Closing the Student Pains
*July 7, 2026 — synthesizes two research passes: (1) how to make AI agents produce genuinely good posters/slides/reports (Anthropic document skills, open-source deck generators, academic design canon), and (2) the Reddit student-pains report ([stem-student-ai-gaps-reddit-2026-07.md](../research/stem-student-ai-gaps-reddit-2026-07.md)).*

---

## Part 1 — The one-paragraph verdict

The formatting research says we're already on the right architecture: "Gamma-quality" output is a **design-rules and verification problem, not a rendering-engine problem**. Anthropic's own PowerPoint skill builds decks with the exact library we use (pptxgenjs) and gets quality from constrained templates, an enforced design system, and a render→inspect→fix loop — all things we can adopt directly. The pains research says the market hole is **trust** (fabricated citations everywhere), **synthesis** (lit-review "slop"), and **generosity** (usage limits students can't afford) — and that beautiful *cited* deliverables are the visible proof of the trust story. The plan below ships the deliverables polish first (it's nearly done), then the trust features that exploit competitors' most-complained-about failures.

---

## Part 2 — Deliverables track: make the agent produce great posters, slides, reports

### What the research established
- **Keep the programmatic pipeline** (pdf-lib / docx / pptxgenjs from one theme). No headless Chrome by default; Markdown-deck tools (Marp/Slidev) can't produce editable PowerPoint; WeasyPrint is slow and wrong for our stack. ([architecture brief](deep links in docs/research/deep-research-agentic-architecture-2026-07.md context))
- **Steal the design rules from Anthropic's document skills** (installed locally, read directly): content-informed palette with one dominant color at 60-70% visual weight; ONE repeated visual motif; every slide needs a visual element; vary layouts; left-align body text; title/body size contrast (36-44pt titles vs 14-16pt body); consistent spacing steps; **never an accent line under slide titles** (the AI-deck tell — already removed from ours).
- **Native charts are free**: pptxgenjs `addChart` produces real, editable PowerPoint charts (no new dependency). For PDF/Word: server-side SVG→PNG via resvg-js or sharp — no browser.
- **The QA loop is the quality multiplier**: render → thumbnail → fresh-eyes visual inspection against a defect checklist (overlap, overflow, contrast, spacing) → fix → re-verify. Anthropic's skill mandates it; we did it manually today; it should be automatic.
- **Typst** (modern typesetting engine, ~40MB, in-process Node, millisecond compiles, accessible PDFs) is the one credible future upgrade for the PDF report — phase-later, PDF-only.

### Build phases

**D1 — Export design system. SHIPPED TODAY (pending review/merge).**
One shared theme (`apps/web/lib/export/theme.ts`) drives all three exporters. PDF rebuilt on pdf-lib (cover, honesty card, styled evidence table that flows across pages, page numbers). Word and PowerPoint restyled to match (serif display, green accents, dark-header zebra tables, Google-Docs-safe table widths). Zero product branding in any exported file — enforced by an automated test.

**D2 — Deck & poster design v2 (1-3 days).**
- **Assertion-evidence headlines**: slide titles become full-sentence findings ("Creatine's cognitive benefit appears only under sleep deprivation [1]") instead of section labels ("What the evidence shows") — the single highest-impact upgrade in the slide-design canon. Generated from existing section content; deterministic fallback to the section heading; scanned by the same safety layer as all generated text.
- **Stat callouts**: a big-numbers slide (N sources · N trials · evidence grade · verification state) using the 60-72pt callout pattern.
- **Typography bump** to canon: deck titles ~32-36pt, body 15-16pt; vary layouts (two-column, callout, table) instead of all-bullets.
- **Poster goes live**: wire the existing ResearchPoster component to a real button on saved reports (route + print-to-PDF exists as dev-preview only today). Design default = **complete-assertion section headings** (full-sentence findings as headers): in the 2025 IEEE comparative study (Wolfe et al.), assertion headings + no abstract beat both the traditional IMRD poster *and* the #betterposter billboard; a 2025 randomized trial of #betterposter found **no overall comprehension gain** (only key-concept recall improved) and faculty criticized it for stripping context. So: assertion headings everywhere; the #betterposter giant-takeaway becomes an optional variant, not the default.

**D3 — Charts with real numbers (2-4 days).**
- **Forest plot for meta-analysis reports** — our meta stats are computed in real code (standing rule: never LLM-guessed), so we can draw the plot everyone else fakes. Native pptx chart in decks; SVG→PNG in PDF/Word/poster.
- Evidence-mix bar (sources by type/year) and a "what we searched" flow figure.

**D4 — The verification loop, productized (alongside D2/D3).**
Every generated deliverable is rendered to images server-side, run past a visual-QA check (the Anthropic defect checklist: overflow, overlap, contrast, spacing, placeholder text), auto-fixed, and re-rendered before the user sees it. This is what separates "generated a file" from "shipped a designed file."

**D5 — Later options (explicitly not now):** Typst PDF pipeline for journal-grade typography; HTML→pptx DOM-measurement only if design ceiling is actually hit; institutional template import ("make it match my university's template").

---

## Part 3 — Pains track: every pain from the report → a build

| # | Pain (evidence in report) | What we do about it | Status / effort |
|---|---------------------------|---------------------|-----------------|
| 1 | **Fabricated citations** — the universal #1, undergrad→PhD; subtler fakes now (wrong year/journal, real authors) | **Ship "Verify a bibliography"**: paste any reference list → PharmaOrb checks each citation exists (PubMed/Crossref/DOI), flags retractions, links the real paper, exports a clean corrected list. Directly monetizes the fear ("professor caught the fake"); we already have all the retrieval + retraction infrastructure. | NEW — highest-leverage cheap build (~2-3 days) |
| 2 | **"Has sources" ≠ claim supported** — Perplexity/Gemini attach links that don't contain the claim | Per-claim provenance is already built (support spans, quote highlights). Next: extend the deep-research faithfulness judge to fast-chat answers; show a "quote-verified" mark per claim in UI and exports. | Partially built; engine extension ~3-5 days, owner-gated deploy |
| 3 | **Lit-review "surface-level slop"** — want synthesis, gap-surfacing, citation networks | **Elicit-style extraction matrix** (already agreed as next big build): per-paper rows (population, n, design, outcome, effect) with per-cell provenance; our `gaps[]` engine already surfaces what's missing; Research Map later (needs Projects). | Next major build (~1-2 weeks) |
| 4 | **Full-text paywall ceiling** — caps every tool incl. Elicit | Honest scoping: maximize open-access full text (PMC/Unpaywall — we already ingest pubmed_oa), **label abstract-only sources in every deliverable**, never imply full-text coverage we don't have. Institutional-access integration = researched later; a trap if rushed. | Labeling: days. Access integration: deliberately deferred |
| 5 | **Usage limits + price** — "basically unusable" Pro plans; students can't pay $100/mo | Generous student free tier for cited answers; meter only deep research; keep quotas visible (credits surface exists). This is the growth wedge, per the OpenEvidence free-for-clinicians pattern. | **Owner decision** (pricing), then ~1 day of config |
| 6 | **Over-refusal on legit health/bio questions** (Gemini's failure) | Measure refusal/over-route rate on a legit-questions benchmark; fix the known preScreen over-routing with post-classify suppression (already designed, frozen-layer owner call). Keep the deterministic safety moat; kill nanny-refusals. Position: "safe AND answers." | Benchmark: days. Fix: owner-gated |
| 7 | **Confidently wrong math** | Don't compete on general math. Keep our rule: all statistics in deliverables computed in real code (meta-analysis engine), shown with the computation. Never over-claim math in positioning. | Standing rule — positioning discipline |
| 8 | **AI-detector false flags + integrity anxiety** | Every deliverable already carries methods, search date, per-claim citations. Add a **disclosure kit**: one-click "methods & AI-use statement" students can paste into a submission — turns integrity anxiety into our feature ("your receipts"). | NEW — ~1-2 days |
| 9 | **Tool-juggling fatigue** (Scholar↔PubMed↔tabs↔citation manager) | One workspace already: chat + deep research + library + monitoring + deliverables. Add BibTeX/RIS export of any evidence base (citation-manager handshake). | RIS/BibTeX export: ~1 day |
| 10 | **Indiscriminate source quality** (Gemini weighting blogs like journals) | Already ranked by evidence tier + strict web-trust domains (spoof-proofed). Surface the tier label on every source chip and in the evidence table. | Mostly built; UI labels: ~1 day |

---

## Part 4 — Recommended sequence

1. **Merge D1** (export design system) — in review now.
2. **Verify-a-bibliography** (#1) — the sharpest demo of the core moat; pairs with a landing-page moment ("paste your ChatGPT bibliography, watch it get checked").
3. **D2 deck/poster v2** — makes every deliverable visibly non-slop; the poster is the shareable growth artifact.
4. **Disclosure kit (#8) + BibTeX export (#9) + source-tier labels (#10)** — three small trust wins, ~3 days combined.
5. **D3 charts / forest plot** — the "real computed stats" flex nobody else can honestly make.
6. **Extraction matrix (#3)** — the big Elicit-parity build, week 2+.
7. Owner decisions in parallel: **student pricing (#5)**, poster footer branding, refusal-tuning gate (#6).

**Explicit non-goals right now:** general math tutoring, paywalled full-text promises, headless-browser rendering, LaTeX pipelines.

---

## Part 5 — Design spec the exporters/agent encode (numbers)

*From Anthropic's pptx/docx skills (read locally) — to be extended with the academic-poster spec brief when it lands.*

**Decks (13.33×7.5in wide):** titles 32-44pt bold serif; body 14-16pt sans, left-aligned; captions 10-12pt muted; margins ≥0.5in; block gaps 0.3-0.5in consistent; one dominant color 60-70% weight + 1-2 supports + 1 accent; one repeated motif (ours: top edge band + green serif titles); every slide carries a visual element; no accent lines under titles; no text-only slide runs; font pairing Georgia/Calibri (validated by the skill's own pairing table).
**Word reports (US Letter):** default 12pt body, headings 16/14pt bold with outline levels; tables at fixed DXA widths (percentage widths break in Google Docs), booktabs-style minimal rules, cell padding ~80/120 twips.
**PDF reports (US Letter):** 54pt margins; body 10.5pt/1.38 line height; H1 15pt; serif display 26pt; footer zone reserved; evidence tables with repeated headers across pages.
**Posters (48×36in):** spec table pending the design-rules brief (title/section/body pt readable at 4-6ft, column conventions, whitespace fraction, betterposter variant).
