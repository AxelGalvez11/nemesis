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
 *  140ms `.canvas-swap`, because a fast flicker between phase captions reads as churn.
 *
 *  🔴 RECORDED, NOT PLAYED, AND SAYING SO IS THE POINT (2026-08-21). Nothing on the phone consumes
 *  this: both captions arrive through `CanvasFadeIn`, which runs at `FADE_IN_MS` (220). A comment
 *  in `CanvasThinking.tsx` claimed the 260 from the day it was written and the code never did it.
 *  It is kept as the
 *  measured web value — this file's job is to hold the numbers the two surfaces were measured
 *  against — but a caller reaching for it is adding a SECOND fade timing to a surface whose one
 *  crossfade module exists to prevent exactly that. Read `CanvasFade.tsx` before using it. */
export const PHRASE_MS = 260;

/** The thinking dot — `canvas-thinking.tsx`. Tailwind's `animate-pulse`: 2s, opacity
 *  1 → .5 → 1. On the ambient line it is deliberately the least interesting thing on screen.
 *
 *  🔴 THERE IS EXACTLY ONE DOT LEFT ON THIS SURFACE, AND THIS IS THE RECORD OF THE THREE THAT WENT
 *  (owner 2026-08-21, and both halves of that day belong here or the next reader re-adds them).
 *  In the morning: "i need a better thinking animation, remove the colorful swirls around the
 *  mascot. i need the thinking to have the mascot in it too like the attached reference" — the
 *  reference image being characters with faces and, beside them, a separate group of three
 *  animated dots. A trio was built to it, staggered so it read as a wave, and it shared this
 *  timing with the ambient line's single dot. Later the same day, after seeing it on the device:
 *  "also remove the three dots animation, i only want the mascot and the thinking words". The trio
 *  is gone from `CanvasThinkingPreview`; the ambient dot in `CanvasThinkingLine` was never in
 *  scope and still pulses on these numbers.
 *
 *  🔴 THE REFERENCE IMAGE IS STILL THE AUTHORITY ON THE MASCOT AND IS NO LONGER THE AUTHORITY ON
 *  THE DOTS. It is what settled `WAITING_FACE` (a character with its face on, no coloured rings)
 *  and that half stands. Finding the image later and "restoring" the dots to match it would be
 *  undoing an instruction, not fixing an omission.
 *
 *  TRIED AND REJECTED ALONG THE WAY, kept because these are the answers to the obvious next ideas:
 *    - a second, faster wave for the trio, to make it "better". `components/ThinkingDots.tsx`
 *      already exists as exactly that — a 480ms bounce with its own easing, used by the notebook —
 *      and two indicators pulsing at different rates in one app is how a surface stops reading as
 *      one thing. What made the trio read as a wave was the stagger, not a shorter period.
 *    - `PULSE_STAGGER_MS = 140`, deleted with the trio. It was the web's own number
 *      (`apps/web/components/workspace/learn/canvas-thinking-preview.tsx` staggers three forming
 *      lines by `index * 140ms`, on the grounds that three things pulsing in lockstep read as ONE
 *      flashing block). Measured under plain node against the same cubic-bezier: 140ms is 7% of
 *      the 2000ms cycle and the leading and trailing dot were furthest apart at 0.224 of opacity,
 *      640ms in — a visible gradient across three 6pt dots, nowhere near a strobe.
 *    - `PULSE_TRIO_GAP = 6.75`, deleted with it: `gap-1.5` at 1rem = 18px, the same step the
 *      source pill uses, tight enough that three dots read as one object rather than three marks.
 *  Both constants had exactly one caller each and nothing else in the app referenced them, so they
 *  are deleted rather than left as furniture. The numbers above are what a reinstated row would
 *  need; `PulseDot`'s own note in `CanvasThinking.tsx` holds the `withDelay`/`withRepeat` ordering
 *  that made the stagger a wave instead of a limp. */
export const PULSE_MS = 2000;
export const PULSE_DOT = 6;
/** `gap-2.5` between the dot and the phrase. */
export const PULSE_GAP = 11.25;
/**
 * What a pulsing dot holds at when the system's Reduce Motion is on.
 *
 * 🔴 THE DOT STAYS AND HOLDS ITS RESTING CONTRAST; ONLY THE SWEEP STOPS. `useReducedMotion.ts`
 * carries the rule and `apps/web/app/globals.css`'s `prefers-reduced-motion` block is where it
 * comes from. Someone who asked the system to stop moving still has to be able to see that the
 * region is busy, so the element never vanishes and never fades to nothing.
 *
 * It is still a shared constant with one caller, which is deliberate. It was a literal 0.6 inside
 * `CanvasThinkingLine` until the trio above needed the same number, and the trio is now gone —
 * folding it back into that component would only have to be undone the next time anything else on
 * this surface rests. The cost of leaving it here is one exported number; the cost of inlining it
 * is two copies drifting to different greys, which is what it was pulled out to prevent.
 */
export const PULSE_REST = 0.6;

/**
 * The caption's travelling highlight — `.canvas-rewriting` (`apps/web/app/globals.css:930-944`),
 * measured off the web rather than re-invented (owner 2026-08-21, on a screenshot of the phone's
 * thinking screen with a red circle drawn around THE CAPTION TEXT and nothing else: "this should
 * be pulsing from left to right"). The three dots in that screenshot were outside the circle and
 * were left alone at the time; the owner removed them outright later the same day (see `PULSE_MS`
 * above), which changed nothing here — the sweep was always about the words, and it is now the
 * only moving thing under the character.
 *
 * 🔴 THE NUMBERS ARE THE WEB'S, EXPRESSED AS MULTIPLES OF THE TEXT'S OWN WIDTH — which is what the
 * CSS is already doing, in units the phone has no equivalent for. The web writes the band as a
 * background image on the text element itself:
 *
 *     background-size: 200% 100%          the gradient tile is 2× the element's width  → SWEEP_TILE
 *     200% 0 → -200% 0                    the tile travels 4× the element's width      → SWEEP_TRAVEL
 *     1900ms linear infinite                                                           → SWEEP_MS
 *
 * A percentage `background-position` resolves against (element − image) width, which here is
 * (W − 2W) = −W, so `200%` puts the tile's left edge at −2W and `−200%` puts it at +2W: four
 * element-widths of travel, moving RIGHTWARDS, at a constant rate. LINEAR is not an oversight to be
 * softened into an ease — an eased sweep slows down in the middle of the words and reads as a
 * hesitation.
 *
 * 🔴 A HIGHLIGHT CROSSES ANY GIVEN LETTER EVERY 950ms, AND 1900 IS STILL THE NUMBER TO COPY. CSS
 * backgrounds repeat by default, so the 2W tile is laid end to end and the element sees a fresh
 * peak every time the pattern advances one whole tile: 1900ms × (2W ÷ 4W) = 950ms. Halving
 * `SWEEP_MS` to "fix" the apparent mismatch was the obvious move and is wrong — it would run the
 * phone's sweep at twice the desktop's speed. Reproduced under plain node rather than reasoned
 * about: sampling the CSS's own `background-position` arithmetic and the phone's translated layer
 * across four caption widths, 401 frames and 201 points per frame, the two alpha profiles agree to
 * 1.3e-15.
 */
export const SWEEP_MS = 1900;

/** `background-size: 200%` — the gradient tile, in multiples of the text's measured width. */
export const SWEEP_TILE = 2;

/**
 * `200% → -200%` — the distance the tile travels in one cycle, in multiples of the text's width.
 *
 * 🔴 THIS IS ALSO WHY THE LOOP HAS NO JUMP IN IT, AND THE PROOF IS ONE DIVISION: 4W of travel over
 * a 2W tile is exactly TWO whole tiles, and a repeating pattern shifted by a whole number of its
 * own periods paints the identical image. So the frame at t = 1900ms and the frame at t = 0 are the
 * same picture and the restart is invisible. Checked under node at 1001 sample points across two
 * caption widths: the largest difference between the two frames is 8.9e-16. Any travel that is not
 * a whole multiple of `SWEEP_TILE` snaps.
 */
export const SWEEP_TRAVEL = 4;

/**
 * How many tiles the phone actually paints. CSS repeats its background forever; a React Native
 * view has edges, so the layer must be long enough to cover the words for the whole cycle.
 *
 * Three, and the arithmetic is tight rather than generous: the layer starts with its left edge at
 * −4W (`-SWEEP_TRAVEL × W`) and finishes at 0, so at its worst moment it spans [−4W, 2W] and the
 * text sits at [0, W] inside it. Two tiles (4W long) span [−4W, 0] at the start of the cycle and
 * would leave the entire caption unpainted; four would paint a tile that is never on screen.
 */
export const SWEEP_TILES = 3;

/**
 * What the words rest at between passes, as a fraction of their own colour.
 *
 * 🔴 0.55 IS THE WEB'S OWN NUMBER FOR EXACTLY THIS — `.canvas-rewriting > * { opacity: 0.55 }`
 * (globals.css:944), the wording of a passage that is being reworked: "Not hidden: the learner
 * asked for THIS paragraph to change and needs to keep seeing which one it is." It is not
 * `PULSE_REST` (0.6) beside it and the two must not be merged; that one is where a DOT holds when
 * Reduce Motion stops it, this one is where WORDS sit while a band is passing over them.
 *
 * 🔴 THE BAND ADDS, IT NEVER SUBTRACTS. The peak of the sweep is exactly the text's resting colour
 * — never brighter, never a different hue — so the caption swings between 0.55 and 1.0 of `c.text3`
 * and is legible at every point of the cycle. Measured under node in sRGB: at the trough the
 * caption is 6.27:1 against the black page and 4.76:1 against the white one, both above the 4.5:1
 * floor. It is also very close to the deepest trough that clears it: the same measurement puts 0.45
 * at 3.35:1 on the white page and 0.35 at 2.44:1. A deeper trough makes the band more dramatic and
 * spends most of every cycle below the contrast floor, which is the "dims the words to
 * near-invisible and back" the owner did not ask for. Going the other way — a shallower 0.75 — is
 * the sweep the eye stops noticing, and then the only honest fix is to make the band brighter than
 * the text, which nothing on this surface is allowed to be (`.canvas-forming`: "LOW CONTRAST BY
 * CONSTRUCTION … a bright sweep on a quiet page becomes the most interesting thing on screen").
 *
 * 🔴 AND UNDER REDUCE MOTION THIS NUMBER IS NOT USED AT ALL — WHICH IS A DELIBERATE DIVERGENCE
 * FROM WEB, NOT PARITY WITH IT (owner 2026-08-21). Say it plainly, because the rest of this file
 * matches web number for number and a reader will assume this does too. Web's
 * `prefers-reduced-motion` block (globals.css) drops only the `background-image` and KEEPS
 * `.canvas-rewriting > * { opacity: 0.55 }`, on the stated grounds that "the dimmed wording is
 * what says this paragraph is being rewritten, and it is not motion".
 * That argument is sound WHERE IT WAS WRITTEN and does not carry here. On web the dimming marks
 * out one paragraph of an article as the one being rewritten — it is a contrast against the
 * surrounding prose, which is the whole of its meaning. The phone's caption has no surrounding
 * prose: it is a standalone status line under the character, and since 2026-08-21 it is the only
 * writing on that screen at all (`PULSE_MS` above records the dots that used to sit beside it).
 * Holding it permanently dim would therefore convey nothing — there is nothing for it to be dim
 * IN CONTRAST TO — and would only make the one status message on the screen harder to read for
 * someone who has asked for less motion. Removing the dots strengthens this rather than weakening
 * it: they were the other visible sign that the region was busy, so the caption now has to stay
 * readable on its own.
 *   TRIED AND REJECTED: keeping the 0.55 for parity. It fails the one test that matters — a
 *   learner who turns on Reduce Motion is not asking for lower contrast.
 */
export const SWEEP_TROUGH = 0.55;

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
 * The thinking mascot's drawn size — `<BloubBot size={128} … />` in `CanvasThinking.tsx`.
 *
 * 🔴 IT REPLACES THE SURFACE, IT DOES NOT SIT UNDER IT (owner call, both halves, 2026-08-20).
 * Rendering it as a small inline spinner above the answer would look like a reasonable
 * simplification and would be the wrong one.
 *
 * 🔴 THIS LINE USED TO READ `state="thinking"` AND THAT IS NO LONGER WHAT IS DRAWN (owner
 * 2026-08-21). At 128pt the engine's `thinking` state has no face at all — see the long note in
 * `CanvasThinking.tsx` for the evidence and the decision. The SIZE is untouched by that: 128pt is
 * still what "the system has the floor" looks like, on both surfaces.
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
