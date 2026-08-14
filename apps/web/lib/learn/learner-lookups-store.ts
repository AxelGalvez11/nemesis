// Reading and writing the terms a learner has had to look up.
//
// 🔴 THE PRODUCER `learner-friction.ts` WAS MISSING. That module and its tests landed with no writer
// at all — a tested reader over an empty table, which is this repo's most-repeated shape of failure
// and the reason `DEGRADED ≠ COMPLETE` is a standing rule. This closes it.
//
// 🔴 NEVER FILTERED BY CANVAS, exactly like `loadEvidence`. A term looked up on Tuesday must be
// there on Friday; a canvas filter here would turn the glossary back into a session transcript, and
// it is one `.eq()` away at every call site — which is why the function does not take a canvas id.
// The canvas is written as provenance and never read as a filter.

import { supabase } from "@/lib/supabase";

import type { TermLookup } from "./learner-friction";
import { isMissingTable } from "./learner-store";
import { glossaryKey } from "./vocabulary-lookup";

/** How many lookups to read back. Generous — the whole point is a glossary that accumulates. */
const LOOKUP_LIMIT = 1_000;

export interface LookupToRecord {
  /** What the learner actually selected, verbatim. */
  displayTerm: string;
  /** What Nemesis gave back. 🔴 NULL IS "WE DID NOT ANSWER", never "no definition exists". */
  definition: string | null;
  canvasId?: string | null;
  occurredAt?: string;
}

/**
 * Record that the learner stopped and asked what something meant.
 *
 * 🔴 IT RETURNS A BOOLEAN AND NEVER THROWS, because a failed glossary write must not take down the
 * definition the learner is waiting for. Remembering the lookup is the smaller half of the feature;
 * answering it is the half they asked for.
 *
 * 🔴 AND IT IS NOT EVIDENCE. This writes `learner_lookups`. `recordEvidence` writes
 * `learner_evidence`. Two functions, two tables, and `projectLearnerState` reads only the second —
 * see `learner-friction.ts` for why collapsing them turns curiosity into a claim about a person.
 */
export async function recordLookup(
  userId: string | null,
  lookup: LookupToRecord,
): Promise<boolean> {
  const term = glossaryKey(lookup.displayTerm);
  if (!userId || !term) return false;
  const { error } = await supabase.from("learner_lookups").insert({
    canvas_id: lookup.canvasId ?? null,
    definition: lookup.definition,
    display_term: lookup.displayTerm.slice(0, 400),
    occurred_at: lookup.occurredAt ?? new Date().toISOString(),
    term: term.slice(0, 200),
    user_id: userId,
  });
  if (error && !isMissingTable(error)) {
    console.warn("[learn] lookup insert failed", error.message);
    return false;
  }
  return !error;
}

/**
 * Every term this learner has ever looked up.
 *
 * 🔴 ORDERED, AND THE SORT ENDS IN A UNIQUE COLUMN. A paged Postgres sort on a non-unique key can
 * silently skip or repeat rows, and a glossary that loses a row loses a definition the learner was
 * already given — which reads to them as Nemesis forgetting.
 */
export async function loadLookups(userId: string | null): Promise<TermLookup[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("learner_lookups")
    .select("term, definition, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(LOOKUP_LIMIT);
  if (error) {
    if (!isMissingTable(error)) console.warn("[learn] lookup read failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    definition: typeof row.definition === "string" ? row.definition : null,
    occurredAt: String(row.occurred_at),
    term: String(row.term),
  }));
}
