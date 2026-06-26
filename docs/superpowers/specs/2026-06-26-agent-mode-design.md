# Agent Mode — design spec

**Status:** Design approved (owner, 2026-06-26) · ready for implementation planning
**Supersedes/extends:** `docs/AGENT_MODE_RESEARCH.md` (the strategy memo). That memo concluded "the
monitoring agent is already live; reframe it and add smarter pieces." This spec is the concrete design
for that reframe **plus** the one genuinely new capability the owner asked for: a topic that an agent
**continuously re-researches and re-synthesizes**, not just passively watches.

---

## 1. Plain-English overview

Today the app has four separate surfaces: **Ask** (fast cited Q&A), **Deep research** (a one-time cited
report), **Reports** (where those reports are saved), and **Monitoring** (live "watches" that re-check a
topic on a schedule). Three of those — Deep research, Reports, Monitoring — are really the same thing seen
at different moments: *researching a topic*, *the report it produced*, and *keeping it current*.

**Agent Mode fuses them into one surface built around "missions."** A **mission** is a topic the agent
owns end-to-end: it researches it now, keeps a single **living report** that it re-synthesizes whenever
new strong evidence appears, and surfaces what changed. Above the missions sits an **analyst briefing**
that synthesizes across all of them ("2 of your 4 missions moved this week…"). This is the **hybrid model**
the owner chose: focused per-topic missions, plus a cross-topic briefing layer.

Ask stays separate as the fast lane. Agent replaces Monitoring in the nav and absorbs Deep research +
Reports.

The look is locked: the **command-deck** feel (a live status line, a mission table with activity
sparklines, a global activity stream, a "deploy a mission" composer) rendered entirely in the **existing
app design system** — the Ask shell, the Orb, Inter + JetBrains-Mono-as-data-layer, the real acid accent,
rounded cards and grade-pills, the real composer. It must read as the same app as Ask, in all three themes.

Mockups (visual companion, this session): `.superpowers/brainstorm/*/content/deck-native.html` is the
approved direction; `visual-style.html` shows the rejected alternatives; `agent-structure-v2.html` shows
the approved layout skeleton.

---

## 2. Goals / non-goals

**Goals**
- One **Agent** surface replacing Monitoring in the nav, absorbing Deep research + Reports.
- A **mission** object that unifies a watch + its living report.
- **Continuous re-synthesis**: a mission's living report updates when the watch loop detects new
  high-tier evidence, with a visible grade delta and an activity trail.
- An **analyst briefing** that synthesizes across a user's missions.
- **Natural-language missions** (a research question, not only an entity chip), kept clean with per-paper
  relevance scoring.
- The locked **command-deck-native** UI, themeable, matching Ask.

**Non-goals (explicitly out of scope for v1)**
- **The "this new study may bear on / contradicts your topic" signal** (memo item 4). This puts an LLM
  *judgment* into the alert path, which today is **deterministic by design** (a stable ID is new; a paper
  is flagged retracted — no AI in the alert decision). Re-synthesis in this spec is triggered by the
  **existing deterministic** "new high-tier study / retraction" signal, never by an AI contradiction call.
  The contradiction signal stays a separate, later, validated research project.
- No new clinical claims, no personal verdicts, no "X is safe." Agent inherits the **research-tool
  positioning** (engine v15) and the deterministic safety floor unchanged — see §6.
- No rebuild of the retrieval/research/safety engines. Agent **orchestrates** the engines that already
  ship; it does not replace them.
- No mobile build in this spec (web first; mobile parity is a later, separate effort).

---

## 3. The model

### 3.1 Mission
A mission is the core object. It is a thin unification of two things that already exist independently:
a **watch** (the monitoring loop) and a **living report** (a research report that gets updated in place).

A mission has:
- An **origin**: either a resolved **entity** (drug/condition chip — today's clean watch path) or a
  **natural-language question** (new — see §3.4).
- A **status**: `researching` (initial or re-synthesis running), `watching` (steady state, no new
  high-tier evidence), `new_finding` (new high-tier evidence landed since you last looked).
- A **living report**: the current synthesized answer (bottom line / what we know / safety notes, cited),
  with an **evidence grade** and a **grade history** (so "B → B+" is real, not decorative).
- A **stream**: the mission's own activity timeline (found, re-graded, re-synthesized, retraction-checked,
  news walled-off, baselined).

### 3.2 Briefing (the analyst layer)
Once per day (reusing the existing daily digest cron), synthesize a short cross-mission briefing for each
user: which missions moved, the direction of each move, which were quiet. v1 is **deterministic-first** —
it is assembled from the missions' own grade deltas and new-finding counts (data we already have), with an
optional one-paragraph LLM smoothing pass that is **descriptive only** (it summarizes the deltas; it makes
no new claims, so it carries no new safety burden). The briefing also drives the email digest.

### 3.3 Streams
- **Per-mission stream** = that mission's `watch_events` + research/synthesis events, merged and ordered.
- **Global activity** = the union across the user's missions (the home screen's live log).
Both are mostly a **reframing of existing `watch_events`** plus a few new event types for synthesis.

### 3.4 Natural-language missions + relevance scoring (new)
Today, raw typed text does **not** create a watch — it produced messy, unscoped watches, so it was
disabled in favor of entity/chip picks (`monitor/page.tsx`). Agent re-opens free-text **safely** by
adding per-paper **semantic relevance scoring**: a question-mission embeds the question, and each candidate
new paper is scored for relevance before it can surface or trigger re-synthesis. Low-relevance papers are
muted. This reuses embeddings we already have and is the memo's highest-value upgrade. Entity missions keep
today's exact clean path; question missions are the new, scored path.

---

## 4. Architecture — reuse vs new (the honest split)

| Capability | Status | Notes |
|---|---|---|
| Watch loop (scheduled re-check, dated source-diff vs known-set, deterministic new-IDs) | **Reuse** | `watch` fn + `watch_scheduler` cron — powers a mission's monitoring |
| Deterministic alerts (new high-tier study / retraction + retraction recheck) | **Reuse** | the trigger for re-synthesis; stays AI-free |
| Evidence/news wall (Alerts / What's-new / walled "In the news") | **Reuse** | becomes stream event types |
| Current-evidence-on-demand (cited grade + bottom line) | **Reuse** | becomes a mission's first living report |
| Research engine (scope → gather → synthesize → faithfulness/abstention) | **Reuse** | runs initial + re-synthesis |
| Report persistence + render | **Reuse** | `evidence_reports` (0123) holds the living report |
| Plan tiers / entitlements (free 1 / plus 10 / pro 50 watches; digest cadence) | **Reuse** | become **mission** limits |
| Email digest | **Reuse** | now carries the briefing |
| Ask shell, Orb, tokens, composer, grade-pills, themes | **Reuse** | the native UI |
| **Unified Agent surface + nav/IA change** | **New (assembly)** | one nav item; absorbs Research/Reports/Monitoring |
| **Mission object** (links a watch ↔ its living report; status; grade history) | **New** | the core abstraction |
| **Continuous re-synthesis** (high-tier trigger → re-run research → update report + grade delta + event) | **New (orchestration)** | wires two live engines together; the owner's headline feature |
| **Analyst briefing** (cross-mission synthesis) | **New** | deterministic-first + descriptive LLM smoothing |
| **NL-question missions + relevance scoring** | **New** | re-opens free-text safely |
| **Command-deck-native frontend** (home + mission detail) | **New** | the locked design |

**Reading of the split:** the owner's "an agent that continuously researches, monitors, and re-synthesizes
multiple topics" is **mostly orchestration of engines that are already live** (the watch loop + the research
engine), unified by one new object (the mission) and one new surface. The two genuinely new *synthesis*
pieces are the briefing and the re-synthesis trigger; both reuse the frozen safety path.

---

## 5. Data model (sketch — finalized in the implementation plan)

- **`missions`** (new table): `id`, `user_id`, `origin_kind` (`entity` | `question`), `entity_ref` /
  `question_text`, `question_embedding` (for relevance scoring), `watch_id` (FK → existing watch row),
  `report_id` (FK → `evidence_reports`), `status`, `created_at`. RLS: `auth.uid()`-scoped, mirroring the
  watch tables (and per the standing rule, REVOKE from `anon` on any SECURITY DEFINER RPC).
- **`mission_grade_history`** (new, small): `mission_id`, `grade`, `delta_reason`, `at` — makes "B → B+"
  a real, queryable fact.
- **Reuse** `live_monitoring_watches` for the monitoring mechanics (a mission *has a* watch), and
  `evidence_reports` for the living report (a mission *has a* report). A mission is the join + status +
  grade-history on top, not a re-implementation.
- **New `watch_events` types**: `resynthesized`, `regraded`, `mission_deployed`, plus the existing
  `new_high_tier_study` / `retraction` / news events.

> Open question for the plan: whether `missions` is a real new table or a view/extension over
> `live_monitoring_watches` + `evidence_reports`. Leaning new-table for clarity and grade-history; the
> plan decides after reading the watch schema in full.

---

## 6. Safety & positioning (inherited, unchanged)

- The **alert/trigger path stays deterministic** — no AI judgment decides what is "new" or what triggers a
  re-synthesis (preserves the existing invariant; the contradiction signal is out of scope, §2).
- Every (re-)synthesis runs the **frozen research safety path**: faithfulness gate + abstention (empty
  after pruning ⇒ no claim), the deterministic `detectViolations` floor, no personal verdicts.
- Agent inherits **engine v15 research-tool positioning**: faithful evidence, no invented reassurance, no
  clinician-steer boilerplate; liability cover stays the signup consent gate + standing disclaimer.
- The **48-check guardrail must stay green** — Agent adds surfaces around the engine, not new answer
  behavior, so a passing guardrail is a release gate for any phase that touches synthesis.

---

## 7. Error handling & cost

- **Re-synthesis fails safe**: on any failure the mission keeps its **last good** living report; record a
  `resynthesis_failed` event and retry on the next cycle. Never display a half-written or unverified report
  (reuse the abstention gate).
- **Cost containment**: re-synthesis fires **only** on the deterministic high-tier trigger — never on every
  quiet paper — and is bounded by the plan's mission limit and check cadence. Question-missions gate
  surfacing on the relevance score, so a noisy query can't fan out into constant re-synthesis.
- **Relevance floor**: a question-mission with all-low-relevance candidates surfaces nothing (no noise),
  matching why raw free-text was disabled in the first place.

---

## 8. Phasing (each phase = its own implementation plan; all owner-gated, prod untouched until flipped)

1. **Phase 1 — Surface + mission read-model (no engine change).** New Agent nav/page; render existing
   watches as missions (entity origin only); mission detail shows the existing current-evidence as the
   living report; global + per-mission streams from existing `watch_events`; the deploy composer creates
   today's entity watch. **Pure assembly + UI** in the locked design. Lowest risk; ships the look and the
   consolidation. *Recommended first plan.*
2. **Phase 2 — Continuous re-synthesis.** Wire the deterministic high-tier trigger → research re-run →
   update living report + grade delta + `resynthesized` event. The headline capability. Guardrail-gated.
3. **Phase 3 — Analyst briefing.** Cross-mission deterministic briefing + descriptive smoothing; fold into
   the daily digest/email.
4. **Phase 4 — NL-question missions + relevance scoring.** Re-open free-text safely.
5. **Phase 5 — Polish.** Evidence-quality snapshot (Consensus-meter minus the verdict), optional Semantic
   Scholar nightly enrichment (memo items 2–3).

The contradiction/"may bear on your topic" signal (memo item 4) is **deferred** beyond this spec.

---

## 9. Testing

- **Unit**: mission status transitions; grade-delta computation; relevance scoring threshold; briefing
  assembly determinism (same deltas ⇒ same briefing); event-merge ordering.
- **Integration**: deploy mission → initial report persisted + baselined; simulate a new high-tier event →
  re-synthesis runs → report + grade-history + event updated; re-synthesis failure → last-good kept.
- **Safety**: the **48-check guardrail stays green**; faithfulness/abstention still hold on re-synthesis.
- **E2E (Playwright)**: deploy a mission, see the living report, simulate a finding, see the grade move and
  the stream entry; verify the surface themes correctly (light/grey/dark) and matches the Ask shell.
- 80% coverage on new units, per the repo testing rule.

---

## 10. Open decisions (resolved in the implementation plan)

- `missions` as a new table vs a view over existing tables (§5).
- Whether Phase 1's nav change hides Monitoring/Research/Reports immediately or keeps them reachable behind
  the Agent surface during rollout.
- Briefing copy + how aggressively the LLM smoothing pass is allowed to rewrite (default: minimal,
  descriptive only).
- Naming: "Agent" vs "Research Agent" / "Evidence Agent" (the memo's branding caveat — owner's call; does
  not affect engineering).
