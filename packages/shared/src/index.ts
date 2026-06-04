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
