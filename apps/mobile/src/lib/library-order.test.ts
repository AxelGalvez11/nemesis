// Deno unit tests (repo convention) for hand-arranged library order.
// Run: deno test --no-check apps/mobile/src/lib/library-order.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  compareManual,
  MIN_POSITION_GAP,
  needsRenumber,
  positionBetween,
  positionForDrop,
  renumbered,
  type OrderedNote,
} from "./library-order.ts";

const note = (title: string, position?: number | null): OrderedNote => ({ position, title });

Deno.test("a drop between two notes lands strictly between them", () => {
  const p = positionBetween(2, 4);
  assert(p > 2 && p < 4, `expected 2 < ${p} < 4`);
});

Deno.test("dropping at the ends STEPS by a whole unit, never halves toward zero", () => {
  // Halving toward an edge would squeeze positions smaller every time someone
  // drags to the top, and burn the precision this design depends on.
  assertEquals(positionBetween(null, 5), 4);
  assertEquals(positionBetween(5, null), 6);
  assertEquals(positionBetween(null, null), 0);
});

Deno.test("dragging repeatedly to the top does not converge on a limit", () => {
  let head: number | null = 0;
  for (let i = 0; i < 200; i += 1) head = positionBetween(null, head);
  assertEquals(head, -200);
});

Deno.test("needsRenumber fires only when the gap is genuinely exhausted", () => {
  assert(!needsRenumber(0, 1));
  assert(!needsRenumber(null, 1), "an open end always has room");
  assert(!needsRenumber(0, null), "an open end always has room");
  assert(needsRenumber(1, 1 + MIN_POSITION_GAP / 2));
});

Deno.test("~50 halvings between the SAME pair is what it takes to exhaust a gap", () => {
  // The trade this design makes, stated as a test: one row per move, at the
  // cost of a renumber after an implausible number of drops in one spot.
  let low = 0;
  let high = 1;
  let moves = 0;
  while (!needsRenumber(low, high) && moves < 1000) {
    low = positionBetween(low, high);
    moves += 1;
  }
  assert(moves > 15, `gap exhausted after only ${moves} moves`);
  assert(moves < 100, `expected exhaustion to be reachable, took ${moves}`);
});

Deno.test("renumbered hands out evenly spaced positions in the given order", () => {
  assertEquals(renumbered(["a.md", "b.md", "c.md"]), [
    { path: "a.md", position: 0 },
    { path: "b.md", position: 1 },
    { path: "c.md", position: 2 },
  ]);
});

Deno.test("NULL POSITIONS SORT LAST — an arrangement is never buried under untouched notes", () => {
  // Notes made on the web, in chat, or by the recorder have no position, and on
  // the day this ships that is most of a real library.
  const sorted = [note("zeta"), note("beta", 5), note("alpha")].sort(compareManual);
  assertEquals(sorted.map((n) => n.title), ["beta", "alpha", "zeta"]);
});

Deno.test("notes without a position keep a stable A-Z order among themselves", () => {
  const sorted = [note("gamma"), note("alpha"), note("beta")].sort(compareManual);
  assertEquals(sorted.map((n) => n.title), ["alpha", "beta", "gamma"]);
});

Deno.test("equal positions tie-break by title rather than flapping", () => {
  const sorted = [note("b", 1), note("a", 1)].sort(compareManual);
  assertEquals(sorted.map((n) => n.title), ["a", "b"]);
});

Deno.test("positionForDrop: head, middle and tail of a folder", () => {
  const folder = [note("a", 0), note("b", 1), note("c", 2)];
  assertEquals(positionForDrop(folder, 0).position, -1);
  assert(positionForDrop(folder, 1).position > 0 && positionForDrop(folder, 1).position < 1);
  assertEquals(positionForDrop(folder, 3).position, 3);
});

Deno.test("positionForDrop clamps an out-of-range index instead of producing NaN", () => {
  const folder = [note("a", 0)];
  assertEquals(positionForDrop(folder, -5).position, -1);
  assertEquals(positionForDrop(folder, 99).position, 1);
  assert(Number.isFinite(positionForDrop([], 3).position));
});

Deno.test("positionForDrop reports when the folder needs renumbering", () => {
  const tight = [note("a", 1), note("b", 1 + MIN_POSITION_GAP / 4)];
  assert(positionForDrop(tight, 1).renumber);
  assert(!positionForDrop([note("a", 0), note("b", 10)], 1).renumber);
});

Deno.test("dropping into a folder of UNPOSITIONED notes still yields a usable number", () => {
  // Every neighbour is null, so the midpoint logic has nothing to work with —
  // it must still return something finite rather than NaN.
  const folder = [note("a"), note("b")];
  const { position } = positionForDrop(folder, 1);
  assert(Number.isFinite(position), `got ${position}`);
});

Deno.test("POSITIONS ARE PER-FOLDER — the same number in two folders means nothing", () => {
  // The tree groups by folder before sorting, so this is only a bug if someone
  // later compares positions across folders. Pinned so that change breaks here.
  const school = [note("essay", 0), note("notes", 1)].sort(compareManual);
  const work = [note("standup", 0), note("review", 1)].sort(compareManual);
  assertEquals(school.map((n) => n.title), ["essay", "notes"]);
  assertEquals(work.map((n) => n.title), ["standup", "review"]);
});
