import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the Library wears the shared frame, and kept every door it had ────────────────────────────
//
// 🔴🔴 2026-09-04: THE REFERENCE CHANGED. Until this date the owner's acceptance condition was
// "pixel, sizing, spacing and colouring 1 to 1" with ChatGPT's Library, and this file pinned every
// one of those numbers. That day the owner said the shelf pages "looked too much like ChatGPT",
// pointed at gemini.google.com/library ("maybe something similar to this"), and then asked for
// "consistent spacing across projects, library, and apps pages". The numbers now live in ONE
// place, `shell/page-frame.tsx`, and `page-frame.test.ts` guards them. What this file guards is
// that the Library actually USES that frame rather than a private copy of it, and that the
// restyle dropped nothing a row could do.
//
// 🔴 WHY A SOURCE-TEXT TEST AND NOT A RENDER TEST. There is no DOM in this suite. What CAN be
// defended is that the page reaches for the frame's components and constants, and that the doors
// behind the rows are still wired. Comments are stripped first, because the file documents all of
// this in prose and a test that matched the prose would pass in any geometry at all.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const OUTPUTS = strip(readFileSync(new URL("./library-outputs.tsx", import.meta.url), "utf8"));
// 🔴 THE ROUTE FILE IS STRIPPED TOO, and it has to be: its header comment spends four paragraphs
// explaining why there must never be a `redirect()` here, so an unstripped read of it would fail
// the very guard those paragraphs exist to protect.
const PAGE = strip(readFileSync(new URL("../../../app/(workspace)/library/page.tsx", import.meta.url), "utf8"));
/** The slide design picker moved here; the guard below checks that claim rather than trusting it. */
const DECK_PAGE = strip(readFileSync(new URL("../../../app/(workspace)/deck/page.tsx", import.meta.url), "utf8"));

test("🔴🔴 the page is drawn on the shared frame, not on a private copy of it", () => {
  // The frame is what makes three pages agree. A page that imports the components cannot drift
  // its title row or column; a page that redraws them can, and will, one pixel at a time.
  assert.match(OUTPUTS, /from "@\/components\/workspace\/shell\/page-frame"/, "the Library stopped importing the frame");
  assert.match(OUTPUTS, /<PageFrame>/, "the scroller and column are not the frame's");
  assert.match(OUTPUTS, /<PageTitle[\s>]/, "the title row is not the frame's");
  assert.match(OUTPUTS, /<Section\b/, "the sections are not the frame's");
  assert.match(OUTPUTS, /SOFT_ROW/, "the rows are not the frame's soft row");
  // 🔴 NO SECOND TITLE, NO SECOND COLUMN. An `<h1>` or a `max-w-[…]` written here is the drift
  // the frame exists to prevent.
  assert.ok(!/<h1\b/.test(OUTPUTS), "the Library draws its own <h1> beside the frame's");
  assert.ok(!/mx-auto[^"]*max-w-\[|max-w-\[[^"]*mx-auto/.test(OUTPUTS), "the Library sets its own column width");
  assert.ok(!/pt-\[115px\]|mt-\[53px\]|max-w-\[768px\]/.test(OUTPUTS), "a ChatGPT-era measurement survived the restyle");
});

test("🔴🔴 three sections in the owner's order, each with a View all, and no projects", () => {
  // Owner 2026-08-24 named the three kinds; 2026-09-04 the reference stacks them as shelves with
  // a round chevron each; the same day, "remove projects from library".
  assert.match(OUTPUTS, /const SECTION_ORDER: readonly OutputKind\[\] = \["deck", "slides", "note"\];/);
  assert.match(OUTPUTS, /deck: "Flashcards", note: "Documents", slides: "Slides"/);
  assert.match(OUTPUTS, /label=\{`View all \$\{SECTION_LABEL\[kind\]\.toLowerCase\(\)\}`\}/, "a section lost its View all");
  assert.match(OUTPUTS, /rows\.slice\(0, PEEK\)/, "the overview no longer peeks; it lists everything and View all means nothing");
  assert.match(OUTPUTS, /const PEEK = 3;/, "the peek is not the reference's three");
  // 🔴 THE VIEW-ALL PAGE IS THE SAME STATE, DRAWN THE OTHER WAY. `shelf` has meant "which kind"
  // since 2026-08-24; a second state for the same fact would let the two disagree.
  assert.match(OUTPUTS, /shelf === "all" \? \(/, "the overview is not keyed on the shelf state");
  assert.match(OUTPUTS, /label="Back to the Library"/, "the View-all page has no way back");
  // 🔴🔴 NO PROJECTS ON THIS PAGE. No folder rows, no open-folder breadcrumb, no New folder,
  // no folder dialog. The ⋯ still files, because that is the one thing only this page can do.
  assert.ok(!/folderRow|visibleFolders|openFolder|setOpenFolder/.test(OUTPUTS), "folder rows or the open-folder state came back");
  assert.ok(!/FolderCreateDialog|createFolder\(|New folder/.test(OUTPUTS), "the Library makes folders again");
  assert.ok(!/LayoutGrid|chooseView|nemesis\.library\.v1\.view/.test(OUTPUTS), "the grid/list toggle came back");
  assert.match(OUTPUTS, /<DropdownMenuSubTrigger>Move to project<\/DropdownMenuSubTrigger>/, "filing is gone from the row menu");
  assert.ok(!/Add to folder|No folders yet|>\s*No folder\s*</.test(OUTPUTS), "the Library is calling a project a folder again");
});

test("🔴🔴 every behaviour the page had before the restyle still works", () => {
  // A visual pass that quietly drops a feature is a regression wearing a screenshot. All three
  // kinds, the download, the share sheet, the in-place reader and the review.
  for (const kind of ["deck", "slides", "note"]) {
    assert.ok(OUTPUTS.includes(`kind === "${kind}"`) || OUTPUTS.includes(`"${kind}"`), `the ${kind} rows stopped rendering`);
  }
  assert.match(OUTPUTS, /const rowsOf = \(kind: OutputKind\): ReactNode\[\] =>/, "the one renderer per kind is gone");
  assert.match(OUTPUTS, /<RowMenu\b/, "the row menu is gone, so nothing can be filed, downloaded or shared");
  assert.match(OUTPUTS, /Download for Anki/, "a deck can no longer be taken out of the app");
  assert.match(OUTPUTS, />Share</, "the share door is gone from the row menu");
  // 🔴 THE PEEK IS DELIBERATELY GONE (owner, 2026-09-01) — pressing a deck opens it full screen,
  // where the cards ARE the screen. Asserted as an absence so it cannot creep back as a menu row.
  assert.ok(!/"Hide the cards"|"Show the cards"/.test(OUTPUTS), "the peek at a deck's answers came back");
  // 🔴🔴 AND ALL THREE KINDS OPEN THE SAME WAY (owner 2026-09-01 and 2026-09-03): one press,
  // one answer, one header band. A deck lands full screen with the document's crumb, ask bar and
  // Download; a document reads full screen in place; a slide deck opens its own page.
  assert.match(OUTPUTS, /<DeckReview[\s\S]{0,900}initialMode="full"/, "a deck opens as a sidebar from the shelf again");
  const deckMount = OUTPUTS.slice(OUTPUTS.indexOf("<DeckReview"));
  assert.match(deckMount, /crumb="Library"/, "a deck opened from this shelf says it came from somewhere else than the document beside it");
  assert.match(deckMount, /onAsk=\{askAbout\}/, "the deck lost the ask bar the document has");
  assert.match(deckMount, /aria-label="Download for Anki"/, "the deck's header lost the Download the document's header has");
  assert.match(OUTPUTS, /initialMode="full"[\s\S]{0,400}output=\{reading\.output\}/, "the document reader stopped opening full screen");
  assert.match(OUTPUTS, /\/deck\?c=/, "a slide deck no longer opens its own page");
  assert.match(OUTPUTS, /<DeckShare\b/, "the share sheet is gone");
  assert.match(OUTPUTS, /<OutputPreview\b/, "a document no longer opens in place");
  assert.match(OUTPUTS, /\{reviewing && \(?\s*<DeckReview\b/, "pressing a deck no longer reviews it");
  assert.match(OUTPUTS, /link\.download = deckFileName\(/, "a deck can no longer be downloaded");
  // 🔴 A ROW STILL SAYS WHICH PROJECT IT IS IN. Projects left the page; the fact did not.
  assert.match(OUTPUTS, /projectOf\(deck\.folderId\)/, "a deck row stopped naming its project");
  // 🔴🔴 THE SLIDE DESIGN CHIP LEFT THIS PAGE, AND THE DOOR IT WAS IS STILL OPEN ELSEWHERE.
  assert.ok(!/DeckDesignPicker/.test(OUTPUTS), "the design chip came back to a row that cannot show what it changes");
  assert.match(DECK_PAGE, /<DeckDesignPicker\b/, "the design picker left the Library AND the deck page — nothing can pick a look now");
});

test("🔴🔴 a row shows NO control until it is hovered", () => {
  // Owner, 2026-09-01, over a screenshot with the whole trailing column ringed: *"the documents in
  // library have these options that i dont want."* The ⋯ is the frame's 40px round button, held
  // at opacity 0 until the pointer is on the row, the control has focus, or its menu is open.
  assert.match(OUTPUTS, /cn\("group\/row", SOFT_ROW\)/, "the row stopped being the hover group its control listens to");
  assert.match(
    OUTPUTS,
    /opacity-0 transition-\[background-color,color,opacity\] group-hover\/row:opacity-100 focus-visible:opacity-100 data-\[state=open\]:opacity-100/,
    "the trailing control is painted at rest again, or its fade and hover colour overwrite each other",
  );
  // 🔴🔴 THE PRESS IS NOT THE MENU'S PARENT. A menu trigger inside a button is a button inside a
  // button; the press covers the row with `inset-0` and the ⋯ floats beside it.
  assert.match(OUTPUTS, /className="absolute inset-0 flex items-start gap-\[16px\] rounded-\[28px\] p-\[20px\] pr-\[72px\] text-left"/);
  const deck = OUTPUTS.slice(OUTPUTS.indexOf("const deckRow"), OUTPUTS.indexOf("const noteRow"));
  assert.ok(deck.indexOf("</button>") < deck.indexOf("<RowMenu"), "a menu trigger is nested inside a row's press");
});

test("🔴 the search is a round button that opens into a field, and it narrows rather than fetches", () => {
  // The reference has no search; a library of a hundred things needs one, inside the frame's
  // round-button grammar. It filters rows already in hand (200 per kind) — never the server.
  assert.match(OUTPUTS, /<RoundButton label="Search library" onClick=\{\(\) => setSearching\(true\)\}>/);
  assert.match(OUTPUTS, /onBlur=\{\(\) => \{ if \(query === ""\) setSearching\(false\); \}\}/, "an emptied search no longer folds back into its button");
  assert.match(OUTPUTS, /const matches = useCallback\(/, "the search stopped being a local filter");
  assert.ok(!/\.ilike\(|textSearch\(/.test(OUTPUTS), "the search reaches the database");
});

test("🔴🔴🔴 the restyle did not put a redirect on the route the extension opens", () => {
  // The shipped browser extension opens `/library?import=coursework` and the import gate fires on
  // the mere presence of that param. A `redirect()` here — or a move out of `(workspace)` — makes
  // "Send to Nemesis" open a tab that silently never shows the wizard.
  assert.ok(!/redirect\(/.test(PAGE), "the Library route grew a redirect — the extension's import link breaks");
  assert.match(PAGE, /<LibraryOutputs\b/, "the Library route stopped mounting the outputs page");
});

test("🔴🔴🔴 no size or space on this page is written in rem", () => {
  // `html { font-size: 112.5% }`: one rem is 18px here, and every rem-based utility paints 12.5%
  // bigger than its name. A page whose whole point is agreeing with two others cannot use them.
  const rem = OUTPUTS.match(/\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|h|w|size|space-x|space-y)-\d+(?:\.\d+)?\b/g) ?? [];
  assert.deepEqual(rem, [], `rem-based spacing utilities on the Library: ${rem.join(", ")}`);
  const remText = OUTPUTS.match(/\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/g) ?? [];
  assert.deepEqual(remText, [], `rem-based type sizes on the Library: ${remText.join(", ")}`);
});
