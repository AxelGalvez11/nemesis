# PharmaOrb autonomous delivery loop

**Purpose:** finish the remaining PharmaOrb backlog as a self-checking loop — green
increments only, committed to the working branch, with genuinely irreversible steps
gated on the owner. This file is the single source of truth each iteration reads.

**Branch:** `feat/research-in-ask-reports-surface` (NEVER commit on `main`).

---

## STEP 0 — Orient (every iteration, before any code)
1. Read the execution ledger:
   `/Users/axelgalvez/.claude/projects/-Users-axelgalvez-Desktop-AIcodingProjects-PharmaBro/memory/pharmaorb-execution-ledger.md`
2. Read the plan:
   `docs/superpowers/plans/2026-06-11-retrieval-provenance-monitoring-agentic.md`
3. `git log --oneline -8 && git status --short && git branch --show-current`
   — confirm the branch; if `git status` shows unfamiliar changes you did not make,
   STOP and surface them (do not commit a tree you don't understand).

## STEP 1 — Pick ONE backlog item
**Selection rule (revised 2026-06-13 after the Crossref analysis):** pick the highest
**value × offline-verifiability × non-safety-adjacency**. "Offline-verifiable" means BOTH
the correctness AND the *value* can be confirmed without a live engine query — unit tests
proving mechanics "merged" is NOT proof the user-facing result got better. Anything that
edits the frozen `/ask` safety path (one detectViolations scan / one citation namespace)
is NOT unattended material — hold it for an owner-attended increment.

**Known-low-value / skip (do not re-derive each wake):**
- **WS-B Crossref — SKIP.** OpenAlex (already a live source) is built on Crossref metadata,
  so Crossref is ~redundant; it also needs cross-provider DOI dedupe the current
  `(provider, provider_id)` key doesn't do, and its abstracts are sparse. Low value, real risk.
- **WS-B bioRxiv — DO NOT add without first checking** whether `europepmc` (already a source)
  already returns preprints for a preprint query. If it does, bioRxiv repeats the Crossref
  redundancy mistake.
- **WS-B Unpaywall — defer.** It's DOI→free-PDF *enrichment*, not a `fetch(query)` search
  source (wrong shape for `LIVE_SOURCES`).
- **WS-F agentic surfacing — GATED, not unattended.** Sits on the frozen safety/citation
  path AND its payoff (better multi-drug/comparison answers) needs live queries to confirm.
  Do it in an owner-attended session. (Exception: if the PR0 eval harness runs fully offline,
  its *value* becomes offline-checkable — re-evaluate then.)

**Preferred unattended picks (clean, offline, zero safety surface):**
1. **#4 settings/profile/billing as a modal overlay** — real owner ask; pure UI; verify via
   the static-mock screenshot method.
2. **#9 thinking snippets in chat** — staged progress (Planning → Gathering → Writing); UI.
3. Other self-contained UI/polish owner-feedback items.

**Defer to a gate (high value but gated/live):** #7 science-state awareness (generate-prompt
+ maturity signal — engine, needs live verify) and #5 benign-health-answer fix (needs a live
query to see why the engine discards the answer; never guess-commit a safety-path change).

> **Honest note for the owner:** the high-value backlog (WS-F, #5, #7) clusters in the
> gated/live bucket; the safe-offline items are mostly lower-value polish. The loop can prove
> itself + clear polish unattended, but the substantive evidence-engine work wants an
> attended session. Surface this rather than manufacturing offline busywork.

## STEP 2 — Loop discipline for the chosen item
- **RED:** write the failing test first (TDD).
- **Implement** the minimum to pass.
- **Self-review** the diff against the guardrails below.
- **GREEN GATE** (must fully pass before committing):
  ```
  deno test --allow-env supabase/functions/ask/
  deno test packages/shared/
  # when a core-source-sync provider parser changed, ALSO:
  deno test supabase/functions/core-source-sync/
  pnpm --filter @pharmaorb/web typecheck && pnpm --filter @pharmaorb/web build && pnpm --filter @pharmaorb/web smoke:export
  ```
- **Independent check:** call `advisor` (or a code-reviewer subagent when not rate-limited).
  Fix what it surfaces.
- **UI changes:** verify via the static-mock screenshot method (can't log into the live
  app) — copy the real `globals.css` + `shell.css` to `/tmp`, serve a markup mock over
  `python3 -m http.server`, screenshot dark + light at >1100px width.
- **Commit** a green increment by EXPLICIT path (NEVER `git add .`). Conventional subject
  + plain-English body.
- **Update the ledger:** status + commit hash + what's next.

## Guardrails (every item)
- **Never-LLM-guess:** numbers, supporting highlights, and study labels are REAL verbatim
  substrings or filed provider metadata, found deterministically — never an LLM guess.
  Omit rather than fabricate.
- **ONE** `detectViolations` safety scan over final client-facing prose; **ONE** citation
  namespace (1..N). Never touch the frozen `/ask` safety layer.
- Explain status to the owner in **PLAIN ENGLISH** (project CLAUDE.md overrides the
  caveman hook). Code, commits, and comments stay normal/technical.

## STOP + ask the owner (do NOT do autonomously)
- prod deploy, DB migration, new secret/API key, PR merge, push to `main`.
- any item needing a LIVE engine query to diagnose (#5; verifying #7).
- when a meaningful batch of branch-only work has accumulated → STOP and OFFER the gated
  deploy (which `ask`/`research`/web redeploy), with a plain-English summary.

## Pacing
- After a clean green increment, backlog remaining, no gate hit → `ScheduleWakeup` (~60s)
  to continue the next item.
- Gate hit, backlog empty, or the green gate fails twice on the same item → STOP, report
  in plain English, do NOT schedule.

## Rate limits
If subagents fail (usage limit), fall back to `advisor` + self-review + the green gate as
the independent check.
