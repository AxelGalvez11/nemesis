"use client";

// The three files a canvas can hand you: a Word document, a PDF, and a spreadsheet.
//
// 🔴 BUILT IN THE BROWSER AT CLICK TIME, LIKE THE DECK. `deck-download.ts` established the shape and
// the reason: the file is a deterministic function of content + format, so nothing is ever uploaded
// and there is nothing to fetch back. The output row stores the markdown; the bytes are made when
// somebody asks for them.
//
// 🔴 THE LIBRARIES LOAD ON DEMAND. `docx` and `pdf-lib` are together a large amount of JavaScript,
// and a learner who never exports anything must not pay for either on first paint. Both are dynamic
// imports inside the function that needs them — the same rule `deck-download.ts` follows for
// pptxgenjs.

import { docBlocks } from "./doc-blocks";

/** Rows a spreadsheet is built from. The model's JSON is parsed into this before it gets here. */
export interface SheetData {
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoked on a delay: revoking synchronously races the browser actually starting the download in
  // some engines, and a lost race is a 0-byte file with no error. Same reason as deck-download.ts.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A filename that survives every filesystem, from a title somebody typed. */
export function docFilename(title: string, extension: string): string {
  const stem = title.replace(/[^\w\- ]+/g, "").trim().slice(0, 80);
  return `${stem || "document"}.${extension}`;
}

// ---------------------------------------------------------------- Word

/**
 * 🔴 THE BYTES AND THE SAVE ARE SEPARATE FUNCTIONS, AND THAT IS SO THE BYTES CAN BE CHECKED. A
 * writer that only ever downloads can only be verified by a person clicking and opening the file in
 * Word, which is exactly the check nobody repeats. Split, a harness can build the blob and assert
 * the file signature — `PK` for a .docx, `%PDF-` for a PDF — without a download dialog.
 */
export async function docxBlob(markdown: string, title: string): Promise<Blob> {
  const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
  const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const;

  const body = docBlocks(markdown).map((block) => {
    if (block.kind === "heading") {
      return new Paragraph({ heading: HEADINGS[block.level - 1], spacing: { after: 120, before: 240 }, text: block.text });
    }
    if (block.kind === "bullet") {
      return new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, text: block.text });
    }
    if (block.kind === "number") {
      // 🔴 THE NUMBER IS WRITTEN INTO THE TEXT RATHER THAN USING `numbering`. Word's numbering needs
      // a document-level definition, and a reference to one that does not exist opens as a blank
      // bullet. `doc-blocks.ts` has already made the count coherent, so printing it is honest.
      return new Paragraph({ indent: { left: 360 }, spacing: { after: 80 }, text: `${block.index}. ${block.text}` });
    }
    return new Paragraph({ spacing: { after: 160 }, text: block.text });
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ bold: true, size: 40, text: title })],
            spacing: { after: 240 },
          }),
          ...body,
        ],
      },
    ],
  });

  // 🔴 `toBlob`, NOT `toBuffer`. Packer.toBuffer needs Node's Buffer, which does not exist here —
  // it returns a broken value in the browser rather than throwing, so the file downloads and will
  // not open. The existing `lib/export/docx.ts` uses toBuffer because it runs in a route handler.
  return Packer.toBlob(doc);
}

export async function downloadDocx(markdown: string, title: string): Promise<void> {
  saveBlob(await docxBlob(markdown, title), docFilename(title, "docx"));
}

// ---------------------------------------------------------------- PDF

const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;
const MARGIN = 56;
const WIDTH = PAGE_W - MARGIN * 2;

export async function pdfBlob(markdown: string, title: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  // 🔴 BASE-14 FONTS ONLY, the same call `lib/export/pdf.ts` already made: every PDF viewer ships
  // them, so nothing is embedded and the file stays small with no font licence to think about.
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  /** Greedy wrap against the real measured width, because a character count is wrong for any
   *  proportional font — "iiii" and "MMMM" are not the same width. */
  const wrap = (text: string, font: typeof body, size: number, width: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the column would loop forever if it were re-tested, so it is
      // placed as its own line and allowed to overhang rather than dropped.
      line = word;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  const write = (text: string, { font = body, gap = 6, indent = 0, size = 11 } = {}) => {
    for (const line of wrap(text, font, size, WIDTH - indent)) {
      if (y - size < MARGIN) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
      }
      page.drawText(line, { color: rgb(0.05, 0.05, 0.05), font, size, x: MARGIN + indent, y: y - size });
      y -= size * 1.45;
    }
    y -= gap;
  };

  write(title, { font: bold, gap: 14, size: 20 });
  for (const block of docBlocks(markdown)) {
    if (block.kind === "heading") {
      y -= 6;
      write(block.text, { font: bold, gap: 4, size: block.level === 1 ? 15 : block.level === 2 ? 13 : 12 });
    } else if (block.kind === "bullet") {
      write(`•  ${block.text}`, { gap: 2, indent: 14 });
    } else if (block.kind === "number") {
      write(`${block.index}.  ${block.text}`, { gap: 2, indent: 14 });
    } else {
      write(block.text, { gap: 8 });
    }
  }

  // 🔴 COPIED INTO A FRESH ArrayBuffer. pdf-lib returns `Uint8Array<ArrayBufferLike>`, and
  // `ArrayBufferLike` includes SharedArrayBuffer, which `BlobPart` does not accept. Slicing the
  // underlying buffer is what narrows it, and it costs one copy of a document-sized array.
  const bytes = await pdf.save();
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function downloadPdf(markdown: string, title: string): Promise<void> {
  saveBlob(await pdfBlob(markdown, title), docFilename(title, "pdf"));
}

// ---------------------------------------------------------------- spreadsheet

/**
 * One CSV cell.
 *
 * 🔴🔴 THE QUOTING IS THE WHOLE FORMAT, AND GETTING IT WRONG SILENTLY CORRUPTS THE FILE. A cell
 * holding a comma splits into two columns; a cell holding a quote ends the field early; a cell
 * holding a newline ends the ROW. Each is a spreadsheet that opens successfully and is wrong, which
 * is worse than one that refuses to open. RFC 4180: wrap when any of the three appear, and double
 * every internal quote.
 */
function csvCell(value: string): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function sheetCsv({ columns, rows }: SheetData): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // 🔴 CRLF, WHICH IS WHAT RFC 4180 SAYS AND WHAT EXCEL ON WINDOWS EXPECTS. Bare newlines open fine
  // almost everywhere and then produce one giant row in some Excel builds.
  return lines.join("\r\n");
}

export function sheetBlob(data: SheetData): Blob {
  // 🔴 THE BOM IS NOT DECORATION, AND IT IS WRITTEN AS `\uFEFF` RATHER THAN AS THE CHARACTER —
  // the literal is invisible, so it is silently lost by any tool that touches this file, which is
  // exactly what happened on the first draft. The dev-preview harness caught it. Without `﻿`, Excel reads the file as the system's legacy
  // codepage and every accented character, dash and symbol arrives mojibake — the single most
  // common "your export is broken" report there is. It costs three bytes.
  return new Blob([`\uFEFF${sheetCsv(data)}`], { type: "text/csv;charset=utf-8" });
}

export async function downloadSheet(data: SheetData, title: string): Promise<void> {
  saveBlob(sheetBlob(data), docFilename(title, "csv"));
}
