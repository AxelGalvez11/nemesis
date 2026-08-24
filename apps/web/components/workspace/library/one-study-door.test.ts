import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

// ── one door, not two (workstream F) ────────────────────────────────────────────────────────
//
// Owner's build order: *"the Library becomes the only door. The genuinely good parts of the old
// tab move in — importing Anki decks, the hide-part-of-an-image cards, the progress stats."*
//
// 🔴🔴 A CORRECTION WORTH RECORDING: the seam was smaller than the plan assumed. `/study` was
// ALREADY retired from navigation before this workstream started — `RetiredSurfaceGuard` has
// wrapped it for weeks, so a bare visit already redirected and nothing in the shell linked to it.
// What was actually missing was the reverse: three things a learner still had to reach the old
// surface FOR. Reviewing a deck landed in workstream A; the other two land here.
//
// 🔴 EVERY ONE OF THEM IS A DOOR, NEVER A SECOND SCREEN. The Study tab's own components are
// mounted unmodified. A Library that redrew the Anki importer would be a second importer to keep
// in step with the first, and the first already knows what an .apkg can be malformed in.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const OUTPUTS = strip(readFileSync(new URL("./library-outputs.tsx", import.meta.url), "utf8"));
const EXTRAS = strip(readFileSync(new URL("../study/study-extras.tsx", import.meta.url), "utf8"));
const GUARD = readFileSync(new URL("../retired-surface-guard.tsx", import.meta.url), "utf8");
const STUDY_PAGE = readFileSync(new URL("../../../app/(workspace)/study/page.tsx", import.meta.url), "utf8");

test("🔴🔴 the Library offers the last two reasons anyone visited Study", () => {
  assert.match(OUTPUTS, /Import from Anki/, "importing an Anki deck still needs the retired surface");
  assert.match(OUTPUTS, /Progress/, "progress still needs the retired surface");
  assert.match(OUTPUTS, /\{importing && \(/, "the importer is not mounted");
  assert.match(OUTPUTS, /\{showingProgress && <LibraryProgress /, "progress is not mounted");
});

test("🔴🔴 they mount the Study tab's own screens, unmodified", () => {
  // Calibration: reimplement either one here and the corresponding line reddens.
  assert.match(EXTRAS, /<AnkiImportDialog/, "the Library grew its own Anki importer");
  assert.match(EXTRAS, /<StatsTab/, "the Library grew its own stats page");
  // A second implementation would show up as this file learning what a card or a review IS.
  assert.ok(!/study_cards|study_decks|supabase\./.test(EXTRAS), "study-extras started querying the study tables itself");
});

test("🔴 neither is mounted until it is pressed", () => {
  // Both reach useCloudStudy(), which loads every deck, card and review on the account. The
  // Library must not pay that on arrival — the same rule DeckReview is held to.
  assert.ok(!/<LibraryAnkiImport[^>]*\sopen=/.test(OUTPUTS), "the importer is always mounted");
  assert.ok(!/<LibraryProgress[^>]*\sopen=/.test(OUTPUTS), "progress is always mounted");
  assert.match(OUTPUTS, /\{reviewing && <DeckReview /, "the review mount stopped being conditional");
});

test("🔴 an import that added decks shows them without a manual reload", () => {
  assert.match(OUTPUTS, /setRefreshKey\(\(was\) => was \+ 1\)/, "finishing an import leaves the shelves stale");
  assert.match(OUTPUTS, /\}, \[refreshKey, userId\]\);/, "the refresh counter is not wired to the loader");
});

test("🔴🔴 Study stays retired, and Library stays NOT retired", () => {
  // Two halves of one invariant. Study keeps its guard: bare visits redirect, deep links still
  // work, because agent-tools.ts has minted /study?section= links into real conversations.
  assert.match(STUDY_PAGE, /<RetiredSurfaceGuard/, "the retired Study surface became navigable again");
  // And Library must NEVER acquire one: the shipped browser extension opens
  // /library?import=coursework, and a redirect there would drop the query string.
  const libraryPage = readFileSync(new URL("../../../app/(workspace)/library/page.tsx", import.meta.url), "utf8");
  assert.ok(!/RetiredSurfaceGuard/.test(libraryPage), "the Library grew a retirement guard — the extension's import link would break");
});

test("🔴 the guard's header no longer claims Library is retired", () => {
  // It said so for weeks after Library came back. Not untidiness: the next person to read that
  // file would have concluded Library was retired and "fixed" it by adding a redirect.
  assert.ok(!/Study, Library and Chill are no longer navigable/.test(GUARD), "the stale claim is back");
  assert.match(GUARD, /LIBRARY CAME BACK/, "the correction was removed");
});

test("the pieces exist where the Library expects them", () => {
  assert.ok(existsSync(new URL("../study/study-extras.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../study/deck-review.tsx", import.meta.url)));
  assert.ok(existsSync(new URL("../study/anki-import-dialog.tsx", import.meta.url)), "the real Anki importer is gone");
  assert.ok(existsSync(new URL("../study/stats-tab.tsx", import.meta.url)), "the real stats page is gone");
});
