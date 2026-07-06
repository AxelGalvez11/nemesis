# Research-Action Layer — Design Spec

> Status: SPEC (2026-07-04). Turns PharmaOrb the evidence engine into a research AGENT THAT ACTS, scoped to research/study workflows. NOT clinical ("Dr GPT") and NOT a general computer-operator. Owner-aligned framing; nothing here is built or deployed. Companion to docs/design/manus-parity-spec.md.

## Owner decisions still open
1. Hosted OAuth apps vs BYO-key: do we register and operate central OAuth apps (Google/Canvas/Notion) so users click-to-connect, or start BYO-key (user pastes their own API keys) to defer app-verification overhead? Recommended: BYO-key for Zotero in P2, hosted OAuth from P3 on.
2. First real connector: Zotero (API-key, no OAuth callback — cheapest, validates the abstraction) vs Google Drive (OAuth + PDF extraction — higher value but drags in the entire net-new OAuth spine). Recommended: Zotero first.
3. Action storage: a separate `research_actions` table (clean status lifecycle, recommended) vs extending `research_report_runs` with an action_type discriminator (fewer tables, but overloads the run row). Recommended: separate table.
4. Produce-action content model (also a safety fork): keep flashcards/study-plan/journal-club as strictly DETERMINISTIC transforms of an already-scanned report (safe by construction, recommended), or allow new LLM generation for richer phrasing — which forces an explicit `detectViolations` call on that new content before it can preview or push. Recommended: deterministic-only until there's a clear need.
5. Push audit depth: is the `research_actions` row + `usage_events` sufficient audit for write-actions, or does compliance want a dedicated append-only `action_audit` log with the exact external payload and response? Recommended: reuse existing tables unless a compliance requirement forces the dedicated log.

---

# PharmaOrb Research-Action Layer — Phased Implementation Spec

**Scope:** Turn the evidence engine into a research *agent that acts*, bounded to the research/study workflow: INGEST → RESEARCH → PRODUCE → SCHEDULE/MONITOR → ACT. Peer set: Elicit, Consensus, scite, NotebookLM, Manus-for-research. **Not** a clinical "Dr GPT," **not** a general computer-operator.

**Prime directive:** reuse the async-job spine, the export pipeline, the Missions scheduler, and the auth/entitlement/audit plumbing that already exist. Build only the missing *action surfaces*. Approval-gated by default: **draft, don't send; propose, don't submit; fill, don't finalize.**

---

## 1. Architecture — how an action is represented, proposed, approved, executed, audited

### 1.1 An action is a status-row, not a new agent runtime

The single most important design decision: **an "action" is a row in a new `research_actions` table modeled directly on `research_report_runs` and `research_missions`.** There is no planner, no tool-calling framework, no generic action registry. It is the async-job spine we already ship, plus a status column.

```
research_actions (new table — mirrors research_report_runs shape)
  id              uuid pk
  user_id         uuid  → auth.users        (RLS: auth.uid() = user_id)
  action_type     text  (produce_deck | produce_flashcards | produce_study_plan |
                         produce_journal_club | produce_systematic_review |
                         push_drive | push_calendar | push_notion | read_import)
  status          text  (proposed | approved | running | completed | failed | rejected)
  source_report_id uuid → saved_reports (nullable — produce/push actions cite a report)
  connector       text  (nullable — 'zotero' | 'gdrive' | 'gcal' | 'notion' | 'canvas')
  input           jsonb (the proposed parameters: title, date, folder, deck options…)
  preview         jsonb (nullable — the drafted artifact the user reviews before approving)
  result          jsonb (nullable — the REAL external ref the connector returned: url/id)
  error           text  (nullable — generic user-facing message on failure)
  counter_key     text  (nullable — which usage counter this consumes)
  created_at / approved_at / completed_at  timestamptz
```

RLS is the uniform `auth.uid() = user_id` pattern used by every user-owned table today (`conversations`, `saved_reports`, `research_report_runs`, `research_missions`, `evidence_watches`). Service-role bypass for the executor's writes, exactly as `research/index.ts` does.

### 1.2 The lifecycle — propose, approve, execute, audit

**PROPOSE.** The assistant (or the user via UI) creates a row with `status='proposed'` and populates `input` + a `preview` (the drafted deck outline, the flashcard set, the calendar block, the Notion page body). *Nothing external happens.* For produce-actions the preview is the deterministically-transformed artifact; for push-actions the preview is exactly what would be written. This is the "draft/fill" stage — and because most external destinations (Calendar, Notion, Drive) have **no native draft state**, the draft lives entirely inside PharmaOrb as the `proposed` row.

**APPROVE.** Approval is **an authenticated PATCH flipping `proposed → approved`**, written from the client with the user's bearer token. We do **not** build an approval system — RLS already guarantees only the row's owner can approve it (`auth.uid() = user_id` on UPDATE with `WITH CHECK`). A user can also `reject` (→ `rejected`, terminal). This reuses the exact `setMissionStatus`/`setWatchStatus` client pattern (`apps/web/lib/api.ts` lines 1082–1092, 1030–1035).

**EXECUTE.** A new edge function `action-run` mirrors `supabase/functions/research/index.ts` verbatim:
`verify user → consume_usage(counter) → confirm row is 'approved' & owned → patch status='running' → run the side-effect in EdgeRuntime.waitUntil → patch status='completed' with the real external ref in result (or 'failed' with a generic message)`.
Produce-actions run the export/formatter code in-process; push-actions call the connector's API with the user's stored OAuth token. The client polls the row for status, identical to `fetchRunForReport` / research-run polling (`api.ts` line 1095).

**AUDIT.** The audit trail is satisfied by **existing infrastructure, no new logging system**:
- the `research_actions` row itself is the durable record (who, what, when, source report, external ref);
- `usage_events` (immutable audit log, migration `0122_entitlements_usage_stripe.sql`) records every `consume_usage` call;
- `entitlement_checks` (decision log, same migration) records the gate decision.

### 1.3 The honesty rule, mechanically enforced

"No fake action theater" is enforced by tying the UI's truth to the row's terminal state:
- The UI shows **"Done"** only on `status='completed'` **with a real `result` ref** the connector returned.
- A failed connector call → `status='failed'`, generic error, **never** a fabricated success.
- A `proposed` row is shown as "Draft — needs your approval," never as done.

This is the same posture as `research/index.ts` executeRun: log real detail server-side, store a generic message on the row, never present an unverified result as verified.

### 1.4 Reused auth + entitlement + quota spine

Every action rides the plumbing already verified in the maps:
- `verifyUser(token)` / `verifyBearer(req)` — reject anonymous, re-validate every call (`ask/index.ts`, `apps/web/lib/server.ts`).
- `consume_usage(p_user_id, p_counter_key, p_cost, p_metadata)` — the SECURITY DEFINER, service-role-only quota gate with the early zero-limit guard (`0127_fix_consume_usage_zero_limit.sql`). New counters slot in with **no code change** to the RPC.
- `plan_entitlements` per-plan ladder — add new keys mirroring the `mission_limit` precedent (§4).

---

## 2. Action taxonomy — READ / PRODUCE / PUSH, with reuse-vs-build

### READ-connectors (ingest sources)

| Connector | Read scope | Reuse | Build |
|---|---|---|---|
| **Existing evidence sources** (PubMed, ClinicalTrials, FDA, OpenAlex, EuropePMC, FAERS, MedlinePlus…) | already live | **100% reuse** — `ask/live-sources.ts` (9 concurrent live sources), `core-source-sync` 28 providers, `NormalizedSource` + `liveToChunk` adapter | none |
| **Zotero** | read-only (user library, collections, attachments) | connector abstraction + `NormalizedSource` mapping + read-through-ingest (`upsertCoreSource`) | Zotero API-**key** client (paste-a-key, no OAuth callback), encrypted credential store, normalize items → `NormalizedSource` |
| **Google Drive** | read-only (`drive.readonly` or `drive.file`) | same `NormalizedSource` pipeline + PDF/text chunking (`chunking.ts`, `embeddings.ts`) | full OAuth spine (§P-OAuth), file picker, PDF extraction (net-new — no PDF parser exists today) |
| **Canvas / LMS** | read-only (courses, modules, files) | same normalization | Canvas developer-key OAuth, course/file fetch |

**Read-vs-write boundary for READ-connectors:** every READ scope is requested **read-only** (`*.readonly` / API-key-read). A read-connector *never* holds write scope. This is the first line of the consent model (§3).

### PRODUCE-actions (deliverables) — the "mostly built" bucket

All produce-actions are **deterministic transforms of an already-safety-scanned `ResearchReport`** (the report passed `detectViolations` inside `orchestrate.ts` before it was saved). This is why they reuse cleanly and are safe.

| Produce-action | Reuse | Build |
|---|---|---|
| **Cited report (PDF/DOCX/PPTX)** | **~100% reuse** — `reportToPdf/Docx/Pptx`, export routes, `buildReferenceList`, `evidenceRows`, `formatReference` | wire as an action_type; already shippable today |
| **Slide deck** | reuse `reportToPptx` (`apps/web/lib/export/pptx.ts`) + `ResearchReport.sections` | deck-options input (per-section slides, forest plot toggle) |
| **Flashcards** | reuse `ResearchReport.sections[].points` (each cited AnswerPoint = one card front/back) as a **deterministic** transform | new `flashcards.ts` formatter (CSV/Anki-txt/JSON); no new LLM generation |
| **Study plan** | reuse `sub_questions` + `sections` + Missions cadence math (`nextRunAt`) to sequence topics over days | new `study-plan.ts` formatter |
| **Journal club packet** | reuse report + `citation-format` + evidence table | new template arrangement (discussion questions drawn from `uncertainties`/`gaps` deterministically) |
| **Systematic review** | reuse `structured_review` ReportMode (`search_method`, `counts`, `gaps` already in the contract) + export | surface as a produce-action preset over the existing mode |

**Reuse-vs-build verdict:** produce-actions are near-zero build. The report contract (`packages/shared/src/research.ts`) already carries everything a deck/flashcard/study-plan needs. Flashcards, study-plan, and journal-club are new **deterministic formatters** sitting beside `pdf.ts`/`docx.ts`/`pptx.ts` — no new medical-content generation.

### PUSH-actions (write out) — all approval-gated, built last

| Push-action | Write scope | Reuse | Build |
|---|---|---|---|
| **Save deliverable to Google Drive** | `drive.file` (app-created files only) | export buffer from produce-action + OAuth token store + `action-run` executor | Drive upload call |
| **Add study/review blocks to Google Calendar** | `calendar.events` (create only) | study-plan produce output as event source + Missions cadence for recurring blocks | Calendar insert call |
| **Push notes to Notion** | Notion integration token (per-user), page-append scope | report/journal-club preview as page body | Notion append call |

**Read-vs-write boundary for PUSH:** write scopes are the **narrowest that work** — `drive.file` (never `drive` full), Calendar **create-only**, Notion **append-to-a-chosen-page**. A push-action always references a `source_report_id` and writes only a study artifact — **never** a patient-care instruction, prescription, order, or message to a third party.

---

## 3. Consent + safety model

### 3.1 Per-connector OAuth scopes (read-only wherever possible)

- **Credential vault (net-new):** a `user_integrations` table (per-user, RLS owner-scoped) storing encrypted connector tokens. This does not exist today — the connectors map confirms *no OAuth, no callback infra, no credential vault*. It is its own owner-gated phase.
- **Scope minimalism:** READ-connectors request read-only scopes only. PUSH-connectors request the narrowest write scope that accomplishes the action (`drive.file`, calendar-create, Notion page-append). Scopes are surfaced to the user at connect time.
- **Per-action approval:** even with a connected account, **no push fires without a per-action `proposed → approved` PATCH.** Connecting an account grants capability, never consent to a specific write.

### 3.2 Audit trail

The `research_actions` row + `usage_events` + `entitlement_checks` constitute the audit trail: every action's proposer, approver (owner via RLS), timestamps, source report, external ref, and quota decision are durable and query-scoped to the owner.

### 3.3 The hard line — clinical actions out of scope; frozen safety layer never bypassed

This is stated as a **content-path invariant, not merely a "don't edit these files" rule:**

1. **Frozen files untouched.** `supabase/functions/ask/**` — `preScreen`, `classify`, `detectViolations`, `consume_usage` — are never edited. (Trivial part of the invariant.)

2. **Every new generated-content path passes the frozen scan.** Produce-actions are safe *because* they are deterministic transforms of a `ResearchReport` that already passed `detectViolations` in `orchestrate.ts`. **Any action that generates *new* medical text** (should a future action ever do so) **must call the frozen `detectViolations` explicitly before that content is eligible to preview or push.** No new LLM-generation path may reach a user or an external destination without the scan.

3. **A safety-routed report is an ineligible source.** If `ResearchReport.template` is a safety route (`emergency_routing`, `safety_fallback`, `sourcing_refusal`, `no_source`), **produce/push must refuse it.** We never turn an emergency-routing stub into a "flashcard deck" or push it to Notion. This gate is mandated in the `action-run` executor even though the current export routes do not yet enforce it.

4. **No clinical-care actions, ever.** Every destination is a *study artifact* — a saved report, a study block, a notes page, a flashcard set. No action emits patient-care instructions, dosing, prescriptions, orders, or messages to clinicians/patients. The taxonomy contains no such action_type and none may be added.

5. **Honesty ties to lifecycle** (§1.3): a failed connector call is `failed`, never a fabricated success.

---

## 4. Reuse map — real files, tables, functions each capability builds on

**Action spine (represent/propose/execute/audit)**
- `supabase/functions/research/index.ts` — the async-job template `action-run` copies verbatim (verify → `consume_usage` → insert run → `EdgeRuntime.waitUntil` → patch row). Lines 44–116 (entry), 118–156 (executeRun), 273–290 (owner-scoped patchRun).
- `research_report_runs` (migration `0123_evidence_reports_entitlements.sql`, progress in `0126_research_run_progress.sql`) — the row-shape `research_actions` mirrors.
- `research_missions` + `apps/web/lib/api.ts` (CRUD lines 1039–1092) + `packages/shared/src/missions.ts` (`nextRunAt`, `missionEntitlement`) — the client CRUD + cadence pattern for actions and recurring calendar blocks.

**Approval = RLS PATCH**
- `20260607001303_conversations.sql` and every owner-scoped table — the `auth.uid() = user_id` USING/WITH CHECK policy `research_actions` reuses.
- `setMissionStatus` / `setWatchStatus` (`api.ts` 1082–1092, 1030–1035) — the exact status-flip client call for approve/reject.

**Auth + quota + audit**
- `supabase/functions/ask/index.ts` `verifyUser` / `apps/web/lib/server.ts` `verifyBearer`, `userClient(req)` — token verification + RLS-scoped Node reads (seen in `export/pdf/route.ts`).
- `consume_usage(p_user_id, p_counter_key, p_cost, p_metadata)` — `0127_fix_consume_usage_zero_limit.sql` (SECURITY DEFINER, service-role only, zero-limit early guard).
- `plan_entitlements`, `usage_counters`, `usage_events`, `entitlement_checks` — `0122_entitlements_usage_stripe.sql`. **New keys** (mirroring `mission_limit`): `produce_action_enabled`, `connector_enabled`, `push_action_daily_limit`; new counters `produce_action_daily`, `push_action_daily`.

**Produce-actions (deliverables)**
- `apps/web/lib/export/{pdf,docx,pptx}.ts`, export routes `app/api/reports/[id]/export/{pdf,docx,pptx}/route.ts` (`runtime="nodejs"`).
- `packages/shared/src/{citation-format,citation-meta}.ts` — `buildReferenceList`, `formatReference`, `evidenceRows` (byte-identical across mediums).
- `packages/shared/src/research.ts` — `ResearchReport` (with `sub_questions`, `sections[].points`, `uncertainties`, `gaps`, `search_method`, `counts`, `template`) — the contract flashcards/study-plan/journal-club/systematic-review transform.
- `supabase/functions/ask/research/orchestrate.ts` — the producer that already runs `detectViolations` on the report the produce-actions consume.

**Read-connectors**
- `ask/live-sources.ts` (`gatherLiveCandidates`, `liveToChunk`, synthetic `live:provider:id` dedup), `core-source-sync/providers/normalized-source.ts` (`NormalizedSource`), `chunking.ts`, `embeddings.ts`, `license.ts` — the ingest + normalization Zotero/Drive/Canvas map into. Read-through-ingest (`upsertCoreSource`) persists confirmed-relevant imports.

**Scheduling (recurring produce/push, e.g. weekly study blocks)**
- `20260618000100_watch_scheduler.sql` (pg_cron hourly tick, Vault-gated `run_due_*`, pg_net fan-out) + `missions.ts` `nextRunAt` — the pattern for a future `action-run-due` scheduler if recurring calendar blocks are wanted.

**Frozen safety (never bypassed)**
- `supabase/functions/ask/safety.ts` (`detectViolations`, `preScreen`) — the scan the invariant in §3.3 references.

---

## 5. Phased build order — each phase independently shippable

Ordered by leverage × reuse. Owner-gated items (migrations, edge-fn deploys, OAuth-app registrations) flagged per phase, consistent with the repo's owner-gated-deploy norm.

### Phase 1 — Produce-actions (the mostly-built phase). *Ships alone.*
Introduce `research_actions` (proposed/approved/running/completed) as a produce-only surface. Add flashcards / study-plan / journal-club deterministic formatters beside the existing exporters; systematic-review is the existing `structured_review` mode surfaced as a preset. Report/deck export is shippable **today** — it only needs the action_type wiring.
- **Reuse:** export pipeline, report contract, citation helpers, async-job spine.
- **Build:** `research_actions` table; 3 new formatters; `action-run` edge fn (produce branch); the §3.3 **safety-routed-report refusal gate**.
- **Owner-gated:** migration (`research_actions` + `plan_entitlements` keys `produce_action_enabled`, counter `produce_action_daily`); deploy `action-run`.

### Phase 2 — First read-connector: Zotero (API-key). *Ships alone.*
Validate the **connector abstraction** with the cheapest on-ramp. Zotero's API-key auth lets us skip the full OAuth-callback build: paste-a-key → encrypted store → read library → `NormalizedSource` → existing retrieval. Produce-actions can now cite the user's own library.
- **Reuse:** `NormalizedSource`, `liveToChunk`, chunking/embeddings, read-through-ingest.
- **Build:** minimal `user_integrations` (encrypted key store, RLS owner-scoped); Zotero read client; `read_import` action_type.
- **Owner-gated:** migration (`user_integrations`, `connector_enabled` key); Zotero API app registration; deploy connector fn.

### Phase 3 — OAuth spine + Google Drive read. *Ships alone.*
The net-new authentication phase the connectors map calls out (no OAuth/callback/vault today). Build the PKCE flow, callback handler, token refresh, and Drive read (`drive.readonly`/`drive.file`) + PDF extraction (also net-new). This is deliberately its own phase — **not** smuggled into P1/P2.
- **Reuse:** the P2 `user_integrations` vault (extended to OAuth tokens); ingest pipeline.
- **Build:** OAuth callback infra; Drive client; PDF parser.
- **Owner-gated:** Google Cloud OAuth-app registration + verification; migration (token columns/scopes); callback route deploy.

### Phase 4 — Canvas/LMS read. *Ships alone.*
Reuses the Phase-3 OAuth spine for a second provider; proves the abstraction generalizes.
- **Owner-gated:** Canvas developer-key registration; connector deploy.

### Phase 5 — Push-actions (approval-gated), built last. *Ships alone, per connector.*
Save-to-Drive (`drive.file`), Calendar study-blocks (create-only), Notion page-append. Each is a `proposed → approved → running → completed` action with a real external-ref result. Recurring blocks can reuse the Missions scheduler (`nextRunAt` + pg_cron pattern).
- **Reuse:** produce-action outputs as the push payload; Phase-3 OAuth tokens; `action-run` executor (push branch); scheduler pattern.
- **Build:** per-connector write clients (narrow scopes); push preview UI.
- **Owner-gated:** write-scope additions to the OAuth apps; Notion integration registration; migration (`push_action_daily_limit`, counter `push_action_daily`); deploy push branch of `action-run`.

**Independence check:** P1 ships with zero connectors. P2 adds one read-connector without touching P1. P3/P4 each add a connector on the shared OAuth spine. P5 adds push per-connector, each behind approval, without changing any read/produce path.
