"use client";

// DEV-ONLY PREVIEW — the three files the canvas can hand you, built for real.
//
// 🔴 IT EXISTS BECAUSE "IT DOWNLOADED" IS NOT THE SAME AS "IT OPENS". A .docx that Word refuses and
// a 0-byte PDF both download exactly as happily as a good one, and the only way anybody finds out
// is by opening the file — which is the check nobody repeats. `check()` builds each blob with the
// real libraries and reports its file signature, so a broken writer is visible without a download
// dialog, and `window.__exports` makes it runnable from a console or a harness.
//
// The buttons still do the real download, because the save path (the anchor, the revoke delay) is
// the half a signature check cannot see.

import { useState } from "react";

import { docxBlob, downloadDocx, downloadPdf, downloadSheet, pdfBlob, sheetBlob, type SheetData } from "@/lib/export/doc-file";

const MARKDOWN = `# Boundary layer separation

A short document with every shape the writers know about.

## What happens

When the pressure gradient turns adverse, the slowest fluid nearest the wall stops first.

- The velocity profile develops an inflection point
- Reverse flow begins at the wall
- The layer detaches and a wake forms

## Order of events

1. Adverse gradient begins
2. Wall shear falls to zero
3. Separation

Unrecognised markdown, such as | a table | row |, still arrives as prose rather than vanishing.
`;

const SHEET: SheetData = {
  columns: ["Case", "Reynolds number", "Separates?"],
  rows: [
    ["Flat plate, zero gradient", "5.0 × 10⁵", "No"],
    ["Cylinder, subcritical", "1.0 × 10⁵", "Yes, at ~82°"],
    ["Aerofoil, high angle", "3.0 × 10⁶", 'Yes — "stall"'],
  ],
};

/** The first bytes of a file, as text, which is how a format is identified. */
async function signature(blob: Blob, length = 5): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, length).arrayBuffer());
  return Array.from(head, (byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : `\\x${byte.toString(16)}`)).join("");
}

export default function ExportsPreview() {
  const [report, setReport] = useState<string>("");

  const check = async () => {
    const docx = await docxBlob(MARKDOWN, "Boundary layer separation");
    const pdf = await pdfBlob(MARKDOWN, "Boundary layer separation");
    const csv = sheetBlob(SHEET);
    const lines = [
      // A .docx is a ZIP container, so it must start "PK".
      `docx  ${docx.size} bytes  signature ${JSON.stringify(await signature(docx, 2))}  ${(await signature(docx, 2)) === "PK" ? "OK" : "BROKEN"}`,
      `pdf   ${pdf.size} bytes  signature ${JSON.stringify(await signature(pdf, 5))}  ${(await signature(pdf, 5)) === "%PDF-" ? "OK" : "BROKEN"}`,
      // 🔴 THE BOM IS CHECKED ON THE RAW BYTES, NOT ON `blob.text()`, AND THE FIRST VERSION OF THIS
      // LINE GOT IT WRONG. `text()` decodes as UTF-8, and a UTF-8 decoder STRIPS a leading BOM by
      // specification — so a perfectly good file reported "no BOM" and I nearly went and "fixed" a
      // writer that was already correct. In UTF-8 the mark is the three bytes EF BB BF.
      `csv   ${csv.size} bytes  ${(await signature(csv, 3)) === "\\xef\\xbb\\xbf" ? "OK (BOM present)" : "BROKEN (no BOM — Excel will mojibake)"}`,
    ];
    setReport(lines.join("\n"));
    return lines;
  };

  if (typeof window !== "undefined") {
    (window as unknown as { __exports?: () => Promise<string[]> }).__exports = check;
  }

  return (
    // 🔴 `data-workspace` OR THE GLOBAL BUTTON RULE LIES TO YOU — see dev-preview/research-plan.
    <main data-workspace className="mx-auto grid min-h-dvh max-w-2xl content-start gap-4 p-8">
      <p className="text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
        The three files a canvas can hand you, built with the real writers. Check reports each file&apos;s
        signature; the download buttons exercise the save path too.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-full bg-(--ui-action) px-4 py-1.5 text-[length:var(--canvas-text-small)] font-medium text-(--ui-bg-editor)"
          onClick={() => void check()}
          type="button"
        >
          Check
        </button>
        {(
          [
            ["Download .docx", () => downloadDocx(MARKDOWN, "Boundary layer separation")],
            ["Download .pdf", () => downloadPdf(MARKDOWN, "Boundary layer separation")],
            ["Download .csv", () => downloadSheet(SHEET, "Separation cases")],
          ] as const
        ).map(([label, run]) => (
          <button
            className="rounded-full px-4 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary)"
            key={label}
            onClick={() => void run()}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {report && (
        <pre className="m-0 overflow-x-auto rounded-xl bg-(--ui-bg-tertiary) p-4 text-[length:var(--canvas-text-meta)] text-(--ui-text-primary)">
          {report}
        </pre>
      )}
    </main>
  );
}
