// Finding the FIGURE SUBJECTS in a model's answer, so the picture comes from the licence-gated
// reference lane rather than from anywhere a model could point (§42, rung three).
//
// 🔴 THE MODEL NAMES A SUBJECT AND STOPS THERE. `{"kind":"figure","subject":"mitosis stages"}` is a
// request to LOOK SOMETHING UP; the asset that reaches the spec comes from
// `app/api/learn/reference-image`, which asked the curated registry and the live providers and ran
// every candidate through `chooseAsset` — the one place a licence decision is made.
//
// 🔴 AND ANY `asset` A MODEL WROTE IS STRIPPED BEFORE ANYTHING ELSE HAPPENS. The field means "the
// reference resolver chose this picture and kept its licence". A model can write those words around
// any URL on the internet, and one that did would be handing the renderer an <img src> nobody
// vetted. The validator bounds the field again for stored blocks; this strip is what guarantees a
// LIVE answer cannot carry one that was not stamped here.
//
// 🔴 A SUBJECT THAT RESOLVES TO NOTHING KEEPS ITS REQUEST AND LOSES ITS PICTURE. The visual stays in
// the answer without an asset — the validator accepts that, and `visual-route.ts` reports it as
// `no-trusted-asset` prose. That is deliberate, and different from the structure pass dropping an
// unresolved compound: an assetless figure is a well-formed record of "a real picture was wanted
// here and none could be shown", which is exactly the coverage gap §42 says is worth counting.
//
// PURE. Mirrors `structure-resolve.ts`, including the positional contract: two walks of one
// immutable value, agreeing by order alone.

import type { CandidateAsset } from "./visual-provenance";

/** How many lookups one answer may trigger. Pictures are heavier than SMILES; the bound is lower. */
const MAX_SUBJECTS = 4;

export type FigureResolution =
  | { ok: true; asset: CandidateAsset }
  | { ok: false; reason: string; detail: string };

/** Worth parsing? A substring test before any parse and any network call. */
export function mightResolveFigure(text: string): boolean {
  return text.includes('"figure"');
}

/** Every figure subject in an answer, in traversal order — the order IS the address. */
export function collectFigureSubjects(value: unknown): string[] {
  const subjects: string[] = [];
  walk(value, (subject) => {
    if (subjects.length < MAX_SUBJECTS) subjects.push(subject);
  });
  return subjects;
}

/**
 * The same answer, with every figure request stamped with what the reference lane chose.
 *
 * 🔴 THE STRIP RUNS WHETHER OR NOT THE LOOKUP SUCCEEDED. A model-written `asset` must not survive a
 * failed resolution any more than a successful one.
 */
export function applyResolvedFigures(value: unknown, results: readonly FigureResolution[]): unknown {
  let cursor = 0;
  return rebuild(value, () => results[cursor++]);
}

// ------------------------------------------------------------------ the walk

function isFigure(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === "figure"
  );
}

/** The subject this figure asks to have found, if it asks at all. */
function subjectOf(value: Record<string, unknown>): string | null {
  const subject = typeof value.subject === "string" ? value.subject.trim() : "";
  return subject && subject.length <= 120 ? subject : null;
}

function walk(value: unknown, visit: (subject: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  if (isFigure(value)) {
    const subject = subjectOf(value);
    if (subject) visit(subject);
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) walk(item, visit);
}

function rebuild(value: unknown, next: () => FigureResolution | undefined): unknown {
  if (Array.isArray(value)) return value.map((item) => rebuild(item, next));
  if (typeof value !== "object" || value === null) return value;

  if (isFigure(value)) {
    const subject = subjectOf(value);
    // 🔴 THE MODEL'S OWN `asset` GOES FIRST, IN EVERY BRANCH. See the header — this line is the
    // security property of the file, and everything else is bookkeeping around it.
    const { asset: _claimed, ...rest } = value as Record<string, unknown>;
    if (!subject) return rest;
    const result = next();
    return result?.ok ? { ...rest, asset: result.asset } : rest;
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = rebuild(item, next);
  }
  return out;
}
