// What the thinking strip says while nothing else is happening.
//
// THE COMPLAINT (owner 2026-08-04): "the chat also is just showing 'thinking'
// and not being dynamic, so the waiting feels stale." True as written — the
// strip only ever changed copy on a TOOL round (chat-activity.ts), so a plain
// question, which calls no tools at all, held one motionless word for the whole
// wait. On a reasoner turn that is often forty seconds of nothing.
//
// 🔴 THE OBVIOUS FIX IS THE ONE ALREADY REJECTED. Streaming the model's own
// reasoning into the strip was built, shipped, and taken back out on
// 2026-08-04: it echoes raw search snippets ("Result 1: …") and the owner
// called it verbose noise. So this does NOT surface what the model is thinking.
// It surfaces how long it has been going, which is the honest thing the student
// is actually waiting on, in the same curated-verb style as the tool labels.
//
// FIELD-AGNOSTIC AND CLAIM-FREE. No phrase names a subject, and none promises
// progress the code cannot see — nothing here says "almost done", because this
// module has no idea. They describe the wait, not the work.
//
// PURE — no timers, no clock of its own, so node:test can walk the whole
// sequence by passing elapsed times.

/** How often the live strip re-reads the phrase. One second is slow enough to
 *  be calm and fast enough that a phrase change never looks like a stall. */
export const PROGRESS_TICK_MS = 1_000;

/**
 * Waiting copy by elapsed time.
 *
 * The steps get further apart as the wait grows: the difference between 2 and 8
 * seconds is worth marking, the difference between 70 and 76 is not, and a
 * strip that changes every few seconds for a minute reads as agitation rather
 * than progress.
 */
const WAITING_PHASES: ReadonlyArray<{ readonly after: number; readonly label: string }> = [
  { after: 0, label: "Thinking" },
  { after: 7_000, label: "Working through it" },
  { after: 18_000, label: "Checking the details" },
  { after: 38_000, label: "Still working on it" },
  { after: 75_000, label: "This one is taking a while" },
];

/** The phrase for a wait of this long. Never null: the strip always has copy. */
export function waitingPhrase(elapsedMs: number): string {
  let label = WAITING_PHASES[0]!.label;
  for (const phase of WAITING_PHASES) {
    if (elapsedMs >= phase.after) label = phase.label;
    else break;
  }
  return label;
}

/** Once the answer starts arriving the wait is over, and saying so is more
 *  informative than any thinking verb — the student can see text appearing and
 *  the strip agreeing with their eyes is what makes it feel live. */
export const WRITING_PHRASE = "Writing the answer";
