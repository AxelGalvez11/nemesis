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

export const CHROME = {
  /** 36x36 at radius 8, holding a 20x20 glyph, on a 40px pitch: 36 + gap 4. */
  button: "flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[8px] transition-colors hover:bg-(--ui-bg-tertiary)",
  icon: "20px",
  /** Buttons sit at y=5.5 in the reference, so the band is 47px; the gap makes the 40px pitch. */
  header: "flex items-center gap-[4px] px-[12px] py-[5.5px]",
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
