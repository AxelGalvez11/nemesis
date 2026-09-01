// The first rung of the figure ladder: a picture out of the learner's OWN lecture.
//
// 🔴 THE LADDER HAS PUT THIS FIRST SINCE IT WAS WRITTEN, AND NOTHING COULD CLIMB IT.
// `PROVENANCE_LADDER` opens with `source_figure` — "a figure from the learner's own material,
// evidence-backed and already familiar" — but `CandidateAsset` could only ever be a retrieved or a
// generated image, so a `{"kind":"figure"}` request went straight to the open corpus even when the
// student's own slide held exactly the picture asked for.
//
// Watched happen, 2026-09-01. Asked to teach the steroid scaffold, the canvas wrote *"let me check
// whether your own lecture has a clean version of this before I draw from memory"*, then drew from
// memory — while the deck open in the next column held the labelled template, stored and described.
// Nothing was broken: there was no rung to check.
//
// 🔴 IT IS NOT A TOOL THE MODEL HAS TO CHOOSE. `find_figure` exists and the model may call it, but
// this session has already paid twice for making a model's cooperation load-bearing (the comment
// box that only opened if React had committed; the reading pane whose only door was a citation the
// model need not emit). A figure REQUEST already means "go and find a picture of this", so the
// learner's own material is consulted on the way, every time, with nothing to remember.

import { supabase } from "@/lib/supabase";

import type { CandidateAsset } from "./visual-provenance";

/** Enough of a match to be worth showing; below this the open corpus is the better answer. */
const MIN_SUBJECT_CHARS = 3;

/** One document's figures are not a gallery: the best match, or nothing. */
const PER_SUBJECT = 1;

interface FigureRow {
  file_name: string;
  unit: number | null;
  description: string | null;
  path: string;
}

/**
 * The learner's own figure for each subject, positionally — `null` where they have none.
 *
 * 🔴 POSITIONAL, BECAUSE THE CALLER ADDRESSES BY ORDER. `figure-resolve.ts` walks the answer twice
 * and pairs results to requests by index alone; a map keyed on the subject string would collapse
 * two identical subjects into one and shift every later picture onto the wrong figure.
 *
 * 🔴 NEVER THROWS. A signed-out learner, a refused RPC, a storage hiccup: each returns nulls and
 * the open corpus answers as it always did. A picture is worth having and never worth an error.
 */
export async function ownFigures(subjects: readonly string[]): Promise<(CandidateAsset | null)[]> {
  const empty = subjects.map(() => null);
  if (subjects.length === 0) return empty;

  try {
    const found = await Promise.all(
      subjects.map(async (subject) => {
        const query = subject.trim();
        if (query.length < MIN_SUBJECT_CHARS) return null;
        const { data, error } = await supabase.rpc("search_figures", {
          p_limit: PER_SUBJECT,
          p_query: query,
          p_source: "",
        });
        if (error) return null;
        const row = ((data ?? []) as FigureRow[])[0];
        if (!row?.path) return null;
        return {
          // 🔴 THE STORAGE PATH, NOT A SIGNED URL. Every other candidate carries a path and is
          // signed at render time (`CandidateAsset.assetPath` says so); handing this one a URL that
          // expires in an hour would put a broken image into a saved canvas a day later.
          assetPath: row.path,
          ...(captionFor(row) ? { caption: captionFor(row) } : {}),
          // No licence: it is their own file, shown back to them. `chooseAsset` says why.
          provenance: "source_figure" as const,
        };
      }),
    );
    return found;
  } catch {
    return empty;
  }
}

/**
 * What to print under a picture from the learner's own material.
 *
 * 🔴 THE LECTURE AND THE PAGE, NOT THE VISION DESCRIPTION. The description is what a model wrote
 * while looking at the figure; printing it as a caption states it as fact beside the picture it was
 * guessing at. Where it came from is checkable, useful, and the thing a student wants — it is how
 * they find the slide again. PURE.
 */
export function captionFor(row: { file_name: string; unit: number | null }): string {
  const where = row.unit === null ? "" : `, page ${row.unit + 1}`;
  return `From your ${row.file_name}${where}`;
}
