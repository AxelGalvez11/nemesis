// The material the causal lane reads, built from the CANONICAL PARSE rather than from canvas-local
// excerpt state.
//
// 🔴🔴 THE DEAD PARAMETER WAS THE BUG, AND IT IS MEASURED. `mechanismsFor` declares `contexts` —
// every source's canonical parse, already loaded one screen above — and never read it. It handed
// `canvas.sources` to the causal lane instead, and those carry excerpts built whenever the file was
// first attached. Measured on production 2026-08-16: 555 of 790 stored canvas excerpts carry no
// `unitId` at all. `locate()` in `causal-grounded.ts` refuses an excerpt with no unit as
// "unanchorable", so on 4 of the 11 canvases that hold material EVERY causal edge was refused before
// the model's reading was consulted at all — and those four are the real lectures (128, 136, 167 and
// 124 excerpts each), while the seven that were fully anchorable are mostly small acceptance
// fixtures. The lane could not have produced one mechanism from the owner's actual coursework
// however well it read. Every other knowledge lane in `canvas-knowledge.ts` already reads
// `contexts`; the causal lane was the only one reading canvas-local state.
//
// Rebuilt from the context, every excerpt carries its unit: measured across all 14 real production
// parses, `anchorable === total` on every one. Measured end to end on the owner's diabetes lecture,
// the same document goes from a guaranteed 0 to real grounded mechanisms.
//
// 🔴 A FRESH VIEW, NEVER A REWRITE OF THE CANVAS'S OWN EXCERPTS. A canvas citation resolves by
// excerpt id, so re-keying the stored list would silently point existing `SourceRef`s at different
// text — "a locator that passes every check and points at nothing", which this codebase is emphatic
// is worse than no locator. Nothing here is persisted. It lives for one model call, and the only
// thing that outlives it is the durable `unitId` anchor each edge is built from.
//
// 🔴 AND IT DOES NOT PRE-FILTER THE MATERIAL, BECAUSE THAT WAS TRIED AND MEASURED AS A REGRESSION.
// This document's bullet glyph is recovered by the PDF reader as the letter "l", so 61 of the
// diabetes lecture's 162 excerpts are 3 characters or fewer and its median excerpt is 9 characters —
// which looks exactly like material worth cleaning up before spending a model call on it. Dropping
// the units that cannot carry a claim (single characters, page numbers, date stamps) cut the prompt
// roughly in half and collapsed the output to ZERO on 3 documents across 6 runs, against 2, 2, 56
// and 15 kept objects for the same documents unfiltered. Whatever those fragments contribute, the
// model is using them, and a tidier prompt that teaches nothing is not an improvement. Left in, with
// the measurement recorded, so nobody re-derives the idea from how the material looks.

import { excerptsFromSourceContext } from "./canvas-grounding";
import type { CanvasSource } from "./canvas-model";
import type { SourceContext } from "@/lib/sources/source-context";

/**
 * Every source this canvas holds, as the causal lane should see it.
 *
 * 🔴 A SOURCE WITH NO CANONICAL PARSE IS LEFT OUT RATHER THAN PASSED THROUGH UNANCHORED. Its
 * excerpts could still be shown to a model, and every edge read from them would then be refused one
 * layer down for having no durable locator — the same zero, reached later, having paid a model call
 * for it. An absent source is the honest input.
 */
export function causalMaterial(
  sources: readonly CanvasSource[],
  contexts: readonly SourceContext[],
): CanvasSource[] {
  const byLibraryId = new Map(contexts.map((context) => [context.sourceId, context] as const));

  return sources.flatMap((source) => {
    const context = source.librarySourceId ? byLibraryId.get(source.librarySourceId) : undefined;
    if (!context) return [];

    const excerpts = excerptsFromSourceContext(source.id, context);
    if (excerpts.length === 0) return [];

    // 🔴 THE CANVAS'S OWN `id` AND `title` ARE KEPT. `groundingBlock` prints them, and the ids are
    // what the model is told to cite; only the excerpts are rebuilt.
    return [{ ...source, excerpts }];
  });
}
