"use client";

// The right half of the inspector: what Nemesis believes the document contains.
//
// Three tabs, three different claims, and they are deliberately not the same claim shown three ways:
//
//   Rendered   — the model, drawn. Headings as headings, tables as grids WITH their merges, figures
//                as their actual pixels. This is where "all the right words, the wrong columns"
//                becomes visible, because a flattened table cannot draw itself as a grid.
//   Markdown   — the exact string that travels downstream. Not a pretty-print of the model: the
//                output of `documentToText`, which is what knowledge extraction actually reads.
//   Structure  — the DocumentModel itself: block kind, unit, reading order, headings, rects, spans.
//
// 🔴 NOTHING HERE REPAIRS ANYTHING. Empty cells render empty. A table with one column renders with
// one column. A figure with no description says nobody looked, rather than showing its caption in
// the description's place.

import { useState } from "react";

import {
  blockToText,
  resolveCell,
  tableToMarkdown,
  type DocBlock,
  type DocTable,
  type DocumentModel,
} from "@nemesis/shared";

import type { LabFigureAsset } from "@/lib/lab/report";

type Tab = "rendered" | "markdown" | "structure";

export function ExtractedPane({
  model,
  unit,
  unitText,
  figures,
  fallbackText,
}: {
  model: DocumentModel | null;
  unit: number;
  unitText: string[] | null;
  figures: readonly LabFigureAsset[];
  /** The parse's own `text` when no model was produced. A lane with no structure still read words. */
  fallbackText: string;
}) {
  const [tab, setTab] = useState<Tab>("rendered");

  if (!model) {
    return (
      <div className="p-4">
        <p className="text-sm text-amber-400">
          This lane produced no structure at all — no units, no blocks, no geometry. Everything below
          is the flat text it returned.
        </p>
        <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-neutral-300">{fallbackText || "(nothing)"}</pre>
      </div>
    );
  }

  const blocks = model.blocks.filter((block) => block.unit === unit);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex gap-1 border-b border-neutral-800 px-3 py-2 text-xs">
        {(["rendered", "markdown", "structure"] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`rounded px-2 py-1 capitalize ${tab === name ? "bg-neutral-700 text-neutral-100" : "text-neutral-400 hover:text-neutral-100"}`}
          >
            {name}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-neutral-500">
          {blocks.length} block{blocks.length === 1 ? "" : "s"} on this {model.units[unit]?.kind ?? "unit"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === "rendered" ? <Rendered blocks={blocks} figures={figures} /> : null}
        {tab === "markdown" ? <Markdown blocks={blocks} unitText={unitText?.[unit] ?? null} /> : null}
        {tab === "structure" ? <Structure blocks={blocks} model={model} unit={unit} /> : null}
      </div>
    </div>
  );
}

function Rendered({ blocks, figures }: { blocks: readonly DocBlock[]; figures: readonly LabFigureAsset[] }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-amber-400">Nemesis found nothing at all on this unit.</p>;
  }
  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <div key={block.id}>
          {block.table ? (
            <TableCard block={block} />
          ) : block.figure ? (
            <FigureBlock block={block} figures={figures} />
          ) : block.kind === "heading" ? (
            <p className="font-semibold text-neutral-100">
              <Kind block={block} />
              {block.text}
            </p>
          ) : (
            <p className={block.kind === "note" ? "text-sm text-sky-300" : "text-sm text-neutral-300"}>
              <Kind block={block} />
              {block.text || <span className="text-neutral-600">(empty)</span>}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Kind({ block }: { block: DocBlock }) {
  return (
    <span className="mr-2 rounded bg-neutral-800 px-1 py-0.5 align-middle text-[10px] uppercase tracking-wide text-neutral-400">
      {block.kind}
      {block.level ? ` h${block.level}` : ""}
    </span>
  );
}

/**
 * One table, inspected — Nemesis Lab §2.
 *
 * 🔴 THE GRID IS DRAWN FROM `cells`, WHICH IS TRUTH, RATHER THAN FROM `rows`, WHICH IS ITS
 * PROJECTION. Drawing `rows` would show a merged heading repeated across its span or blanked out,
 * and a lane that LOST the merge would look identical to a lane that kept it — which is precisely
 * the failure this page exists to catch. When a table carries no `cells` at all, that is stated
 * rather than filled in.
 */
function TableCard({ block }: { block: DocBlock }) {
  const table = block.table!;
  const [raw, setRaw] = useState(false);
  const rows = table.rows.length;
  const columns = table.rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const merged = (table.cells ?? []).filter((cell) => (cell.rowSpan ?? 1) > 1 || (cell.colSpan ?? 1) > 1);

  return (
    <div className="rounded border border-neutral-700 bg-neutral-900 p-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-neutral-400">
        <span className="rounded bg-neutral-800 px-1 py-0.5 uppercase tracking-wide">table</span>
        <span>{rows} rows × {columns} columns</span>
        <span>{table.cells ? `${table.cells.length} cells` : "no cell grid — rows only"}</span>
        <span>{table.headerRows} header row{table.headerRows === 1 ? "" : "s"}{table.headerSource ? ` (${table.headerSource})` : ""}</span>
        <span>{merged.length} merged</span>
        {table.name ? <span>name: {table.name}</span> : null}
        {table.continuesFromUnit !== undefined ? <span>continues from unit {table.continuesFromUnit}</span> : null}
        <span>unit {block.unit}</span>
        {block.rect ? (
          <span>
            box {Math.round(block.rect.x)},{Math.round(block.rect.y)} {Math.round(block.rect.width)}×
            {Math.round(block.rect.height)}
          </span>
        ) : (
          <span className="text-neutral-600">no bounding box</span>
        )}
        <button type="button" className="ml-auto underline" onClick={() => setRaw((on) => !on)}>
          {raw ? "hide" : "show"} raw
        </button>
      </div>
      <div className="mt-2 overflow-auto">
        <Grid table={table} rows={rows} columns={columns} />
      </div>
      {table.hiddenRows?.length || table.hiddenColumns?.length ? (
        <p className="mt-2 text-[11px] text-amber-400">
          The source marks {table.hiddenRows?.length ?? 0} row(s) and {table.hiddenColumns?.length ?? 0} column(s)
          hidden. They are kept, not dropped.
        </p>
      ) : null}
      {raw ? (
        <div className="mt-2 space-y-2">
          <Raw label="What travels downstream (tableToMarkdown)" value={tableToMarkdown(table)} />
          <Raw label="The table object, verbatim" value={JSON.stringify(table, null, 2)} />
        </div>
      ) : null}
    </div>
  );
}

/** The grid, honouring spans, with each cell's own coordinates on hover. */
function Grid({ table, rows, columns }: { table: DocTable; rows: number; columns: number }) {
  const drawn = new Set<string>();
  return (
    <table className="border-collapse text-xs">
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row}>
            {Array.from({ length: columns }, (_, column) => {
              const cell = resolveCell(table, row, column);
              if (!cell) {
                return (
                  <td key={column} className="border border-neutral-800 px-2 py-1 text-neutral-700">
                    ·
                  </td>
                );
              }
              const key = `${cell.row}:${cell.column}`;
              // A merged cell resolves at every position it covers; draw it once, at its origin.
              if (drawn.has(key)) return null;
              drawn.add(key);
              const spans = (cell.rowSpan ?? 1) > 1 || (cell.colSpan ?? 1) > 1;
              return (
                <td
                  key={column}
                  rowSpan={cell.rowSpan}
                  colSpan={cell.colSpan}
                  title={`row ${cell.row}, column ${cell.column}${spans ? ` — spans ${cell.rowSpan ?? 1}×${cell.colSpan ?? 1}` : ""}${cell.formula ? ` — formula ${cell.formula}` : ""}`}
                  className={`border px-2 py-1 align-top ${row < table.headerRows ? "bg-neutral-800 font-semibold" : ""} ${spans ? "border-amber-500" : "border-neutral-700"}`}
                >
                  {cell.text || <span className="text-neutral-600">(empty)</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FigureBlock({ block, figures }: { block: DocBlock; figures: readonly LabFigureAsset[] }) {
  const figure = block.figure!;
  const asset = figures.find((candidate) => candidate.entry === figure.ref);
  return (
    <div className="rounded border border-neutral-700 bg-neutral-900 p-3 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-400">
        <span className="rounded bg-neutral-800 px-1 py-0.5 uppercase tracking-wide">figure</span>
        {figure.ref ? <span>ref {figure.ref}</span> : null}
        <span>unit {block.unit}</span>
      </div>
      {asset?.dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.dataUrl} alt="" className="mt-2 max-h-64 border border-neutral-800" />
      ) : null}
      <p className="mt-2 text-neutral-300">
        {figure.description ? (
          figure.description
        ) : figure.skipped ? (
          <span className="text-amber-400">Not examined — {figure.skipped}.</span>
        ) : (
          <span className="text-red-400">Nobody looked at this picture, and nobody decided to skip it.</span>
        )}
      </p>
    </div>
  );
}

function Markdown({ blocks, unitText }: { blocks: readonly DocBlock[]; unitText: string | null }) {
  // `unitTexts` is the shared derivation; falling back to a local join keeps a lane with no unit
  // text readable while being explicit that it is not the same string.
  const value = unitText ?? blocks.map(blockToText).join("\n");
  return (
    <>
      {unitText === null ? (
        <p className="mb-2 text-[11px] text-amber-400">
          This lane produced no per-unit text. Shown below is this unit&apos;s blocks joined locally, which is
          not necessarily what travels downstream.
        </p>
      ) : null}
      <pre className="whitespace-pre-wrap break-words text-xs text-neutral-300">{value || "(nothing)"}</pre>
    </>
  );
}

function Structure({ blocks, model, unit }: { blocks: readonly DocBlock[]; model: DocumentModel; unit: number }) {
  const meta = model.units[unit];
  return (
    <div className="space-y-2 text-xs">
      <div className="rounded border border-neutral-800 bg-neutral-900 p-2 text-[11px] text-neutral-400">
        unit {unit} · kind {meta?.kind ?? "?"} · label {meta?.label ?? "(the author gave none)"} ·{" "}
        {meta?.size ? `${Math.round(meta.size.width)}×${Math.round(meta.size.height)}` : "no size"}
        {meta?.hidden ? " · marked hidden by the source" : ""}
      </div>
      {blocks.map((block, order) => (
        <details key={block.id} className="rounded border border-neutral-800 bg-neutral-900 p-2">
          <summary className="cursor-pointer text-neutral-300">
            <span className="mr-2 text-neutral-500">#{order}</span>
            <span className="mr-2 rounded bg-neutral-800 px-1 py-0.5 text-[10px] uppercase">{block.kind}</span>
            {block.headingPath.length ? (
              <span className="mr-2 text-neutral-500">{block.headingPath.join(" › ")}</span>
            ) : null}
            <span className="text-neutral-400">{block.text.slice(0, 90) || "(no text)"}</span>
            {block.rect ? null : <span className="ml-2 text-neutral-600">no box</span>}
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] text-neutral-400">
            {JSON.stringify(block, null, 2)}
          </pre>
        </details>
      ))}
      {blocks.length === 0 ? <p className="text-amber-400">No blocks on this unit.</p> : null}
    </div>
  );
}

function Raw({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded border border-neutral-800 bg-neutral-950 p-2">
      <summary className="cursor-pointer text-[11px] text-neutral-400">{label}</summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] text-neutral-400">{value}</pre>
    </details>
  );
}
