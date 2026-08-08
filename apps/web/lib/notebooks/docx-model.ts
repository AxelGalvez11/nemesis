/**
 * Word's first producer of the canonical document model.
 *
 * 🔴 THIS IS THE STEP PHASE 3 WAS MISSING. The structure reader already resolved
 * headings, numbering, grids and heading paths — and then `extractDocxText`
 * rendered them back to a string and threw the structure away at exactly the
 * boundary the old tag strip used to sit at. The recovery numbers (8,345 of 8,355
 * cells, 2,116 of 2,266 markers) were true about the reader and false about what
 * any model, index or citation ever received.
 *
 * 🔴 ONE UNIT, KIND `body`, AND NO PAGES ANYWHERE.
 * Word paginates at layout time; the file holds no page boundaries. So the model
 * gets a single unit that says what it is, and every block belongs to it. The
 * truthful address of a sentence in a .docx is its block index and its heading
 * path — which is exactly what `describeLocator` will print, because a `body`
 * unit renders no number at all.
 *
 * PURE. No zip, no I/O.
 */

import { buildDocument, type DocBlock, type DocumentModel } from "@nemesis/shared";

import type { DocxDocument } from "./docx-structure";

/**
 * Turn the Word structure into the canonical model.
 *
 * Block order is preserved exactly: it is reading order, and reading order is
 * what makes a locator mean anything.
 */
export function docxToModel(doc: DocxDocument, title: string | null): DocumentModel {
  const blocks: Omit<DocBlock, "id">[] = doc.blocks.map((block) => {
    const base = {
      headingPath: block.headingPath,
      text: block.text,
      unit: 0,
    };
    if (block.kind === "table") {
      return {
        ...base,
        kind: "table" as const,
        table: {
          // Word states its header rows; when it states none, this is 0 and the
          // renderer draws no separator rather than promoting a data row.
          headerRows: block.headerRows ?? 0,
          rows: block.rows ?? [],
        },
        // A table's `text` is its rendered grid in the old shape. The canonical
        // model derives that from `table` instead, so carrying the pre-rendered
        // string too would mean two renderings of one grid — and the one that
        // reached a model would depend on which field a consumer happened to
        // read.
        text: "",
      };
    }
    if (block.kind === "heading") {
      return { ...base, kind: "heading" as const, level: block.level ?? 1 };
    }
    if (block.kind === "figure") {
      return {
        ...base,
        // 🔴 NO `skipped` REASON, DELIBERATELY. `figureCoverageOf` maps a figure
        // with neither a description nor a stated reason to `not-examined`, which
        // is what makes a document full of diagrams read as PARTIAL instead of
        // complete. Writing `decorative` here would mean "we know it is a bullet
        // or a rule" — we do not know that, and the lie would be free of charge
        // to us and expensive to the student.
        figure: block.ref ? { ref: block.ref } : {},
        kind: "figure" as const,
        // A figure's text is its caption. Word attaches none.
        text: "",
      };
    }
    if (block.kind === "equation") {
      return { ...base, kind: "equation" as const };
    }
    if (block.kind === "listItem") {
      return {
        ...base,
        depth: block.depth ?? 0,
        kind: "listItem" as const,
        ...(block.marker ? { marker: block.marker } : {}),
      };
    }
    return { ...base, kind: "paragraph" as const };
  });

  return buildDocument({
    blocks,
    format: "docx",
    title,
    // 🔴 `body`, NOT `page`. See the header comment. A test asserts no Word
    // locator can ever render a number.
    units: [{ index: 0, kind: "body" }],
  });
}
