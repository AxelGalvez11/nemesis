# Live Monitoring — design spec

**Status:** APPROVED by owner 2026-06-17 ("looks good" → "just build it"). Building in increments; migrations / scheduler / email / deploy each owner-gated. Owner also requested (2026-06-17) a **separate walled-off NEWS signal** + an **autonomous self-checking build loop** (quality checks every increment; pauses at owner gates).
**Date:** 2026-06-17
**Workstream:** WS-D (standing-watch / topic monitoring) — the recurring-revenue flagship.

## Thesis (owner reframe 2026-06-17)
PharmaOrb is a **self-serve subscription** an individual (clinician / pharmacist / researcher / engaged patient or caregiver) pays **$20–50/mo** for. **Live monitoring is the feature that justifies the price** and the lever that makes Pro ($50) worth more than Plus ($20). This SUPERSEDES the earlier "med-comms agency / sell deliverables" default — monitoring is built now as the consumer hook, riding the already-live Stripe Free/Plus/Pro tiers.

## The four product decisions (owner-chosen)
1. **Watch BOTH** a saved question *and* a drug/topic. (They reduce to one primitive — see architecture.)
2. **Two channels:** a quiet, browsable "what's new" feed (every new source) + loud alerts reserved only for conclusion-movers.
3. **Delivery:** in-app inbox first (source of truth), email layered second (Resend + verified domain + secret — owner-gated).
4. **Tier ladder:** Free taste → Plus real monitoring → Pro power ("more + faster + smarter").

## Architecture keystone (advisor-confirmed — the whole ballgame)
**Detect change by querying the source APIs by date — NEVER by diffing engine output.** Re-running the engine retrieves a slightly different source set each time (documented retrieval jitter), so diffing cited `source_id`s would fire constant false "new evidence!" alerts and destroy trust. Instead:

- Each watch keeps **(a) a last-check date cursor** and **(b) an accumulating set of known sources** keyed `provider:provider_id` (the codebase's canonical first-wins dedupe key).
- Each cycle: ask PubMed (`mindate`/`datetype`), ClinicalTrials.gov (last-update / first-posted), openFDA (`effective_time`) **"what's new since the cursor?"**, normalize+dedupe, diff against the known-set.
- **The engine runs ONLY to summarize a confirmed change** (grounded, through the one `detectViolations` scan). Cheap dated query every cycle; expensive generate only on a real hit → 50 Pro watches/day is affordable.

Consequences:
- **Cold start:** first check **baselines silently** — store keys, emit zero alerts. Real alerts begin cycle 2. Guarded by an explicit `firstRun` flag (NOT inferred from "known-set empty", or a topic that legitimately had 0 results on run 1 would never alert on its first real hit).
- **Both = one primitive:** topic-watch and saved-question-watch differ only in where search terms come from (typed topic vs. the saved question's stored terms). Build once; ship topic-watch first, saved-question is a thin wrapper.
- **"Conclusion moved" must be RECOMPUTED, not read off the saved report** (`evidence_grade` is frozen at generation). Recompute the deterministic §9 tier over the accumulated study set; re-pool meta (`meta-analysis.ts` is deterministic given stable inputs) over the deduped known-set.

## The two channels
- **"What's new" feed (quiet):** every new source on the watch, browsable, ordered by importance (reuse `digest-ranking.ts`). The "it's clearly working / worth my money" channel — visible even in a quiet month.
- **Alerts (loud — conclusion-movers only):**
  1. **New high-tier study** lands (meta-analysis / systematic review / RCT / late-phase [3–4] trial — via `studyTypeLabel`), not just any paper.
  2. **Evidence strength changed** — recomputed over the accumulated set (not the frozen grade).
  3. **Pooled meta result shifted** — re-pooled deterministically; e.g. crosses significance.
  4. **A relied-on source was retracted** (PubMed "Retracted Publication" / "Retraction of Publication").

Every alert is computed from real data; only the human-readable *description* is generated, and it flows through the single safety scan.

## News signal (separate, walled-off channel — owner-requested 2026-06-17)
A news signal sits ALONGSIDE the evidence monitoring, deliberately walled off so it cannot contaminate the "shows its work" guarantee.
- **Source:** a topic news search. v1 = **Google News RSS** (free, no API key, no new secret); swappable later for a curated medical-news feed. Fetched fault-tolerantly + time-bounded like the evidence sources.
- **The wall (non-negotiable):** a news item is NEVER converted to an evidence record (no `NormalizedSource` / `Citation` / `RetrievedChunk`), NEVER grounded, NEVER cited, NEVER enters the one citation namespace, and NEVER fires an evidence alert. News is **feed-only**: a distinct "In the news" list per watch, clearly labeled *"In the news — not verified evidence."* The evidence alert/inbox stays evidence-only.
- **Type:** a standalone `NewsItem { title, url, source, published_at }` in its own module (`supabase/functions/news/`), intentionally NOT the evidence `NormalizedSource` shape — the type system helps enforce the wall.
- **Diff:** news has its own simple seen-set diff (by URL); no "high-tier"/material concept (news never moves a conclusion) → new items just populate the feed, never the loud alert.
- **Tier:** shown alongside the watch; no separate gating in v1.

## Tiers (starting numbers — adjustable)
| | Free (taste) | Plus $20 | Pro $50 |
|---|---|---|---|
| Watches | 1 | 10 | 50 |
| Frequency | weekly | daily | daily (priority) |
| Channels | both, in-app only | both, **+ email** | both, + email |
| Alert history | 30 days | 1 year | unlimited + export |
| Advanced | — | — | meta re-pooling alerts, competitor-drug watches |

Honest premium lever = freshness + volume + smarter signals. NO fake "real-time" (literature doesn't change by the minute; daily is the practical ceiling). Free gets the full *experience* on one watch.

## Data model (net-new; reuse proven patterns, NOT the corpus-tied spine)
The existing `watchlist_items` + `updates` + `detect-updates` + `get_watchlist_updates` spine is **corpus-ingest-tied** (a hand-run script that diffs ingested `pubmed_articles`/`clinical_trials`, drug-entity-keyed only) and is **not** dated live-API querying. It stays as-is, separate. New tables:

- `evidence_watches` — owner, `kind` (`topic` | `saved_question`), the terms (topic string OR saved_report_id + stored terms), cadence, **last_checked_at cursor**, channels, `baselined_at`. RLS owner-scoped.
- per-watch **known-source set** — normalized/deduped `provider:provider_id` keys (own table `watch_known_sources`, or a jsonb set on the watch; decide at migration time by expected cardinality).
- `watch_alerts` — one row per fired alert: kind/reason, new source ids, grounded summary, read/unread, fired_at. This is the inbox; reuses the saved-revisitable-object pattern.

Reuse: owner-scoped RLS, the `saved_reports` payload-snapshot pattern, the entitlements system (`plan_entitlements` + `resolve_user_plan` + `consume_usage`), idempotent `ON CONFLICT` upserts.

## Scheduler (the one genuinely new primitive — swappable, don't agonize)
Recommendation: **Supabase `pg_cron` → `watch-check` edge function** (native to where data lives, fewest new secrets). Alternatives: Vercel Cron (best dashboards, needs a shared secret) or GitHub Actions (free). Pick for observability + fewest new secrets + idempotency; it does NOT determine correctness — detection determinism does.

Must-haves (easy to forget):
- **Idempotent + resumable:** batch watches; advance each watch's cursor **only on success**. The date-cursor gives free catch-up after a missed/double run.
- **Per-cycle spend cap** (same safeguard the faithfulness runner needed) so a runaway fleet can't burn the LLM budget.
- Alert-summary generation routed through the ONE `detectViolations` scan.

## Build sequence (each green-gated; gates marked)
1. **Detection primitive** — `packages/shared/src/watch-detect.ts`: PURE dated-diff (known-set diff, cold-start `firstRun` suppression, accumulation, per-source material classifier reusing `studyTypeLabel`). Fully unit-tested, no DB/network. *(autonomous)*
1b. **News signal (walled-off)** — pure news parse (`supabase/functions/news/`) + `NewsItem` type (NOT an evidence record); later a news fetch in `watch-check` + a separate "In the news" feed. Feed-only, never cited/grounded. *(parse autonomous; deploy gated)*
2. **Topic-watch end-to-end, in-app only** — migrations (`evidence_watches`, known-set, `watch_alerts`) + `watch-check` edge fn (calls `gatherLiveCandidates` with the watch terms → `detectWatchDelta` → persist) + "what's new" feed + alerts inbox + "Watch this" button. *(migrations + deploy gated)*
3. **Saved-question watch** — thin wrapper: terms come from the saved report. *(deploy gated)*
4. **Tier gating + cadence** — wire Free/Plus/Pro watch limits + cadence into entitlements. *(migration gated)*
5. **Computed-shift alerts** — recompute §9 tier + re-pool meta over the known-set; fire grade-change / significance-crossing alerts.
6. **Email layer** — Resend + verified domain + same-day digest batching + unsubscribe link. *(service + domain + secret + deploy gated)*
7. **Scheduler** — enable `pg_cron` (or chosen mechanism) to drive `watch-check`. *(migration/cron + deploy gated)*

## Guardrails (non-negotiable)
Never-LLM-guess (detection = deterministic source IDs; conclusion-movers computed; only the description generated). One safety scan on every generated summary. One citation namespace. Per-cycle spend cap. Owner-gated: every migration, the scheduler, email service/domain/secret, each prod deploy.

## Verification
Pure logic → Deno unit tests with fixtures (the green gate runs `deno test packages/shared/`). Edge/diff correctness → fixture tests simulating cold-start, a planted new trial (fires), and a quiet cycle (silent). Visual surfaces (feed, inbox, "Watch this") → static-mock screenshot method (real CSS, dark+light). Live behavior → an attended probe before any deploy.
