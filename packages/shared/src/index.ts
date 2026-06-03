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
