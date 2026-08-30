// Which surface a `/learn` URL opens, as a value rather than as a chain of `if`s inside a page.
//
// 🔴 THIS IS A MODULE BECAUSE "IS THE LEARNER INSIDE A CANVAS?" NOW DECIDES TWO THINGS AT ONCE,
// and until §38 it decided none.
//
//   1. §38.1 — inside a canvas the navigation rail is not shown at all.
//   2. §38.2 — inside a canvas the only way out is the `×`.
//
// Those are the same question asked by two different files, and while it lived as a condition
// inside `learn/page.tsx` it could only be answered at render time. That is precisely the shape of
// the defect this repo already shipped once: the shell suppressed the rail on `/learn`, which also
// suppressed the rail's reopen toggle, and nothing could assert that the surface underneath still
// offered a way out. It did not. Library, Calendar and Stats were unreachable from the front door
// and from every active session.
//
// So the answer is a value here, the page renders from it, and the entry paths are enumerable in a
// test rather than remembered by whoever edits the page next.

/**
 * `home`   the front door — the composer, with the learner's canvases beneath it. Not "inside a
 *          canvas": the rail belongs here and is merely collapsed by default.
 * `canvas` a canvas session. Full-bleed, no rail, `×` to leave.
 */
export type LearnSurface = "home" | "canvas";

/** Exactly the query parameters `/learn` reads. Named rather than passed as a `URLSearchParams` so
 *  that a caller cannot quietly start depending on a parameter this module does not know about. */
export interface LearnEntry {
  /** `?c=<id>` — 🔴 `c`, NOT `canvas`. The deep-link parameter other lanes and the sign-in
   *  round-trip use. */
  readonly c: string | null;
  /** `?ask=<text>` — a topic typed on the front door, entering a canvas that does not exist yet. */
  readonly ask: string | null;
  /** `?new=1` — material dropped on the front door; the canvas is minted on arrival. */
  readonly isNew: string | null;
  /**
   * `?cap=<capability>` — a one-shot composer capability staged on the front door, riding beside
   * `ask` (owner, 2026-08-23: *"you can't access the course mode from the landing page"*). Raw
   * here — whether the value names a real capability is `composer-capability.ts`'s question, and
   * the page validates it there so this module keeps reading URLs and nothing else.
   *
   * 🔴 IT NEVER DECIDES THE SURFACE. A stray `?cap=` with nothing asked opens the front door,
   * exactly as any unknown parameter does — a capability is a fact about a submission, and with
   * no submission there is nothing for it to be about.
   */
  readonly cap: string | null;
  /**
   * `?folder=<id>` — the project chosen on the front door before the canvas existed.
   *
   * Owner 2026-08-29: *"could you allow the user to add the landing page chat into a project like
   * in the ChatGPT landing page for the work mode?"* On the reference a row appears under the
   * composer the moment you type, carrying **Choose project**; picking one files the chat that is
   * about to be created. There is no canvas yet to file, so the choice travels in the URL exactly
   * as `ask` and `cap` do.
   *
   * 🔴 IT NEVER DECIDES THE SURFACE, for the same reason `cap` does not. A stray `?folder=` with
   * nothing asked opens the front door: a filing instruction is a fact ABOUT a submission, and with
   * no submission there is nothing to file.
   *
   * Raw here. Whether the id names a folder the learner actually owns is the store's question,
   * answered when the canvas is filed — not this file's.
   */
  readonly folder: string | null;
}

export function learnEntryFrom(params: {
  get(name: string): string | null;
}): LearnEntry {
  return { ask: params.get("ask"), c: params.get("c"), cap: params.get("cap"), folder: params.get("folder"), isNew: params.get("new") };
}

export function learnSurface({ ask, c, isNew }: LearnEntry): LearnSurface {
  // Deliberately permissive on `c`: any non-empty id opens a canvas, including one that turns out
  // not to exist. A canvas that fails to load still renders the canvas surface — 🔴 which is the
  // whole point, because that is the state most likely to strand someone, and it is the state that
  // used to paint a page with no exit on it.
  if (c) return "canvas";
  if (ask) return "canvas";
  if (isNew === "1") return "canvas";
  return "home";
}

/** True when the shell must take the navigation rail off screen entirely (§38.1) — not collapse
 *  it, not offer a reopen toggle: remove it. Only ever true where an unconditional `×` renders. */
export function canvasIsImmersive(entry: LearnEntry): boolean {
  return learnSurface(entry) === "canvas";
}

/**
 * 🔴 THE ENTRY PATHS, ENUMERATED HERE RATHER THAN IN THE TEST THAT CHECKS THEM.
 *
 * A list that lives in the test file is a list the test author wrote to match their own
 * expectations. Kept beside the function it describes, a new entry path has one obvious place to be
 * added — and §38.2's requirement ("the `×` must be unconditionally present in EVERY entry path")
 * is only as good as this list is complete.
 *
 * `label` is the human description of how a learner actually arrives.
 */
export const LEARN_ENTRY_PATHS: ReadonlyArray<{
  readonly label: string;
  readonly search: string;
  readonly surface: LearnSurface;
}> = [
  { label: "the front door", search: "", surface: "home" },
  { label: "a deep link to a canvas (?c=)", search: "?c=b2e6d684-0000-0000-0000-000000000000", surface: "canvas" },
  { label: "a hard refresh of an open canvas", search: "?c=3be94cc6-0000-0000-0000-000000000000", surface: "canvas" },
  {
    label: "returning from sign-in, which replays the whole query",
    search: "?c=3be94cc6-0000-0000-0000-000000000000&policy=off",
    surface: "canvas",
  },
  { label: "a topic typed on the front door (?ask=)", search: "?ask=how%20insulin%20works", surface: "canvas" },
  {
    label: "a Course ordered on the front door (?ask= with &cap=course)",
    search: "?ask=organic%20chemistry&cap=course",
    surface: "canvas",
  },
  {
    // A capability with no submission is a fact about nothing — see `LearnEntry.cap`.
    label: "a stray capability with nothing asked (?cap= alone)",
    search: "?cap=course",
    surface: "home",
  },
  { label: "material dropped on the front door (?new=1)", search: "?new=1", surface: "canvas" },
  {
    label: "the browser extension's coursework import",
    search: "?import=coursework",
    // 🔴 NOT A CANVAS ENTRY, AND THAT IS THE FINDING. The shipped extension links to
    // `/library?import=coursework` — a different route entirely — so it never lands inside a
    // canvas and never needed an `×`. Listed anyway, with the correct answer, so that nobody has
    // to re-derive it and nobody claims to have tested a canvas entry that does not exist.
    surface: "home",
  },
];

/** Parses a real query string the way the page does, so the enumeration above is exercised through
 *  the same code path rather than by hand-built objects. */
export function learnEntryFromSearch(search: string): LearnEntry {
  return learnEntryFrom(new URLSearchParams(search));
}
