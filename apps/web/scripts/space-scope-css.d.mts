// Types for the stylesheet build, which is plain JavaScript so it can run as a script. See space-scope-css.mjs.

/** The class every rule in the workspace's stylesheet is scoped under. */
export const SCOPE: string;

/** Every colour the measured copy carries, expressed in our own ink (design/TOKENS.md §1). */
export function inkColors(source: string): string;

/** The stylesheet, scoped under `.nsp`, with the resets the layout was measured against restored in front of it. */
export function scopeCss(source: string): string;
