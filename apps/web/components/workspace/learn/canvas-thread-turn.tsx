"use client";

// One finished turn, drawn in the thread.
//
// 🔴🔴 IT DRAWS WITH THE SAME COMPONENTS THE LIVE ANSWER USES, AND THAT IS THE WHOLE REQUIREMENT.
// Owner, 2026-08-26, on making the chat the product: *"bring over the artifacts, rendering chips,
// the visualizations, the instruction prompts for teaching, and bring over the output rendering,
// like the pill shapes for the sources and favicon thumbnails… and the component chips for tests."*
//
// The version this replaces re-rendered a turn from a flat string, so every one of those things was
// lost the moment it scrolled out of the live region. `SemanticVisual`, `CanvasSourceCards`,
// `ArtifactCard` and `AssistantMarkdown` are the exact components the canvas uses one screen below;
// a second drawing of any of them would drift the first time one was adjusted.
//
// 🔴 WHAT IT DELIBERATELY DOES NOT CARRY: the selection markers, "Learn this", "Back to the lesson",
// and any pending confirmation. Those are offers about the turn you are IN — a consent button under
// a turn from twenty minutes ago is the one way such a control becomes genuinely dangerous, and
// `use-canvas-session.ts` already says so about `pending` living on the aside. A past turn is
// something you read, not something you act on.
//
// 🔴 READ-ONLY. No session, no policy, no handler that writes.

import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";

import type { CanvasThreadTurn } from "@/lib/learn/canvas-thread";
import { replySegments } from "@/lib/learn/reply-visuals";

import { ArtifactCard } from "./artifact-card";
import { CanvasSourceCards } from "./canvas-source-cards";
import { LearnerUtterance } from "./learner-utterance";
import { SemanticVisual } from "./semantic-visual";

export function CanvasThreadTurnView({
  onOpenOutput,
  turn,
}: {
  /** Opening what the turn produced. The card is not a dead control in the thread. */
  onOpenOutput: (output: NonNullable<CanvasThreadTurn["output"]>) => void;
  turn: CanvasThreadTurn;
}) {
  return (
    <div className="mx-auto w-full max-w-(--canvas-column) px-6" data-thread-turn={turn.id}>
      {/* 🔴 THE LEARNER'S WORDS, ON THE RIGHT, IN THE ONE TREATMENT §46.2 ALLOWS. The Canvas view
          is the one that hides these — owner, 2026-08-26: *"just make the canvas the one where it
          doesn't show the user's prompt. It just shows the output."* In the chat they are the half
          that makes an answer legible at all.
          🔴 `via={null}`: nothing on the ordinary conversational path establishes whether the words
          were typed or spoken, and `LearnerUtterance` defaults to `"typed"`. */}
      {turn.said?.trim() && (
        <div className="mb-4 flex justify-end">
          <LearnerUtterance via={null}>{turn.said}</LearnerUtterance>
        </div>
      )}

      {/* Material attached during this turn, named rather than announced. */}
      {turn.attached.length > 0 && (
        <ul className="mb-4 space-y-1">
          {turn.attached.map((title) => (
            <li className="text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)" key={title}>
              {title}
            </li>
          ))}
        </ul>
      )}

      {/* 🔴 THE SAME SPLIT THE LIVE REPLY USES, so a drawing lands exactly where the model put it,
          between the sentence that introduces it and the one that follows. */}
      {turn.reply.trim() && (
        <div className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)">
          {replySegments(turn.reply, turn.visuals).map((segment, index) =>
            segment.kind === "visual" ? (
              <SemanticVisual key={`v${index}`} visual={segment.visual} />
            ) : segment.kind === "target_language" ? (
              // 🔴 THE SENTENCE, WITHOUT THE SPEAKER. `SpokenExample` owns a live audio controller
              // keyed to the one reply on screen; mounting one per past turn would put a row of
              // play buttons down the thread all competing for the same voice. The words stay.
              <AssistantMarkdown
                className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
                key={`s${index}`}
                singleDollarMath
                text={segment.text}
              />
            ) : (
              <AssistantMarkdown
                className="text-[length:var(--canvas-text-body)] leading-relaxed text-(--ui-text-primary)"
                key={`p${index}`}
                namedCitations
                singleDollarMath
                sources={turn.sources.length ? turn.sources : undefined}
                text={segment.text}
              />
            ),
          )}
        </div>
      )}

      {/* 🔴 THE PILLS AND THE FAVICONS, WHICH IS THE OWNER'S OWN ITEM ON THE LIST. `CanvasSourceCards`
          is the component the live answer draws, headline and favicon and all.
          🔴 NO `onAdd`. Promoting a page to a durable source is an act about the turn you are in;
          offering it under an old answer is a control whose effect nobody can see. */}
      {turn.sources.length > 0 && (
        <CanvasSourceCards cards={turn.sources.map((source) => ({ title: source.title || source.url, url: source.url }))} />
      )}

      {/* What this turn made. The card opens it, exactly as it does live. */}
      {turn.output && <ArtifactCard onOpen={() => onOpenOutput(turn.output!)} output={turn.output} />}

      {/* 🔴 SAID PLAINLY RATHER THAN HIDDEN. A turn rebuilt after a refresh keeps its words and
          whatever fitted; a thread that quietly dropped the pictures would read as them being lost
          rather than as never having been kept. */}
      {turn.truncated && (
        <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
          Only the start of this was kept.
        </p>
      )}
    </div>
  );
}
