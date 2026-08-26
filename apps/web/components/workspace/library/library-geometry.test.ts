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

test("🔴 the row's parts are the measured sizes: 20px icon, 14px name, 14px meta", () => {
  // Leading icon 20x20 in `--icon-secondary` — it used to be a 16px tertiary glyph, which reads
  // as a bullet rather than as a file type.
  assert.match(OUTPUTS, /const COL_ICON = "mr-\[12px\] shrink-0 text-\(--ui-text-secondary\)"/, "the leading icon lost its measured colour or gap");
  for (const icon of ["FolderIcon", "Layers", "MonitorPlay", "NotebookText"]) {
    assert.match(OUTPUTS, new RegExp(`<${icon} className=\\{COL_ICON\\} size=\\{20\\}`), `the ${icon} row icon is not 20x20`);
  }
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
  for (const heading of ["Name", "Modified", "Cards"]) {
    assert.ok(OUTPUTS.includes(`>${heading}</span>`), `the ${heading} column header is gone`);
  }
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
  assert.match(OUTPUTS, /<FolderPicker\b/, "the move-to-folder menu is gone");
  assert.match(OUTPUTS, /<DeckDesignPicker\b/, "the slide design picker is gone");
  assert.match(OUTPUTS, /<DeckShare\b/, "the share sheet is gone");
  assert.match(OUTPUTS, /<OutputPreview\b/, "a document no longer opens in place");
  assert.match(OUTPUTS, /\{reviewing && <DeckReview /, "pressing a deck no longer reviews it");
  assert.match(OUTPUTS, /link\.download = deckFileName\(/, "a deck can no longer be downloaded");
  assert.match(OUTPUTS, /createFolder\(userId/, "a folder can no longer be made from the Library");
  // 🔴 THE DESIGN CHIP IS ALLOWED TO SHRINK, and that is load-bearing rather than cosmetic. It is
  // the one control the reference has no equivalent of, it carries a word rather than a glyph, and
  // at its longest ("Schoolhouse") it outgrows the measured 112px trailing slot. Letting it give up
  // width keeps the Modified column in the one place all three shelves agree on.
  assert.match(OUTPUTS, /\[&>button\]:shrink/, "the design chip can push the Modified column out of the grid again");
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
