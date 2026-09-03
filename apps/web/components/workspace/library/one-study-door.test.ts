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

test("🔴🔴 the Library is the learner's shelves, and not a home for retired features", () => {
  // 🔴🔴 REVERSED BY THE OWNER, 2026-08-24, AND THE OLD ASSERTION IS DESCRIBED HERE SO THE REVERSAL
  // IS LEGIBLE. This used to REQUIRE an "Import from Anki" and a "Progress" button, because
  // workstream F had to put the retired Study tab's two survivors somewhere and the Library was the
  // only door left. The owner's verdict on meeting them: *"the library page has an import from Anki
  // button that I don't want. The library also has a progress button that I did not ask for. I
  // mainly just want buttons for slides, flash cards, and documents."*
  //
  // The lesson is about WHERE a retired feature goes. "It has to live somewhere" put two controls
  // at the top of the one page a learner opens to reach their own work, ahead of the shelves that
  // page exists for. Neither component was deleted — `study-extras.tsx` still exports both, and the
  // test below still holds them unmodified — the Library simply stopped offering them.
  assert.ok(!/Import from Anki/.test(OUTPUTS), "the Anki import button is back on the Library");
  assert.ok(!/<LibraryProgress/.test(OUTPUTS), "the Progress panel is back on the Library");
  assert.ok(!/<LibraryAnkiImport/.test(OUTPUTS), "the Anki importer is mounted on the Library again");
  // What the page IS for, asserted positively: the three shelves the owner named.
  // 🔴 MATCHED AS HEADINGS, NOT AS BARE WORDS. The old spelling of this checked for `/Notes/`,
  // which passed on the `setNotes` state setter and would have gone on passing with every shelf
  // deleted. A guard that cannot fail is worse than no guard, because it is counted as coverage.
  // 🔴 NAMED BY THEIR PILLS SINCE 2026-09-01, NOT BY HEADINGS. Each shelf used to print a heading
  // ("Flashcard decks", "Slides", "Documents") above its table, under a pill that already said the
  // same word — two things on the page saying which shelf you were on, and part of why the shelves
  // read as different pages (owner: *"it's kinda weird because all of them have different
  // settings"*). The shelves themselves are unchanged, so this checks the thing that still names
  // them; `SHELVES` is what the pills are built from and what the guard below already pins.
  for (const shelf of ["Flashcards", "Slides", "Documents"]) {
    assert.ok(new RegExp(`label: "${shelf}"`).test(OUTPUTS), `the ${shelf} shelf is gone`);
    assert.ok(!new RegExp(`SECTION_TITLE\\}>`).test(OUTPUTS), "a shelf heading came back beside its own pill");
  }
});

test("🔴🔴 the filter offers exactly the three kinds the owner named, plus All", () => {
  // Owner 2026-08-24: *"make sure you add the flashcards, slides, or documents, selection, or
  // filter in the library like in ChatGPT."*
  //
  // 🔴 "All" IS PART OF THE CONTRACT, NOT A FOURTH OPTION SOMEBODY ADDED. Without a way back to
  // everything, picking a filter is a one-way door and the other two shelves read as deleted.
  const shelves = OUTPUTS.slice(OUTPUTS.indexOf("const SHELVES"), OUTPUTS.indexOf("export function LibraryOutputs"));
  assert.ok(shelves.length > 0, "the shelf filter is gone — this guard is pointed at nothing");
  for (const label of ["All", "Flashcards", "Slides", "Documents"]) {
    assert.ok(shelves.includes(`"${label}"`), `the filter lost "${label}"`);
  }
  assert.match(OUTPUTS, /useState<Shelf>\("all"\)/, "the Library no longer opens showing everything");
});

test("🔴🔴 there is exactly ONE control meaning 'show me everything'", () => {
  // 🔴 THE OWNER'S CATCH, 2026-08-24: *"why is there an everything button if we already have the
  // all button"*. The first version had two rows of pills — kinds above, folders below — whose
  // selected states read "All" and "Everything". Two controls, same English word, stacked.
  //
  // The reference they pointed at (ChatGPT's library) has no second row: one row of kind pills, and
  // folders are ROWS IN THE LIST you open. So folders moved into the list and "Everything" stopped
  // needing to exist — being in no folder IS the top of the list.
  assert.ok(!/>\s*Everything\s*</.test(OUTPUTS), "the second 'show me everything' control is back");
  // …and the folders it replaced are really rows now, with a way back out of one.
  assert.match(OUTPUTS, /setOpenFolder\(folder\.id\)/, "a folder can no longer be opened");
  assert.match(OUTPUTS, /openFolder !== null && \(/, "there is no way back out of an open folder");
});

test("🔴 the page does not explain itself under its own heading", () => {
  // Owner, same message: *"remove the description under the library heading."* It had also gone
  // stale twice in one day, which is the usual fate of a sentence describing a page's contents.
  assert.ok(!/What Nemesis has made for you/.test(OUTPUTS), "the subtitle is back under the heading");
});

test("🔴🔴 a hidden shelf is not rendered, heading and all", () => {
  // A heading left standing over a list the filter emptied says "you have no decks", which is a
  // different and false claim. Calibration: drop the `showing(...)` wrappers and this reddens.
  for (const kind of ["deck", "slides", "note"]) {
    assert.ok(OUTPUTS.includes(`{showing("${kind}") && (`), `the ${kind} shelf renders even when filtered out`);
  }
});

test("🔴🔴 Library folders are the SIDEBAR's folders, never a second tree", () => {
  // Owner 2026-08-24: *"And the library, I don't know if you added the folders. Could you… yeah.
  // Add the folders."*
  //
  // 🔴 THE `folders` TABLE WAS BUILT GENERIC FOR EXACTLY THIS — its migration says *"folders
  // organise sessions, and Nemesis is not education-only"*. A `library_folders` table would give
  // one learner two unrelated trees, so "Fall 2026 / Pharmacology" would have to be typed once
  // for the canvas and again for the deck that canvas produced.
  assert.match(OUTPUTS, /from "@\/lib\/learn\/canvas-store"/, "the Library stopped using the shared folder store");
  assert.match(OUTPUTS, /listFolders\(userId\)/, "the Library does not load the learner's folders");
  assert.match(OUTPUTS, /createFolder\(userId/, "there is no way to make a folder from the Library");
  assert.ok(!/library_folders/.test(OUTPUTS), "a second folder tree appeared");
});

test("🔴🔴🔴 the learner never hand-authors a card, and can always take one away", () => {
  // 🔴🔴🔴 REVERSED BY THE OWNER ONE DAY AFTER IT SHIPPED, 2026-08-25. THE OLD ASSERTION IS
  // DESCRIBED HERE SO THE REVERSAL IS LEGIBLE, exactly as the Anki-import reversal is above.
  //
  // This test used to REQUIRE `<DeckOcclusion` on every deck row. It was written to answer
  // *"What about image occlusion? Can I do image occlusion?"* — and the honest answer then was
  // no, because `OcclusionEditor` had shipped with its only door on the retired `/study`. So a
  // door was cut in the Library and this guard held it open.
  //
  // The owner's verdict on meeting it: *"I don't want users to edit flashcards, really. Mainly
  // just download them if they want to… similar to notebook where you don't have to edit cards.
  // That's not what I want users to do in my app."* And on what should make them instead:
  // *"DeepSeek should have the image occlusion as part of its testing tools… it should also be
  // allowable for it to use image occlusion for flash cards."*
  //
  // 🔴 SO THE ANSWER TO "CAN I DO IMAGE OCCLUSION?" DID NOT BECOME "NO" AGAIN — IT MOVED. The
  // learner does not drag rectangles; the model places them. A guard demanding a hand-authoring
  // door would now hold open the exact surface the owner asked to close.
  assert.ok(!/<DeckOcclusion/.test(OUTPUTS), "the hand-authoring door is back on the Library");
  assert.ok(!/OcclusionEditor/.test(OUTPUTS), "the Library mounts the box-dragging editor again");
  assert.ok(!existsSync(new URL("./deck-occlusion.tsx", import.meta.url)), "the door component came back");

  // 🔴 AND THE REPLACEMENT IS ASSERTED POSITIVELY, because removing authoring without giving the
  // cards back would leave a learner unable to change or export their own material. Download is
  // what keeps this a clean surface rather than a cage.
  assert.match(OUTPUTS, /deckToAnkiText/, "a deck can no longer be downloaded");
  assert.match(OUTPUTS, /link\.download = deckFileName\(/, "the download stopped naming its file");
});

test("🔴🔴 the occlusion machinery is NOT deleted, because the model still uses it", () => {
  // Same rule the Anki importer and the stats page are held to: a component whose door closes is
  // not a component that gets removed. `OcclusionCardView` renders every image card in a review,
  // `study-occlusion.ts` owns what a valid mask is, and both are on the path a MODEL-made card
  // takes. Deleting them along with the door would take the feature out by the roots.
  for (const file of ["../study/occlusion-card.tsx", "../study/occlusion-editor.tsx"]) {
    assert.ok(existsSync(new URL(file, import.meta.url)), `${file} was deleted along with its door`);
  }
  const review = readFileSync(new URL("../study/review-session.tsx", import.meta.url), "utf8");
  assert.match(review, /<OcclusionCardView/, "image cards stopped rendering in a review");
});

test("🔴 filing waits for the write, and never guesses", () => {
  // The cross-account folder trigger can refuse a move. An optimistic update would leave the
  // learner looking at a folder their deck is not in until the next reload.
  const filing = OUTPUTS.slice(OUTPUTS.indexOf("const file = useCallback"), OUTPUTS.indexOf("const addFolder"));
  assert.ok(filing.length > 0, "the filing callback is gone — this guard is pointed at nothing");
  assert.match(filing, /if \(!\(await fileOutput\(/, "the Library moves a row before the database agrees");
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
  // 🔴 REPOINTED 2026-09-03: the mount grew props (crumb, Download, the ask bar) and JSX with props
  // wraps in parentheses, so a pattern demanding `&& <DeckReview ` on one line reddened on correct
  // code. The RULE — conditional, never `open={…}` — is unchanged and still asserted.
  assert.match(OUTPUTS, /\{reviewing && \(?\s*<DeckReview\b/, "the review mount stopped being conditional");
});

test("🔴 the shelves load on the account and nothing else", () => {
  // The refresh counter existed for ONE caller: a bulk Anki import that had just added forty decks
  // and needed the shelves re-read without a manual reload. That caller is gone (above), so the
  // counter went with it rather than sitting there as an unused setter — a door left standing after
  // its room was demolished. One effect, keyed on the account.
  assert.ok(!/setRefreshKey/.test(OUTPUTS), "a refresh counter came back with no caller to bump it");
  assert.match(OUTPUTS, /\}, \[userId\]\);/, "the shelves' loader is no longer keyed on the account");
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
