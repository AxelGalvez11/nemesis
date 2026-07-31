import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyBrowseFilter,
  buildBrowseRows,
  buildBrowseSections,
  buildDeckTree,
  searchRevealed,
  EMPTY_BROWSE_FILTER,
  type BrowseCard,
} from "./study-browse.ts";

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

Deno.test("buildBrowseSections: a deck row shows its leaf plus its parent folder, never the raw path", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  const nested = buildBrowseSections(rows, DECKS)[0]?.rows[0];
  assertEquals([nested?.label, nested?.parent], ["Cardiovascular", "Pharmacology"]);
  const flat = buildBrowseSections(rows, DECKS)[0]?.rows[1];
  assertEquals([flat?.label, flat?.parent], ["Anatomy", ""]);
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
  // THE contract that makes the two pages agree: whatever number page 1 prints
  // on a row, page 2 must list that many cards when you tap it.
  //
  // Checked with the search box empty AND set, because the box lives above the
  // page toggle and so survives navigating back to page 1. Counting without the
  // query let a deck row read 2 and open onto 1.
  const rows = buildBrowseRows(CARDS, DECKS);
  for (const query of ["", "ACE", "mechanisms", "zzz-no-matches"]) {
    for (const section of buildBrowseSections(rows, DECKS, query)) {
      for (const row of section.rows) {
        assertEquals(
          applyBrowseFilter(rows, { ...row.filter, query }).length,
          row.count,
          `${row.id} promised ${row.count} for query "${query}"`,
        );
      }
    }
  }
});

Deno.test("buildBrowseSections: a search narrows the counts, and empties the rows it excludes", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  // "ACE" is only on c1, in the Cardiovascular deck.
  const decks = buildBrowseSections(rows, DECKS, "ACE")[0];
  assertEquals(decks?.rows.map((r) => [r.label, r.count]), [["Cardiovascular", 1], ["Anatomy", 0]]);
  // A tag whose cards are all excluded loses its row entirely, since a tag row
  // can only come from a card that survived.
  assertEquals(buildBrowseSections(rows, DECKS, "ACE")[1]?.rows.map((r) => r.label), ["#mechanisms"]);
});

Deno.test("buildBrowseSections: a whitespace-only search is treated as no search", () => {
  const rows = buildBrowseRows(CARDS, DECKS);
  assertEquals(
    buildBrowseSections(rows, DECKS, "   ")[0]?.rows.map((r) => r.count),
    buildBrowseSections(rows, DECKS)[0]?.rows.map((r) => r.count),
  );
});

Deno.test("buildBrowseSections: counts ignore cards whose deck was deleted", () => {
  // c3 lives in "missing-deck" and buildBrowseRows already dropped it, so no
  // section may count it.
  const rows = buildBrowseRows(CARDS, DECKS);
  const total = buildBrowseSections(rows, DECKS)[0]?.rows.reduce((sum, r) => sum + r.count, 0);
  assertEquals(total, 3);
});

// --- Nested decks (owner 2026-07-31) -----------------------------------------
//
// A Study folder has no row of its own in the database — it is a prefix inside a
// deck's name — so these tests are really about rows that get INVENTED, and the
// one number on them that has to be right is the card count, which is the sum of
// everything below and not the number of decks.

const NESTED_DECKS = [
  { id: "d1", name: "Pharmacology::Cardiovascular::Week 1" },
  { id: "d2", name: "Pharmacology::Cardiovascular::Week 2" },
  { id: "d3", name: "Pharmacology::Renal" },
  { id: "d4", name: "Constitutional Law" },
];

const NESTED_CARDS: BrowseCard[] = [
  card({ id: "n1", deckId: "d1", front: "Beta blockers", back: "a" }),
  card({ id: "n2", deckId: "d1", front: "ACE inhibitors", back: "b" }),
  card({ id: "n3", deckId: "d2", front: "Statins", back: "c" }),
  card({ id: "n4", deckId: "d3", front: "Loop diuretics", back: "d" }),
  card({ id: "n5", deckId: "d4", front: "Commerce Clause", back: "e" }),
];

function deckRowsFor(decks: { id: string; name: string }[], cards: BrowseCard[]) {
  const sections = buildBrowseSections(buildBrowseRows(cards, decks), decks);
  return sections.find((section) => section.key === "decks")?.rows ?? [];
}

Deno.test("buildDeckTree: folders are invented from the deck names and nest", () => {
  const tree = buildDeckTree(deckRowsFor(NESTED_DECKS, NESTED_CARDS), new Set());
  assertEquals(
    tree.map((entry) => [entry.type, entry.type === "folder" ? entry.label : entry.row.label, entry.depth]),
    [
      ["folder", "Pharmacology", 0],
      ["folder", "Cardiovascular", 1],
      ["deck", "Week 1", 2],
      ["deck", "Week 2", 2],
      ["deck", "Renal", 1],
      ["deck", "Constitutional Law", 0],
    ],
  );
});

Deno.test("buildDeckTree: a folder counts CARDS below it, not decks", () => {
  const tree = buildDeckTree(deckRowsFor(NESTED_DECKS, NESTED_CARDS), new Set());
  const counts = Object.fromEntries(
    tree.filter((entry) => entry.type === "folder").map((entry) => [entry.path, entry.count]),
  );
  // Pharmacology holds 4 cards across 3 decks; two of them sit one level down.
  assertEquals(counts["Pharmacology"], 4);
  assertEquals(counts["Pharmacology::Cardiovascular"], 3);
});

Deno.test("buildDeckTree: a folded folder hides its contents but keeps its count", () => {
  const tree = buildDeckTree(deckRowsFor(NESTED_DECKS, NESTED_CARDS), new Set(["Pharmacology"]));
  assertEquals(
    tree.map((entry) => (entry.type === "folder" ? entry.label : entry.row.label)),
    ["Pharmacology", "Constitutional Law"],
  );
  const pharm = tree[0];
  assertEquals(pharm.type === "folder" ? pharm.count : -1, 4);
});

Deno.test("buildDeckTree: an empty deck still gets a row — you have to see it to believe it exists", () => {
  const tree = buildDeckTree(deckRowsFor([{ id: "d9", name: "Torts::Fresh" }], []), new Set());
  assertEquals(
    tree.map((entry) => [entry.type, entry.type === "folder" ? entry.label : entry.row.label]),
    [["folder", "Torts"], ["deck", "Fresh"]],
  );
});

// --- Pull down to reveal the search box ---------------------------------------

Deno.test("searchRevealed: a real pull past the top brings it down", () => {
  assertEquals(searchRevealed(false, -40, ""), true);
});

Deno.test("searchRevealed: a rubber-band twitch does not", () => {
  assertEquals(searchRevealed(false, -8, ""), false);
});

Deno.test("searchRevealed: scrolling back up puts it away", () => {
  assertEquals(searchRevealed(true, 60, ""), false);
});

Deno.test("searchRevealed: settling at exactly 0 after a reveal drag leaves it down", () => {
  // The whole point of a hide threshold above zero: releasing the drag lands
  // here, and a bare `> 0` would undo the reveal in the same gesture.
  assertEquals(searchRevealed(true, 0, ""), true);
});

Deno.test("searchRevealed: a box with something typed in it NEVER hides", () => {
  // Hiding it would turn a filtered list into a list that has mysteriously lost
  // most of its cards, with the explanation off screen.
  assertEquals(searchRevealed(true, 400, "beta"), true);
  assertEquals(searchRevealed(false, 400, "beta"), true);
});

Deno.test("searchRevealed: whitespace is not a filter", () => {
  assertEquals(searchRevealed(true, 400, "   "), false);
});
