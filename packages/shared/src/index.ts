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
