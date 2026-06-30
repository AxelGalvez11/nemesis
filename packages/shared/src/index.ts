// PharmaBro shared contract — FROZEN at the end of Phase 3 (IMPLEMENTATION_PLAN.md §8).
//
// This is the app <-> backend boundary. Phase 6 (mobile) builds against these
// shapes; changing one after the freeze is a breaking change, so additions
// should be optional fields, not renames/removals.
//
// The answer shape is the deliberate SUPERSET of doc-20 (6 narrative sections,
// incl. safety_notes) and the §8 JSON sketch (plain_english_summary +
// evidence_grade + answer_sections + citations + safety_flags). Freezing the
// superset now means safety_notes has a home and the contract does not reopen
// in Phase 6.

export * from "./answer.ts";
export * from "./claim-relation.ts";
export * from "./discovery.ts";
export * from "./search.ts";
export * from "./evidence.ts";
// Phase-4 evidence-scoring engine (§9): the deterministic tier core. Pure
// functions + signal spec; the LLM only writes rationale/limitations prose.
export * from "./evidence-scoring.ts";
// Phase-5 watchlist/digest (§8/§10): shared shapes + the deterministic doc-12
// digest-ranking comparator (pure, like the §9 tier core).
export * from "./watchlist.ts";
export * from "./digest-ranking.ts";
// My Health Context (user_health_context, 0109): user-owned, read/edit/delete.
export * from "./health-context.ts";
// Phase-6a backend gaps (§8): GET /compare structured comparison shapes.
// (SourceDetail for GET /sources/{id} lives in search.ts alongside SourceRef.)
export * from "./compare.ts";
// MVP web-beta entitlements + usage snapshots (0122).
export * from "./entitlements.ts";
// Deep Research report contract (research-modes): the multi-step, cited REPORT
// produced by plan -> gather -> synthesize -> faithfulness. Additive, optional.
export * from "./research.ts";
// Publishable-reports: PRISMA-overclaim guard + numbered citation formatter (pure).
export * from "./forbidden-phrases.ts";
export * from "./citation-format.ts";
// Evidence-base table helpers (publishable-reports): pure citation -> row mapping shared by the
// on-screen report and the docx/pptx exports so both render the same body-of-evidence summary.
export * from "./citation-meta.ts";
// Meta-analysis (deliverables track): pure inverse-variance + DerSimonian-Laird risk-ratio pooling
// with Q / I^2 / tau^2. Real statistics in code — NEVER LLM-guessed. Validated against metafor's
// published BCG analysis (Q = 152.2330). Extraction + go-live are owner-gated, not wired yet.
export * from "./meta-analysis.ts";

// Forest-plot figure: the iconic meta-analysis graphic, computed (PURE) from the pool above. A layout
// model for theme-aware React rendering + an SVG string for the Word/PDF/PPT export. Draws only numbers
// the pool produced — never an LLM-drawn figure.
export * from "./forest-plot.ts";

// Structured abstract (Background/Methods/Results/Conclusions) for a meta report. The Results line is
// computed from the real pool — never LLM-stated. Null unless the report actually pooled.
export * from "./meta-abstract.ts";

// Study-type badge: PURE label derived from a citation's PubMed PublicationType / ClinicalTrials.gov
// study_type fields ("Meta-analysis", "Randomized controlled trial", "Interventional trial · Phase 3").
// Never an LLM guess — computed verbatim or omitted (no false badge).
export * from "./study-type.ts";

// "Where the science stands": PURE evidence-MATURITY signal (well_studied / emerging) computed from
// the cited sources' study-type metadata. Positive-only — null (no badge) when there's no signal to
// stand behind. Never an LLM guess; consensus/"contested" is left to the meta engine's heterogeneity.
export * from "./science-state.ts";

// Live-monitoring (WS-D) change detection: PURE dated-diff over an accumulating per-watch known-source
// set. Detects change by diffing source-API results by date, never by diffing engine output (avoids
// retrieval-jitter false alerts). Cold-start baselines silently; per-source classifier flags the loud
// conclusion-mover alerts (new high-tier study / retraction) reusing the study-type metadata.
export * from "./watch-detect.ts";

// Live-monitoring UI: the client WatchEvent shape + the PURE split into loud alerts / quiet "what's
// new" feed / the walled-off news list (the watch detail view renders from this; the news wall is
// re-enforced here defensively).
export * from "./watch-events.ts";

// Monitoring "browse popular topics": the curated, hand-vetted catalog (drugs/conditions/classes) +
// the PURE watch-field builder. The tappable starting points that complement the autocomplete.
export * from "./browse-topics.ts";

// Live-monitoring tier gating: PURE read of the per-plan watch entitlements (limit / daily / email)
// + the allowed-cadence resolver. Defaults to the free-tier floor when keys are absent.
export * from "./watch-entitlements.ts";

// Live-monitoring email digest: PURE builder of the same-day digest of LOUD alerts (alerts-only; the
// quiet feed + walled news are never emailed). The send/schedule is owner-gated; this is the content core.
export * from "./watch-digest.ts";

// Score feature ("Percentile Engine" / Strava-for-longevity): two PURE, non-diagnostic primitives.
//   • percentile.ts — places a raw biomarker value on a reference-population percentile (NOT a clinical
//     threshold). Seed reference data is ILLUSTRATIVE pending real NHANES/cohort ingestion (see file).
//   • health-score.ts — rolls metric percentiles up into pillar scores + one composite rank, with an
//     evidence-weight hook the "living score" turns. Wellness framings only; never a disease label.
export * from "./percentile.ts";
export * from "./health-score.ts";

// Evidence distribution charts (study-design mix + publications-by-year): PURE, deterministic SVG-layout
// builders over the report's real citation metadata (studyTypeLabel / citationYear). Null when the data is
// too thin to be honest. Rendered behind NEXT_PUBLIC_ENGINE_VISUALS (default off).
export * from "./evidence-charts.ts";

// Gap test-runner (meta): the comparability gate between a gap's extracted studies and the meta engine
// — clusters by outcome, pools comparable clusters via poolRiskRatio, abstains honestly otherwise.
// PURE; reuses the computed-statistics engine (never LLM-guessed). Extraction + UI wiring are owner-gated.
export * from "./gap-meta-test.ts";

// Field-router (beyond-medicine prerequisite): PURE, deterministic classifier that maps a query to a
// field (→ source-set + in-silico executability) and to the safety systems to engage. Safety is
// signal-driven and additive — a health/drug signal keeps the medical floor on even inside a CS query.
// Deterministic spine; an LLM classifier is the owner-gated refinement that feeds the same contract.
export * from "./field-router.ts";

// Auto-depth: PURE depth picker for the simplified "Auto" composer mode — fast vs thorough from the
// query shape (length / multi-part / comparison markers). Deterministic; an LLM router refines later.
export * from "./auto-depth.ts";

// Real-World Signal (researcher-facing): PURE aggregation of patient-reported outcomes into descriptive
// per-intervention COUNTS — never an effect estimate — graded at the lowest (anecdotal) tier and walled
// from the cited evidence, abstaining below a minimum-reports floor. A hypothesis-generation / gap-detection
// signal for researchers (feeds the discovery engine), not consumer advice. Safety pass over reported
// stacks + sourcing are owner-gated follow-ups.
export * from "./realworld-signal.ts";

// Stack safety (Real-World Signal Phase B): PURE checker that flags WELL-ESTABLISHED dangerous drug/
// supplement combinations in a reported regimen, for a researcher's review. A curated, conservative SEED
// (clinical review + a licensed source pending) — a flag means a known danger; absence of a flag != safe.
export * from "./stack-safety.ts";
