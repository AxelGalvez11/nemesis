// The Canvas's measured numbers, in one place — the phone's half of a contract that was written
// on the web and then measured off it, rather than re-guessed here.
//
// 🔴 EVERY NUMBER BELOW IS A RESOLVED PIXEL VALUE, NOT A rem. `apps/web/app/globals.css` sets
// `html { font-size: 112.5% }`, so on the web 1rem is 18px and a `gap-1.5` is 6.75px, not 6. Any
// number in this file that looks oddly precise (6.75, 11.25, 27) is a Tailwind spacing step that
// has already been through that multiplication. Rounding them to the phone's 4pt grid was tried
// first and is exactly how the two surfaces drift: the source pill's asymmetric 6.75/11.25
// padding is what makes a favicon sit centred inside a 23pt pill, and 8/12 does not.
//
// 🔴 THE COMPOSER IS THE ONE PLACE THE PHONE DELIBERATELY DOES NOT MATCH THE WEB, and it is not
// an oversight to be tidied away later. The owner asked for two things in the same breath — "the
// canvas does not match the web" and "the composer should match the attached chatgpt ios app
// style, i need the font and sizing to be the same" — and those are different instructions. The
// web composer is ONE row: `+`, textarea, mic and send all on a single line
// (`canvas-composer.tsx:677`). The ChatGPT iOS composer the owner attached is TWO rows: the field
// alone on the first, the controls on the second. For the composer the ChatGPT reference wins and
// the web does not. Do not "fix" this back to one row.
//
// What is still taken from the web, because it is the same object on both: the 36pt control, the
// 20pt glyph inside it, and the fact that the send button is always drawn.
//
// 🔴 COLOUR IS NEVER TAKEN FROM EITHER REFERENCE. Only shape, type and size. The palette comes
// from `theme/palette.ts` through `useTheme()`, which is why nothing in this file is a colour.

/** The composer, matching the ChatGPT iOS shape (see the header). */
export const COMPOSER = {
  /** ~16pt side margins, as the reference. */
  marginX: 16,
  /**
   * 🔴 26, NOT `radius.pill`. The phone shipped `borderRadius: 999`, which is a lozenge — it
   * tracks the height, so the moment the field wraps to a second line the ends stop being round
   * and start being ovals. The reference is a fixed 26pt corner that stays a corner however tall
   * the box grows. (The web token is `--composer-radius: 28px`; the reference's is 26, and the
   * composer follows the reference.)
   */
  radius: 26,
  padX: 8,
  padTop: 10,
  padBottom: 8,
  /** Row 2's clearance from the field above it. */
  rowGap: 8,
  /** Every round control on the row — the web's `--composer-control: 36px`. */
  control: 36,
  /** The `+`, dial and mic glyphs. The reference draws these larger than the web's 20. */
  glyph: 24,
  /** The send arrow, inside a filled 36pt disc — the web's `--composer-icon: 20px`. */
  sendGlyph: 20,
  /** Between the three right-hand controls. */
  controlGap: 4,
  /** Send stands off from the group to its left. */
  sendGap: 8,
  /**
   * 🔴 17/22 IS A DELIBERATE EXEMPTION FROM `theme/tokens.ts`'s text scale, and it needs to be
   * named as one or the next standardisation pass will bump it back to `type.body` (18/28) and
   * silently re-break the match the owner asked for. Two reasons it is this number and not
   * another:
   *   1. 17 is the iOS system body size and the size in the reference the owner attached.
   *   2. 🔴 IT MUST NEVER GO BELOW 16. `apps/web/components/workspace/learn/canvas-composer.tsx`
   *      records why: mobile Safari zooms the viewport when a focused input is under 16px, and
   *      the phone's web build is the same browser. 16 is a floor, not a preference.
   */
  fontSize: 17,
  lineHeight: 22,
  /** One line, before anything is typed. */
  inputMinHeight: 22,
  /** Six lines, then the field scrolls instead of growing. */
  inputMaxHeight: 132,
} as const;

/** The canvas's own type scale — `apps/web/app/styles/desktop-ui.css:389-410`, already in px. */
export const CANVAS_TEXT = {
  meta: 12,
  small: 14,
  body: 16,
  lead: 18,
  title: 24,
  question: 20,
} as const;

/** `canvas-surface.tsx:39` — `CANVAS_COLUMN_PX`. Everything on the canvas is this wide except the
 *  composer, which is 768. On a phone both are simply "the screen", but the ratio is why the
 *  document keeps a slightly larger side gutter than the composer does. */
export const CANVAS_COLUMN = 680;

/** The one crossfade — `apps/web/lib/learn/canvas-crossfade.ts`. Sequential: the outgoing subtree
 *  finishes leaving before the incoming one starts arriving, so 380ms in total. Opacity ONLY;
 *  nothing slides, scales or bounces. */
export const FADE_OUT_MS = 160;
export const FADE_IN_MS = 220;

/** `.canvas-phrase` (globals.css:881-935) — the ambient captions. Deliberately SLOWER than the
 *  140ms `.canvas-swap`, because a fast flicker between phase captions reads as churn. */
export const PHRASE_MS = 260;

/** The ambient thinking dot — `canvas-thinking.tsx`. Tailwind's `animate-pulse`: 2s, opacity
 *  1 → .5 → 1. Deliberately the least interesting thing on screen. */
export const PULSE_MS = 2000;
export const PULSE_DOT = 6;
/** `gap-2.5` between the dot and the phrase. */
export const PULSE_GAP = 11.25;

/** The source pill — `canvas-source-pills.tsx`, resolved from 1rem = 18px. */
export const PILL = {
  /** `mt-4` above the row. */
  rowTop: 18,
  /** `gap-1.5` between pills. */
  rowGap: 6.75,
  /** `py-1`. With a 14pt favicon this makes the pill 23pt tall — the icon sets the height, not
   *  the 12pt text. */
  padY: 4.5,
  /** `pl-1.5` — the favicon side. Asymmetric on purpose. */
  padLeft: 6.75,
  /** `pr-2.5` — the text side. */
  padRight: 11.25,
  /** `gap-1.5` between the favicon and the label. */
  gap: 6.75,
  /** `const FAVICON_PX = 14` — written in px on the web too, for this exact reason. */
  favicon: 14,
  text: CANVAS_TEXT.meta,
} as const;

/**
 * The thinking mascot's drawn size — `<BloubBot size={128} state="thinking" />`.
 *
 * 🔴 IT REPLACES THE SURFACE, IT DOES NOT SIT UNDER IT (owner call, both halves, 2026-08-20).
 * Rendering it as a small inline spinner above the answer would look like a reasonable
 * simplification and would be the wrong one.
 */
export const THINKING_MASCOT = 128;

/**
 * How tall the centred thinking block is, as a fraction of the window.
 *
 * 🔴 `70vh` ON THE WEB AND A MEASURED FRACTION HERE — NOT `100%`. The web file records the bug:
 * the block renders inside `CanvasFade`, which is a bare element with no height of its own, so a
 * percentage collapses to nothing and the mascot ends up pinned to the top of the column. The
 * same is true of a percentage `minHeight` inside a non-flex parent in React Native.
 */
export const THINKING_BLOCK_VH = 0.7;
