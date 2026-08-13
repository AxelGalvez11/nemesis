// Whether the extraction behind a canvas can be TRUSTED enough to mint knowledge from it.
//
// 🔴 THIS IS NOT COVERAGE, AND IT MUST NEVER BECOME COVERAGE AGAIN. `policyOwnsCanvas` asks "did we
// account for ALL of this document?" — a whole-document question. This asks something narrower and
// prior: "did we read what we read RELIABLY?" The two were fused while ownership was whole-page,
// because a policy that REPLACED the page had to account for the page. Under composition the policy
// contributes a task BESIDE unsupported material, so a whole-document question deciding a
// per-knowledge action answers "no" for every real document — measured, it refused 6 of 6.
//
// 🔴 THE INPUT TYPE IS THE GUARD, NOT THE COMMENT. `knowledgeProductionFor` takes an object holding
// `outcome` and nothing else. There is no coverage in scope to gate on, so reintroducing a coverage
// veto here is not merely discouraged — it does not typecheck without changing this signature, which
// is a thing a reviewer sees. Same move as `AnswerSink` being a union: make the defect
// unrepresentable rather than unlikely.
//
// 🔴 AND THE UNREPRESENTED FACT DOES NOT DISAPPEAR — IT CHANGES JOB. `coverage.unrepresented` stays
// computed, stays on `CanvasKnowledge`, and stays reported to the surface as material this lane
// cannot teach. It moves from GATE to DISCLOSURE. Producing objectives for the knowledge we did
// extract is never a claim that the document is covered, and nothing here may ever be read as one.

import type { ExtractionOutcome } from "./knowledge-extraction";

/**
 * Why knowledge will not be minted from this canvas.
 *
 * Named rather than left to be guessed from a `false`, for the same reason `OwnershipRefusal` is:
 * "we could not read it at all" and "we read it and something was lost on the way in" are different
 * situations with different fixes, and only one of them is a parse bug.
 */
export type ProductionRefusal =
  /** Nothing durable to read. Not a failure — there is simply no source with a library row. */
  | "no-durable-source"
  /** Read, but something was lost getting here: a flattened grid, an undescribed figure, a refused
   *  delimiter. What survived may be right; we cannot tell, so we do not mint from it.
   *
   *  🔴 THIS REFUSES THE WHOLE CANVAS AND THAT OVER-REFUSAL IS DELIBERATE. `outcome` is the WORST
   *  result across every source, so one degraded source refuses three clean ones alongside it. It
   *  is the coarseness `PARSER-003` removes: once unit locality survives the boundary, `degraded`
   *  refuses the CHART rather than the chapter it sits in. Do not soften it before that lands. */
  | "extraction-degraded"
  /** Not read at all. What the source holds is unknown, and unknown is not empty. */
  | "extraction-failed";

/**
 * May knowledge be minted from what this canvas's extraction produced?
 *
 * A union rather than a boolean plus a nullable reason, so "refused" cannot be represented without
 * saying why — the shape that would otherwise let a refusal reach a surface with nothing to show
 * for it.
 */
export type KnowledgeProduction =
  | { produce: true }
  | { produce: false; refusal: ProductionRefusal };

/**
 * The trust decision, and the whole of it.
 *
 * Total over its input by construction: every `ExtractionOutcome` maps to exactly one verdict, so a
 * new outcome cannot be added upstream and silently fall through to "produce". Every uncertainty
 * resolves toward refusing — `complete` is the only value that mints anything.
 */
export function knowledgeProductionFor(input: {
  outcome: ExtractionOutcome | "no-durable-source";
}): KnowledgeProduction {
  switch (input.outcome) {
    case "complete":
      return { produce: true };
    case "degraded":
      return { produce: false, refusal: "extraction-degraded" };
    case "failed":
      return { produce: false, refusal: "extraction-failed" };
    case "no-durable-source":
      return { produce: false, refusal: "no-durable-source" };
  }
}
