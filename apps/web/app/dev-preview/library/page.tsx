"use client";

// DEV-ONLY PREVIEW — the Library canvas manager, without the auth gate.
//
// 🔴 IT SUBSTITUTES THE ROWS, NOT THE COMPONENT. `CanvasManager` renders exactly as the real
// route renders it; only where the rows come from is swapped, through the same seam the query's
// tests use. A screenshot of a differently-assembled surface would prove nothing about the real
// one.

import { CanvasManager } from "@/components/workspace/library/canvas-manager";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { WorkspaceShell } from "@/components/workspace/shell/workspace-shell";
import type { CanvasTable } from "@/lib/library/canvas-index";

// `createdAt` is present here for the same reason the canvas rows carry one: without it the
// preview renders an em dash where production renders a date, and a preview that is missing a
// column is exactly the kind of screenshot that gets read as "the column is broken".
const FOLDERS = [
  { createdAt: "2026-07-28T09:00:00.000Z", id: "f-fall", name: "Fall 2026", parentId: null },
  { createdAt: "2026-08-02T09:00:00.000Z", id: "f-phcy", name: "PHCY 2105", parentId: "f-fall" },
  { createdAt: "2025-11-14T09:00:00.000Z", id: "f-pharm", name: "Pharmacology", parentId: null },
];

const TITLES = [
  "Hypertension pharmacotherapy",
  "Diabetes pharmacotherapy",
  "How a four-stroke diesel engine works",
  "Contract formation — offer and acceptance",
  "Beam deflection under distributed load",
  "Community IPPE exam prep",
  "Renal physiology — the nephron",
  "Statistical power and sample size",
];

interface Row {
  id: string;
  title: string;
  state: string;
  updated_at: string;
  created_at: string;
  pinned_at: string | null;
  folder_id: string | null;
  deleted: boolean;
}

/** 84 canvases, so the surface shows its own truncation rather than a tidy short list. */
const ROWS: Row[] = Array.from({ length: 84 }, (_, index) => ({
  // Spread over a year so the Created column shows real variety rather than 84 copies of today.
  created_at: new Date(Date.now() - index * 4 * 86_400_000).toISOString(),
  deleted: false,
  folder_id: index < 2 ? "f-phcy" : index < 4 ? "f-pharm" : null,
  id: `preview-${index}`,
  pinned_at: index === 0 ? "2026-08-12T00:00:00.000Z" : null,
  state: "learn",
  title: TITLES[index] ?? `Lecture ${index - TITLES.length + 1} — working notes`,
  updated_at: new Date(Date.now() - index * 43_200_000).toISOString(),
}));

/** Nulls sort last in both directions, matching `nullsFirst: false`. */
function compare(a: unknown, b: unknown, ascending: boolean): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return (a < b ? -1 : 1) * (ascending ? 1 : -1);
}

/** The same shape the real query talks to, behaving the way the database does.
 *
 *  🔴 ORDER KEYS ACCUMULATE. An earlier version re-sorted on every `.order()` call, so the
 *  trailing unique tiebreaker won outright and this preview rendered the library in `id` order —
 *  0, 1, 10, 11 — which is how the mistake was spotted at all. */
function previewTable(): CanvasTable {
  const make = (current: Row[], orders: { column: string; ascending: boolean }[]): CanvasTable => ({
    eq: (column, value) =>
      make(current.filter((row) => (row as unknown as Record<string, unknown>)[column] === value), orders),
    ilike: (column, pattern) => {
      const needle = pattern.replace(/^%|%$/g, "").replace(/\\(.)/g, "$1").toLowerCase();
      return make(
        current.filter((row) =>
          String((row as unknown as Record<string, unknown>)[column] ?? "")
            .toLowerCase()
            .includes(needle),
        ),
        orders,
      );
    },
    is: (column, value) =>
      make(current.filter((row) => (row as unknown as Record<string, unknown>)[column] === value), orders),
    order: (column, options) => make(current, [...orders, { ascending: options?.ascending ?? true, column }]),
    range: (from, to) => {
      const sorted = [...current].sort((left, right) => {
        for (const key of orders) {
          const result = compare(
            (left as unknown as Record<string, unknown>)[key.column],
            (right as unknown as Record<string, unknown>)[key.column],
            key.ascending,
          );
          if (result !== 0) return result;
        }
        return 0;
      });
      // 🔴 THE PREVIEW ANSWERS SLOWLY ON PURPOSE. An in-memory array resolves in the same tick,
      // so the placeholder rows would be mounted and unmounted before a single frame was painted
      // — and the one state this harness exists to let anyone LOOK at would be the one state it
      // could never show. 450ms is roughly what the real query costs over a cold connection.
      return new Promise((resolve) =>
        setTimeout(() => resolve({ count: sorted.length, data: sorted.slice(from, to + 1), error: null }), 450),
      );
    },
    select: () => make(current, orders),
  });
  return make(ROWS, []);
}

export default function LibraryPreviewPage() {
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <WorkspaceShell>
        <CanvasManager seedFolders={FOLDERS} table={previewTable} userId="preview-user" />
      </WorkspaceShell>
    </WorkspacePreviewProvider>
  );
}
