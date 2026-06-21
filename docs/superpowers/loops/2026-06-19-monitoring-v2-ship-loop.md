# Monitoring v2 — Autonomous Ship Loop (loop-engineering runbook)

A self-sustaining delivery loop to ship the **Universal Entities + Catalysts** spec
(`docs/superpowers/specs/2026-06-19-monitoring-universal-entities-catalysts-design.md`) without stopping
for hand-holding — while keeping the quality gates that make "unattended" safe.

Built on Addy Osmani's loop engineering (maker/checker separation, a `/goal` done-condition the loop runs
until true, a memory file outside the chat, "stay the engineer") + this repo's real guardrails.

> **Run instruction (feed this at the top of every iteration):**
> "Read this runbook + the spec + the LEDGER below. Do the next unchecked task in the current slice through
> the full quality loop. Commit the green increment, tick the LEDGER, and continue to the next task without
> stopping — UNTIL you hit a HARD STOP or the slice's done-condition is true."

Branch: `feat/monitoring-universal-entities` (NOT the live deploy branch). Commit small green increments.

---

## GOAL (the done-condition the loop runs until true)

Ship in this order; a slice is done only when **all** its checks are green.

- **Slice A — Drug picker (no gated deploy).**
  `EntityPicker` drug typeahead over the existing `search_entities` RPC, wired into the Monitor box +
  `WatchButton`. Selecting resolves brand→generic and sets `query_terms` + `mentions`. Typecheck + build +
  tests green; reviewer sub-agent clean; UI verified via static-mock + Chrome DevTools.
- **Slice A2 — Universal picker (no gated deploy).**
  `GET /api/entities/suggest` merges `search_entities` (drugs) + NCBI MeSH + `espell`; classifies by MeSH
  tree (device/condition/procedure); picker shows type chips; free-text fallback intact. Diag probe
  `scripts/diag/entity-suggest-probe.ts` PASS; gates green; reviewer clean.
- **Slice B — Catalysts lane (OWNER-GATED migration + edge-fn deploy).**
  `catalyst-sources.ts` + `watch-catalyst-detect.ts` + cycle/persistence wiring; `WatchDetail` 3rd lane +
  `include_catalysts` toggle; `partitionWatchEvents` extended. Diag probe `scripts/diag/watch-catalyst-probe.ts`
  PASS for FDA drug + FDA device + CT.gov readouts. Migration + deploy **staged, owner-greenlit**.
- **Fast-follow (separate loop):** SEC company filings for ticker-mappable entities.

## THE LOOP (per task — maker side)

1. **Orient.** Read the spec section + LEDGER. Pick the next unchecked task.
2. **RED.** Write the failing test first. Pure modules → `deno test`. Web *pure logic* (`lib/*`, classify/merge/rank) → `node:assert` + `npx tsx <file>.test.ts` (the `lib/cite.test.ts` convention — **apps/web has NO component runner**). React wiring (EntityPicker, lanes) is gated by the verify-without-auth screenshots, not a component test.
3. **GREEN.** Minimal implementation to pass. Match surrounding style; small focused files.
4. **REFACTOR.** Clean up; keep it green.
5. **GATE.** Run the full quality gate (below). A red gate **halts the loop** — fix forward, never weaken the test.
6. **CHECK.** Maker/checker separation: launch a reviewer sub-agent on the diff (below).
7. **COMMIT.** Green increment on `feat/monitoring-universal-entities`, conventional message, my files only.
8. **TICK.** Update the LEDGER (done / next). Plain-English one-liner of what shipped.
9. **CONTINUE.** Next task — no stopping — until a HARD STOP or the slice done-condition.

## QUALITY GATES (the checker side — all mandatory before a commit counts)

- `pnpm --filter @pharmaorb/web typecheck` — clean.
- `pnpm --filter @pharmaorb/web build` — succeeds (for any web change).
- `deno test` — green for every touched pure module (`supabase/functions/watch/*`, `packages/shared/*`).
- Web pure logic → `npx tsx <file>.test.ts` (`node:assert`, per `lib/cite.test.ts`). apps/web has no
  component runner; React wiring is gated by verify-without-auth, not unit tests.
- Lint — clean; no `console.log`, no hardcoded secrets.
- **Reviewer sub-agent** (`typescript-reviewer` for TS, `code-reviewer` for logic, `security-reviewer` when
  touching input handling / API routes / DB): run on the diff; **no CRITICAL/HIGH left unaddressed.** This is
  the "second agent grades the homework" gate — different instructions catch what the maker rationalized.
- **New live source → read-only diag probe PASS** before it's wired (the established `watch-dated-probe`
  pattern; prove the exact query shape against the real API).
- **Visual change → verify-without-auth** (copy real globals.css/shell.css to /tmp, static markup mock,
  Chrome DevTools screenshot) before the task is "done." Never ship UI unseen.
- **Advisor checkpoints:** call `advisor` (a) before committing to a slice's approach, and (b) before
  declaring a slice done. Give the advice real weight.

## HARD STOPS (pause, stage, ask the owner — never work around the classifier)

The loop runs autonomously in the green zone but **stops and waits** for:
- A **prod schema migration** (`apply_migration`) — Slice B's `evidence_watches`/channel-widen change.
- An **edge-function deploy** (the `watch-check` redeploy).
- A **prod-secret read/decode** or any prod credential handling.
- A **production deploy** (`vercel deploy --prod`).
- **Anything the auto-mode classifier denies** — treat the denial as the boundary; surface it, don't route around it.

At a hard stop: write the artifact (migration SQL file, probe results, the exact command), summarize in
plain English what it does + why + the rollback, and **wait for an explicit owner "go."**

## AUTONOMY ZONE (do these without asking)

Create/modify files; write + run tests; typecheck/build/lint; run **read-only** diag probes; commit green
increments on the feature branch; update the LEDGER; launch reviewer/Explore sub-agents; open a PR when a
slice is green (optional). Self-correct on failure — fix the implementation, not the test.

## ANTI-PATTERNS TO RESIST (Addy) + the countermeasure here

- **Cognitive Surrender** ("stop having an opinion and take whatever it gives") → the reviewer sub-agent +
  advisor keep an independent check; I read every diff before committing.
- **Comprehension Debt** (gap between what shipped and what I understand) → each slice ends with a
  plain-English owner summary of what changed and why.
- **Intent Debt** (re-deriving context each cycle) → the spec + this LEDGER are the compounding memory; read
  them at the top of every iteration.
- **"Verification is still on you."** → gates are not optional; a red gate halts the loop. A loop running
  unattended is a loop making mistakes unattended.

---

## LEDGER (living state — the loop updates this every iteration)

**Current slice:** owner 4-item plan (2026-06-20: "do all 4") · **Status:** Slice A (picker `pharma-bro-80k95i1ps` + current-evidence `pharma-bro-amczljatq`) LIVE. **Slice A2 (universal MeSH picker) BUILT + REVIEWED + HARDENED, NOT deployed** (commits 5a9d747→8013254): drugs+MeSH conditions/devices/procedures, `/api/entities/suggest` proxy (espell→esearch sort=relevance→efetch, proven by `scripts/diag/entity-suggest-probe.ts` 5/5), 2 reviewers (no critical), NCBI-budget/timeout/shape-guard fixes applied. Owner 4-item plan: (1) BETA HARDENING ✅ security audit CLEAN ([[pharmaorb-beta-security-audit]]) — owner to flip leaked-password protection; (2) SHIP A2 — BLOCKED on owner adding `NCBI_API_KEY` to Vercel env, then deploy go; (3) UI POLISH — part-1 done (`06dd964` fast tooltips + skeletons), part-2 (caching, more optimistic) pending; (4) MOBILE (apps/mobile Expo, ~28 screens, reuses shared) — last. · **Last green commit:** `06dd964` UI polish tooltips+skeletons · **Branch is GREEN** (typecheck + all unit tests + build).

### Slice A — Drug picker
- [x] A1. `watchFieldsFromEntity(r)` pure fn (`lib/entity.ts`) — picked entity → {title, topic, query_terms, mentions}; drug-like types scope `mentions`, class/company leave it empty. `lib/entity.test.ts` GREEN (`npx tsx`), typecheck clean.
- [x] A2. `EntityPicker.tsx` typeahead — debounced + stale-response guard, keyboard nav (Arrow/Enter/Escape), combobox/listbox a11y, colored type chip. Typecheck + build green.
- [x] A3. Wired into the Monitor box (`monitor/page.tsx`): pick → `addEntity` (scoped watch via `watchFieldsFromEntity`); free-text → `addTopic` (unchanged). `.entity-menu` CSS mirrors `.row-menu`.
- [~] A4. N/A — `WatchButton.tsx` (drug page / Ask / reports) already passes the entity + `mentions`; no picker needed there. The picker is the Monitor-box fix.
- [x] A5. Verify ✓ (3 themes; `.playwright-mcp/entity-picker-light.png`). Reviewer ✓ — returned BLOCK (1 HIGH + 3 MED), ALL fixed in `4d0af74`: try/finally stuck-state guard (addEntity + addTopic), preserve arrow-selection on same-list re-fetch, blur-timer unmount cleanup, `aria-activedescendant`. typecheck + build green.
- [x] A6. **RUNTIME-VERIFIED** in preview mode (`next dev`, no Supabase env → `previewSession` injected by AuthProvider, `/app/monitor` renders; `searchEntities` returns 2 mocks for any query — same-list re-fetch faithfully reproduced). Driven via Chrome DevTools, asserting the live ARIA state machine (`aria-activedescendant`, `.active`), not screenshots:
  - type → 2 suggestions; ArrowDown → option 0 highlighted (`aria-activedescendant=entity-option-0`).
  - **The re-fetch fix:** append a char ("sema"→"semag", identical list re-fetched) → highlight PRESERVED (still `entity-option-0`). This is the exact reviewer-flagged bug (unconditional `setActive(-1)` on debounce resolve); proven fixed at runtime — typecheck/build can't catch it.
  - Enter w/ highlight → PICK path (menu closes; `createWatch`→`not_enabled` error; `addEntity` scoped fired). Enter w/o highlight → free-text path (`onSubmitText`→`addTopic`; error appears newly). Mouse `mousedown` on a row → PICK (menu closes, no blur-race). try/finally fix: button never stuck on "Starting…". Real-component shot: `.playwright-mcp/entity-picker-live-light.png`.
  - Active-row highlight = `var(--surface-2)` EXACTLY mirrors shipped `.row-menu button:hover` (shell.css:123) — house convention, not a bug; faintness on the `--raised` menu matches the chat-options popup. Left unchanged for consistency.
- [x] A7. Advisor slice-done checkpoint ✓ — flagged the brand-scoping/deploy-ask contradiction; resolved by fixing A2-0 in-slice (above). Slice A is DONE: typecheck + build + unit test green, reviewer Approve, all interaction paths + the mentions payload runtime-verified.
- [x] **A8. PICKER DEPLOYED TO PROD (2026-06-19, owner "yes both").** `pharma-bro-80k95i1ps` (dpl_3fTowuHcHEKmANtuMBUSKTrjYNkw). Verified in shipped bundle: `entity-menu`/`entity-picker-list`/"Search a drug to monitor". Scheduler prereq (B0) already green, so created watches are live, not inert. Deployed SOLO per advisor; current-evidence got its own go (A9).
- [x] **A9. CURRENT-EVIDENCE VIEW DEPLOYED TO PROD (2026-06-19, owner explicit go after a separate ask).** `pharma-bro-amczljatq` (dpl_CiXXuKZ1Vv11Uv1oQrwadUC65eDt, @ commit `253d9d7`). Opening a watch now leads with a status line (tracks X · checked daily · last checked Nh ago · monitoring) + a calm "See the current evidence →" card → Ask **pre-filled** with the topic via a NEW `?q=` param (fills box, NEVER auto-submits, stripped from URL after; coexists with `?c=`). New pure helpers `lib/watch-format.ts` (`relativeTime`+`askHrefForWatch`, unit-tested); preview `demoWatch` so the detail page renders backend-free. Verified live in preview (Chrome DevTools: fill/no-submit/URL-strip, end-to-end watch→Ask click, `?c=` coexistence, no console errors) + in shipped bundle (CSS `.watch-current`, JS "See the current evidence"/"Monitoring flags only what changes"). **ROLLBACK one step = `pharma-bro-80k95i1ps`** (picker only). Advisor settled the auth question: "yes both" named the picker DEPLOY but only the current-evidence FEATURE → its deploy needed a separate explicit go (got it). Details in [[pharmaorb-ui-overhaul-deployed]].

### Slice A2 — Universal picker
- [x] **A2-0. RESOLVED in Slice A (commit `c7dae67`).** Brand-scoping was incomplete on pick: `search_entities` returns one brand alias (RPC `LIMIT 1`), so a picked drug scoped openFDA to generic + one brand and missed siblings (Wegovy/Rybelsus). Fixed in A, not deferred — advisor flagged the contradiction (the deploy ask recommends syncing the Vault key FIRST, which makes watches active, so "inert, defer it" was false). `addEntity` now `fetchDrug(id)` → folds full `brand_names[]` into `mentions` (deduped/trimmed, `Array.isArray` guard, subtitle fallback); `isDrugLikeEntity` gates the fetch. Runtime pick emitted `["Semaglutide","Ozempic","Wegovy","Rybelsus"]`. Unit-tested + reviewer Approve.
- [~] A2-1. RESEARCH DONE (live NCBI probe, 2026-06-19) — the prefix-typeahead source question is RESOLVED; still TODO: codify as the committed `scripts/diag/entity-suggest-probe.ts` (repeatable PASS) before wiring. Verified pipeline:
  - **Typo:** `espell.fcgi?db=pubmed&term=<q>` → `<CorrectedQuery>` (e.g. "diabetis melitus"→"diabetes mellitus"). Use the correction when it differs.
  - **Prefix typeahead:** `esearch.fcgi?db=mesh&term=<q>*[mh]` — the `[mh]` field-restrict is the fix for the spec's "loose" worry: bare `insulin*` = 808 all-fields hits; `insulin*[mh]` = 4 real descriptors (Insulin, Insulinase, Insulinoma…). `autocomp.fcgi?dict=mesh` is DEAD (`_dictionary_error`) — don't use it.
  - **Name + synonyms + tree in ONE call:** `efetch.fcgi?db=mesh&id=<uids>&retmode=text` → parse `1: <name>`, `Entry Terms:` (synonyms), `Tree Number(s):`. (esummary json gives names but its `ds_meshhierarchy` came back EMPTY — efetch text is the reliable tree source.)
  - **Classify by tree prefix:** `C*`→condition/disease, `F03`→mental disorder, `D*`→drug/chemical, `E07`→equipment/device, `E01–E06`→procedure. (e.g. Diabetes Mellitus → `C18…,C19.246`; Insulins → `D06…,D12…`.)
  - **Cost per keystroke:** espell + esearch + efetch = 3 sequential NCBI calls → MUST be server-side (route handler) with the NCBI key + cache + debounce (already the spec's plan). efetch carries name+tree+synonyms together, so it's esearch→efetch (2 calls + espell), not 4.
- [ ] A2-2. `app/api/entities/suggest/route.ts` — merge drugs + MeSH/espell; classify; rank; cache/debounce.
- [ ] A2-3. `suggestEntities` → call the route; `EntityPicker` shows type chips; free-text fallback.
- [ ] A2-4. Tests (route + classification pure fn); gates; reviewer; advisor; owner summary.

### Slice B — Catalysts lane (HARD STOPS inside)
- [x] **B0. PREREQUISITE DONE (2026-06-20): scheduler 401→200 CONFIRMED, watch baselined.** Root cause was a STALE FUNCTION ENV (the deployed `watch` fn held an out-of-date `SUPABASE_SERVICE_ROLE_KEY`), NOT a wrong Vault key — owner's current legacy key was correct all along. FIX = redeployed `watch` (`--use-api --no-verify-jwt`); re-injected env → 200, `last_checked_at`/`baselined_at` set, 3 known sources, daily cadence. Same deploy shipped `auth-keys.ts` (accepts new `sb_secret_…` keys too; commit 725d711). So Slice B IS now end-to-end verifiable through the live scheduler. (watch-digest still legacy-only auth — apply the same fix when email/Resend activates.) Details in [[pharmaorb-ui-overhaul-deployed]].
- [ ] B1. Migration FILE (channel→+catalyst on `watch_events`/`watch_known_sources`; `evidence_watches` +`entity_type`/`entity_ref`/`include_catalysts`; keep news-never-alerts). **STAGE — owner-gated.**
- [ ] B2. `scripts/diag/watch-catalyst-probe.ts` — prove openFDA drug `drugsfda`+`enforcement`, device `510k`/`pma`/`enforcement`, CT.gov status/results shapes (read-only).
- [ ] B3. `packages/shared/src/watch-catalyst-detect.ts` — pure delta + alert classification; tests.
- [ ] B4. `supabase/functions/watch/catalyst-sources.ts` — dated catalyst fetch (env-free, fault-tolerant, time-bounded); tests.
- [ ] B5. Wire `watch-cycle.ts` + `plan-persistence.ts` + `index.ts` (3rd channel, gated on `include_catalysts`/`entity_type`); tests.
- [ ] B6. `partitionWatchEvents` + `WatchDetail.tsx` 3rd lane + toggle; verify-without-auth.
- [ ] B7. Reviewer + advisor; **STAGE migration + edge-fn deploy — owner-gated**; owner summary.
