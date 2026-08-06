// What a finished recording's chat card is allowed to claim, and when.
//
// 🔴 THE BUG THIS EXISTS TO FIX — a real one, hit on a real 47-minute lecture.
// The card said "Writing the notes did not finish, so ask me to write them up",
// permanently, for a recording whose notes had been written successfully and
// filed at Pharmacy/Lectures. Nothing was lost; the sentence was simply false,
// and because resolving a card clears its `pending` flag, nothing ever re-ran to
// correct it. The student was told their lecture was gone.
//
// The cause was a race between two sources that update at different speeds:
//
//   recording_jobs   read through a polling store — arrives in the same render
//                    it changes, and a job DISAPPEARS from the watch the moment
//                    it is `ready` (the query is `.neq("status","ready")`).
//   the artifact     read through a fetch fired from an effect — always at
//                    least one network round trip BEHIND the job that triggered
//                    it, and only refetched when a job's stage actually changes.
//
// The old code asked the JOB whether work was still running and then asked the
// ARTIFACT what the result was. Between those two questions the artifact can be
// stale, and a stale artifact has a transcript but no notes — which is exactly
// what a failed compose looks like. Production timestamps on the lecture above:
// notes written at 13:52:29.389, job `ready` at 13:52:29.625. **236 ms** to
// cross a 2-second poll. The page never once observed "notes exist AND the job
// is still running", so the wrong branch was not unlucky, it was guaranteed.
//
// ── The rule ────────────────────────────────────────────────────────────────
// ABSENCE OF NOTES IS NOT EVIDENCE OF FAILURE. It is equally the signature of a
// snapshot taken a moment too early, and the client cannot tell those apart by
// looking at the artifact alone.
//
// The worker already guarantees the direction that matters: compose returns
// `wait` when it produces no notes, and filing fails outright if it cannot read
// them back — so a job that reached `ready` HAS notes, always. Therefore only a
// job may declare failure, and the worker writes that copy itself.
//
// Everything here is a pure function so the decision can be tested without
// mounting a chat page. It lived inside a React effect before, which is the
// reason 1,100 unit tests and a clean build all went green over a card telling
// a student their lecture had been lost.

import type { RecordingJob } from "@/lib/workspace/recording-job";

/** Said once the notes are on the artifact. */
export const RECORDING_NOTES_READY =
  "Your recording is written up — transcript and notes are ready.";

/**
 * Said ONLY when there is positive evidence the write-up did not happen: a job
 * that failed, or a transcript with no job behind it at all and a snapshot fresh
 * enough to prove the notes are genuinely absent rather than merely unfetched.
 *
 * 🔴 Exported because the heal below matches on it EXACTLY. Change this string
 * and you orphan every card already carrying the old one — add to the heal list,
 * do not edit in place.
 */
export const RECORDING_NOTES_MISSING =
  "Your recording is transcribed. Writing the notes did not finish, so ask me to write them up and I will use the transcript.";

/** Every wording this module has ever written for the notes-missing case, so a
 *  card stamped by an older build can still be recognised and healed. */
export const RECORDING_NOTES_MISSING_WORDINGS: readonly string[] = [
  RECORDING_NOTES_MISSING,
];

export interface RecordingCardInputs {
  /** The artifact's transcript, as last fetched. */
  transcript: string;
  /** The artifact's notes, as last fetched. Empty is AMBIGUOUS — see above. */
  notes: string;
  /** This artifact's job, or null when no unfinished job is watching it. A
   *  `ready` job is null here by design: it has left the watch. */
  job: RecordingJob | null;
  /** Have this account's jobs been read at least once? Before that, `job: null`
   *  means "not known yet", not "nothing running". */
  jobsLoaded: boolean;
  /** Were the artifact fields above fetched for the CURRENT job state, rather
   *  than an earlier one? This is the whole fix: it is what separates "the notes
   *  are absent" from "the notes have not been fetched yet". */
  snapshotFresh: boolean;
}

export type RecordingCardDecision =
  /** Leave the card pending. Something will change and this will run again. */
  | { action: "wait" }
  /** Replace the placeholder with final wording. */
  | { action: "resolve"; content: string };

const WAIT: RecordingCardDecision = { action: "wait" };

/**
 * Decide what a pending recording card should say.
 *
 * Ordered by how much the input actually proves, strongest first — notes on the
 * row are proof of success and outrank everything, including a job still
 * reporting itself as running (which only means the LAST stage has not been
 * ticked off, not that the notes are in doubt).
 */
export function decideRecordingCard(inputs: RecordingCardInputs): RecordingCardDecision {
  const transcript = inputs.transcript.trim();
  const notes = inputs.notes.trim();

  // Nothing to show yet. The transcript is the first durable output; before it
  // exists there is no card to resolve, whatever the job says.
  if (!transcript) return WAIT;

  // Proof of success. Notes on the artifact are permanent and cannot un-happen,
  // so this needs no agreement from the job.
  if (notes) return { action: "resolve", content: RECORDING_NOTES_READY };

  // No notes on hand. From here on, every branch is about whether that absence
  // is TRUSTWORTHY — and the default answer is no.
  if (!inputs.jobsLoaded) return WAIT;

  const job = inputs.job;
  if (job) {
    // The one case that genuinely failed. The worker writes the copy, because
    // it is the only thing that knows which stage broke and what survived it.
    if (job.status === "failed") {
      return { action: "resolve", content: job.error?.trim() || RECORDING_NOTES_MISSING };
    }
    // Still working. Notes may be seconds away; saying they failed is the
    // original bug.
    return WAIT;
  }

  // No job watching this recording. Either it finished (and the artifact we are
  // holding is stale) or it is old enough to predate the job pipeline entirely.
  //
  // 🔴 The freshness check is what makes this branch safe, and what stops it
  // becoming the opposite landmine — a card that pulses forever because it will
  // never say anything without notes. A pre-pipeline artifact has no job and
  // never will, so once its snapshot is current the absence IS real and the card
  // resolves honestly.
  return inputs.snapshotFresh
    ? { action: "resolve", content: RECORDING_NOTES_MISSING }
    : WAIT;
}

/**
 * Should an ALREADY-RESOLVED card be corrected?
 *
 * Fixing the logic above does not repair a message that is already wrong: the
 * card is no longer pending, so nothing re-runs for it, and the student keeps
 * reading a false claim that their lecture was lost every time they scroll past.
 *
 * Matched on the exact sentence this module wrote, never on a fuzzy pattern, so
 * it can only ever replace Nemesis's own words. A student who typed something
 * similar keeps what they typed.
 */
export function shouldHealRecordingCard(content: string, notes: string): boolean {
  if (!notes.trim()) return false;
  return RECORDING_NOTES_MISSING_WORDINGS.includes(content.trim());
}

/**
 * The title this conversation should take from its recording, or null to leave
 * it alone.
 *
 * 🔴 A recording is born titled `Recording · <date>` — a placeholder, minted
 * before anything has been heard. The old code renamed the conversation to that
 * placeholder as soon as the job appeared, and then refused to rename it again
 * because its guard only permitted replacing the "Recorded session" default. It
 * locked itself out: every recorded lecture kept a dated name forever, even
 * though the real title ("Diabetes Classification, Pathophysiology, and the
 * Ominous Octet") was sitting on the row.
 *
 * So a title Nemesis wrote may be replaced by a better one Nemesis wrote; a
 * title the STUDENT wrote is theirs and is never touched.
 */
export function nextRecordingSessionTitle(options: {
  /** The conversation's title right now. */
  current: string;
  /** The untouched default a recorded conversation starts life with. */
  fallback: string;
  /** The dated placeholder posted with the card, if this conversation still
   *  carries it. */
  placeholder?: string | null;
  /** The real title, written by the compose pass. */
  composed: string | null;
}): string | null {
  const composed = options.composed?.trim();
  if (!composed) return null;
  if (composed === options.current) return null;
  // Never install the placeholder as if it were a result — that is the trap
  // above. A composed title is only worth taking if it is not the placeholder.
  if (options.placeholder && composed === options.placeholder.trim()) return null;

  const ours = options.current === options.fallback || options.current === options.placeholder?.trim();
  return ours ? composed : null;
}
