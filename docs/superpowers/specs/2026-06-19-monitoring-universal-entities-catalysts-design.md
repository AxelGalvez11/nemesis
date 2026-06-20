# Live Monitoring v2 — Universal Entities + Catalysts Lane

- **Date:** 2026-06-19
- **Status:** Draft (design approved by owner; pending spec review → implementation plan)
- **Branch:** `feat/monitoring-universal-entities`
- **Builds on:** the live monitoring system (`evidence_watches`, the `watch-check` edge function, `dated-sources.ts` / `watch-cycle.ts` / `watch-detect.ts`, `WatchDetail.tsx`).

---

## 1. Summary (plain English)

Today a "watch" re-checks the live science on a schedule and shows two lanes: **Evidence** (peer-reviewed)
and **In the news** (walled-off press). This upgrade does two things:

1. **A universal picker.** The "Monitor a topic" box becomes a smart, typo-tolerant search that resolves
   what you type to the *real* medical thing — a **drug** (brand→generic), a **device**, a **condition**,
   or a **procedure** — instead of taking loose text. It knows *which kind* you picked, and that decides
   which real-world events it can track for you.

2. **A third lane: Catalysts.** Verified, factual *events* about that entity — FDA approvals/rejections,
   recalls/safety actions, and trial readouts — sitting between Evidence and News in the trust order. More
   authoritative than a headline, but not peer-reviewed science. News stays walled off and can never alert.

The product stays clinician/researcher-first. Stock tickers and SEC filings are an explicit later
fast-follow, not part of this spec.

## 2. Goals / Non-goals

**Goals**
- Kill the "vague / misspelled free-text" problem by resolving entities to a canonical identity.
- Make monitoring genuinely cover *anything PubMed indexes* (drugs, devices, conditions, procedures),
  not just the in-house drug catalog.
- Add a deterministic **Catalysts** event lane (FDA drug + FDA device + trial readouts) that can raise a
  loud alert for material events.
- Preserve every existing monitoring guarantee: deterministic detection (never LLM-guessed), the
  news wall, silent baselining, idempotent/resumable write order.

**Non-goals (this spec)**
- SEC filings, stock tickers, prices, financials, drug→ticker mapping. (Fast-follow.)
- Adverse-event signal detection (FAERS/MAUDE statistics). The label/recall path covers safety actions;
  signal mining is out of scope.
- Changing the evidence detection itself. Evidence lane behavior is unchanged.

## 3. Users & value

The existing ICP (clinician, pharmacist, researcher, engaged patient). Value: "tell me when the answer
could change" expands from *new papers* to *new papers + the regulatory/trial events that move practice*,
across every medical entity — not only drugs.

## 4. Current state (what exists today)

- `evidence_watches` (migration `20260617000000_live_monitoring_watches.sql`): `kind` ∈ {topic,
  saved_question}, `query_terms`, `mentions` (drug names for openFDA scoping), `include_news`, `cadence`,
  `status`, `last_checked_at`, `baselined_at`.
- `watch_events` / `watch_known_sources`: `channel text CHECK (channel IN ('evidence','news'))`; PK/UNIQUE
  `(watch_id, channel, source_key)`; `CONSTRAINT watch_events_news_never_alerts CHECK (NOT (channel='news'
  AND is_alert))`.
- Edge function `supabase/functions/watch/index.ts` (thin, service-role/cron). Pure cores:
  `dated-sources.ts` (dated PubMed/CT.gov/openFDA-label fetch), `watch-cycle.ts` (evidence delta + news
  delta), `plan-persistence.ts` (what to write), `watch-detect.ts` (evidence classifier), `news-source.ts`
  (Google News, feed-only).
- UI: `WatchDetail.tsx` renders Alerts / What's-new / In-the-news from `partitionWatchEvents`. The
  "Monitor a topic" box (`monitor/page.tsx`) + `WatchButton.tsx` create watches. `searchEntities(q)` →
  Supabase RPC `search_entities` powers the drug-focused Explore search.
- **Verified keystone (2026-06-19):** NCBI MeSH maps lay synonyms ("heart attack" → *Myocardial
  Infarction*) and `espell` corrects typos ("diabetis" → *diabetes*); MeSH resolves device terms
  ("insulin pump"). This can power the universal picker.

## 5. Design

### 5.1 Entity model

A watch gains an **entity type** that drives which catalyst feeds apply:

| `entity_type` | Examples | Catalysts that apply |
|---|---|---|
| `drug` | semaglutide, tesamorelin | FDA drug approvals/recalls + trial readouts |
| `device` | insulin pump, CGM | FDA device clearances (510(k)/PMA) + device recalls + trial readouts |
| `condition` | type 2 diabetes, NASH | trial readouts only |
| `procedure` | knee replacement | trial readouts only |
| `topic` | free-text fallback (no resolved entity) | trial readouts only |

Evidence + News work for **all** types (free-text PubMed/CT.gov already does). Entity type only gates the
**Catalysts** lane.

New `evidence_watches` columns:
- `entity_type text NOT NULL DEFAULT 'topic' CHECK (entity_type IN ('drug','device','condition','procedure','topic'))`
- `entity_ref text` — canonical id: in-house drug id, or `mesh:<MeSH UI>` for MeSH-resolved entities; NULL for free-text.
- `include_catalysts boolean NOT NULL DEFAULT true` — per-watch on/off (mirrors `include_news`).

`mentions` (existing) keeps holding drug/device names for field-scoped FDA queries; the picker populates it.

### 5.2 Universal picker

**Server-side suggest endpoint** — a Next.js route handler `GET /api/entities/suggest?q=…` (avoids browser
CORS to NCBI, protects the NCBI API key, allows caching/rate-limiting). It merges and returns ranked
candidates:

1. **Drugs** — the existing `search_entities` RPC (best UX, brand→generic). Tagged `entity_type:'drug'`.
2. **Everything else** — NCBI MeSH lookup + `espell` typo-correction. Each MeSH hit is classified by its
   **MeSH tree category** into device / condition / procedure:
   - `C*` → `condition`; `E07*` (Equipment & Supplies) → `device`; `E01–E06` (diagnosis/therapeutics/
     procedures) → `procedure`; `D*` (chemicals & drugs) → `drug`; otherwise `topic`.
   - Returns canonical term name + `mesh:<UI>` ref + synonyms.
3. **Free-text fallback** — if nothing resolves, the raw string is still acceptable as `entity_type:'topic'`.

Picker UX (`monitor/page.tsx` box + `WatchButton.tsx`): typeahead dropdown, each row shows the canonical
name + a small type chip (Drug / Device / Condition / Procedure). Selecting a row sets `query_terms`
(canonical term, expanded with key synonyms for recall), `entity_type`, `entity_ref`, and `mentions`
(drug/device names). Keyboard accessible; debounced; the box still accepts a typed topic with no selection.

**Slice A note:** ship the drug-only typeahead first (RPC only, no gated deploy), then add the MeSH/espell
source behind the same endpoint to make it universal.

### 5.3 Catalysts lane (v1)

A new pure module `supabase/functions/watch/catalyst-sources.ts` (mirrors `dated-sources.ts`: env-free,
fetch injectable, fault-tolerant, time-bounded, every query shape proven by a diag probe). It fetches
**dated events since the cursor** per entity type and maps them to a `CatalystSource` (deterministic
source key, event type from the source field — never LLM-derived):

**Drug entity**
- Approvals: openFDA `drug/drugsfda.json` — new submissions/approvals by `submission_status_date`;
  company = `sponsor_name`.
- Recalls/safety: openFDA `drug/enforcement.json` — by `recall_initiation_date`; `classification`
  (Class I/II/III) sets severity; company = `recalling_firm`.

**Device entity**
- Clearances: openFDA `device/510k.json` + `device/pma.json` — by `decision_date`; company = `applicant`.
- Recalls/safety: openFDA `device/enforcement.json` — by `recall_initiation_date`; company = `recalling_firm`.

**Any entity (drug/device/condition/procedure)**
- Trial readouts: ClinicalTrials.gov v2 — detect **status transitions** (`overallStatus` → COMPLETED /
  TERMINATED) and **results posted** (`hasResults` flips true / `resultsFirstPostDate` appears) on trials
  matching the entity; company = `leadSponsor.name`.

Scoping uses `mentions` (drug/device names) for the FDA name-scoped queries (same name-drop guard as
`dated-sources.ts`), and `query_terms` for CT.gov. Endpoints/params are candidates **to be confirmed by a
diag probe** (`scripts/diag/watch-catalyst-probe.ts`) before wiring — consistent with how the existing
three dated sources were proven.

### 5.4 Alerting rules (loud vs quiet)

Deterministic, from the event type:
- **Loud alert:** drug/device **approval**, **rejection/CRL**, **recall or safety action** (any class),
  or a **pivotal (late-phase) trial readout** (Phase 3/4 → Completed, or results posted).
- **Quiet feed (catalyst lane, no alert):** routine status nudges (enrollment/registration changes,
  early-phase status flips).

New alert reasons on `watch_events.alert_reason`: `fda_approval`, `fda_rejection`, `recall`,
`trial_readout` (extends the existing `new_high_tier_study` / `retraction`).

### 5.5 Lanes & UI

- `partitionWatchEvents` (shared) extends to a **catalyst** partition: returns `alerts` (loud, now incl.
  catalyst alerts), `catalysts` (the quiet catalyst feed), `feed` (evidence what's-new), `news`.
- `WatchDetail.tsx` gains a **Catalysts** section between "What's new" and "In the news":
  - Header: "Catalysts · verified events". Cards show the event type badge (Approval / Recall / Readout),
    the company, the date, and a source link (FDA / ClinicalTrials.gov).
  - Trust-ladder styling: more prominent than news, distinct from peer-reviewed evidence; an "official
    source" marker, no "evidence" framing.
- Catalyst alerts surface in the existing **Alerts** section (loud), tagged by reason.
- A per-watch **Catalysts on/off** toggle (`include_catalysts`), mirroring the news toggle.

### 5.6 Data model / schema changes (one migration, owner-gated)

```
-- evidence_watches
ALTER TABLE evidence_watches
  ADD COLUMN entity_type text NOT NULL DEFAULT 'topic'
    CHECK (entity_type IN ('drug','device','condition','procedure','topic')),
  ADD COLUMN entity_ref  text,
  ADD COLUMN include_catalysts boolean NOT NULL DEFAULT true;

-- widen the lane on both tables
ALTER TABLE watch_events        DROP CONSTRAINT … ;  -- channel CHECK → ('evidence','catalyst','news')
ALTER TABLE watch_known_sources DROP CONSTRAINT … ;  -- channel CHECK → ('evidence','catalyst','news')
-- KEEP watch_events_news_never_alerts (news still cannot alert); catalyst CAN alert (no new constraint).
```

No RLS changes (existing owner-scoped policies cover the new columns). Read path (`fetchWatch`,
`fetchWatchEvents`) already selects `channel` generically.

### 5.7 Architecture & code layout

Mirror the existing thin-edge / pure-core split. New/changed:
- `supabase/functions/watch/catalyst-sources.ts` — **new**, pure dated catalyst fetch (FDA drug, FDA
  device, CT.gov readouts).
- `packages/shared/src/watch-catalyst-detect.ts` — **new**, pure catalyst delta + alert classification
  (analogue of `watch-detect.ts`).
- `supabase/functions/watch/watch-cycle.ts` — extend `runWatchCycle` to a third channel
  (`catalyst`), gated on `watch.include_catalysts` + `entity_type`.
- `supabase/functions/watch/plan-persistence.ts` — extend to write catalyst events/known-set.
- `supabase/functions/watch/index.ts` — wire the catalyst fetch (thin; load `entity_type`/`entity_ref`/
  `include_catalysts`).
- `apps/web/app/api/entities/suggest/route.ts` — **new**, the universal suggest endpoint.
- `apps/web/lib/api.ts` — `suggestEntities(q)`; `createWatch` accepts `entity_type`/`entity_ref`/
  `include_catalysts`.
- `apps/web/components/EntityPicker.tsx` — **new** typeahead; used by `monitor/page.tsx` + `WatchButton`.
- `packages/shared/src/watch-entitlements.ts` — unchanged (catalysts ride existing plan limits).
- `WatchDetail.tsx`, `partitionWatchEvents` — the third lane.

## 6. Build slices

1. **Slice A — drug picker.** `EntityPicker` over the existing `search_entities` RPC; wire into the box +
   `WatchButton`; persist `entity_type`/`entity_ref` (needs the additive `evidence_watches` columns —
   small owner-gated migration, or ship picker UI first writing only `mentions`/`query_terms` and add
   columns with Slice B). Visible win.
2. **Slice A2 — universal picker.** `/api/entities/suggest` adds MeSH + espell; classification by MeSH
   tree; type chips. Diag probe for the term source.
3. **Slice B — Catalysts lane.** The lane migration (channel widen + watch columns), `catalyst-sources.ts`
   + `watch-catalyst-detect.ts` + cycle/persistence wiring, the `WatchDetail` lane + toggle,
   `partitionWatchEvents`. Diag probe(s) for FDA drug/device + CT.gov readouts. Owner-gated edge-fn deploy.
4. **Fast-follow (separate spec):** SEC company filings for ticker-mappable entities.

## 7. Gating & verification

- **Owner-gated:** the `evidence_watches`/lane migration, the `watch-check` edge-function redeploy, and
  each new external source. Each source gets a `scripts/diag/*` probe proving the live query shape
  (read-only) before it's trusted — the established pattern (`watch-dated-probe.ts`).
- **Tests (TDD, ≥80%):** pure modules unit-tested under `deno test` (catalyst detect, source mappers,
  MeSH classification, partition). The suggest route + picker get component/route tests. UI verified
  via the static-mock + Chrome DevTools pattern (no app login needed) before any deploy.

## 8. Guardrails preserved

- **Deterministic detection** — catalyst event types come from source fields, never an LLM.
- **News wall intact** — `watch_events_news_never_alerts` kept; catalysts are a *separate* lane, not news.
- **Idempotent/resumable** — catalysts use the same events→known-set→cursor write order and
  `UNIQUE(watch_id,channel,source_key)` dedupe.
- **Silent baseline** — first run baselines the catalyst channel too (no back-catalog alert spam).
- **Fault-tolerant/time-bounded** — a failed/slow catalyst source contributes `[]` and never sinks a cycle.

## 9. Risks & open questions

- **MeSH UX polish:** raw MeSH translations can be loose (e.g. "insulin pump" → `insulin AND pump`). The
  suggest endpoint should prefer exact MeSH *term* names (efetch/MeSH-term lookup) over raw esearch
  translations; final ranking proven against a hand list during Slice A2. (Confirm endpoint in the probe.)
- **openFDA device coverage** is less complete/timely than drug labels; device catalysts may be sparser —
  acceptable, surfaced honestly.
- **Entity↔event matching precision:** FDA name-scoping reuses the existing name-drop guard; CT.gov
  matching uses `query_terms` — risk of off-target trials for broad conditions. Mitigate with the same
  high-tier/phase gating used by evidence.
- **NCBI rate limits:** the suggest endpoint shares the NCBI key; needs caching + debounce.

## 10. Done = 

Universal typeahead resolves drug/device/condition/procedure (typo+synonym tolerant); a watch records its
entity type; the Catalysts lane shows FDA drug/device approvals & recalls + trial readouts with the
company, raising loud alerts only for material events; news stays walled; all detection deterministic;
every new source probe-verified; shipped behind owner-gated deploys.
