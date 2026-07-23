import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyBrowseFilter, browseTags, buildBrowseRows, EMPTY_BROWSE_FILTER, type BrowseCard } from "./study-browse.ts";

const DECKS = [
  { id: "d1", name: "Pharmacology::Cardiovascular" },
  { id: "d2", name: "Anatomy" },
];

const card = (over: Partial<BrowseCard> & Pick<BrowseCard, "id" | "deckId" | "front" | "back">): BrowseCard => ({
  flag: 0,
  suspended: false,
  lapses: 0,
  tags: [],
  ...over,
});

const CARDS: BrowseCard[] = [
  card({ id: "c1", deckId: "d1", front: "What does ACE stand for?", back: "Angiotensin-converting enzyme", flag: 1, tags: ["mechanisms"] }),
  card({ id: "c2", deckId: "d2", front: "Name the four heart chambers.", back: "LA, RA, LV, RV", suspended: true, tags: ["anatomy"] }),
  card({ id: "c3", deckId: "missing-deck", front: "Orphaned card", back: "Its deck was deleted" }),
  card({ id: "c4", deckId: "d1", front: "Beta blocker overdose sign?", back: "Bradycardia", lapses: 9, tags: ["mechanisms", "toxicology"] }),
];

Deno.test("buildBrowseRows: joins each card to its deck's name", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(rows.find((row) => row.card.id === "c1")?.deckName, "Pharmacology::Cardiovascular");
});

Deno.test("buildBrowseRows: drops cards whose deck no longer exists, preserves order", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(rows.map((row) => row.card.id), ["c1", "c2", "c4"]);
});

Deno.test("browseTags: distinct tags across rows, alphabetical", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(browseTags(rows), ["anatomy", "mechanisms", "toxicology"]);
});

Deno.test("applyBrowseFilter: empty filter returns every joined row", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(applyBrowseFilter(rows, EMPTY_BROWSE_FILTER).length, rows.length);
});

Deno.test("applyBrowseFilter: query matches front, deck name, and tags case-insensitively", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, query: "ACE" }).map((r) => r.card.id), ["c1"]);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, query: "anatomy" }).map((r) => r.card.id), ["c2"]); // deck AND tag
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, query: "toxicology" }).map((r) => r.card.id), ["c4"]); // tag only
});

Deno.test("applyBrowseFilter: scope flagged / suspended / leeches", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, scope: "flagged" }).map((r) => r.card.id), ["c1"]);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, scope: "suspended" }).map((r) => r.card.id), ["c2"]);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, scope: "leeches" }).map((r) => r.card.id), ["c4"]); // lapses >= 8
});

Deno.test("applyBrowseFilter: exact flag color only narrows within the flagged scope", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, scope: "flagged", flag: 1 }).map((r) => r.card.id), ["c1"]);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, scope: "flagged", flag: 3 }).length, 0); // no green flags
});

Deno.test("applyBrowseFilter: deck and tag filters compose", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, deckId: "d1" }).map((r) => r.card.id), ["c1", "c4"]);
  assertEquals(applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, tag: "mechanisms" }).map((r) => r.card.id), ["c1", "c4"]);
  assertEquals(
    applyBrowseFilter(rows, { ...EMPTY_BROWSE_FILTER, deckId: "d1", tag: "toxicology" }).map((r) => r.card.id),
    ["c4"],
  );
});
