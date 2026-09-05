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
  /**
   * 28x28 at radius 12.5, holding a 20px glyph, adjacent on a 28px pitch.
   *
   * 🔴🔴 RE-MEASURED LIVE IN THE DESKTOP APP ON 2026-09-04 (owner: *"just copy the ChatGPT side
   * panel … can you just copy one for one because to give us a good baseline"*), over CDP in his
   * own signed-in app, window zoom 1.1 divided out: Save and full screen are 28x28 with a 22px
   * (20 design) glyph at 50% ink, `rounded-lg` computing to 12.5px, and they touch: 1356 and
   * 1387, no gap. The 8px radius this replaced was ChatGPT's WEB close button (2026-08-25) and
   * the 18px glyph was their annotate toggle's `icon-sm`; the row's own controls are these.
   */
  button: "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[12.5px] transition-colors hover:bg-(--ui-bg-tertiary)",
  icon: "20px",
  /**
   * The panel's ONE row: the open things as tabs on the left, the controls on the right.
   *
   * 🔴🔴 ONE ROW, NOT TWO, AND THE NAME ROW IS GONE — owner, 2026-09-04, with ChatGPT's Work pane
   * on screen: *"i dont want the top bar or the outline comments … i want the multiple tabs too
   * with the annotation/comment feature"*. Their row is tabs at the left and Open / download /
   * expand / close at the right, and nothing under it but the document: the tab IS the name. The
   * 36px name band this replaced said the name a second time under the tab that already said it.
   *
   * 🔴 THEIR `h-toolbar`, MEASURED: 46px tall, `ps-2 pe-2` (8px), white, no rule under it, the
   * strip and the controls each `my-auto`. Nothing here is a taste call.
   */
  row: "flex h-[46px] shrink-0 items-center gap-[8px] px-[8px]",
  /**
   * The flush band a full PAGE wears (`deck-view.tsx`, which is a route and not a panel): 28 + 4
   * top + 4 bottom = 36px. The panels stopped using it on 2026-09-04 when their name row went; a
   * page has no tabs to name it, so its band still carries the crumb.
   */
  header: "flex items-center gap-[4px] px-[10px] py-[4px]",
  /** 14px / 400 / 20px line. `--canvas-text-small` IS 14px (see desktop-ui.css), so the size comes
   *  from the scale as §46.3 requires; only the line height needs stating. */
  crumb: "truncate text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-primary)",
} as const;

/**
 * The docked panel's geometry: a rounded panel floating beside the conversation.
 *
 * 🔴🔴 THE OWNER'S FINAL WORD, 2026-09-04, AFTER BOTH REFERENCES: *"actually just copy the ChatGPT
 * side panel and just give it rounded corners … can you just copy one for one because to give us
 * a good baseline."* So the ROW and everything in it is ChatGPT's desktop pane, measured live
 * (`CHROME`, dock-tabs.tsx, comment-layer.tsx), and the corners and the air around the panel are
 * what "give it rounded corners" needs: a panel flush to the window's edge cannot show a corner,
 * so it keeps the inset and the gap Gemini's canvas was measured with below. The corner itself is
 * 24px, the app's own large radius, and small enough that ChatGPT's 8px tab inset still clears
 * the curve (at the tab's top edge a 24px corner reaches 5px in; the 40px corner this replaced
 * reached 15 and needed a 20px inset that was not theirs).
 *
 * 🔴🔴 GEMINI'S CANVAS, MEASURED IN THE OWNER'S OWN ACCOUNT ON 2026-09-04 (viewport 1470x779,
 * `getBoundingClientRect` and `getComputedStyle`, never a screenshot). He sent the link and said:
 * *"it has the rounded corners for the side panel. And essentially, this is kind of how I want to
 * envision the chat to be, where you have like the chat on the left side and you have the right
 * panel on the right side where you can view like documents and, you know, annotate."*
 *
 *   their panel     left 557, top 24, 865 x 707; right margin 48, bottom margin 48
 *   corner          40px
 *   edge            1px solid rgba(0, 0, 0, 0.08); no shadow; white
 *   chat column     449 = ONE THIRD of the 1346 between the rail and the right margin
 *   panel column    897 = TWO THIRDS, holding a 32px gap and then the panel
 *   opening         the panel scales from 0.6 to 1 over 500ms on cubic-bezier(0.2, 0, 0, 1),
 *                   opacity 0 to 1 over the first 200ms; the chat column slides in 20% of its
 *                   width on the same curve
 *
 * 🔴 THIS REVERSES THE 2026-08-25 RULE ("flush: no radius, no shadow, no inset, right edge on the
 * viewport"), which was ChatGPT's conversation pane measured the same way. The owner chose the
 * other reference in writing, so the numbers changed and the method did not.
 *
 * 🔴 24 ON EVERY SIDE, NOT THEIR 48 ON THE RIGHT. Their 48 pairs with a 24px gutter their whole
 * window carries; ours carries none, and a panel 48px from the edge beside a rail 0px from it
 * read as off-centre. The GAP to the conversation is theirs exactly, because that is the number
 * the eye reads.
 */
export const DOCK_MARGIN = 24;
export const DOCK_GAP = 32;
export const DOCK_RADIUS = 24;
/** `--nav-rail-width` in globals.css. The sidebar folds to this when a panel opens (side-panel.tsx). */
export const NAV_RAIL_WIDTH = 52;

/**
 * How wide a docked panel's COLUMN is, as a fraction of the space between the rail and the window's
 * right edge.
 *
 * 🔴 MEASURED TWICE AND THE SAME BOTH TIMES: 980 of 1470 in ChatGPT's pane (2026-08-25), and
 * Gemini's `grid-template-columns: 1fr 2fr` (2026-09-04). The column holds the gap and the panel
 * (`use-dock-width.ts`), so the conversation keeps its third. The panel shipped first at 38rem,
 * 608px, a little over a third, which is a different object: a document at that width wraps every
 * line twice and reads as a sidebar rather than as the thing you opened.
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
