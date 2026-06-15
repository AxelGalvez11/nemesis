// eval/lib/faithfulness.ts
//
// The semantic faithfulness layer of the answer-quality benchmark (the "v2 LLM-judge" the README and
// answer-metrics.ts name as the next step beyond lexical grounding-coverage).
//
// WHY: grounding_coverage (answer-metrics.ts) measures whether a verbatim source SENTENCE was FOUND for
// a claim — a LEXICAL proxy. It has two honest blind spots: (1) FALSE NEGATIVES — a source that supports
// a claim by paraphrase/synonym ("death" for "mortality", terse trial-arm fields) scores below the word-
// overlap bar though it is the correct, supporting source; (2) FALSE POSITIVES — a sentence sharing words
// with a claim without actually entailing it. This layer judges ENTAILMENT: does the cited source TEXT
// semantically support the claim? It is the honest basis for a "most trustworthy engine" claim.
//
// HONESTY GUARDRAILS (this IS the trust product):
//   - MEASUREMENT ONLY. This judge never runs in the live /ask path and never gates a user's answer; it
//     scores saved benchmark transcripts. It cannot make an answer less safe.
//   - LLM-JUDGED, not ground truth. The verdict is an LLM's opinion. Report it as "LLM-judged semantic
//     faithfulness", aggregate with margin, and never treat one verdict as fact. Unclear counts AGAINST
//     faithfulness (conservative — same withhold-when-unsure discipline as the rest of the engine).
//   - REPRODUCIBLE. The judge prompt is PINNED here and the live runner must call a pinned model at
//     temperature 0 (a silent prompt/model change moves every score — see eval/README anti-flake rules).
//   - The live model call is INJECTED (JudgeFn), so this module is pure and unit-tested offline with a
//     fake judge; the real provider adapter (and the model decision) live in the gated runner.
//
// PER-TAG JUDGING (not a union): a claim is judged against EACH cited source separately and is faithful
// if ANY one of its cited sources supports it (aggregateVerdict). This avoids a token-bomb — openFDA
// labels run 50–66k chars, so unioning a 7-citation claim's sources would be a ~300k-char single call —
// and bounds every judge call to one chunk. Cited tags beyond MAX_TAGS_PER_CLAIM are dropped (recorded).

/** The judge's per-claim ruling. `unclear` is a real outcome (the source neither clearly supports nor
 *  clearly refutes), counted against faithfulness so an evasive judge can't inflate the score. */
export type Entailment = "supported" | "not_supported" | "unclear";

export interface Verdict {
  label: Entailment;
  /** One-sentence judge rationale, when provided. Diagnostic only. */
  reason?: string;
}

/** Minimal claim shape consumed from an /ask answer (subset of AnswerPoint). */
export interface FaithAnswerPoint {
  text: string;
  citation_ids?: string[];
}

/** Minimal per-tag source text (subset of AskResponse.source_texts; requires include_source_text). */
export interface FaithSourceText {
  tag: string;
  text: string;
}

/** One cited source's verbatim text (judged on its own, not unioned). */
export interface CitedSource {
  tag: string;
  text: string;
}

/** A claim plus the per-tag text of the source(s) it cites — the unit the judge rules on. */
export interface ClaimSources {
  claim: string;
  /** The cited tags that resolved to source text and survived the per-claim cap. */
  tags: string[];
  /** Per-tag source texts (NOT concatenated; each judged separately). */
  sources: CitedSource[];
  /** Resolved cited tags dropped by MAX_TAGS_PER_CLAIM (recorded so a cap is never silent). */
  droppedTags: number;
}

export interface JudgedClaim {
  claim: string;
  tags: string[];
  verdict: Verdict;
}

/** Judge at most this many cited sources per claim (bounds cost + avoids the union haystack). A claim
 *  citing more is judged on its first N and the rest are recorded as dropped. */
export const MAX_TAGS_PER_CLAIM = 3;
/** Defensive per-source truncation (one openFDA label tops out ~66k chars; this only trims a pathological
 *  outlier so a single judge call can't blow the context window). */
export const MAX_SOURCE_CHARS = 80000;

/**
 * Pair each load-bearing claim with the verbatim text of the source(s) it cites — one entry PER cited
 * tag (not unioned). A claim with no citation, or whose cited tags don't resolve to any source text, is
 * skipped (nothing to judge). Cited tags are de-duped, unresolved tags dropped, the rest capped to
 * MAX_TAGS_PER_CLAIM (overflow counted in `droppedTags`) and each truncated to MAX_SOURCE_CHARS. PURE.
 */
export function claimSourcePairs(
  points: ReadonlyArray<FaithAnswerPoint>,
  sourceTexts: ReadonlyArray<FaithSourceText>,
): ClaimSources[] {
  const byTag = new Map(sourceTexts.map((s) => [s.tag, s.text]));
  const out: ClaimSources[] = [];
  for (const p of points) {
    const seen = new Set<string>();
    const resolved: CitedSource[] = [];
    for (const raw of p.citation_ids ?? []) {
      const tag = String(raw);
      if (seen.has(tag)) continue;
      const text = byTag.get(tag);
      if (text === undefined) continue; // unresolved cited tag — drop it
      seen.add(tag);
      resolved.push({ tag, text: text.slice(0, MAX_SOURCE_CHARS) });
    }
    if (resolved.length === 0) continue; // uncited, or none of the cited tags resolved → nothing to judge
    const sources = resolved.slice(0, MAX_TAGS_PER_CLAIM);
    out.push({
      claim: p.text,
      tags: sources.map((s) => s.tag),
      sources,
      droppedTags: resolved.length - sources.length,
    });
  }
  return out;
}

/**
 * The PINNED faithfulness-judge prompt. Strict NLI against ONE source: judge ONLY against the provided
 * source, count paraphrase/synonym as support (this is what fixes the lexical false-negatives), and
 * return `unclear` when the source alone can't decide. Pinned because the metric is only reproducible if
 * the prompt is fixed — treat edits as a benchmark version bump. PURE.
 */
export function buildJudgePrompt(claim: string, sourceText: string): string {
  return [
    "You are a strict faithfulness judge for a medical evidence assistant.",
    "Decide whether the SOURCE TEXT supports the CLAIM.",
    "",
    "Rules:",
    "- Base your judgment only on the SOURCE TEXT below. Do NOT use any outside knowledge.",
    "- The claim is supported if the source states it, including by paraphrase or synonym",
    '  (for example "death" for "mortality"); exact wording is not required.',
    "- If the source contradicts the claim, or does not address it, the label is not_supported.",
    "- If the source text alone is not enough to decide, the label is unclear.",
    "",
    `CLAIM:\n${claim}`,
    "",
    `SOURCE TEXT:\n${sourceText}`,
    "",
    'Reply with strict JSON only: {"label": "supported" | "not_supported" | "unclear", "reason": "<one short sentence>"}',
  ].join("\n");
}

/** Map any label-ish text to an Entailment. Checks the NEGATION forms FIRST so "not supported" /
 *  "unsupported" are never misread as "supported" (the inversion that would silently flip the metric).
 *  Defaults to "unclear" — the fail-safe: an unrecognized reply is never counted as supported. */
function classify(text: string): Entailment {
  const t = text.toLowerCase();
  if (/\bnot[_ ]+supported\b/.test(t) || /\bunsupported\b/.test(t)) return "not_supported";
  if (/\bsupported\b/.test(t) || /\bsupports\b/.test(t)) return "supported";
  if (/\bunclear\b/.test(t)) return "unclear";
  return "unclear";
}

/**
 * Parse a judge reply into a Verdict. Prefers a strict JSON `{label, reason}` body, but tolerates a
 * loose/bare label (models drift), and FAILS SAFE to `unclear` on anything unrecognized — junk, empty,
 * or a missing label is never scored as supported. PURE.
 */
export function parseVerdict(raw: string): Verdict {
  const trimmed = raw.trim();
  if (!trimmed) return { label: "unclear" };
  try {
    const o = JSON.parse(trimmed) as unknown;
    if (o && typeof o === "object" && typeof (o as { label?: unknown }).label === "string") {
      const reasonVal = (o as { reason?: unknown }).reason;
      return {
        label: classify((o as { label: string }).label),
        reason: typeof reasonVal === "string" ? reasonVal : undefined,
      };
    }
  } catch {
    // not JSON — fall through to a lenient scan of the raw reply
  }
  return { label: classify(trimmed) };
}

/**
 * Combine the per-source verdicts for ONE claim into a single claim verdict: `supported` if ANY cited
 * source supports it (the claim is backed by at least one of its citations); else `not_supported` only
 * when EVERY cited source clearly fails; otherwise `unclear` (a mix of not_supported + unclear, or all
 * unclear). Empty → `unclear`. Conservative: a single `unclear` blocks a `not_supported` verdict. PURE.
 */
export function aggregateVerdict(perTag: ReadonlyArray<Verdict>): Verdict {
  if (perTag.length === 0) return { label: "unclear" };
  if (perTag.some((v) => v.label === "supported")) return { label: "supported" };
  if (perTag.every((v) => v.label === "not_supported")) return { label: "not_supported" };
  return { label: "unclear" };
}

export interface FaithfulnessScore {
  /** Total claims judged (supported + not_supported + unclear). */
  judged: number;
  supported: number;
  not_supported: number;
  unclear: number;
  /** supported / judged — LLM-judged semantic faithfulness. `unclear` counts against it (conservative). */
  faithfulness: number;
}

/** Aggregate per-claim verdicts into the faithfulness scorecard. PURE; 0 (never NaN) on empty input. */
export function scoreFaithfulness(verdicts: ReadonlyArray<Verdict>): FaithfulnessScore {
  let supported = 0;
  let not_supported = 0;
  let unclear = 0;
  for (const v of verdicts) {
    if (v.label === "supported") supported++;
    else if (v.label === "not_supported") not_supported++;
    else unclear++;
  }
  const judged = verdicts.length;
  return { judged, supported, not_supported, unclear, faithfulness: judged === 0 ? 0 : supported / judged };
}

/** The injected live judge: rule one (claim, single-source-text) pair. The real adapter calls a pinned
 *  model at temperature 0 in the gated runner; tests inject a deterministic fake. */
export type JudgeFn = (claim: string, sourceText: string) => Promise<Verdict>;

/**
 * Orchestrate judging across saved answers: resolve each answer's cited claims to per-tag sources, rule
 * each source with the injected judge, and aggregate to one verdict per claim (supported-if-any). Pure
 * except for the injected `judge` — so the wiring is deterministically testable offline and the only
 * live dependency (the model call) is isolated.
 */
export async function judgeAnswers(
  answers: ReadonlyArray<{ id: string; points: FaithAnswerPoint[]; sourceTexts: FaithSourceText[] }>,
  judge: JudgeFn,
): Promise<Array<{ id: string; claims: JudgedClaim[] }>> {
  const out: Array<{ id: string; claims: JudgedClaim[] }> = [];
  for (const a of answers) {
    const claims: JudgedClaim[] = [];
    for (const unit of claimSourcePairs(a.points, a.sourceTexts)) {
      const perTag: Verdict[] = [];
      for (const src of unit.sources) perTag.push(await judge(unit.claim, src.text));
      claims.push({ claim: unit.claim, tags: unit.tags, verdict: aggregateVerdict(perTag) });
    }
    out.push({ id: a.id, claims });
  }
  return out;
}
