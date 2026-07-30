// Making what a conversation PRODUCED visible to the model.
//
// 🔴 THIS IS THE FIX FOR A WRONG ANSWER THAT LOOKED LIKE DISOBEDIENCE. The owner
// saved a recording about collecting a car, then asked "Can you make flashcard
// and test from this?" and got twenty cards about atrial fibrillation.
//
// The model was not ignoring the recording. It could not see it. When a recording
// saves, the message in the thread reads "Recording saved. Your notes are being
// prepared in the Library." — and the actual content (title, transcript, notes)
// lives in that message's `outputs`, which buildWireMessages dropped on the floor:
// `.map((msg) => ({ content: msg.content, role: msg.role }))`. So "this" had
// nothing in the conversation to point at, while the retrieval packet had glued
// unrelated Library notes onto the end of the very same user message. It answered
// the only material it was given.
//
// The lesson generalises past recordings: ANY artifact a turn produces is invisible
// to the next turn, so "add ten more cards to that deck" or "expand those notes"
// had the same hole. This module is the one place that decides what a produced
// artifact looks like on the wire.
//
// Field-agnostic by construction: it reports the artifact's KIND and TITLE and, for
// the newest one, its body. No subject-matter heuristics — a mechanical engineer's
// lab recording and a law student's seminar are handled by the same two lines.
import { wrapUntrusted } from "@nemesis/shared";

/** The most a single artifact body may add to the wire. The whole history budget
 *  is 24,000 characters (chat-thread.ts), so one artifact may take a sixth of it —
 *  enough for a lecture's write-up, not enough to evict the conversation around it. */
export const ARTIFACT_BODY_BUDGET = 4_000;

/** Structural shape only — deliberately NOT ChatMsg, so this module stays free of
 *  chat-thread.ts and Deno can test it alone (same precedent as artifact-timeline.ts). */
export interface ArtifactCarrier {
  role: "assistant" | "user";
  content: string;
  outputs?: readonly {
    kind: string;
    title: string;
    notes?: string;
    transcript?: string;
    polish?: "pending" | "done";
  }[];
}

/** What the student said when they meant "the thing we just made". Written into the
 *  system prompt rather than repeated on every message — see chat-thread.ts. */
export const ARTIFACT_REFERENCE_RULE =
  "Some messages below end with a bracketed [Produced in this conversation: …] note. That is a real thing " +
  "this conversation already made, and it is what the student means by \"this\", \"it\", \"that\", \"these notes\", " +
  "or \"the recording\" unless they name something else. Resolve such a reference against the most recent one " +
  "of those FIRST. Only search their Library when the conversation genuinely does not contain what they are " +
  "pointing at, or when they ask for their existing material by name.";

type Artifact = NonNullable<ArtifactCarrier["outputs"]>[number];

function bodyOf(output: Artifact): string {
  // Notes before transcript: the write-up is what the student reads and what they
  // mean by the recording. The raw transcript is a fallback for the window between
  // saving and the polish pass finishing.
  return (output.notes ?? output.transcript ?? "").trim();
}

/** One artifact, as one line. */
function describe(output: Artifact): string {
  const title = output.title.trim() || "untitled";
  return `${output.kind} "${title}"`;
}

/**
 * Fold each message's artifacts into its text, so the wire carries them.
 *
 * Only the LAST artifact that has a body gets that body. Everything else is named
 * and nothing more. Two reasons: an older artifact's full text would crowd out the
 * conversation that gives it meaning, and "this" almost always means the newest
 * thing — an older one gets referred to by name, which the one-line mention serves.
 *
 * Returns a NEW array; the input is never mutated (messages are also rendered on
 * screen from these same objects).
 */
export function expandArtifactContext<T extends ArtifactCarrier>(
  history: readonly T[],
  bodyBudget = ARTIFACT_BODY_BUDGET,
): T[] {
  // Which message owns the body: the last one with an artifact that HAS text.
  let bodyIndex = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if ((history[i].outputs ?? []).some((output) => bodyOf(output).length > 0)) {
      bodyIndex = i;
      break;
    }
  }

  return history.map((message, index) => {
    const outputs = message.outputs ?? [];
    if (outputs.length === 0) return message;

    const named = outputs.map(describe).join(", ");
    let note = `[Produced in this conversation: ${named}.`;

    if (index === bodyIndex) {
      const carrier = outputs.find((output) => bodyOf(output).length > 0);
      if (carrier) {
        const body = bodyOf(carrier);
        // Clipped, never summarised — a summary of a summary is where detail dies.
        const clipped =
          body.length > bodyBudget ? `${body.slice(0, bodyBudget)}\n…(continues)` : body;
        // Fenced as untrusted for the same reason Library notes are: this text was
        // spoken by whoever the student recorded, and a sentence in it that reads
        // like an instruction is not one.
        note += `\n${wrapUntrusted(carrier.title.trim() || "produced content", clipped)}`;
      }
    } else if (outputs.some((output) => output.polish === "pending")) {
      // Say the quiet part rather than letting the model assume it has the content:
      // a pending recording is named but its write-up does not exist yet.
      note += " Its write-up was still being prepared at that point.";
    }

    note += "]";
    return { ...message, content: `${message.content}\n\n${note}` };
  });
}
