// The Library's list has to be able to find a canvas it is not currently showing.
//
// 🔴 THE DEFECT THIS PINS. `listCanvases` is `.limit(200)` with no paging, and the home surface
// filters that array in the browser. On the landing page that is invisible. In a Library — a
// surface whose entire job is finding things — a learner past 200 canvases would type a title
// they can see in their own account and be told nothing matched.
//
// 🔴 AND WHY THE FAKE IS STRICT. A server-side filter and a client-side one read almost
// identically at the call site, so a test that only checks "the right row came back" passes for
// both as soon as the fixture is small. This fake enforces the database's real semantics —
// filters and count apply to the WHOLE table, `range` slices afterwards — and the last test in
// this file runs the naive implementation through the same fixture to prove the instrument can
// still fail. Without that control this file would assert vocabulary, not behaviour.

import assert from "node:assert/strict";
import { test } from "node:test";

import { PAGE_SIZE, searchCanvases, type CanvasTable } from "./canvas-index";

// ------------------------------------------------------------------ the fixture

interface Row {
  id: string;
  title: string;
  state: string;
  updated_at: string;
  pinned_at: string | null;
  folder_id: string | null;
  deleted: boolean;
}

/** 250 canvases. The one worth finding sits at index 240 — well beyond the 200-row cap, and
 *  beyond the first page of any sane page size. */
const NEEDLE = "Hypertension pharmacotherapy";

function library(): Row[] {
  return Array.from({ length: 250 }, (_, index) => ({
    deleted: false,
    folder_id: index % 5 === 0 ? "folder-a" : null,
    id: `canvas-${String(index).padStart(3, "0")}`,
    // Most recent first means index 0 is newest, so a high index is an OLD canvas — exactly the
    // one a truncated list drops.
    pinned_at: null,
    state: "learn",
    title: index === 240 ? NEEDLE : `Canvas number ${index}`,
    updated_at: new Date(Date.UTC(2026, 0, 1) - index * 86_400_000).toISOString(),
  }));
}

/** Nulls sort last in both directions, matching `nullsFirst: false`. */
function compare(a: unknown, b: unknown, ascending: boolean): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return (a < b ? -1 : 1) * (ascending ? 1 : -1);
}

/** A Supabase-shaped builder that behaves like the database: every filter narrows the whole
 *  table, `count` is over the narrowed set, and `range` slices only at the end.
 *
 *  🔴 ORDER KEYS ACCUMULATE — THEY DO NOT RE-SORT. The first version of this fake applied a full
 *  sort on every `.order()` call, so the LAST key silently won and the earlier ones were thrown
 *  away. PostgREST appends each key to one composite `ORDER BY`. That difference made the fixture
 *  come back ordered by `id` alone, which is what a rendered preview of this data actually showed
 *  — and it meant the paging and tiebreaker tests below were passing against semantics the
 *  database does not have. An instrument that models the system wrongly proves the wrong thing. */
function fakeTable(rows: Row[]): { table: () => CanvasTable; calls: string[] } {
  const calls: string[] = [];

  const make = (current: Row[], orders: { column: string; ascending: boolean }[]): CanvasTable => ({
    eq(column, value) {
      calls.push(`eq:${column}`);
      return make(
        current.filter((row) => (row as unknown as Record<string, unknown>)[column] === value),
        orders,
      );
    },
    ilike(column, pattern) {
      calls.push(`ilike:${column}`);
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
    is(column, value) {
      calls.push(`is:${column}`);
      return make(
        current.filter((row) => (row as unknown as Record<string, unknown>)[column] === value),
        orders,
      );
    },
    order(column, options) {
      calls.push(`order:${column}`);
      return make(current, [...orders, { ascending: options?.ascending ?? true, column }]);
    },
    range(from, to) {
      calls.push(`range:${from}-${to}`);
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
      return Promise.resolve({ count: sorted.length, data: sorted.slice(from, to + 1), error: null });
    },
    select(_columns, _options) {
      return make(current, orders);
    },
  });

  return { calls, table: () => make(rows, []) };
}

// ------------------------------------------------------------------ the tests

test("finds a canvas that sits beyond the 200-row cap", async () => {
  const { table } = fakeTable(library());
  const result = await searchCanvases("user-1", { search: "Hypertension" }, table);

  assert.equal(result.total, 1, "the count must be over the whole library, not over one page");
  assert.deepEqual(
    result.rows.map((row) => row.title),
    [NEEDLE],
    "the canvas at index 240 must be findable even though it is never on the first page",
  );
});

test("search is case-insensitive and runs before paging", async () => {
  const { table, calls } = fakeTable(library());
  const result = await searchCanvases("user-1", { search: "hypertension PHARMACO" }, table);

  // Mixed case, spanning two words, on a canvas 240 rows deep. All three have to hold at once.
  assert.deepEqual(
    result.rows.map((row) => row.title),
    [NEEDLE],
    "case must not decide whether a learner can find their own canvas",
  );
  assert.ok(
    calls.some((call) => call.startsWith("ilike:")),
    "the title filter must reach the query — a filter applied after `range` is the defect",
  );
  assert.ok(
    calls.indexOf("ilike:title") < calls.findIndex((call) => call.startsWith("range:")),
    "the filter must be applied BEFORE the page is taken",
  );
});

test("an unfiltered first page reports how much it is not showing", async () => {
  const { table } = fakeTable(library());
  const result = await searchCanvases("user-1", {}, table);

  assert.equal(result.rows.length, PAGE_SIZE);
  assert.equal(result.total, 250, "the surface must know the real size to disclose truncation");
  assert.equal(result.more, true, "a truncated list that does not say so is the original defect");
});

test("paging reaches the end without repeating or dropping a row", async () => {
  const seen = new Set<string>();
  const { table } = fakeTable(library());

  for (let page = 0; page * PAGE_SIZE < 250; page += 1) {
    const result = await searchCanvases("user-1", { page }, table);
    for (const row of result.rows) {
      assert.ok(!seen.has(row.id), `row ${row.id} appeared on two pages — the order is not stable`);
      seen.add(row.id);
    }
  }

  assert.equal(seen.size, 250, "every canvas must be reachable by paging");
});

test("the order ends in a unique column, so page boundaries cannot shuffle", async () => {
  // Every row shares one timestamp: without a unique tiebreaker the sort is free to return them
  // in any order, and two fetches can disagree about which rows belong to page 0.
  const flat = library().map((row) => ({ ...row, updated_at: "2026-01-01T00:00:00.000Z" }));
  const first = await searchCanvases("user-1", { page: 0 }, fakeTable(flat).table);
  const second = await searchCanvases("user-1", { page: 0 }, fakeTable([...flat].reverse()).table);

  assert.deepEqual(
    first.rows.map((row) => row.id),
    second.rows.map((row) => row.id),
    "the same page must contain the same rows regardless of the order rows arrive in",
  );
});

test("pinned first, then most recent — order keys accumulate, they do not replace each other", async () => {
  // 🔴 THIS PINS A DEFECT FOUND BY LOOKING AT THE RENDERED SURFACE, not by a failing test. With a
  // fake that re-sorted on every `.order()` call, the trailing unique tiebreaker won outright and
  // the list came back in `id` order — 0, 1, 10, 11, 12 — while every assertion here stayed green.
  const rows = library().map((row) =>
    row.id === "canvas-100" ? { ...row, pinned_at: "2026-08-01T00:00:00.000Z" } : row,
  );

  const result = await searchCanvases("user-1", {}, fakeTable(rows).table);

  assert.equal(result.rows[0]?.id, "canvas-100", "a pinned canvas sorts above everything else");
  assert.equal(result.rows[1]?.id, "canvas-000", "then the most recently updated");
  assert.equal(result.rows[2]?.id, "canvas-001", "and the list continues by recency, not by id");
});

test("Unfiled means folder_id IS NULL, not folder_id = null", async () => {
  const { table, calls } = fakeTable(library());
  const result = await searchCanvases("user-1", { folderId: null }, table);

  assert.ok(calls.includes("is:folder_id"), "`.eq(column, null)` matches nothing in Postgres");
  assert.ok(result.total > 0, "Unfiled must not render empty for a learner who has loose canvases");
  assert.ok(
    result.rows.every((row) => row.folderId === null),
    "a folder scope must not leak filed canvases",
  );
});

test("no user means no query at all", async () => {
  const { table, calls } = fakeTable(library());
  const result = await searchCanvases(null, { search: "Hypertension" }, table);
  assert.deepEqual(result.rows, []);
  assert.equal(calls.length, 0);
});

// ------------------------------------------------------------------ the control

test("🔴 CONTROL: filtering a truncated page in the browser FAILS this fixture", async () => {
  // This is the implementation the Library would have had if search had been left where the home
  // surface does it — `listCanvases` (capped at 200) followed by `Array.filter`. It is run here
  // deliberately, so that if anyone ever "simplifies" the query-side filter back into a
  // client-side one, the tests above stop being satisfiable rather than quietly still passing.
  const naive = (rows: Row[], search: string) =>
    rows
      .slice(0, 200) // what `.limit(200)` returns
      .filter((row) => row.title.toLowerCase().includes(search.toLowerCase()));

  const found = naive(library(), "Hypertension");

  assert.equal(
    found.length,
    0,
    "if the browser-side filter can find the needle, this fixture no longer discriminates and " +
      "every assertion above is worthless — move the needle further out",
  );
});
