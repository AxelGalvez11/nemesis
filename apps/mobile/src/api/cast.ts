import type { AskResponse, DrugOverview, SearchResult, SourceDetail } from "@pharmabro/shared";
import type { DrugPubmed, DrugTrial, LabelDoc } from "./types.ts";

// jsonb / RPC-row -> DTO narrowing at the §8 client boundary. `supabase gen types`
// types the jsonb RPC returns as `Json`, so the narrowing to the frozen DTOs happens
// here. We guard the field(s) the renderer dereferences (the 6b-1 review lesson:
// validate, don't bare-cast) so a backend shape change surfaces as not-found / a
// dropped row rather than a screen rendering `undefined`. Not security-critical: the
// data is from our own authenticated RPC and the sink is RN <Text>.

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Narrow + filter an RPC row array: keep only object rows that pass `keep`. A null
 * body or non-array (PostgREST quirk) yields []. */
function rows<T>(raw: unknown, keep: (r: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const mapped = keep(item);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

/** GET /drugs/{id} (get_drug) — single jsonb object; null body = not-found. */
export function toDrugOverview(raw: unknown): DrugOverview | null {
  if (!isObj(raw)) return null;
  if (typeof raw.id !== "string" || typeof raw.canonical_name !== "string") return null;
  return raw as unknown as DrugOverview;
}

/** GET /sources/{id} (get_source) — single jsonb object; null body = not-found. We
 * require the identity (source_id) + provider, and coerce is_current to a real
 * boolean (it drives the doc-06 outdated state). */
export function toSourceDetail(raw: unknown): SourceDetail | null {
  if (!isObj(raw)) return null;
  if (typeof raw.source_id !== "string" || typeof raw.provider !== "string") return null;
  return { ...raw, is_current: raw.is_current !== false } as unknown as SourceDetail;
}

/** GET /search (search_entities) — row array. A row needs id + name (to navigate)
 * and status (rendered via .replace in the result badge — guard what we dereference). */
export function castSearchResults(raw: unknown): SearchResult[] {
  return rows(raw, (r) =>
    typeof r.id === "string" && typeof r.name === "string" && typeof r.status === "string"
      ? (r as unknown as SearchResult)
      : null,
  );
}

/** GET /drugs/{id}/label (get_drug_label) — row array keyed by label_id. Missing or
 * malformed extracted_sections coerces to {} so the row still shows its citation. */
export function castLabelDocs(raw: unknown): LabelDoc[] {
  return rows(raw, (r) => {
    if (typeof r.label_id !== "string") return null;
    const sections = isObj(r.extracted_sections) ? r.extracted_sections : {};
    return { ...r, extracted_sections: sections } as unknown as LabelDoc;
  });
}

/** GET /drugs/{id}/trials (get_drug_trials) — row array keyed by trial_id. */
export function castTrials(raw: unknown): DrugTrial[] {
  return rows(raw, (r) => (typeof r.trial_id === "string" ? (r as unknown as DrugTrial) : null));
}

/** GET /drugs/{id}/pubmed (get_drug_pubmed) — row array keyed by article_id. */
export function castPubmed(raw: unknown): DrugPubmed[] {
  return rows(raw, (r) => (typeof r.article_id === "string" ? (r as unknown as DrugPubmed) : null));
}

/** POST /ask (the `ask` edge fn) — the frozen AskResponse. A refusal/template answer
 * is still a valid AskResponse (not null); only a malformed body is null. We guard the
 * fields the AnswerView dereferences: answer_id, plain_english_summary, answer_sections. */
export function toAskResponse(raw: unknown): AskResponse | null {
  if (!isObj(raw)) return null;
  if (typeof raw.answer_id !== "string" || typeof raw.plain_english_summary !== "string") return null;
  if (!isObj(raw.answer_sections)) return null;
  // Coerce the array/grade fields the AnswerView dereferences (.some/.filter/.replace)
  // so a body that omits them degrades gracefully instead of white-screening on a
  // safety/refusal path — the cast invariant: guard what the renderer touches.
  return {
    ...raw,
    safety_flags: Array.isArray(raw.safety_flags) ? raw.safety_flags : [],
    citations: Array.isArray(raw.citations) ? raw.citations : [],
    evidence_grade: typeof raw.evidence_grade === "string" ? raw.evidence_grade : "not_applicable",
  } as unknown as AskResponse;
}
