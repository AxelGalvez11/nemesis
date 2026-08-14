/**
 * LlamaParse's read of a document, as the Nemesis canonical document.
 *
 * 🔴 BENCHMARK CODE, NOT A WIRED LANE. Nothing imports this from `parseDocument`. It exists to
 * answer one question the owner asked precisely — "can LlamaParse output reach knowledge
 * construction without a large amount of provider-specific code?" — by being the code that would
 * be required, so the answer is a measured line count rather than an estimate.
 *
 * 🔴 IT IS ROUGHLY A THIRD OF THE MISTRAL ADAPTER, AND THE REASON IS STRUCTURAL. Mistral returns
 * page markdown plus a labelled-block array whose tables live behind `[tbl-N.html]` references, in
 * three different shapes depending on format — so `mistral-model.ts` + `mistral-tables.ts` have to
 * parse markdown, resolve references, read HTML into cells, AND carry a pipe-table fallback for
 * Office. LlamaParse returns typed items with a level on every heading, a `rows` array on every
 * table, and a box on everything, so the mapping is mostly renaming.
 */

import { buildDocument, type DocBlock, type DocFormat, type DocRect, type DocUnit, type DocumentModel } from "@nemesis/shared";

import { tableFromHtml } from "./mistral-tables";

type PendingBlock = Omit<DocBlock, "id">;

export interface LlamaBox {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface LlamaItem {
  type?: string;
  md?: string;
  value?: string;
  /** Heading depth, 1-based. Present on `heading` items. */
  lvl?: number;
  rows?: string[][];
  html?: string;
  csv?: string;
  isPerfectTable?: boolean;
  bBox?: LlamaBox;
}

export interface LlamaPage {
  page: number;
  width?: number;
  height?: number;
  text?: string;
  md?: string;
  items?: LlamaItem[];
  /** 🔴 THE FIELD THAT DECIDES THE WHOLE PPTX QUESTION. A first-class place for a lecturer's
   *  spoken explanation, which an optical parser cannot see because it is not painted on the
   *  slide. Measured: 13,134 characters recovered from a deck declaring exactly 13,134. */
  slideSpeakerNotes?: string | null;
  slideSectionName?: string | null;
  pageHeaderMarkdown?: string | null;
  pageFooterMarkdown?: string | null;
}

export interface LlamaResult {
  pages: LlamaPage[];
  job_metadata?: { job_pages?: number; job_credits_usage?: number };
}

/** A box in page points to the model's unit-relative 0..1 rectangle. PURE. */
export function rectFromBox(box: LlamaBox | undefined, page: LlamaPage): DocRect | undefined {
  const width = page.width;
  const height = page.height;
  if (!box || !width || !height || width <= 0 || height <= 0) return undefined;
  const { h = 0, w = 0, x = 0, y = 0 } = box;
  if (!(w > 0) || !(h > 0)) return undefined;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { height: clamp(h / height), width: clamp(w / width), x: clamp(x / width), y: clamp(y / height) };
}

/** Which unit kind a format's pages are — the same rule the Mistral lane uses, for the same
 *  reason: a Word file's rendered pagination is a property of a renderer, not of the document. */
function unitKindFor(format: DocFormat): DocUnit["kind"] {
  if (format === "pptx") return "slide";
  if (format === "docx") return "body";
  return "page";
}

/** LlamaParse's answer as a `DocumentModel`, or null when nothing survived. */
export function modelFromLlama(result: LlamaResult, format: DocFormat, title: string | null): DocumentModel | null {
  const paged = format === "pdf" || format === "pptx";
  const kind = unitKindFor(format);
  const stack: Array<{ level: number; text: string }> = [];
  const blocks: PendingBlock[] = [];
  const units: DocUnit[] = [];

  const pages = [...result.pages].sort((a, b) => a.page - b.page);
  for (const [position, page] of pages.entries()) {
    const unit = paged ? position : 0;
    if (paged || units.length === 0) {
      units.push({
        index: unit,
        kind,
        ...(paged ? { label: String(position + 1) } : {}),
        ...(paged && page.width && page.height ? { size: { height: page.height, width: page.width } } : {}),
      });
    }
    const path = () => stack.map((entry) => entry.text);
    const rectOf = (item: LlamaItem) => rectFromBox(item.bBox, page);

    const header = (page.pageHeaderMarkdown ?? "").trim();
    if (header) blocks.push({ headingPath: path(), kind: "pageHeader", text: header, unit });

    for (const item of page.items ?? []) {
      const rect = rectOf(item);
      const withRect = (block: Omit<PendingBlock, "headingPath" | "unit">): PendingBlock =>
        ({ ...block, headingPath: path(), unit, ...(rect ? { rect } : {}) }) as PendingBlock;

      if (item.type === "heading") {
        const level = Math.min(9, Math.max(1, item.lvl ?? 1));
        const text = (item.value ?? item.md ?? "").replace(/^#+\s*/, "").trim();
        if (!text) continue;
        while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
        blocks.push(withRect({ kind: "heading", level, text }));
        stack.push({ level, text });
        continue;
      }
      if (item.type === "table") {
        // 🔴 `html` FIRST, BECAUSE `rows` IS ALREADY FLAT. The HTML carries colspan/rowspan, which
        // is the only way a merged cell reaches `DocTable.cells`; `rows` is the projection and is
        // used when no HTML came back.
        const table = (item.html ? tableFromHtml(item.html) : null)
          ?? (item.rows?.length ? { headerRows: 0, rows: item.rows } : null);
        if (table) blocks.push(withRect({ kind: "table", table, text: "" }));
        continue;
      }
      const text = (item.value ?? item.md ?? "").trim();
      if (text) blocks.push(withRect({ kind: "paragraph", text }));
    }

    // 🔴 THE SPEAKER NOTES, AS CONTENT RATHER THAN METADATA. They are the lecturer explaining the
    // slide, which for a learning system is worth more than the bullets on it. Filed against the
    // slide they belong to, so a citation still resolves to the right place.
    const notes = (page.slideSpeakerNotes ?? "").trim();
    if (notes) blocks.push({ headingPath: path(), kind: "note", text: notes, unit });

    const footer = (page.pageFooterMarkdown ?? "").trim();
    if (footer) blocks.push({ headingPath: path(), kind: "pageFooter", text: footer, unit });
  }

  if (units.length === 0 || blocks.length === 0) return null;
  return buildDocument({ blocks, format, title, units });
}
