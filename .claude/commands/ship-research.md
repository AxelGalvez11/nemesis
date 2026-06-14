---
description: Autonomously finish the paper-quality research program (Phases 2–4) with quality gates, committing each green increment; STOP at gated prod steps.
---

You are executing the **paper-quality research program** to completion with quality code. Work
continuously, one green increment at a time, until the stop condition. Do not pause for "should I
continue?" — the only reasons to stop are listed under STOP below.

## Source of truth
- Plan (phases, tasks, acceptance): `docs/superpowers/plans/2026-06-11-paper-quality-research-program.md`
- Goal + constraints (memory): `pharmaorb-paper-quality-research-program`, `pharmaorb-research-in-ask-restructure`, `pharmaorb-strategy-honesty-first`
- Branch: `feat/research-in-ask-reports-surface` (PR #52). Never commit on `main`.

## Each iteration
1. **Pick the next incomplete piece** from git history + the plan's unchecked boxes. Order:
   Phase 2 wiring (scope endpoint action + in-chat clarifying UI) → Phase 3 (paper structure + study
   table) → Phase 4 (real statistics).
2. **Build it with quality:**
   - TDD where there is real logic: write the failing test first, watch it fail, implement, pass.
   - Small focused files, immutable updates, explicit error handling, no dead code, no `console.log`.
   - Reuse existing components/helpers; match surrounding style.
3. **Gate must be GREEN before you commit** (run all that apply to the change):
   - `deno test packages/shared/`
   - `deno test --allow-env supabase/functions/ask/`
   - `pnpm --filter @pharmaorb/web typecheck`
   - `pnpm --filter @pharmaorb/web build`
   - `pnpm --filter @pharmaorb/web smoke:export`
4. **Self-review the diff** (or dispatch a reviewer subagent); fix issues. Then **commit** with a
   conventional message and tick the plan checkbox.

## Hard constraints — never violate
- **Frozen safety:** exactly ONE `detectViolations` call over the assembled client-facing prose; ONE
  citation namespace (mergeEvidence round-robin → 1..N retag). The frozen /ask safety suite must stay
  green unchanged.
- **No invented statistics (Phase 4):** pooled estimates are computed in **real code** in
  `packages/shared` and **unit-tested against known textbook values**. The LLM may only extract
  source-stated numbers; it never computes the pooled result. When studies are not poolable (<2
  comparable, different outcomes/designs), output an honest "not poolable — narrative synthesis only."
  The word "meta-analysis" appears ONLY when a real pooled estimate was computed.
- **No overclaiming:** never call output a "systematic review" / "PRISMA-compliant"; keep the
  forbidden-phrase guard.
- **No DB migration** unless the plan explicitly calls for one — and then surface it for an explicit
  owner ask, don't run it.
- Owner-facing summaries in **plain English** (per repo CLAUDE.md).

## STOP / hand back to the owner
- **Before ANY production action** — `supabase functions deploy`, `supabase secrets set`, a prod
  migration, or merging PR #52. That is Phase 5 and is **owner-gated**; the auto-guard blocks it and it
  needs a fresh explicit OK. Summarize what's ready and ask.
- On genuine ambiguity the plan doesn't resolve, or a gate that stays red after a couple of honest fix
  attempts.
- When **Phases 2–4 are code-complete and the full gate is green**: post a plain-English summary,
  confirm everything is committed, and hand back for the gated validate + deploy.
- If you hit the account session/rate limit: stop and report — durable progress is in the commits.

Keep going until one of the STOP conditions. Quality over speed: a green, reviewed, committed
increment every time — never a half-finished or untested one.
