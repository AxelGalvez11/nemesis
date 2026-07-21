import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildBrowseRows, filterBrowseRows } from "./study-browse.ts";

const DECKS = [
  { id: "d1", name: "Pharmacology::Cardiovascular" },
  { id: "d2", name: "Anatomy" },
];
const CARDS = [
  { id: "c1", deckId: "d1", front: "What does ACE stand for?", back: "Angiotensin-converting enzyme" },
  { id: "c2", deckId: "d2", front: "Name the four heart chambers.", back: "LA, RA, LV, RV" },
  { id: "c3", deckId: "missing-deck", front: "Orphaned card", back: "Its deck was deleted" },
];

Deno.test("buildBrowseRows: joins each card to its deck's name", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const c1 = rows.find((row) => row.card.id === "c1");
  assertEquals(c1?.deckName, "Pharmacology::Cardiovascular");
});

Deno.test("buildBrowseRows: drops cards whose deck no longer exists", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(rows.length, 2);
  assertEquals(rows.some((row) => row.card.id === "c3"), false);
});

Deno.test("buildBrowseRows: preserves the caller's card order", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(rows.map((row) => row.card.id), ["c1", "c2"]);
});

Deno.test("filterBrowseRows: a blank query returns every row", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(filterBrowseRows(rows, "").length, rows.length);
  assertEquals(filterBrowseRows(rows, "   ").length, rows.length);
});

Deno.test("filterBrowseRows: matches front text case-insensitively", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const found = filterBrowseRows(rows, "ace");
  assertEquals(found.length, 1);
  assertEquals(found[0]?.card.id, "c1");
});

Deno.test("filterBrowseRows: matches deck name", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const found = filterBrowseRows(rows, "anatomy");
  assertEquals(found.length, 1);
  assertEquals(found[0]?.card.id, "c2");
});

Deno.test("filterBrowseRows: no match returns an empty list", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(filterBrowseRows(rows, "nonexistent xyz").length, 0);
});
