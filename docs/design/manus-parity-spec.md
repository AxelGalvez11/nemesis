# Manus parity spec — the build plan (2026-07-06)

The plan the capture docs point to. Companions: `manus-ui-capture-log.md` (anatomy of ~30 Manus
surfaces), `manus-design-tokens.md` (pixel-exact tokens from the live app), and
`manus-vs-pharmaorb-comparison.md` (per-page parity scorecard). Owner goal, in the owner's words:
**"Manus UI with the GitHub underneath"** — the full Manus look-and-feel, powered by the existing
PharmaOrb evidence engine — **plus** un-rigid the engine so general questions ("who is Matt Turner",
"what is a good bench PR") get a normal assistant answer instead of a forced literature search.

Additional reference discovered 2026-07-06: **`Simpleyyt/ai-manus`** (GitHub) — an open-source
Manus clone whose frontend reproduces Manus's real design tokens, layout geometry, and UI strings
(sidebar 300px, composer `rounded-[22px]`, "Task Progress" widget docked above the composer,
tool-use pill chips, the right computer panel at 50% width with "Jump to live"). Vue, so we
transcribe patterns, not code. We recreate Manus's layout/UX with our own assets and PharmaOrb
branding — no Manus logos, wordmarks, or copied asset files.

---

## Part A — Engine flexibility: the general-question path

### Root cause (verified 2026-07-06)
- The classifier's intent list is 16 pharma/health categories only
  (`supabase/functions/ask/prompts.ts:16-21`; union in `packages/shared/src/answer.ts:9-26`).
  There is no off-domain intent; `CLASSIFY_SYSTEM` (prompts.ts:33-45) shoves every non-medical
  question toward `general_health`.
- Every classified question is then forced through corpus retrieval (`index.ts:263`) and hits one
  of three refusal walls: empty-retrieval refuse (`index.ts:325-329`), fabrication guard
  (`index.ts:354`, `fabrication.ts:63`), or cite-or-refuse citation enforcement (`index.ts:423`).
  The model's own knowledge is structurally unusable — `generate` is told retrieved chunks are the
  ONLY grounding (`generate.ts:1-2`).
- Generation is DeepSeek (`model-router.ts:3-21`, default `deepseek-chat` via
  `llm.ts:12` `api.deepseek.com`). So "regular DeepSeek would have answered this" is literally
  true — our pipeline forbids it from doing so.
- Web search does not exist as an answer source. `live-sources.ts` = biomedical APIs only;
  `web-recon.ts` = term-disambiguation only, explicitly non-citable; Google News lane = walled
  headlines (`index.ts:240-247`).

### The fix (smallest clean change, mirrors the existing smalltalk bypass)
1. **New intent `general_knowledge`** in `packages/shared/src/answer.ts`, `prompts.ts` INTENTS +
   a CLASSIFY_SYSTEM rule: use it for person lookups, fitness/sports, general facts — anything
   with no medication/supplement/trial substance. Add classifier tests beside `classify.test.ts`.
2. **Bypass branch in `runAsk`** right after the drug-sourcing gate (`index.ts:256`, before
   entity-resolve at 258): `intent === "general_knowledge"` → `finalizeGeneral(...)`, modeled on
   `finalizeSmallTalk` (`index.ts:623`). Direct DeepSeek answer with a general-assistant system
   prompt; skips retrieval, fabrication guard, and citation enforcement entirely (branching before
   `retrieve` at 263 avoids all three walls at once).
3. **Web search for the general path.** Reuse the `WEB_RECON` lane's plumbing (`web-recon.ts:51`)
   or wire a proper search provider behind `WEB_SEARCH_API_URL`; results render as ordinary web
   links visually distinct from clinical citations (different chip style — "web source", not
   "evidence"). Clinical answers stay cite-or-refuse; that moat is untouched.
4. **Soften the dead-end refusal.** When a pharma-ish question retrieves nothing
   (`index.ts:325-329`), fall through to the general path with a labeled preamble ("No indexed
   literature matched; here's general knowledge + web context") instead of the flat `no_source`
   template. Flag-gated (`GENERAL_FALLBACK=on`) so it can be turned off.
5. **Safety unchanged.** Deterministic pre-screens (emergency/sourcing, `index.ts:191-206`) still
   run before everything; genuinely medical questions still classify into the 16 intents and get
   the full evidence pipeline.
6. **Conversation context (verify + likely add):** the ask function receives a single question
   today; Manus/ChatGPT feel needs follow-ups to carry prior turns. Pass the last N turns from
   `conversation_messages` into classify + generate. Scope this after 1–5 land.

Acceptance: "who is Matt Turner", "what is a good bench PR", "best laptop under $1000" get direct
answers (with web links when the search lane is on); "lisinopril contraindications" still returns
the cited evidence answer; emergency phrasing still hits the emergency template; deno tests cover
the new intent + bypass + fallback.

---

## Part B — Manus UI parity (phased by leverage, per the comparison scorecard)

Pixel source of truth: `manus-design-tokens.md` §1b (light+dark semantic tokens), §3 (radius/
spacing), §4/4b (component + run-view specs). Structural source: `manus-ui-capture-log.md`.
Interaction reference: ai-manus clone. Current state (verified): tokens already partially adopted
(`globals.css` accent `#0081f2`, 3 themes light/grey/dark); polling architecture (no SSE) —
`research_report_runs.progress` polled at 1500ms by `ResearchRunCard` (`ask/page.tsx:1124-1150`).

### Phase 1 — The agent-run view (~30% parity today; worth more than all other phases combined)
The surface that makes Manus feel like an agent. We have the skeleton (AgentRunDock, WorkPanel,
RunThinking, ResearchProgress) but not the substance:

1. **Task-progress tracker, exact Manus form** (`manus-design-tokens.md` §4b): restyle
   `AgentRunDock` to the top-rounded `22px 22px 0 0` panel *docked onto the composer*; per-step
   rows with green ✓ / clock icons from the run's real `progress` steps (not the fixed 4-phase
   trail); N/N counter; live timer; collapse chevron. Unify the two step vocabularies
   (Planning/Searching/Drafting/Checking vs Understand/Search/Answer/Verify) into one.
2. **Real progress for plain asks.** Fast/thorough asks fake progress with hardcoded timers
   (`ask/page.tsx:431-437`). Have the `ask` edge function write coarse progress rows (classify →
   retrieve → generate → verify) to a pollable store (same pattern as `research_report_runs
   .progress`), so every run shows genuine steps.
3. **Tool-use pill chips in the thread** (Manus signature): inline chips "Searching PubMed
   `retatrutide`", "Reading DailyMed label", "Verifying claim 3/8" — rounded-full, hairline
   border, mono argument; click → opens the right panel at that snapshot.
4. **"Evidence engine" panel** (our reframe of Manus's Computer, right-docked ~50% width /
   min 368px): header "Evidence engine" + status line ("PharmaOrb is searching PubMed…"),
   body streams sources as they're found, footer replay scrubber + "Jump to live" pill.
   Upgrade `WorkPanel` from trail+counter to this. Replay = walk the stored progress array.
5. **Per-run "Evidence work" popover** (reframe of Manus Usage): sources searched / reviewed /
   cited · claims verified · retractions checked · time — from the run trace we already store.
6. **Per-run Files panel**: "All files in this task" with tabs All/Documents/Links — report
   exports (DOCX/PPTX/PDF), poster, cited source links.
7. **Thread framing**: orb avatar + "PharmaOrb" + tier badge + timestamp on agent messages;
   right-aligned bubble-less user messages; "✓ Task completed" bar in success green + rating
   stars; follow-up suggestion chips.

### Phase 2 — Shell, task-centric (sidebar ~70%)
Rename "Recent chats" → **Tasks** with the Manus filter (None/Favourite/Shared — favourite =
existing `pinned`); search icon in the sidebar top block; Projects as inline expandable rows
with ＋; keep account footer. Optional skips: cast icon, notification bell.

### Phase 3 — In-task top bar (~50%)
Model-tier pill "PharmaOrb Lite ▾" mapping the existing depth dial (fast/thorough/auto →
Lite/Standard/Max framing with one-line descriptors, `manus-ui-capture-log.md` §1); Share button
(run share links); per-task Usage (Evidence work) icon; per-task Files icon; "…" menu.

### Phase 4 — Home landing (~75%)
Serif greeting is in; add "type / for more" composer hint + slash menu opening the skills list
(`lib/playbooks.ts`); suggestion cards with refresh/dismiss; keep the calmer single chip row.

### Phase 5 — Settings depth (~45%)
Add **Personalization** (nickname/occupation/about + custom instructions threaded into generate)
and **Skills** + **Data sources** as managed settings tabs (toggleable cards over our existing
skills + evidence providers). Skip (no product equivalent yet): Mail-to-task, My Computer,
Cloud browser, Integrations.

### Phase 6 — Library / Scheduled polish (~80–85%)
Library: ★ favorites filter, grid/list toggle, always-on search. Scheduled: Calendar tab only if
volume justifies (reconfirm).

Cross-phase: adopt the §1b token table 1:1 for light+dark (grey theme maps to Manus dark-adjacent
values); verify every phase with `npm run build` + screenshots against the capture log.

---

## Part C — The X post (@synscience status 2073829478393086311)

Unretrievable from this environment (x.com + all mirrors blocked by egress policy; not indexed by
search). Owner to paste screenshot/text; fold whatever it shows into the relevant phase above.

---

## Sequencing recommendation

1. **Part A (engine)** first — it's the daily-use pain, it's small (one intent + one bypass +
   flag-gated fallback), and every demo of the new UI reads better when the engine stops refusing
   normal questions.
2. **Phase 1 (run view)** second — highest-leverage UI work; makes the product feel like Manus.
3. Phases 2→3→4 next (shell, top bar, home), then 5–6.

Delivery: each part/phase = one PR-sized branch off `main`; conventional commits; deno tests for
engine changes, `npm run build` for web. `main` auto-deploys to production — merges are
owner-gated.
