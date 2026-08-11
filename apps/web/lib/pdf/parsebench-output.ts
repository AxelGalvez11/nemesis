/**
 * `DocumentModel` → the shape ParseBench scores. SERIALIZATION ONLY.
 *
 * 🔴 NOTHING HERE PARSES ANYTHING, AND THAT SEPARATION IS THE POINT OF THE FILE.
 * The benchmark must measure the parser production runs, not a parser built to
 * be measured. So the pipeline is:
 *
 *     PDF bytes → parseDocument (the production entry point) → DocumentModel
 *                                                            → this file → JSON
 *
 * Everything upstream of this module is untouched production code. Everything in
 * this module is a pure rename of facts the model already holds. If a score moves
 * because of a change in here, that is a reporting change and must be described
 * as one — it is not the parser getting better.
 *
 * 🔴 AND NOTHING BENCHMARK-SPECIFIC MAY LEAK BACKWARDS. No test-case ids, no
 * per-document special casing, no reading of ground truth. This function's only
 * inputs are a model and the page sizes that produced it.
 *
 * PURE.
 */

import { blockToText, type DocBlock, type DocumentModel } from "@nemesis/shared";

/**
 * ParseBench's canonical layout vocabulary, as of the repo read on 2026-08-11
 * (`schemas/layout_ontology.py`). The default evaluation ontology is `basic`,
 * which merges Title and Section-header into one class and folds List-item,
 * Caption and Footnote into Text — so the only distinctions that actually score
 * are Table, Picture, Formula and everything-else.
 */
type CanonicalLabel =
  | "Caption"
  | "Formula"
  | "List-item"
  | "Picture"
  | "Section-header"
  | "Table"
  | "Text";

/**
 * A block kind, said in the benchmark's words.
 *
 * 🔴 `heading` BECOMES `Section-header`, NOT `Title`. Title means the document's
 * own title, and Nemesis does not distinguish that from any other level-1
 * heading — claiming it would be a guess dressed as a label. Under the `basic`
 * ontology the two collapse anyway, so the honest choice costs nothing.
 */
function labelOf(kind: DocBlock["kind"]): CanonicalLabel {
  if (kind === "table") return "Table";
  if (kind === "figure") return "Picture";
  if (kind === "equation") return "Formula";
  if (kind === "caption") return "Caption";
  if (kind === "listItem") return "List-item";
  if (kind === "heading") return "Section-header";
  return "Text";
}

export interface ParseBenchItem {
  type: string;
  md: string;
  value: string;
  /** Unit-relative, 0..1, top-left origin — the model's own convention. */
  bbox?: { x: number; y: number; w: number; h: number; label: string };
}

export interface ParseBenchPage {
  page_number: number;
  width: number | null;
  height: number | null;
  md: string;
  items: ParseBenchItem[];
}

export interface ParseBenchOutput {
  pages: { page_index: number; markdown: string }[];
  layout_pages: ParseBenchPage[];
  markdown: string;
}

/**
 * Render one document.
 *
 * 🔴 PAGE MARKDOWN IS BUILT FROM THE SAME `blockToText` EVERY OTHER CONSUMER
 * USES. Writing a benchmark-only renderer here would mean the thing being scored
 * is not the thing a student's question is answered from — and the score would
 * be a statement about this file rather than about Nemesis.
 *
 * 🔴 A UNIT WITH NO BLOCKS STILL EMITS A PAGE. An absent page and an empty page
 * are different claims: the first says the document is shorter than it is, and
 * every page number after it would be wrong.
 */
export function toParseBench(model: DocumentModel): ParseBenchOutput {
  const byUnit = new Map<number, DocBlock[]>();
  for (const block of model.blocks) {
    const bucket = byUnit.get(block.unit);
    if (bucket) bucket.push(block);
    else byUnit.set(block.unit, [block]);
  }

  const pages: ParseBenchOutput["pages"] = [];
  const layoutPages: ParseBenchPage[] = [];

  model.units.forEach((unit, index) => {
    const blocks = byUnit.get(index) ?? [];
    const rendered = blocks.map((b) => blockToText(b)).filter((t) => t.trim().length > 0);
    const md = rendered.join("\n\n");

    pages.push({ markdown: md, page_index: index });
    layoutPages.push({
      height: unit.size?.height ?? null,
      // 1-based: ParseBench's `page_number` is `ge=1`, while `page_index` above
      // is 0-based. Two fields, two conventions, one document — getting this
      // backwards puts every element on its neighbour's page.
      items: blocks.map((block) => {
        const text = blockToText(block);
        return {
          md: text,
          type: labelOf(block.kind),
          value: text,
          // Only where the format gave one. An invented rectangle would score as
          // a confident wrong answer, which is worse than an absent one.
          ...(block.rect
            ? {
                bbox: {
                  h: block.rect.height,
                  label: labelOf(block.kind),
                  w: block.rect.width,
                  x: block.rect.x,
                  y: block.rect.y,
                },
              }
            : {}),
        };
      }),
      md,
      page_number: index + 1,
      width: unit.size?.width ?? null,
    });
  });

  return {
    layout_pages: layoutPages,
    markdown: pages.map((p) => p.markdown).filter((m) => m.trim().length > 0).join("\n\n"),
    pages,
  };
}
