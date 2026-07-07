# PharmaOrb — App polish + live evidence + cinematic landing

**Date:** 2026-06-09
**Owner decisions captured:** live evidence ON (all questions) · landing = "Cinematic orb" · demo = record the real app
**Source:** 9-investigator parallel root-cause sweep (workflow `wf_0ed11a38-c8a`), all findings high-confidence.

Sequenced **functional-first** (make the app you're using work), then landing/demo. Each phase notes whether it
needs a **production "OK"** from the owner at deploy time (cloud secret or edge-function deploy), per the standing
rule that prod cloud changes require fresh authorization.

---

## Phase 1 — App fixes (frontend only, one PR, NO production change)

Pure web-app changes. Ships via normal PR → reviewers → CI gate → squash-merge.

### 1a. Citation links open + scroll the evidence sidebar  *(bug, medium)*
- **Why:** the inline source tags look clickable (pointer cursor, green hover) but are inert `<span>`s — no click
  handler, and the sidebar cards have no scroll target.
- **Do:**
  - `AppShell.tsx` — add a dedicated `openEvidence()` to the chrome context (un-collapse on desktop; slide the
    drawer in at ≤1100px). Must be *open*, not *toggle* (toggle would close an already-open panel).
  - `EvidencePanel.tsx` — give each source card a stable `id` (`ev-src-<normTag>`) + accept an `activeTag` prop to
    highlight the matching card.
  - `ask/page.tsx` — make each citation a real button: on click, `openEvidence()` + set `activeTag` + (deferred via
    rAF/effect, because the drawer animates in) `scrollIntoView` the matching card.
  - `shell.css` — `.src.active` highlight; ensure the chip-as-button still renders inline.
- **Files:** `apps/web/app/app/ask/page.tsx`, `apps/web/components/AppShell.tsx`,
  `apps/web/components/EvidencePanel.tsx`, `apps/web/app/styles/shell.css`

### 1b. Readability: type hierarchy + real bold/emphasis  *(enhancement, small)*
- **Why:** section headers are *smaller and greyer* than the body; the model's `**bold**` shows as literal asterisks
  (no markdown renderer anywhere in the app).
- **Do:**
  - CSS: section headers bigger/darker/sentence-case (`13px`, `weight 700`, `var(--text)`); a lead-paragraph style
    for the bottom-line summary (`16px`, `weight 500`); line-height `1.6`.
  - New `apps/web/lib/inline-md.tsx` (~30 lines, no dependency): converts `**bold**`, `*em*`/`_em_`, `` `code` ``
    into React elements (no `dangerouslySetInnerHTML`, no XSS surface — model output → React nodes). Use it on the
    summary, each answer point, and clinician questions.
  - `.ai-body strong/code` styles.
- **Files:** `apps/web/app/app/ask/page.tsx`, `apps/web/app/styles/shell.css`, `apps/web/lib/inline-md.tsx` (new)

### 1c. "Projects" link no longer routes to Settings  *(bug, small)*
- **Why:** `AppShell.tsx:200` "New project" `<Link href="/app/settings">` is a stray wrong href; no `/app/projects`
  route exists (swapping the href would 404).
- **Do:** make "New project" a quiet "coming soon" placeholder matching its inert siblings (the real Projects
  feature is deferred — see "Later").
- **Files:** `apps/web/components/AppShell.tsx`

### 1d. (Fold-in) Honesty cleanup — watchlist preview
- Stop the preview/demo from fabricating update types (`label_update`/`trial_status`) the real pipeline can't emit
  yet, so the UI doesn't advertise capabilities that don't exist (matters for a medical product).

**Phase 1 verification:** typescript-reviewer + advisor + Playwright/CI gate green, then squash-merge.

---

## Phase 2 — Live evidence ON: the retatrutide / "no PubMed" fix  *(needs production OK)*

- **Why:** real-time source search (PubMed, Europe PMC, trials) is **switched off** (`LIVE_SOURCES` unset in prod),
  so `/ask` only searches the pre-built library — which is thin on PubMed for new/investigational drugs. PubMed was
  never *dropped*; it was never *fetched*.
- **Code (PR, no prod write):**
  - `core-source-sync/providers/pubmed.ts` — relax the over-strict `AND free full text[sb]` filter (abstracts are
    enough to ground a citation), and review the 4s live timeout so PubMed's two-step fetch fits. *This is the part
    that makes live PubMed actually return results for newer drugs — necessary in addition to the flag.*
  - Optional transparency: when an answer is trial-only because PubMed genuinely returned nothing, surface a short
    note instead of a silent gap.
- **Safety gate (must pass BEFORE enabling):** run `eval/live-pipeline-safety.ts` with a valid LLM key; both parts
  must be green (Part B confirms the classifier extracts the literal drug token the fabrication guard relies on).
- **Production step (owner OK at the moment):** set `LIVE_SOURCES=on` in the ask function's cloud secrets + deploy
  the `ask` edge function.
- **Verify before declaring fixed:** ask "what is retatrutide" against the live function and confirm PubMed
  citations actually appear. Do not report "fixed" until this passes.
- **Heads-up:** adds ~1–2s and a small per-question cost to every `/ask`.
- **Files:** `supabase/functions/ask/{index.ts,live-sources.ts}`,
  `supabase/functions/core-source-sync/providers/pubmed.ts`, `eval/live-pipeline-safety.ts`

---

## Phase 3 — Chat history: save each Q&A and reopen it  *(needs production OK for the backend write)*

- **Why:** the `conversations` + `conversation_messages` tables **already exist and are deployed** with security
  rules, but nothing reads or writes them; the Ask page is single-turn ephemeral state; the rail shows placeholder
  text. (Every answer is *already* stored in an audit table, so we're not starting from zero.)
- **v1 scope (recommended):** save each question+answer and let you reopen it from the rail. Multi-turn follow-ups
  and the Projects grouping are **later** (Projects has no table yet).
- **Do:**
  - Backend (`ask/index.ts`): thread `conversation_id` through; on each ask, create the conversation if absent and
    write the user + assistant turns into the existing tables; return `conversation_id`. Writes are non-fatal (a
    save failure never fails the answer). *Edge-function deploy = production OK.*
  - Shared (`packages/shared/src/answer.ts`): add `conversation_id` to the response; start using `AskRequest`.
  - API (`apps/web/lib/api.ts`): `listConversations()`, `getConversation(id)`, pass `conversation_id` in
    `askQuestion()`.
  - UI: AskPage captures/sends `conversation_id`; AppShell rail shows a real "Recent chats" list; reopen via
    `/app/ask?c=<id>`.
- **Files:** `supabase/functions/ask/index.ts`, `apps/web/lib/api.ts`, `apps/web/app/app/ask/page.tsx`,
  `apps/web/components/AppShell.tsx`, `packages/shared/src/answer.ts`

---

## Phase 4 — Answer format adapts to the question  *(needs production OK for the edge-fn deploy)*

- **Why:** there has only ever been **one** answer shape ("what we know / safety / what we don't know / questions
  for your clinician"), forced on every question by the model's output schema.
- **Do (Option A — lowest risk):** relax the `required` sections in `GENERATE_TOOL` so they can be empty, and
  strengthen per-intent guidance so a definition gives a short summary + "what we know", while safety/comparison
  questions keep the fuller structure. **The frozen safety guardrails are not touched.**
- **Care:** verify the eval/guardrail harness tolerates empty sections (the safety scanner reads a declarative-text
  feed duplicated in 3 spots — keep them consistent); relax the golden validator if it requires all four sections.
- **Files:** `supabase/functions/ask/{prompts.ts,generate.ts}`, `packages/shared/src/answer.ts`,
  `apps/web/app/app/ask/page.tsx`, `apps/mobile/src/components/AnswerView.tsx`, eval/guardrail scripts

---

## Phase 5 — Landing redesign: "Cinematic orb"  *(frontend only, NO production change)*

- **Direction (owner pick):** the 3D orb becomes a full-bleed, edge-to-edge centerpiece that shifts color across the
  evidence ramp (red→green) as you scroll, with minimal copy floating over it, keynote-style. Restrained chrome,
  mostly black + one green. Keeps the shared brand (acid `#BCFF3C`, Hanken + JetBrains).
- **Do:** extend the existing three.js `HeroCanvas` + add a scroll-progress hook; float hero copy over the orb;
  pare back section chrome toward full-bleed scenes. **Perf tuning + reduced-motion fallback are required** (the orb
  is heavy on low-end phones; readable text over moving background).
- **I'll mock it up before committing.**
- **Files:** `landing/components/{Hero.tsx,HeroCanvas.tsx,Sections.tsx}`, `landing/app/{page.tsx,globals.css}`,
  `landing/lib/useLandingEffects.ts`

---

## Phase 6 — Demo video: "See it in action"  *(frontend only, NO production change)*

- **Why it's possible without a login:** the app has a built-in **preview mode** (when the Supabase env vars are
  absent) that injects a fake session AND returns a complete canned answer — so the *real* app UI (orb, the
  four-stage "thinking" animation, the cited answer, the evidence panel) renders end-to-end with no server.
- **Do:** run `apps/web` in preview mode, record the real Ask flow (Playwright is already in the repo, or screen
  capture), post-process with ffmpeg to **MP4 (H.264 720p) + WebM (VP9) + a WebP poster**, commit to
  `landing/public/demo/`, embed a lazy `<video autoplay muted loop playsinline poster>` in a new "See it in action"
  section after the hero.
- **Honesty (medical product):** the recording shows real UI with *example* data — caption it
  **"illustrative example."** (Optionally enrich the canned preview answers so the clip shows more breadth.)
- **Not Remotion:** the UI already exists as React, so rebuilding it as video would be duplicate work and *less*
  faithful than recording the real screen. (Reserve Remotion for a future narrated trailer.)
- **Files:** `landing/app/page.tsx`, `landing/components/{Sections.tsx,InteractiveDemo.tsx}`,
  `landing/app/globals.css`, `landing/public/demo/*` (new), optionally `apps/web/lib/api.ts` (richer preview data)

---

## Recommended order
1. **Phase 1** (immediate visible wins, safe, one PR)
2. **Phase 2** (live evidence — the answer-quality lever you cared about; needs your prod OK)
3. **Phase 3** (chat history)
4. **Phase 4** (adaptive format)
5. **Phase 5 + 6** (cinematic landing + demo video)

## Later / optional (not in this plan unless you want it)
- **Make watchlist monitoring genuinely live** — schedule the two update jobs (pg_cron or GitHub Actions), build the
  "content changed → emit a signal" pipeline so label/trial-status alerts become real, make per-signal alert
  preferences functional, add instant/daily digests, and email delivery (Resend). This is real work; today
  monitoring is manual.
- **Projects feature** — a real `/app/projects` page + table grouping chats/sources/deliverables.
- **Multi-turn conversations** — follow-up questions in the same thread.

## Production-OK checkpoints (I will ask at the moment, not assume)
- Phase 2: set `LIVE_SOURCES=on` secret + deploy `ask` function (after the safety gate is green).
- Phase 3: deploy `ask` function (now writing conversation rows).
- Phase 4: deploy `ask` function (relaxed output schema).
