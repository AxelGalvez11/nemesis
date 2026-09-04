// The chrome every docked reader on the canvas wears, and how wide it docks.
//
// 🔴🔴 EXTRACTED 2026-08-27 BECAUSE A SECOND READER ARRIVED. Owner: *"file preview should open with
// sidebar not as popup."* The source preview was a centred modal; making it a docked panel meant it
// had to match the artifact reader beside it, and two hand-written copies of these numbers would
// drift the first time one was adjusted. There is one set now and both import it.
//
// 🔴 EXPLICIT PIXELS, NOT REM UTILITIES, AND MEASURING BOTH SIDES IS WHAT CAUGHT IT. This app sets
// `html { font-size: 112.5% }`, so every rem in Tailwind lands 1.125x too big. Written the obvious
// way — `size-9 rounded-lg gap-2 leading-5` — the panel measured 40.5x40.5 buttons at a 13.5px
// radius on a 49.5px pitch with a 22.5px line, against a reference of 36x36 at 8px on 40 with a
// 20px line. Every one of those reads as "close enough" in a screenshot and none of them is the
// number.

// 🔴🔴 RE-MEASURED AND SHRUNK 2026-09-04. Owner: *"the sidebar headers containing the tabs and
// tools feel too big, do you understand? ... i want it to look like how chatgpt does it,
// minimalist"*. The old numbers came from the reference's OWN pane, but from the wrong part of it:
// 36x36 buttons with 20px glyphs are what their CLOSE control wears, and every other control in
// that header is smaller. Read out of their desktop bundle
// (`artifact-source-bootstrap`, `size:"toolbar"` + `uniform:true`):
//
//   their control    28x28, radius 12.5, an 18px glyph, 4px apart, in a 48px band
//   their close      32x32, the one control that is bigger than the rest
//   ours, before     36x36, radius 8, a 20px glyph, 4px apart, in a 47px band
//   ours, now        28x28, radius 8, an 18px glyph, 4px apart, in a 36px band
//
// 🔴 THE BAND IS TIGHTER THAN THEIRS ON PURPOSE, AND ONLY BECAUSE WE HAVE TWO. Their pane shows one
// document and has no tab strip at all (checked: no `role="tablist"` anywhere in its 53-module
// manifest). Ours shows several, so the tabs need their own row above this one — the arrangement
// the owner asked for and `dock-tabs.tsx` explains. Two rows at their 48px would be 96px of chrome
// over the document. At 32 + 36 it is 68px, down from 83px, and every number in it is measured.
//
// 🔴 ONE SIZE FOR EVERY CONTROL, WHICH IS WHERE WE DEPART FROM THE REFERENCE. They make close 32px
// among 28s. At their scale that reads as emphasis; at ours it reads as a mistake, and "minimalist"
// was the instruction.
export const CHROME = {
  /** 28x28 at radius 8, holding an 18x18 glyph, on a 32px pitch: 28 + gap 4. */
  button: "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] transition-colors hover:bg-(--ui-bg-tertiary)",
  icon: "18px",
  /** 28 + 4 top + 4 bottom = a 36px band. */
  header: "flex items-center gap-[4px] px-[10px] py-[4px]",
  /** 14px / 400 / 20px line. `--canvas-text-small` IS 14px (see desktop-ui.css), so the size comes
   *  from the scale as §46.3 requires; only the line height needs stating. */
  crumb: "truncate text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-primary)",
} as const;

/**
 * How wide a docked panel is, as a fraction of the viewport.
 *
 * 🔴 MEASURED AT 980 OF 1470 = 0.667, NOT CHOSEN. The panel shipped first at 38rem — 608px, a
 * little over a third — which is a different object: a document at that width wraps every line
 * twice and reads as a sidebar rather than as the thing you opened.
 */
export const DOCK_FRACTION = 2 / 3;

/**
 * The three sizes any opened artifact can take.
 *
 * 🔴🔴 SHARED SINCE 2026-09-03, AND SPLITTING IT WAS THE BUG. The document reader grew a third
 * size on 2026-09-01 (owner: *"when users open the initial artifact in the library, it should take
 * up the whole screen except for the sidebar. And then if they want a full screen, then the sidebar
 * will disappear."*) and the flashcard panel did not, so it still only knew `docked | full`. From
 * the Library both open full — and then one press of the same-looking button gave the document a
 * bigger view and the deck a narrow sidebar over a shelf. Owner, 2026-09-03: *"when you undo the
 * full screen it kind of does this, which is different than the documents one."*
 *
 *   docked      a side sheet at the dragged width, with the surface beside it. The canvas.
 *   full        everything but the nav rail (`--nav-column`). The Library's opening size.
 *   maximized   everything, rail included. Nothing but the artifact.
 */
export type ReaderMode = "docked" | "full" | "maximized";

/**
 * One step bigger than the size a panel opened at. PURE.
 *
 * 🔴 THE TOGGLE IS A PAIR, NOT A CYCLE, AND IT KEYS ON WHERE THE PANEL OPENED. A canvas opens
 * `docked` and its button has always meant "fill the window", which is `full`; the Library opens
 * `full` and its button means "and lose the rail too". A three-way cycle on one control would make
 * getting back a double press, and would change the canvas's behaviour to fix the Library's.
 */
export function biggerThan(opened: ReaderMode): ReaderMode {
  return opened === "docked" ? "full" : "maximized";
}
