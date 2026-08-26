// The character's two colours, and nothing else.
//
// 🔴 THIS MODULE EXISTS TO BREAK A CYCLE, and that is worth saying plainly so nobody
// tidies it back into `document.ts`. The document builds the default studio, which needs
// the bloub reference character; the reference needs the default ink. Imported directly
// that is `document -> bloub-reference -> document`, which happens to work today only
// because every use sits inside a function body rather than at module top level — move
// one constant to the top level of either file and it becomes a `undefined` read at
// import time, in a code path that runs before any test does.
//
// The values match `components/mascot/mascot.css`, which is where the renderer actually
// reads them from. Kept in step by hand: the CSS cannot import TypeScript, and a build
// step to generate one from the other would be more machinery than four colours deserve.
// `document.test.ts` fails if they drift.

/** Body ink on a light ground. */
export const DEFAULT_INK = "#0b0b0d";
/** Body ink on a dark ground. It INVERTS rather than tinting, so the character carries
 *  the same weight in both themes. */
export const DEFAULT_INK_DARK = "#f2f2f4";
/** The colour cut out of the body for the eyes: always the ground it is standing on.
 *  Not pure white — at 4px across, #fff against #0b0b0d fizzes on a sub-pixel display. */
export const DEFAULT_EYE = "#fbfbfb";
export const DEFAULT_EYE_DARK = "#0a0a0c";
