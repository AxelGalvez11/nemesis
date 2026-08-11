// Turning "these objectives need fresh evidence" into something a calendar can hold.
//
// 🔴 THE FAILURE MODE THIS EXISTS TO PREVENT: the memory model can identify hundreds of
// objective-level retrieval opportunities across every canvas a learner has. Writing one
// calendar entry per objective —
//
//     Tuesday  Review concept A
//     Tuesday  Review concept B
//     Tuesday  Review concept C
//     …          × 200
//
// — produces a calendar nobody can read, which means a calendar nobody reads, which means the
// real obligations in it (the exam, the deadline) get buried by machine-generated noise. The
// objective-level schedule stays INTERNAL. The calendar gets meaningful blocks.
//
// 🔴 AND A BLOCK IS NOT AN OBLIGATION. An exam has a date because the world says so; a review
// block exists because Nemesis thinks it would help. They are different kinds of thing (§19)
// and must not be rendered as peers — `origin: "nemesis_plan"` is what keeps them apart, and
// `canAutoConfirm` already refuses to auto-confirm anything carrying it.

import type { RetentionView } from "./canvas-retention";

/** Minutes of work one objective is assumed to need when it comes back. Deliberately coarse:
 *  the number's job is to stop a block from being three hours long, not to predict anything. */
const MINUTES_PER_OBJECTIVE = 4;

/** Blocks shorter than this are not worth putting on a calendar — someone who sees "3-minute
 *  review" on a Tuesday will stop trusting the calendar. */
const MIN_BLOCK_MINUTES = 10;

/** And nothing longer than this in one entry, however much is due. More than this is a session
 *  someone plans themselves, not something we should assert into their day. */
const MAX_BLOCK_MINUTES = 45;

export interface StudyBlock {
  /** Which canvas this is work for. */
  canvasId: string;
  /** What to call it. Names the SUBJECT, never the concepts — "20-minute calculus review", not
   *  a list of six objective titles nobody recognises out of context. */
  title: string;
  minutes: number;
  /** How many objectives it covers. A count, for the learner's own judgement — not a score. */
  objectiveCount: number;
  /** 🔴 Never "obligation". A block is a suggestion from the memory model, and the calendar has
   *  to be able to tell the two apart. */
  origin: "nemesis_plan";
  /** The lowest predicted retrievability in the block — why it is being suggested now. */
  lowestRetrievability: number;
}

export interface BlockInput {
  canvasId: string;
  /** The canvas's own title, which is what the learner will recognise. */
  canvasTitle: string;
  /** Objectives whose predicted retrievability has fallen — from `needsFreshEvidence`. */
  due: readonly RetentionView[];
}

/** One block per canvas, or none.
 *
 *  🔴 NOT ONE PER OBJECTIVE, and the shape of this function is the enforcement: it takes a
 *  canvas and returns at most a single block for it. There is no code path that can emit an
 *  entry per objective, because there is no loop over objectives that produces output. */
export function studyBlockFor(input: BlockInput): StudyBlock | null {
  const due = input.due.filter((view) => view.retrievability !== null);
  if (due.length === 0) return null;

  const raw = due.length * MINUTES_PER_OBJECTIVE;
  if (raw < MIN_BLOCK_MINUTES) return null;

  // Rounded to five minutes: a calendar entry saying "23 minutes" claims a precision the
  // estimate does not have.
  const minutes = Math.min(MAX_BLOCK_MINUTES, Math.round(raw / 5) * 5);
  const lowest = Math.min(...due.map((view) => view.retrievability ?? 1));

  const subject = input.canvasTitle.trim() || "review";
  return {
    canvasId: input.canvasId,
    title: `${minutes}-minute ${subject} review`,
    minutes,
    objectiveCount: due.length,
    origin: "nemesis_plan",
    lowestRetrievability: lowest,
  };
}

/** Across every canvas, most-decayed first — so a day with limited room spends it where recall
 *  is closest to failing. */
export function studyBlocks(inputs: readonly BlockInput[]): StudyBlock[] {
  return inputs
    .map(studyBlockFor)
    .filter((block): block is StudyBlock => block !== null)
    .sort((a, b) => a.lowestRetrievability - b.lowestRetrievability);
}

/** How much of a day's suggested work to actually place, given the room the learner has.
 *
 *  Takes minutes available rather than assuming: someone with twenty minutes before class and
 *  someone with a free afternoon should not be given the same plan, and Nemesis does not get to
 *  decide that a full block is going to happen. */
export function fitToAvailable(blocks: readonly StudyBlock[], availableMinutes: number): StudyBlock[] {
  const out: StudyBlock[] = [];
  let left = availableMinutes;
  for (const block of blocks) {
    if (block.minutes > left) continue;
    out.push(block);
    left -= block.minutes;
  }
  return out;
}
