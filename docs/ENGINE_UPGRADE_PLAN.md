# Engine Upgrade Plan

_Plain-English build plan for the next wave of engine work. Written 2026-06-25._

Everything here is **additive and behind switches** — none of it touches the safety,
citation-integrity, or computed-statistics guarantees that are the product's moat. Where a
change has any correctness risk (only "beautiful prose" really does), the plan says exactly how
it stays safe.

---

## TL;DR — the recommended order

| # | Workstream | Effort | Impact | When |
|---|------------|--------|--------|------|
| A | Smarter front door (scope + easy-vs-clinical routing) | S–M (~2–4 days) | High (credibility) | Scope guard = pre-beta |
| B | Beautiful prose (writing quality) | M (~3–5 days) | Very high (perception) | Owner's call (see below) |
| C | Elicit-style extraction tables | M (~4–6 days) | High (feature) | After beta |
| D | Guidelines source | M–L (~1–2 wks, licensing-dependent) | High (clinical) | After beta |
| E | Web recon + entity intelligence | M (~4–7 days) | Very high (smartness) | Best-MVP upgrade |
| F | Evidence relation engine | L (~2–4 wks) | Very high (moat) | Pro / Evidence OS |
| G | Deep Research deliverables | M–L (~1–3 wks) | Very high (revenue) | Pro launch path |
| H | Model routing + eval harness | M (~1–2 wks) | High (quality/cost) | Before scale |

**The one genuine pre-beta item** is the out-of-scope guard inside A — testers *will* type "how to
make a sandwich," and an awkward medical answer there is a credibility hit. Everything else (the rest
of A, and B/C/D) is a polish-vs-speed trade-off, framed as a decision at the bottom of this doc. The
beta itself is otherwise close to ready — its open items are your toggles (password protection,
waitlist call, branch→main merge), not engineering.

---

## Best-MVP upgrade paths added 2026-06-26

These are the upgrade paths that move PharmaOrb from "cited medical chat" toward a serious biomedical
evidence engine. They are ordered by what most improves the public MVP first.

### 1. Live-source production gate

**What it is.** Verify that `LIVE_SOURCES=on` is set for the deployed `ask` and `research` Supabase
functions, with `VOYAGE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
and the LLM key configured in the same edge environment.

**Why it matters.** Without this switch, the app mostly answers from the existing embedded corpus.
With it on, the engine fans out to PubMed, Europe PMC, ClinicalTrials.gov, openFDA labels, FAERS,
OpenAlex, and MedlinePlus before reranking. This is the cheapest "make it feel alive" upgrade.

**MVP bar.** A production smoke test should confirm that a newer or long-tail query retrieves at
least one live source and that citation links resolve.

### 2. Web recon before biomedical retrieval

**What it is.** Add a pre-retrieval "what does the user mean?" lane for brands, slang, typos, popular
products, newsy terms, and non-drug entities. Example: "is celsius lethal" should first infer
"Celsius energy drink," then search the biomedical lanes for caffeine toxicity, energy drinks,
arrhythmia, poison/toxicology, and adverse events.

**Important rule.** Web recon is context, not clinical proof. General web pages can identify an entity
or clarify a term, but clinical claims must still come from trusted biomedical sources.

**MVP bar.** The answer states assumptions clearly: "I'm interpreting Celsius as the energy drink."
If the term is ambiguous, the engine asks a focused clarifying question or shows the top assumption.

### 3. Unified entity intelligence

**What it is.** Expand the current curated alias layer into a proper resolver for drug names,
brand/generic aliases, supplements, peptides, research compounds, consumer products, common typos,
and abbreviations.

**Why it matters.** The engine should not require users to speak in FDA-label vocabulary. It should
map messy user language into the right source lanes while avoiding fake-drug hallucinations.

**MVP bar.** At minimum: common drug typo correction, supplement/product aliases, energy drinks,
skincare actives, peptides/research compounds, and transparent assumptions.

### 4. Source-lane expansion

**What it is.** Add high-value source lanes that answer safety and serious-research questions better:
FDA enforcement/recalls, poison/toxicology references, guideline publications/pages, supplement or
nutrition sources, and eventually full-text open-access papers where available.

**Why it matters.** PubMed abstracts alone are not enough for "is this lethal," "is this recalled,"
"what do guidelines say," or "is this supplement safe."

**MVP bar.** Start with FDA enforcement/recalls and poison/toxicology. Those are high-safety,
high-trust, and fit the current live-source registry pattern.

### 5. Scite-style evidence relation engine

**What it is.** Move beyond "this source was retrieved" into "this source directly supports,
partially supports, merely mentions, contradicts, or is irrelevant to this claim." The current
source-support ratings are the seed. The next step is a claim-level relation engine.

**Why it matters.** This is how PharmaOrb becomes more than a chatbot: it can say not just what it
found, but whether the evidence agrees, conflicts, or fails to support the claim.

**MVP bar.** A light version is enough first: partition cited sources into `supports`, `uncertain`,
and `conflicts`, then show a transparent confidence/verdict. The full citation-graph version is a
larger product.

### 6. Deep Research as the Pro wedge

**What it is.** Productize the existing `research` engine into paid deliverables: literature overview,
structured review, evidence report, computed meta-analysis when possible, PDF, Word, PowerPoint,
source table, and forest plot.

**Why it matters.** This is the paid "researcher/professional" reason to subscribe. The chat answers
are the front door; deliverables are the business.

**MVP bar.** Deep Research should produce a saved report with method notes, citations, source table,
export buttons, and a visible "not an exhaustive formal systematic review" honesty note.

### 7. Model routing

**What it is.** Keep the provider-agnostic client, but route different jobs to the best model class:
cheap/fast model for classification and scoping, strong synthesis model for hard reports, and a
separate verifier/faithfulness model for claim checks. Statistics stay deterministic code.

**Why it matters.** Model choice alone will not make the product smart. A smart engine uses the right
model for each step, then verifies the output against sources.

**MVP bar.** Expose env-driven model slots: `LLM_CLASSIFY_MODEL`, `LLM_GENERATE_MODEL`,
`LLM_VERIFY_MODEL`, and `LLM_RESEARCH_MODEL`, with logs showing which model handled each step.

### 8. Evaluation and launch gates

**What it is.** Turn the current guardrail tests and diagnostic probes into a living launch gate:
typos, off-topic questions, popular product names, fabricated drugs, safety questions, citation
faithfulness, and deep-research report quality.

**Why it matters.** A medical evidence product cannot rely on vibes. Every upgrade needs a regression
pack that proves it got smarter without getting looser.

**MVP bar.** Before public beta, run a small but brutal eval set: `celsius`, misspelled drugs,
fake peptides, personal medication-change questions, overdose/sourcing, and "make a sandwich."

### 9. Platform packaging after the app proves demand

**What it is.** API, MCP, and CLI wrappers over the same evidence backend and usage ledger.

**Why it matters.** The app is the user-facing product; the platform is the moat and enterprise path.
But it should not distract from the MVP. Build the backend so API/MCP/CLI are natural extensions,
then launch them after the report/watchlist/evidence-trace system is durable.

**MVP bar.** Do not launch public API/MCP/CLI yet. Do keep data contracts, citations, usage counters,
and report payloads clean enough that they can become platform surfaces.

---

## A. Smarter front door — scope + easy-vs-clinical routing

**What it is.** A cheap classification step at the very start that sorts each question into one of
three lanes: **out-of-scope** (politely decline — "I'm a medical-evidence tool"), **easy/consumer**
(answer plainly from plain-language sources like MedlinePlus/CDC), or **clinical-primary** (the full
pipeline we have today). It extends the greeting-detector and intent-classifier that already exist.

**Why it matters.** Today a non-medical question like "how to make a sandwich" isn't caught — it
falls through to the medical pipeline, retrieves junk, and produces an awkward medical-flavored
answer instead of a graceful decline. Testers *will* try exactly this. This one change closes that
embarrassment **and** improves easy-question handling (your "should it answer easy questions like
Mayo Clinic" question) — same fix, two wins.

**Effort.** Small-to-Medium. The classifier already runs; we add the three lanes, a graceful
decline template, and routing the "easy" lane to the consumer-health sources we already ingest.

**Impact.** High for credibility and polish. Directly de-risks the beta.

**Risk.** Low (additive, switchable). The only tuning care: lean toward *answering* so we never
wrongly decline a real medical question.

---

## B. Beautiful prose — writing quality

**What it is.** Make the answers and reports *read* beautifully — structure, flow, rhythm, tone — to
match the polish of ChatGPT/Gemini deep research, building on the prose-formatting and Fast/Thorough
voice work already done. Concretely: sharper synthesis instructions, better headings and section
craft, and a light "editor" pass that improves readability.

**Why it matters.** This is the single biggest *perceived-quality* gap versus the big players.
Correct-but-clunky loses to polished every time, and this touches **every answer**, so it's the
highest-leverage perception upgrade we can make. It's what makes the beta and demos feel premium.

**Effort.** Medium, including evaluation.

**Risk — and how it stays safe (important).** This is the only item with real correctness risk. An
AI "readability rewrite" is not cosmetic formatting — it writes new sentences, and a new sentence can
quietly shift a hedge ("may reduce" → "reduces"), flip a negation, or change a dose. So the rule is:
**the text we ship must be the text we verified.** The safe design — and the preferred one — is to
build the writing quality into the synthesis step itself (better instructions and templates in the
one model call that already gets fact-checked), so there is no separate rewrite and the existing
verification gate already covers exactly what the user sees. If we ever add a *separate* editor pass,
it must run **before** the safety scan and the claim-by-claim fact-check, with both gates re-run on
its output — never verify a draft and then rewrite it. Done this way, the writing gets better and the
"every claim is checked before you see it" promise stays literally true.

---

## C. Elicit-style extraction tables

**What it is.** Pull structured fields out of the retrieved papers — population, number of patients,
study design, dose, outcome, effect size — into a clean **comparison table**, the way Elicit does.
This reuses the extraction code meta-analysis already uses (which copies numbers verbatim and records
the sentence it read them from, so it's grounded, not guessed).

**Why it matters.** A visible "wow" feature that positions us as a real research tool, not just a Q&A
box. It also answers your "can it output tables" question directly.

**Effort.** Medium — generalize the existing extraction, add the table view, wire it into exports.

**Impact.** High as a feature and a demo. Not required for beta.

**Risk.** Medium (extraction accuracy) — mitigated by grounding each cell against the source text,
exactly like meta-analysis already does.

---

## D. Guidelines source

**What it is.** Add a clinical-**guidelines** layer so "what do the guidelines recommend" is answered
from actual guidelines, not whatever happens to be indexed. A free-first version (filtering PubMed
for guideline publications + curated freely-available guideline pages, plus the CDC content we
already have) is the Medium path; full coverage of the best sources (e.g., NICE, UpToDate) involves
licensing and is the larger path.

**Why it matters.** Closes a real clinical gap — guideline questions are among the most common a
clinician asks, and we have no dedicated source for them today.

**Effort.** Medium-to-Large, depending on how far into licensed sources we go.

**Impact.** High clinically. Not blocking beta.

**Risk.** Medium — the best guideline sources are licensed; free coverage is patchy, so set
expectations that v1 is "free-first, partial."

---

## Fast-follows (smaller, later)

| Item | Note |
|------|------|
| Raise the source cap + tune retrieval relevance | The cap is a one-line dial; the real lever is relevance, not count. Ongoing. |
| "Maximum rigor" mode | Narrative + documented method + meta-analysis in one report. Small — the pieces are already optional fields on one report object. |
| Line graphs (dose-response / effect-over-time) | Moderate; do after extraction tables, only where studies report such data. |
| Scite-style "agree vs. contradict" signal | Larger. A light version ("do our retrieved sources agree?") reuses our verification machinery; the full citation-graph version is a real project. |
| Structured interaction checker + pharmacology (PK/PD) data | Larger and licensing-dependent; revisit if "clinical reference tool" becomes a goal. |

---

## Recommended sequence & the launch-timing decision

The beta is close to ready on its own (the open items are your toggles — password protection, the
waitlist call, and the branch→main merge — not engineering). So the real question is **how much of
this plan to do _before_ beta versus _after_.** Three honest options:

- **Ship now, polish after.** Launch the beta with the known rough edge (off-topic questions answer
  awkwardly), and run A→B→C→D as post-launch waves shaped by real feedback.
- **Recommended — one quick fix, then ship.** Spend ~2–4 days on just the **out-of-scope guard** (the
  credibility-critical slice of A), launch, then do beautiful prose (B), extraction tables (C), and
  guidelines (D) as the immediate post-launch wave. Removes the one genuine embarrassment without
  holding the launch hostage to 1–2 weeks of polish.
- **Polish first.** Do all of A + B (~1–2 weeks) before launching, for the strongest possible first
  impression. Best if the beta audience is investors/press rather than iterative users.

My recommendation is the middle path: the sandwich problem is the only thing here that actively
*hurts* on first contact, and beta feedback is exactly what should shape the prose and feature work
anyway. But this is your call — a speed-vs-first-impression trade, not a technical one.

After launch, the natural wave order is **B (prose) → C (tables) → D (guidelines)**, with the
fast-follows slotted in as usage shows what users reach for.

**Guiding principle:** we are not trying to out-breadth ChatGPT/Gemini. Every item above either
deepens the moat (verifiable, computed, safe) or polishes the experience — never trades integrity
for surface area.
