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

import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import { ArtifactCard } from "@/components/workspace/learn/artifact-card";
import { OutputPreview } from "@/components/workspace/learn/output-preview";
import { docxBlob, downloadDocx, downloadPdf, downloadSheet, pdfBlob, sheetBlob, type SheetData } from "@/lib/export/doc-file";
import type { CanvasOutput } from "@/lib/learn/canvas-model";

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

## Compared

| Feature | What causes it | What you observe |
| --- | --- | --- |
| Spherical shape | Surface area minimisation | A free bubble rounds itself |
| Rainbow colours | Thin-film interference | Bands shift with angle |
| Higher pressure | Curved surface under tension | Small bubbles are high-pressure |

A line of pipes with no separator under it, such as | this |, is still prose.
`;

const SHEET: SheetData = {
  columns: ["Case", "Reynolds number", "Separates?"],
  rows: [
    ["Flat plate, zero gradient", "5.0 × 10⁵", "No"],
    ["Cylinder, subcritical", "1.0 × 10⁵", "Yes, at ~82°"],
    ["Aerofoil, high angle", "3.0 × 10⁶", 'Yes — "stall"'],
  ],
};

/** Draws a real molecule and reports the PNG's size, because "it compiled" says nothing about
 *  whether smiles-drawer produced a picture. */
async function structureCheck(): Promise<string | null> {
  const { structurePng } = await import("@/lib/export/structure-image");
  const data = await structurePng("smiles", "OCC1OC(O)C(O)C(O)C1O", 1);
  if (!data?.startsWith("data:image/png;base64,")) return null;
  return `${Math.round((data.length * 3) / 4 / 1024)}KB  OK (a real drawing)`;
}

/**
 * Builds the real .pptx from the deck fixture and reports whether the molecule made it INSIDE.
 *
 * 🔴 A .pptx IS A ZIP, and a zip lists its entry names uncompressed — so `ppt/media/` appearing in
 * the bytes is proof that a picture was embedded, not merely that the plan mentioned one. Checking
 * the file size alone would pass on a deck that silently dropped every drawing.
 */
async function deckCheck(): Promise<string> {
  const plan = MADE.find((output) => output.deck)?.deck;
  if (!plan) return "BROKEN (no deck fixture)";
  const { withStructures } = await import("@/lib/export/deck-download");
  const { buildDeckPptx } = await import("@/lib/export/deck-pptx");
  const drawn = await withStructures(plan);
  const blob = (await buildDeckPptx(drawn, { credit: "Made with Nemesis" })) as Blob;
  const raw = new TextDecoder("latin1").decode(await blob.arrayBuffer());
  const media = (raw.match(/ppt\/media\//g) ?? []).length;
  return `${Math.round(blob.size / 1024)}KB  ${drawn.figures.length} figure(s), ${media} media entr${media === 1 ? "y" : "ies"}  ${media > 0 ? "OK" : "BROKEN (no picture reached the file)"}`;
}

/** The first bytes of a file, as text, which is how a format is identified. */
async function signature(blob: Blob, length = 5): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, length).arrayBuffer());
  return Array.from(head, (byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : `\\x${byte.toString(16)}`)).join("");
}

/** Every field a DeckSlide needs, so the fixtures below only state what they are about. */
const SLIDE = {
  chart: "column" as const,
  columns: [],
  data: [],
  figure: 0,
  layout: "bullets" as const,
  leftHeading: "",
  note: "",
  points: [],
  quoteAttribution: "",
  rightHeading: "",
  rightPoints: [],
  rows: [],
  statLabel: "",
  statValue: "",
  subtitle: "",
  takeaway: "",
  title: "",
  unit: "",
};

const MADE: CanvasOutput[] = [
  { createdAt: "", id: "a1", kind: "pdf", markdown: MARKDOWN, title: "The hidden physics of soap bubbles" },
  { createdAt: "", id: "a2", kind: "document", markdown: MARKDOWN, title: "Soap bubbles, written up" },
  { createdAt: "", id: "a3", kind: "sheet", sheet: SHEET, title: "Separation cases" },
  {
    createdAt: "",
    deck: {
      figures: [],
      references: [],
      slides: [
        { ...SLIDE, layout: "cover", subtitle: "How a cell gets energy out of glucose", title: "Glycolysis" },
        {
          ...SLIDE,
          points: ["Glucose is phosphorylated twice", "The six-carbon sugar is split in two", "Each half is oxidised to pyruvate"],
          takeaway: "Two ATP are spent before any are made.",
          title: "The pathway in three moves",
        },
        {
          ...SLIDE,
          points: ["ATP is spent before any is made"],
          structure: {
            caption: "Hexokinase traps glucose in the cell",
            notation: "reaction-smiles" as const,
            resolvedFrom: { id: "5793", name: "glucose", provider: "pubchem" as const },
            value: "OCC1OC(O)C(O)C(O)C1O>>OCC1OC(O)C(O)C(O)C1OP(=O)(O)O",
          },
          takeaway: "The phosphate is what stops glucose leaving again.",
          title: "Step one: glucose is phosphorylated",
        },
        {
          ...SLIDE,
          points: ["Six carbons, one ring"],
          structure: {
            caption: "Glucose",
            notation: "smiles" as const,
            resolvedFrom: { id: "5793", name: "glucose", provider: "pubchem" as const },
            value: "OCC1OC(O)C(O)C(O)C1O",
          },
          title: "The molecule itself",
        },
        { ...SLIDE, layout: "closing", points: ["Net: 2 ATP, 2 NADH, 2 pyruvate"], title: "What to remember" },
      ],
      subtitle: "",
      title: "Glycolysis",
    },
    id: "a4",
    kind: "slides",
    title: "Glycolysis",
  },
];

export default function ExportsPreviewPage() {
  // 🔴 INSIDE THE REAL SHELL, because half of what this harness checks is what the shell DOES when
  // a panel docks: the sidebar has to collapse to the rail and come back. Rendered bare, that
  // behaviour has nowhere to happen and would have to be taken on trust.
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <ExportsPreview />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}

function ExportsPreview() {
  const [report, setReport] = useState<string>("");
  const [open, setOpen] = useState<CanvasOutput | null>(null);

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
      `png   ${(await structureCheck()) ?? "BROKEN (no data URI)"}`,
      `pptx  ${await deckCheck()}`,
      `csv   ${csv.size} bytes  ${(await signature(csv, 3)) === "\\xef\\xbb\\xbf" ? "OK (BOM present)" : "BROKEN (no BOM — Excel will mojibake)"}`,
    ];
    setReport(lines.join("\n"));
    // 🔴 THE PDF IS ALSO OPENED, because a byte count proves the table changed the file and nothing
    // about whether it is READABLE. A blob URL renders in the browser's own viewer, which is the
    // same renderer the learner's machine will use.
    (window as unknown as { __pdfUrl?: string }).__pdfUrl = URL.createObjectURL(pdf);
    return lines;
  };

  if (typeof window !== "undefined") {
    (window as unknown as { __exports?: () => Promise<string[]> }).__exports = check;
  }

  return (
    // 🔴 `data-workspace` OR THE GLOBAL BUTTON RULE LIES TO YOU — see dev-preview/research-plan.
    <main data-workspace className="mx-auto grid h-full max-w-2xl content-start gap-4 overflow-y-auto p-8">
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
      {/* The hand-over card, as it appears in the canvas flow, and the reader it opens. */}
      <div className="grid gap-2 border-t border-(--ui-stroke-tertiary) pt-6">
        {MADE.map((output) => (
          <ArtifactCard key={output.id} onOpen={() => setOpen(output)} output={output} />
        ))}
      </div>
      {open && <OutputPreview onClose={() => setOpen(null)} output={open} />}
      {report && (
        <pre className="m-0 overflow-x-auto rounded-xl bg-(--ui-bg-tertiary) p-4 text-[length:var(--canvas-text-meta)] text-(--ui-text-primary)">
          {report}
        </pre>
      )}
    </main>
  );
}
