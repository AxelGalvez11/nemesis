import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyBrowseFilter, buildBrowseRows, buildBrowseSections, EMPTY_BROWSE_FILTER, type BrowseCard } from "./study-browse.ts";

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

// --- buildBrowseSections: the first page's Decks / Tags / Flags rows

Deno.test("buildBrowseSections: three sections, always in this order", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(buildBrowseSections(rows, DECKS).map((s) => s.key), ["decks", "tags", "flags"]);
});

Deno.test("buildBrowseSections: a deck row counts only its own cards", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const decks = buildBrowseSections(rows, DECKS)[0];
  assertEquals(decks?.rows.map((r) => [r.label, r.count]), [["Cardiovascular", 2], ["Anatomy", 1]]);
});

Deno.test("buildBrowseSections: a deck row shows its leaf, its depth, and its parent folder", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const nested = buildBrowseSections(rows, DECKS)[0]?.rows[0];
  // "Pharmacology::Cardiovascular" reads as an indented "Cardiovascular" under
  // "Pharmacology" — the raw path never reaches the screen.
  assertEquals([nested?.label, nested?.depth, nested?.parent], ["Cardiovascular", 1, "Pharmacology"]);
  const flat = buildBrowseSections(rows, DECKS)[0]?.rows[1];
  assertEquals([flat?.label, flat?.depth, flat?.parent], ["Anatomy", 0, ""]);
});

Deno.test("buildBrowseSections: an empty deck still gets a row, at 0", () => {
  // A deck you just created has no cards yet. Hiding it would read as the
  // create having failed.
  const withEmpty = [...DECKS, { id: "d3", name: "Microbiology" }];
  const rows = buildBrowseRows(CARDS, withEmpty);
  const micro = buildBrowseSections(rows, withEmpty)[0]?.rows.find((r) => r.label === "Microbiology");
  assertEquals([micro?.label, micro?.count], ["Microbiology", 0]);
});

Deno.test("buildBrowseSections: tag rows are alphabetical and counted", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const tags = buildBrowseSections(rows, DECKS)[1];
  assertEquals(tags?.rows.map((r) => [r.label, r.count]), [["#anatomy", 1], ["#mechanisms", 2], ["#toxicology", 1]]);
});

Deno.test("buildBrowseSections: only flag colours in use get a row, and they carry their hex", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const flags = buildBrowseSections(rows, DECKS)[2];
  // c1 is red; nothing else is flagged, so the other six colours stay out.
  const red = flags?.rows.find((r) => r.id === "flag:1");
  assertEquals([red?.label, red?.count, red?.hex], ["Red", 1, "#ef4444"]);
  assertEquals(flags?.rows.filter((r) => r.id.startsWith("flag:")).length, 1);
});

Deno.test("buildBrowseSections: Suspended and Leeches ride in the Flags section", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const flags = buildBrowseSections(rows, DECKS)[2];
  assertEquals(flags?.rows.map((r) => r.id), ["flag:1", "state:suspended", "state:leeches"]);
  assertEquals(flags?.rows.find((r) => r.id === "state:leeches")?.count, 1);
});

Deno.test("buildBrowseSections: a card-state row with nothing in it is left out", () => {
  const clean = [card({ id: "x1", deckId: "d2", front: "Q", back: "A" })];
  const rows = buildBrowseRows(clean, DECKS);
  assertEquals(buildBrowseSections(rows, DECKS)[2]?.rows, []);
});

Deno.test("buildBrowseSections: every row's filter selects exactly what its count promised", () => {
  // The contract that makes the two pages agree: whatever number page 1 prints
  // on a row, page 2 must list that many cards when you tap it.
  const rows = buildBrowseRows(CARDS, DECKS);
  for (const section of buildBrowseSections(rows, DECKS)) {
    for (const row of section.rows) {
      assertEquals(
        applyBrowseFilter(rows, { ...row.filter, query: "" }).length,
        row.count,
        `${row.id} promised ${row.count}`,
      );
    }
  }
});

Deno.test("buildBrowseSections: counts ignore cards whose deck was deleted", () => {
  // c3 lives in "missing-deck" and buildBrowseRows already dropped it, so no
  // section may count it.
  const rows = buildBrowseRows(CARDS, DECKS);
  const total = buildBrowseSections(rows, DECKS)[0]?.rows.reduce((sum, r) => sum + r.count, 0);
  assertEquals(total, 3);
});
