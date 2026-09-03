import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the Library is measured, not approximated ───────────────────────────────────────────────
//
// 🔴🔴🔴 THE OWNER'S ACCEPTANCE CONDITION FOR THIS PAGE IS "PIXEL, SIZING, SPACING AND COLOURING
// 1 TO 1" WITH CHATGPT'S LIBRARY. Not "in the spirit of", not "close". Every number asserted below
// was read off the live, signed-in reference with `getComputedStyle` / `getBoundingClientRect` at a
// 1456px viewport, and is recorded in the geometry block at the top of `library-outputs.tsx`.
//
// 🔴 WHY A SOURCE-TEXT TEST AND NOT A RENDER TEST. These are values a stylesheet resolves in a
// browser; there is no DOM in this suite to measure them in. What CAN be defended here is that
// nobody quietly rounds a measured number back to the nearest Tailwind step — `py-2.5` for
// `py-[10px]`, `max-w-3xl` for `max-w-[768px]`, `--ui-stroke-tertiary` for the measured
// `rgba(0,0,0,0.05)`. Every one of those substitutions is invisible in review and each one is a
// failed acceptance. So the guard is: the measured literal is present, and the thing it replaced
// is absent.
//
// 🔴 THE COMMENTS ARE STRIPPED FIRST, and that is the whole point of the `strip` call. The file
// documents every one of these numbers in prose; a test that matched the prose would pass with the
// page rendered in any geometry at all, which is worse than no test because it is counted as
// coverage.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const OUTPUTS = strip(readFileSync(new URL("./library-outputs.tsx", import.meta.url), "utf8"));
// 🔴 THE ROUTE FILE IS STRIPPED TOO, and it has to be: its header comment spends four paragraphs
// explaining why there must never be a `redirect()` here, so an unstripped read of it would fail
// the very guard those paragraphs exist to protect.
const PAGE = strip(readFileSync(new URL("../../../app/(workspace)/library/page.tsx", import.meta.url), "utf8"));
/** The slide design picker moved here; the guard below checks that claim rather than trusting it. */
const DECK_PAGE = strip(readFileSync(new URL("../../../app/(workspace)/deck/page.tsx", import.meta.url), "utf8"));

test("🔴🔴 the page sits on the measured ground, not on white", () => {
  // The reference's page background is its `--component-sidebar-bg`, #fcfcfc — a hair off white.
  // This is the single most visible miss on the whole page: a pure-white surface next to a tinted
  // sidebar reads as a seam down the middle, and it is the one difference a person notices without
  // being told to look for it.
  //
  // 🔴 THE TOKEN CARRIES THE MEASUREMENT, so the token is what is asserted. Our light theme was
  // calibrated against this same app, and `--ui-bg-sidebar` already resolves to #fcfcfc — writing
  // the literal instead would be the same colour today and an opt-out of the theme system forever.
  // The Projects page resolves it identically; the two must be indistinguishable side by side.
  assert.match(OUTPUTS, /bg-\(--ui-bg-sidebar\)/, "the page ground is no longer the reference's #fcfcfc");
  // 🔴 `(?!\/)` — WITHOUT IT THIS GUARD FIRES ON `dark:bg-white/[0.10]`, which is the measured dark
  // row hover, not a white page. A guard that reddens on the correct answer gets deleted, and the
  // real one goes with it.
  assert.ok(!/\bbg-white(?!\/)/.test(OUTPUTS), "the Library went back to a pure-white page");
  // 🔴 AND THE PAGE SCROLLS ITSELF. The shell hands every route a fixed-height `overflow-hidden`
  // box, so without this the shelves are simply cut off at the fold with no way to reach them —
  // which is what this page did before the restyle.
  assert.match(OUTPUTS, /h-full min-h-0 overflow-x-hidden overflow-y-auto/, "the Library is clipped at the fold again");
});

test("🔴🔴 the content column is 768px, and the gutter is not inside it", () => {
  // 🔴 THE LITERAL, NOT `max-w-3xl`. They are the same 768px only while the root font size is 16;
  // one is a measurement and the other is a coincidence that holds today.
  assert.match(OUTPUTS, /max-w-\[768px\]/, "the 768px content column is gone");
  assert.ok(!/max-w-3xl/.test(OUTPUTS), "the column went back to a rem-derived width");
  // 🔴 AND THE COLUMN CARRIES NO HORIZONTAL PADDING. `px-6` on the same element would make the
  // real content 720px, which puts every measured column width (368 / 160 / 88) out by 48px while
  // the class still says 768. The gutter belongs to the scroller around it.
  const column = OUTPUTS.slice(OUTPUTS.indexOf("<main className="), OUTPUTS.indexOf("<header"));
  assert.ok(column.length > 0, "the content column is gone — this guard is pointed at nothing");
  assert.ok(!/\bpx-\d/.test(column), "horizontal padding moved back inside the 768px column");
});

test("🔴 the title is 28px / 500 / 34px, and the search box beside it is 36px", () => {
  assert.match(OUTPUTS, /text-\[28px\] font-medium leading-\[34px\]/, "the page title stopped being 28/500/34");
  // 36px tall, 240px wide, rounded full, 14px, with a leading magnifier — all measured.
  assert.match(OUTPUTS, /h-\[36px\] w-\[240px\]/, "the 36x240 search box is gone");
  assert.match(OUTPUTS, /<Search\b/, "the search box lost its leading magnifier");
  assert.match(OUTPUTS, /aria-label="Search the library"/, "the search input is gone");
  // 🔴 AND IT ACTUALLY NARROWS THE LIST. A search box that filtered nothing would be a dead
  // control drawn for the screenshot, which is the §38 failure in its most literal form.
  assert.match(OUTPUTS, /setQuery\(event\.target\.value\)/, "typing in the search box no longer does anything");
  assert.match(OUTPUTS, /filter\(\(row\) => matches\(row\.name\)\)/, "the search stopped narrowing the decks");
  assert.match(OUTPUTS, /filter\(\(row\) => matches\(row\.title\)\)/, "the search stopped narrowing the notes or slides");
});

test("🔴🔴 the filter pills are 36px tall with 16px of side padding", () => {
  // 🔴 THE SLICE ENDS AT THE PILLS' OWN CLOSING TAG, not at the next control. The primary button
  // used to sit in this row and now sits on the title row above it — a guard bounded by that
  // button silently inverted and started measuring nothing the moment it moved.
  const pillsAt = OUTPUTS.indexOf("{SHELVES.map(");
  const pills = OUTPUTS.slice(pillsAt, OUTPUTS.indexOf("</div>", pillsAt));
  assert.ok(pills.length > 0, "the shelf pills are gone — this guard is pointed at nothing");
  // Measured: height 36, padding `0 16px`, rounded full, 14px / 500 on a 20px line.
  assert.match(
    pills,
    /h-\[36px\] items-center rounded-full px-\[16px\] text-\[14px\] font-medium leading-\[20px\]/,
    "the pills lost the measured geometry",
  );
  // 🔴 WEIGHT 500 IN BOTH STATES. Bolding only the selected pill changes the label's width as you
  // press it, so the whole row shuffles sideways — a wobble the reference does not have, because
  // there selection is carried by the ground and the text colour alone.
  assert.ok(!/font-medium text-\(--ui-text-primary\)/.test(pills), "the selected pill bolds itself again, so the row wobbles");
  assert.match(pills, /bg-\[#f3f3f3\] text-\(--ui-text-primary\) dark:bg-\[#414141\]/, "the selected pill lost its measured ground");
  assert.match(pills, /bg-transparent text-\(--ui-text-secondary\)/, "the unselected pill stopped being transparent");
});

test("🔴🔴🔴 a row is a 60px band with a hairline under it — never a card", () => {
  const row = OUTPUTS.slice(OUTPUTS.indexOf("const ROW =\n"), OUTPUTS.indexOf("const ROW_MAIN"));
  assert.ok(row.length > 0, "the shared row class is gone — this guard is pointed at nothing");
  // Height 60, padding `10px 8px 10px 0` — left padding is deliberately absent, not forgotten.
  assert.match(row, /h-\[60px\]/, "the row stopped being 60px tall");
  assert.match(row, /py-\[10px\]/, "the row lost its measured 10px vertical padding");
  assert.match(row, /pr-\[8px\]/, "the row lost its measured 8px right padding");
  assert.ok(!/\bp[xl]-\d/.test(row), "the row grew left padding the reference does not have");
  // 🔴 THE DIVIDER IS THE ONLY SEPARATOR, AND IT IS LIGHTER THAN ANY BORDER TOKEN WE OWN.
  // `--ui-stroke-tertiary` is 8% in light and 14% in dark; the measured value is 5% in both. Half
  // the weight is the difference between a list and a spreadsheet.
  assert.match(row, /border-b border-b-black\/\[0\.05\]/, "the row divider is no longer the measured rgba(0,0,0,0.05)");
  assert.match(row, /dark:border-b-white\/\[0\.05\]/, "the dark row divider is no longer the measured rgba(255,255,255,0.05)");
  assert.match(row, /hover:bg-black\/\[0\.05\]/, "the row hover is no longer the measured rgba(0,0,0,0.05)");
  assert.match(row, /dark:hover:bg-white\/\[0\.10\]/, "the dark row hover is no longer the measured rgba(255,255,255,0.10)");
  // 🔴 NO RADIUS, NO BOX, NO SHADOW. This page used to draw `rounded-xl` boxes with their own
  // hover, which turns a list of documents into a list of buttons — a different object entirely.
  // The reference has no border-radius and no shadow anywhere on this page.
  assert.ok(!/rounded/.test(row), "the rows went back to being rounded cards");
  assert.ok(!/shadow/.test(row), "a shadow appeared on a page the reference draws flat");
  assert.ok(!/border border-transparent/.test(row), "the row grew a full box outline again");
});

test("🔴 the row leads with the reference's 32px tile, and the glyph's colour names the kind", () => {
  // Re-measured on the reference 2026-08-30 evening (owner: *"they should also have colors like
  // in chatgpt"*): every library row leads with a 32px rounded-[8px] tile on the primary surface
  // with a hairline border, and the 20px glyph INSIDE carries the kind's colour — their .docx
  // draws #0285FF, their .pdf #FF3B30, their folders stay neutral. (The morning's bare-20px-icon
  // reading was the same page before this pass looked closer: the tile is invisible in dark mode
  // because its surface matches the page; the border was the tell.)
  //
  // 🔴🔴 AND THE SURFACE IS `--ui-bg-elevated`, NOT `--ui-bg-primary` — the same NAME means
  // opposite things in the two products. Theirs is the page white; ours is a FILL, and measured on
  // /dev-preview/library/outputs it composited to `color(srgb 0.182 0.182 0.182 / 0.244)`, a 24%
  // dark wash. Owner, 2026-09-01: *"the library has the icons darkened."* Pinned by name because
  // the two tokens differ by one word and the wrong one looks deliberate.
  assert.ok(!/bg-\(--ui-bg-primary\)/.test(OUTPUTS), "the lead tile went back to a fill token and darkened every row");
  assert.match(
    OUTPUTS,
    /const COL_TILE =\s*"mr-\[12px\] flex size-\[32px\] shrink-0 items-center justify-center rounded-\[8px\] border border-black\/\[0\.10\] bg-\(--ui-bg-elevated\) dark:border-white\/\[0\.15\]"/,
    "the leading tile lost the measured geometry",
  );
  assert.match(OUTPUTS, /const KIND_COLOR = \{ deck: "#34C759", note: "#0285FF", slides: "#FF9500" \} as const;/, "the kind colours drifted");
  for (const [icon, kind] of [["Layers", "deck"], ["MonitorPlay", "slides"], ["NotebookText", "note"]] as const) {
    assert.match(
      OUTPUTS,
      new RegExp(`<span className=\\{COL_TILE\\}><${icon} size=\\{20\\} strokeWidth=\\{1\\.8\\} style=\\{\\{ color: KIND_COLOR\\.${kind} \\}\\} /></span>`),
      `the ${icon} row glyph lost its tile or its colour`,
    );
  }
  assert.match(
    OUTPUTS,
    /<span className=\{COL_TILE\}><FolderIcon className="text-\(--ui-text-secondary\)" size=\{20\} strokeWidth=\{1\.8\} \/><\/span>/,
    "folders stopped being neutral in their tile",
  );
  assert.match(OUTPUTS, /const ROW_NAME = "min-w-0 flex-1 truncate text-\[14px\] font-normal text-\(--ui-text-primary\)"/, "the row name stopped being 14px/400");
  // 🔴 THE META IS 14px SECONDARY, NOT 12px QUATERNARY. The dates on this page used to be a size
  // smaller and a shade fainter than the reference's, which made every row look bottom-heavy.
  assert.match(OUTPUTS, /const ROW_META = "text-\[14px\] text-\(--ui-text-secondary\)"/, "the row meta stopped being 14px secondary");
  assert.ok(!/canvas-text-meta/.test(OUTPUTS), "the 12px meta size came back to the Library");
});

test("🔴🔴 the columns are the measured widths, and the header row exists at all", () => {
  // Reference: Name 368 / Modified 160 / Size 88, and the 16px `padding-left` on that third column
  // is INSIDE its 88 — adding it again is what put a phantom term in the shared doc's arithmetic.
  // The Name column is the flexible one and lands on exactly 368 because the row closes:
  //
  //   32 lead (20px icon + 12px gap) + 616 cells (368 + 160 + 88) + 112 tail + 8 right pad = 768
  //
  // 🔴 MEASURE EVERY TERM, THEN CLOSE THE SUM. `368 + 160 + 88 + 16 = 632` survived a doc, a code
  // comment and a test comment because a remainder swallows a spare term and still looks right —
  // but closing it is the weaker half of the rule, and these assertions are the stronger half:
  // icon-outside and icon-inside both close to 768, so only a measured term tells them apart.
  assert.match(OUTPUTS, /const COL_MODIFIED = "w-\[160px\] shrink-0"/, "the Modified column stopped being 160px");
  assert.match(OUTPUTS, /const COL_COUNT = "w-\[88px\] shrink-0 pl-\[16px\]"/, "the third column stopped being 88px with a 16px inset");
  assert.match(OUTPUTS, /const COL_ACTIONS = "flex w-\[112px\] shrink-0 items-center justify-end"/, "the trailing slot stopped being the measured 112px");
  // 🔴 THE COLUMN HEADER IS THE ONE THING THE REFERENCE HAD THAT THIS PAGE DID NOT. 14px / 400 /
  // secondary, 20px tall.
  // 🔴 `leading-[20px]` IS LOAD-BEARING. The app's body line-height is 1.6, so 14px text draws a
  // 22.4px line box and the header's words hang 1.2px below the 20px row they are supposed to fill.
  // It looks right and measures wrong, which is this page's whole failure mode.
  assert.match(
    OUTPUTS,
    /"flex h-\[20px\] items-center pr-\[8px\] text-\[14px\] leading-\[20px\] font-normal text-\(--ui-text-secondary\)"/,
    "the column header lost its measured type",
  );
  // 🔴 THE THIRD COLUMN IS HELD OPEN EVEN WHERE IT IS EMPTY. Dropping it on the shelves with no
  // count moved their Modified 88px left, so three shelves printed dates in three places and the
  // page read as three unrelated tables. Measured: Modified starts at x=770 and Name is 368 wide on
  // all three, which is the reference's own Name width rather than a wider one on two of them.
  // Counted rather than spot-checked, because the failure is silent: a row that renders one and
  // not the other still looks fine on its own and only drifts when you compare it to another shelf.
  const modifieds = (OUTPUTS.match(/COL_MODIFIED/g) ?? []).length;
  const counts = (OUTPUTS.match(/COL_COUNT/g) ?? []).length;
  assert.ok(modifieds > 4, "the Modified column is gone — this guard is pointed at nothing");
  assert.equal(
    counts,
    modifieds,
    "a row renders Modified without holding the third column open, so its date drifts out of the grid",
  );
  // 🔴🔴 ONE HEADER PER SHELF, AND ONE WORD FOR THE THIRD COLUMN. It used to say `Items` over the
  // folders table and `Cards` over the deck table, on the same screen, above identical column
  // stops — owner, 2026-09-01: *"mainly the columns are just not aligned and they drift a bit… all
  // of them have different settings."* The stops were exact to the pixel (measured 461 / 505 / 861
  // / 1021 / 1109 on all four shelves); what drifted was a header that renamed itself depending on
  // which group of rows you were looking at, printed twice on one page.
  for (const heading of ["Name", "Modified", "Items"]) {
    assert.ok(OUTPUTS.includes(`>${heading}</span>`), `the ${heading} column header is gone`);
  }
  assert.ok(!/>Cards</.test(OUTPUTS), "the third column renames itself per group again");
  // 🔴 EXACTLY FOUR HEADERS IN THE FILE — one per shelf, never two on one screen.
  assert.equal((OUTPUTS.match(/<li className=\{COLUMN_HEAD\}>/g) ?? []).length, 4, "a shelf grew a second column header, or lost its own");
  // 🔴🔴 AND WE DO NOT INVENT THE ONE WE HAVEN'T GOT. The reference's third column is a byte size.
  // We hold no size for a deck, a note or a slide deck, so the deck shelf spends that column on a
  // real card count and the other two shelves simply have two columns. A "Size" header over a
  // column of em dashes would be a promise the page can never keep.
  assert.ok(!/>Size</.test(OUTPUTS), "a Size column appeared for data we do not have");
});

test("🔴🔴 every behaviour the page had before the restyle still works", () => {
  // A visual pass that quietly drops a feature is a regression wearing a screenshot. All three
  // shelves, both pickers, the download, the share sheet, the in-place reader and the review.
  for (const kind of ["deck", "slides", "note"]) {
    assert.ok(OUTPUTS.includes(`{showing("${kind}") && (`), `the ${kind} shelf stopped rendering`);
  }
  assert.match(OUTPUTS, /<RowMenu\b/, "the row menu is gone, so nothing can be filed, downloaded or shared");
  assert.match(OUTPUTS, /Download for Anki/, "a deck can no longer be taken out of the app");
  assert.match(OUTPUTS, />Share</, "the share door is gone from the row menu");
  // 🔴 THE PEEK IS DELIBERATELY GONE (owner, 2026-09-01: *"the option to show the flashcard I don't
  // think that's really necessary in the library"*) — pressing a deck opens it full screen, where
  // the cards ARE the screen. Asserted as an absence so it cannot creep back as a menu row.
  assert.ok(!/"Hide the cards"|"Show the cards"/.test(OUTPUTS), "the peek at a deck's answers came back");
  // 🔴🔴 AND ALL THREE KINDS OPEN THE SAME WAY. Owner, same day: *"it's kinda weird because all of
  // them have different settings… the slides and the documents, they both have different top
  // header settings."* A document opened full screen, a deck slid in a sidebar, and a slide deck
  // LEFT THE PAGE for /deck. One press, one answer, one header band now.
  //
  // 🔴🔴 REPOINTED AND WIDENED 2026-09-03. It pinned one line, `<DeckReview deckId={reviewing}
  // initialMode="full"`, and passed for two days over a deck that still wore a DIFFERENT header
  // from the document beside it. Owner: *"it doesn't have the same toolbar… it should be the same,
  // basically the one it has for the document."* Landing full screen was never the whole rule.
  assert.match(OUTPUTS, /<DeckReview[\s\S]{0,900}initialMode="full"/, "a deck opens as a sidebar from the shelf again");
  const deckMount = OUTPUTS.slice(OUTPUTS.indexOf("<DeckReview"));
  assert.match(deckMount, /crumb="Library"/, "a deck opened from this shelf says it came from somewhere else than the document beside it");
  assert.match(deckMount, /onAsk=\{askAbout\}/, "the deck lost the ask bar the document has");
  assert.match(deckMount, /aria-label="Download for Anki"/, "the deck's header lost the Download the document's header has");
  assert.match(OUTPUTS, /initialMode="full"[\s\S]{0,400}output=\{reading\.output\}/, "the document reader stopped opening full screen");
  // 🔴 A SLIDE DECK STILL OPENS AS ITS OWN PAGE, AND THE OWNER SAID SO: *"the slides … they open
  // like a new page pretty much. The ones that I have there open a new page. And the library is
  // fine."* Opening it in place beside the document reader was tried for consistency's sake and
  // reverted: `/deck` composes the REAL slides and carries the design picker and the .pptx export,
  // while the in-panel view is an outline of the plan. What was wrong was the header, and that is
  // fixed where it lives — see artifact-chrome.test.ts for the one-band guard.
  assert.match(OUTPUTS, /\/deck\?c=/, "a slide deck no longer opens its own page");
  assert.match(OUTPUTS, /<DropdownMenuSubTrigger>Move to project<\/DropdownMenuSubTrigger>/, "filing is gone from the row menu");
  assert.match(OUTPUTS, /<DeckShare\b/, "the share sheet is gone");
  assert.match(OUTPUTS, /<OutputPreview\b/, "a document no longer opens in place");
  // 🔴 REPOINTED 2026-09-03: the mount carries props now, so it wraps in parentheses.
  assert.match(OUTPUTS, /\{reviewing && \(?\s*<DeckReview\b/, "pressing a deck no longer reviews it");
  assert.match(OUTPUTS, /link\.download = deckFileName\(/, "a deck can no longer be downloaded");
  assert.match(OUTPUTS, /createFolder\(userId/, "a folder can no longer be made from the Library");
  // 🔴🔴 THE SLIDE DESIGN CHIP LEFT THIS PAGE, AND THE DOOR IT WAS IS STILL OPEN ELSEWHERE. It
  // was the one control the reference has no equivalent of, it carried a WORD in a slot measured
  // for glyphs, and it asked a learner to choose a look beside a row that shows none of it. The
  // same picker sits on /deck, over the actual slides. Checked on the deck page rather than
  // asserted in prose, because "it exists somewhere else" is exactly the claim that rots.
  assert.ok(!/DeckDesignPicker/.test(OUTPUTS), "the design chip came back to a row that cannot show what it changes");
  assert.match(DECK_PAGE, /<DeckDesignPicker\b/, "the design picker left the Library AND the deck page — nothing can pick a look now");
});

test("🔴🔴 a row shows NO control until it is hovered", () => {
  // Owner, 2026-09-01, over a screenshot with the whole trailing column ringed: *"the documents in
  // library have these options that i dont want."* Every row printed its controls at rest — up to
  // four glyphs on a deck and a named chip on a slide deck — so a nine-row list carried eleven
  // glyphs and two words before anyone reached for anything. This file's own measurement note has
  // always called the 112px slot "the space its hover menu lives in"; the page filled it with a
  // toolbar instead.
  assert.match(OUTPUTS, /const ROW =\s*"group\/row /, "the row stopped being the hover group its control listens to");
  assert.match(
    OUTPUTS,
    /const ROW_ACTION_QUIET =\s*"opacity-0 group-hover\/row:opacity-100 focus-visible:opacity-100 data-\[state=open\]:opacity-100"/,
    "the trailing control is painted at rest again",
  );
  // 🔴 EVERY TRAILING CONTROL IS THE QUIET ONE. A single loud button left behind is the whole
  // complaint back at one-quarter size, and it would read as the odd row rather than the odd rule.
  assert.equal(
    (OUTPUTS.match(/className=\{ROW_ACTION\b/g) ?? []).length + (OUTPUTS.match(/cn\(ROW_ACTION, ROW_ACTION_QUIET\)/g) ?? []).length,
    1,
    "a row grew a second trailing control, or one of them stopped being quiet",
  );
  assert.match(OUTPUTS, /cn\(ROW_ACTION, ROW_ACTION_QUIET\)/, "the row menu's own trigger is not the quiet control");
  // 🔴 ONE `transition-property`, NOT TWO UTILITIES FIGHTING. `transition-colors` and a separate
  // opacity transition both set the property and the later rule in the generated sheet wins,
  // whatever order they are written in here — so one of them silently does nothing.
  assert.match(OUTPUTS, /transition-\[background-color,color,opacity\]/, "the control's fade and its hover colour are back to overwriting each other");
});

test("🔴🔴🔴 the restyle did not put a redirect on the route the extension opens", () => {
  // The shipped browser extension opens `/library?import=coursework` and the import gate fires on
  // the mere presence of that param. A `redirect()` here — or a move out of `(workspace)` — makes
  // "Send to Nemesis" open a tab that silently never shows the wizard. A shipped client cannot be
  // updated by this repo, so this is checked on every change to the page, cosmetic ones included.
  assert.ok(!/redirect\(/.test(PAGE), "the Library route grew a redirect — the extension's import link breaks");
  assert.match(PAGE, /<LibraryOutputs\b/, "the Library route stopped mounting the outputs page");
});

test("🔴🔴🔴 no size or space on this page is written in rem", () => {
  // 🔴🔴 ONE REM IS 18px HERE. `globals.css` sets `html { font-size: 112.5% }` to scale the whole
  // desktop-parity UI, so every rem-based Tailwind utility renders 12.5% larger than its name says:
  // `px-4` is 18px not 16, `h-9` is 40.5 not 36, `leading-5` is 22.5 not 20, `size-7` is 31.5 not
  // 28, `gap-3` is 13.5 not 12, `text-sm` is 15.75 not 14 — and `max-w-3xl` is 864, not the 768 it
  // is famous for, which is what this page shipped for months.
  //
  // 🔴 THE FIRST DRAFT OF THIS RESTYLE USED `h-9`, `px-4` AND `leading-5` AND MEASURED
  // 40.5 / 18 / 22.5 IN REAL CHROME. That is the nastiest shape a bug can take on a 1:1 brief:
  // every class name is the right number, every pixel is wrong, and there is nothing for a reviewer
  // to see. So the rule has no exceptions — every size and space on this page is an explicit px
  // value, and the steps below may never come back to it. `globals.css` says the same thing in its
  // own comment: "WRITE THESE IN PX, NEVER REM".
  //
  // 🔴 THE TYPE SCALE IS IN THE BAN TOO. `text-sm` is the one that slips a spacing-only regex, and
  // it is 15.75px on a page whose every text size was measured at 14.
  const banned = ["h-9", "px-4", "leading-5", "size-7", "h-5", "w-5", "mr-3", "pr-2", "pl-4", "pl-9", "max-w-3xl"];
  for (const scale of ["xs", "sm", "base", "lg", "xl", "2xl"]) banned.push(`text-${scale}`);
  for (const step of banned) {
    assert.ok(
      !new RegExp(`(^|[\\s"'\`])${step}([\\s"'\`]|$)`, "m").test(OUTPUTS),
      `\`${step}\` is back on the Library — with --spacing at 4.5px it is not the number it reads as`,
    );
  }
  // And the values it was traded for are all present.
  for (const literal of ["h-[36px]", "px-[16px]", "leading-[20px]", "size-[28px]", "h-[20px]", "mr-[12px]", "pr-[8px]", "pl-[16px]"]) {
    assert.ok(OUTPUTS.includes(literal), `the measured ${literal} is gone`);
  }
});

test("🔴🔴🔴 if anyone ever swaps these literals for the scale token, they cannot do it the broken way", () => {
  // 🔴 THIS GUARD DEFENDS A CONVERSION I DID NOT MAKE, and that is the point. The Canvas's own
  // §46.3 guard (canvas-shell.test.ts) bans bare `text-[14px]` on the surfaces it covers, and its
  // roots are `learn/` and `shell/` — this page is out of scope, so its literals stand. But its
  // roots may widen, or someone may simply tidy this file "to use the token like everywhere else".
  //
  // 🔴🔴 AND THE OBVIOUS SPELLING OF THAT TIDY-UP IS SILENTLY BROKEN. In Tailwind,
  // `text-[var(--x)]` is a COLOUR utility: it emits `color: var(--canvas-text-small)` and applies
  // NO font size at all. It has already shipped that way once in this repo — §46.3's own comment
  // records it — and it was found by an unrelated CSS build error, not by review, because the
  // class name reads correctly. The tree has since been swept: 336 correct
  // `text-[length:var(--canvas-text-…)]` against 0 broken.
  //
  // 🔴 THIS PAGE IS WHERE IT WOULD HIDE LONGEST. 14px is close enough to the inherited body size
  // that losing it does not scream, and the whole acceptance condition here is pixel parity — so
  // the failure would read as "the 1:1 work regressed", with no sign of the cause.
  //
  // So: no opinion here on WHETHER to convert (that is an owner call between two mandates). Only
  // that the broken spelling cannot land on this page unnoticed, whichever way that goes.
  assert.ok(
    !/text-\[var\(--canvas-text-/.test(OUTPUTS),
    "`text-[var(--canvas-text-…)]` is a COLOUR utility in Tailwind and applies no size — it needs the `length:` hint",
  );
});

test("🔴🔴 the page's one primary button is the product's accent, not a faint text link", () => {
  // The reference's shared frame puts exactly one filled pill on every page of it (its black
  // "New"). The Library's equivalent is "New folder", and it used to be `--ui-text-secondary` on
  // transparent — in dark mode, a control you have to hunt for.
  //
  // 🔴 `--ui-action`, NOT THE REFERENCE'S `#0d0d0d`. Three units apart and indistinguishable on
  // screen, but `--ui-action` is the accent the Settings picker writes and the mascot follows
  // (owner, 2026-08-23). A literal would be the one button in the app that ignores the learner's
  // chosen colour. The Projects page's "New" is this exact string; the two pages are meant to be
  // indistinguishable side by side.
  assert.match(
    OUTPUTS,
    /h-\[36px\] shrink-0 items-center gap-\[6px\] rounded-full bg-\(--ui-action\) px-\[16px\] text-\[14px\] font-medium text-\(--ui-action-glyph\)/,
    "the Library's primary button is no longer the accent pill the Projects page uses",
  );
});
