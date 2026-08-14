// What Nemesis is actually doing right now, said in the learner's language.
//
// 🔴 EVERY PHASE HERE NAMES A STEP THAT IS GENUINELY RUNNING. None of them is scheduled, cycled on
// a timer, or advanced by a progress bar that guesses. This is the microphone waveform's rule
// applied to text: those bars move because a real amplitude changed, and a canned loop would look
// identical while the microphone was dead. A caption that walked "Mapping what you know → Finding
// the next gap → Building the next step" on a 900ms interval would look exactly like a system
// thinking and would be theatre — and the moment a step got slower or was reordered, the caption
// would be confidently describing work that was not happening.
//
// 🔴 SO THE VOCABULARY IS DELIBERATELY SHORTER THAN THE ONE WE WERE GIVEN. "Choosing the right
// difficulty" and "Building the next step" are excellent names for steps THIS RUNTIME DOES NOT YET
// HAVE — nothing selects a difficulty, and nothing generates a next step; the policy chooses one
// action from stored state and the canvas renders it. They belong here on the day that work exists
// and can report itself, and not one commit earlier.

/** A step that is really executing. Added only when something can emit it. */
export type ThinkingPhase =
  /** Fetching and parsing the canonical stored document. */
  | "reading_source"
  /** Extracting knowledge objects from it and storing their objectives. */
  | "mapping_knowledge"
  /** Reading durable evidence and projecting learner state to decide what is owed. */
  | "finding_gap"
  /** The evaluator is judging a submitted answer. */
  | "reading_answer";

/**
 * 🔴 PLAIN, AND ABOUT THE LEARNER RATHER THAN THE MACHINE. "Fetching parsed_documents" is what the
 * step does; "Reading your material" is what it means to the person waiting. Neither is a status
 * code, and neither is "Loading…", which tells someone only that software exists.
 */
export const THINKING_COPY: Record<ThinkingPhase, string> = {
  finding_gap: "Finding the next gap",
  mapping_knowledge: "Mapping what you know",
  reading_answer: "Reading your answer",
  reading_source: "Reading your material",
};

/**
 * What the learner's own file is made of, when that is known.
 *
 * 🔴 KNOWN FROM THE FILE ITSELF, NOT GUESSED FROM PROGRESS. A deck really does have slides and a
 * PDF really does have pages, and the browser knows which it is holding before a single byte is
 * uploaded. That is what separates this from theatre: the caption is more specific because more
 * is genuinely known, not because time passed.
 */
export type ReadingSubject = "slides" | "pages" | "sheets" | "document";

/**
 * What to say while a step runs.
 *
 * 🔴 THE ONE PLACE THAT DECIDES, so a second caller cannot invent its own vocabulary. The busy
 * label on the ingestion lane used to be a bare word set at the call site — `"Reading"` — while
 * the policy lane went through `THINKING_COPY`. Two vocabularies for the same surface is how one
 * of them drifts into sounding like software talking about itself.
 *
 * `subject` refines exactly one phase, because it is the only one where the material's own shape
 * is known and worth saying. PURE.
 */
export function thinkingCopy(phase: ThinkingPhase, subject?: ReadingSubject): string {
  if (phase !== "reading_source" || !subject || subject === "document") return THINKING_COPY[phase];
  return `Reading ${subject}`;
}

/**
 * What a file is made of, from its name.
 *
 * 🔴 RETURNS `document` RATHER THAN A GUESS WHEN IT DOES NOT KNOW. An unrecognised extension
 * genuinely tells us nothing about the shape of what is inside, and "Reading pages" over a file
 * that turns out to be a transcript is a small lie the learner has no way to check. PURE.
 */
export function readingSubjectFor(fileName: string): ReadingSubject {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pptx" || extension === "ppt" || extension === "key") return "slides";
  if (extension === "pdf") return "pages";
  if (extension === "xlsx" || extension === "xls" || extension === "csv") return "sheets";
  return "document";
}

/**
 * How long a step must run before it is worth SAYING anything.
 *
 * 🔴 A FLASHED LOADING STATE IS WORSE THAN NONE. Most of these finish in well under a second, and a
 * caption that appears and vanishes inside 200ms reads as a glitch rather than as progress — it
 * draws the eye, then punishes it for looking. Below the threshold the interface simply stays
 * still, which is what "instant" is made of.
 */
export const THINKING_VISIBLE_AFTER_MS = 600;

/**
 * How long mapping a canvas's knowledge may take before it is reported as a failure.
 *
 * 🔴 THE OWNER'S REQUIREMENT IS A CONSTRUCTION RULE, NOT A NUMBER: "ninety seconds with no
 * transition or failure state should never be REPRESENTABLE." This is what makes that true — the
 * pipeline has exactly three ends (ready, nothing to ask, failed) and cannot sit between them.
 *
 * 🔴 SET UNDER NINETY DELIBERATELY, AND NOT MUCH UNDER. A real build is one model call over up to
 * 120,000 characters; production measured a topic territory resolving in about 18 seconds, and a
 * lecture is a larger input. A tight bound would abort work that was about to succeed and report a
 * failure the learner did not have. Sixty seconds is comfortably above every measured success and
 * comfortably inside the window the owner says must never be silent.
 *
 * 🔴 IT IS A CEILING ON THE WAIT, NOT A BUDGET TO SPEND. Nothing waits for it in the ordinary case:
 * the promise settles when the work does. What it removes is the case where the work never settles
 * at all, which no `catch` can reach because nothing ever rejects.
 */
export const KNOWLEDGE_DEADLINE_MS = 60_000;

/**
 * The same idea for the composer's own activity dot, but sooner.
 *
 * Shorter than the ambient state because it is smaller and closer to what the learner just did:
 * after pressing enter, a completely inert control for half a second reads as a dropped keystroke.
 * Still long enough that a fast judgement never flickers.
 */
export const COMPOSER_ACTIVITY_AFTER_MS = 320;
