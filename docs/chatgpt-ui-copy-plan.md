# Evidence engine — product vision + what to copy from ChatGPT

**Owner vision statement:** 2026-06-30 / 07-01. **Method:** studied ChatGPT's live "berberine vs
Ozempic" and "white flakes" conversations (owner's browser) + ran the same questions in our live app
(v67) and read the real source counts. This doc supersedes the earlier "copy the UI" framing — the UI
is in service of the mission below.

---

## Build status — 2026-07-01 (branch `feat/verify-a-claim`)

**Built, tested green** (511 ask + 204 shared Deno tests, web typecheck, eval metrics), previewed from the
real component:
- **L0** — query-cleaner fix: colloquial "what causes / why do I have / what is X" now reaches the
  research sources as the topic keywords. ✅ `46cf427`.
- **L1** — per-claim Evidence meter, source-type pills, expandable "what I searched" thinking trail,
  source favicons, "Sources · N" chip, thumbs feedback. ✅ `c307d9c` + `bdc5368`.
- **L2** — the both-sides claim-check (for + counter + limits + news lenses); gated `what_contradicts`
  counter-evidence path (safety-scanned + citation-enforced + double-gated). ✅ `8ca890e`.
- **L3** — "Copy as cited report" (formatted, cited markdown mini-paper) from any answer. ✅ `bdc5368`.
- **Consumer-answer shape** — for "why do I have / what causes X" questions, a gated **differential**
  (several causes, each rigor-graded) + attributed practical **options** + a **"When to see a clinician"**
  red-flag block (from safety_notes). Rides the same `verify_claim` gate; `general_health`/`health_context`
  only; overrides the Fast 2-point cap for that class; no new schema field. ✅ `c249a53`. This closes the
  breadth/actionability half of the ChatGPT gap the live head-to-head exposed.

**Deferred / NOT built** (honest ledger):
- **L0** widening per-provider caps + down-ranking trials for consumer intent — NOT done (shipped only
  the query-fix; kept the change surface small).
- **L1** the `+` tools launcher — NOT built (still a disabled "Attach — coming soon").
- **L3** PDF / Word / PPT surfacing from an *ask* answer — NOT built (markdown report only; the separate
  research-report PDF/PPT pipeline already exists).
- **L2** anecdotal lens ("what people report") — NOT built; the *source* is a product/safety DECISION for
  the owner (Reddit/forums vs consumer-guidance-only vs skip). The walled news lens covers "what's being
  said" for now.

**Verification ceiling (read before deploy):** offline I can only verify Deno tests + typecheck + the
CANNED-fixture render. The engine's REAL output is UNVERIFIED until deploy:
- **L0 is an UNCONDITIONAL retrieval change on deploy (not gated)** — it changes the research query for
  every colloquial question in prod. Safe (touches only the free-text research string, never the drug
  `term`/fabrication guard) but its retrieval EFFECT ("what causes white flakes" actually pulling
  MedlinePlus) is unverified — **validate on the `retrieval-eval` / guardrail CI at deploy.**
- **L2 counter generation is DOUBLE-GATED OFF** (`NEXT_PUBLIC_VERIFY_CLAIM` web + `VERIFY_CLAIM_COUNTER`
  server env). Its real output quality is unverified — **the owner MUST pass the live 48-check with
  verify_claim requests BEFORE enabling `VERIFY_CLAIM_COUNTER`;** rollback = clear the env.

---

## What the app IS (north star, owner's words)

An **evidence engine**, not a clinical-advice bot. Every question — even personal-framed ones like
"is sucralose bad for me" or "are seed oils bad" — is treated as **investigational, not medical
advice**. It gives off **trust** by showing its work.

**The three lenses it answers with:**
1. **Official evidence** — what the strongest research actually says.
2. **Anecdotal** — what people are saying / what works for them (clearly walled as *not* evidence).
3. **In the news** — what's being said right now.

**How it reasons about a claim:**
- **Steelman the claim** (present the strongest case *for* it) **and** present the evidence that
  **contradicts** it. Both sides, deliberately.
- **Grade the evidence by rigor + relevance** — per sub-claim, not one blanket verdict (ChatGPT's
  "Evidence meter" does exactly this: "moderate but mixed / weak-modest / no").

**Jobs it does for the user:**
- *"I saw this claim but don't want to read papers"* — especially for **under-investigated** claims.
- *"My preceptor gave me a research question — do it for me, and generate a proper paper with
  formatted citations, even a presentation."*
- *"Is this good for me?"* — a shopper in-store looking at a food/supplement → **"here's the strongest
  evidence for this."**

The moat vs a general chatbot: **deterministic safety + provenance/no-fabrication + structured
three-lens + honest per-claim grading + real deliverables.**

---

## What ChatGPT does well (patterns to copy) — full catalogue

From the berberine claim-check (a perfect example of our target question class):

### The answer body (markdown scaffold)
- A one-line **framing line** ("I'll compare them on mechanism, safety, and why 'nature's Ozempic' is
  misleading").
- A **bold verdict lead**: "**No. Berberine is not Ozempic.**"
- **Bold-term definitions**, each ending in an **authority pill**: "**Ozempic = semaglutide**, …"
  `Novo PI`; "**Berberine = supplement/plant alkaloid**, …" `JAMA Network`.
- A **"Plain English:"** block (simplified restatement).
- An **"Evidence meter:"** block — **per-sub-claim grades**:
  - Berberine for blood sugar/lipids: **moderate but mixed**
  - Berberine for major weight loss: **weak/modest**
  - Berberine as "Ozempic replacement": **no**
- **Caveats/safety** with pills (`NCCIH`, `FDA`).
- A **Sources** footer with a favicon cluster.
- It **steelmans** (what berberine might do via AMPK/microbiome) then **counters** (the 2026 JAMA RCT:
  did *not* reduce visceral/liver fat). This is the both-sides structure the vision wants.

### The thinking preview (two levels — the trust signal)
- **Live:** one line naming the source being searched ("Searching www.nccih.nih.gov") → "Browsing
  medical sources on berberine vs Ozempic" with **domain chips**.
- **Done:** collapses to **"Thought for 16s ›"**, expandable into the **Activity panel** which shows
  the full **step-by-step reasoning** — each step a titled paragraph ("Comparing semaglutide weight
  loss trials and citations") **with the domains it searched** as chips.

### The `+` menu (a tools/skills launcher, NOT just "attach")
`Add photos & files · Create image · **Web search** ("real-time news and info") · **Deep research**
("get a detailed report") · **Canva** ("presentations, marketing materials") · Supabase · GitHub`.
→ Maps to our **news lens**, our **Deep Research report**, and our **deck/paper deliverables**.

### The source panel ("Activity · 16s")
Opens automatically; "Thinking" trail + **"Sources · 46"** + rich cards (favicon + publisher + title +
date + snippet). Many are dupes from one site — 46 = pages browsed, not 46 vetted cites.

### The answer footer
Copy · thumbs up/down (**feedback**) · share/**export** · **regenerate** · more · **Sources** button.

---

## What we ALREADY have (don't rebuild)

- **Per-claim citation grounding**, deterministic **evidence_grade**, **safety floor**, **walled "In
  the news"** panel, **honesty/abstention** framing.
- **Evidence Report Card + PDF / Word / PPT export** (the "paper" and "deck" deliverables largely
  exist — they need surfacing, not building from scratch).
- **Rich source cards** (support level, study type, relevance bar, vetted-OA flag) — already richer
  than ChatGPT's.
- A **ChatGPT-style composer**, per-turn sources, citation→panel highlight, collapsible/resizable
  evidence panel, saved chats.

**Measured gap (live, v67):** "what causes white flakes" returns **12 sources total** (1 cited + 11
reviewed) = **3 PubMed + 9 clinical trials + 0 consumer-health authorities**. ChatGPT's 46 were all
consumer authorities. So the count gap is **retrieval**, not display.

---

## The plan — four layers

### Layer 0 — Retrieval breadth + source mix (engine; the "12 → 40+" fix)
Widen per-provider result caps for consumer/claim questions; **add consumer-health + news + anecdotal
sources** (MedlinePlus is in the v67 priority but returned 0 here — verify it fires; add Mayo/
Cleveland/AAD-class explainers; a news feed; a clearly-walled anecdotal source e.g. curated forums/
Reddit). Down-rank clinical trials for "what causes / is X bad" intent.
Files: `supabase/functions/ask/index.ts`, `query-understanding.ts`, provider modules. (CLI deploy.)

### Layer 1 — Trust surface (front-end; copy ChatGPT; fast, visible)
1. **Inline authority pills** (source-type-aware: publisher name for consumer/authority, journal/PMID
   for research; "+N"). `ask/page.tsx` `CiteChips`, `shell.css`.
2. **Per-claim "Evidence meter"** — render each sub-claim's grade (we compute grades already; show
   them per point, not one blanket chip). `ask/page.tsx` `Answer`, shared grade data.
3. **Expandable thinking trail** — "Thought for Ns ›" that opens the step reasoning + **"searched
   these sources"** chips. `ask/page.tsx` `Thinking`, `EvidencePanel`, `lib/thinking-preview.ts`.
4. **Source panel polish** — favicons, prominent "Sources · N", a "Sources · N" chip under each
   answer. `EvidencePanel.tsx`, `AppShell.tsx`.
5. **`+` tools launcher + answer footer** — turn "+" into a modes/tools menu (Deep research, News,
   Make a deck); add feedback + export to the footer. `Composer`, `Answer`.

### Layer 2 — The investigational answer (the flagship: "Verify a claim")
The differentiator beyond ChatGPT. For any claim ("are seed oils bad", "is sucralose bad for me"):
- **Reframe personal → investigational** ("here's what the evidence says about sucralose").
- **Structured both-sides**: strongest case **FOR** (steelman) + strongest **AGAINST** (counter).
- **Three-lens output**: Official evidence / Anecdotal (walled) / In the news — labeled, separated.
- **Per-claim evidence meter** as the verdict.
Files: `ask/index.ts` (claim intent + retrieval routing), generation prompt/schema, `Answer` render.

### Layer 3 — Deliverables (surface what mostly exists)
Surface the **Report Card → paper (formatted citations)** and **→ presentation/deck** from any answer
(a "Make a paper / Make a deck" action), matching the "preceptor" and "paper + presentation" jobs.
Files: existing `evidence-report-card.ts` / `report-document.ts` + a surfacing affordance.

---

## Recommended first slice

The vision's flagship is **"Verify a claim."** Highest-leverage, most-differentiating build:
**Layer 1 (trust surface: pills + per-claim evidence meter + thinking trail) + the Layer 2 answer
scaffold (steelman + counter + three-lens)** on the current engine, behind an owner-gated preview —
then **Layer 0 (retrieval breadth)** to make the sources deep, then **Layer 3 (deliverables)**.

Rationale: Layer 1 is fast and visible; the Layer 2 scaffold is what makes us *not* a ChatGPT clone;
Layer 0 is the foundation that makes both genuinely good; Layer 3 is mostly surfacing existing work.
