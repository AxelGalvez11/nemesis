"use client";

// The Canvas read end to end: every recorded moment, in the order it happened.
//
// Owner, 2026-08-26: *"a way to view outputs… where it pretty much just shows one output and hides
// the user's chat bubble"*, then, correcting the framing: *"it shouldn't be a different mode. It
// should just be, like, a different view, a different way to view outputs."*
//
// 🔴🔴 A VIEW MEANS THE VERBS DO NOT MOVE. Everything a learner can DO is unchanged and still on
// screen while this is open: the composer (z-20), the character (z-30), the exit `×`, the header
// controls and the History Rail (z-30) all sit ABOVE this overlay's z-10 and stay live. Ask a
// question from here and it is the same question, routed the same way, answered the same way — it
// simply lands at the bottom of what you are already reading. That is the whole difference between
// this and the "answer state" the owner had removed the same day (`canvas-has-no-modes`): a mode
// changes what you may do, and this changes only what is drawn.
//
// 🔴🔴 IT IS A PROJECTION, NOT A SECOND STORE. Every line here comes from `canvas.moments` through
// `reconstructMoment` — the same append-only spine the History Rail draws, and the same projection
// the rewound single moment uses. There is no transcript kept for this view, nothing written when
// it opens, and nothing it can show that the rail could not already reach. A view with its own data
// would be a second source of truth about what happened, and the two would disagree.
//
// 🔴 IT IS NOT THE "ALL HISTORY" DRAWER, WHICH STAYS DELETED. That was a SECOND RAIL — a column of
// markers beside the compact one, which is what the owner saw and cut on 2026-08-23 (*"there seems
// to be two rails"*). This is not a navigation surface: it has no markers, no selection, no active
// row, and it does not duplicate the rail's job of getting you to ONE moment. It is the reading
// surface the rail navigates within. `canvas-history-surface.test.ts` still holds every part of
// that deletion, and nothing here touches the rail.
//
// 🔴 READ-ONLY BY CONSTRUCTION. No session, no policy, no `update()`, no handler that writes. The
// learner model is a projection of an append-only table, so reading back through a canvas cannot
// roll back mastery even if this file tried to.

import { useEffect, useRef } from "react";

import type { HistoricalMoment } from "@/lib/learn/canvas-history";

import { CanvasMomentBody } from "./canvas-moment-body";
import { LearnerUtterance } from "./learner-utterance";

export function CanvasConversationView({
  moments,
  pendingSaid,
}: {
  /** Oldest first — the order the rail uses, and the order it happened in. */
  moments: readonly HistoricalMoment[];
  /**
   * What the learner has just sent and Nemesis has not answered yet, or null.
   *
   * 🔴🔴 WITHOUT THIS THE VIEW LOOKS BROKEN ON EVERY SEND, AND ONLY IN THIS VIEW. A moment is
   * recorded when the turn RESOLVES, so between pressing send and the answer landing there is
   * nothing new to draw — on the answer view that is invisible, because the character is walking
   * and captioned over the top of it, but here the learner is reading a list that their own message
   * did not join. The character still carries "something is happening"; this carries "and it heard
   * you", which is the half a transcript is expected to show.
   *
   * 🔴 IT IS NOT A MOMENT AND IT IS NOT RECORDED. It exists for the seconds the request is in
   * flight and is replaced by the real recorded moment the instant one exists — never both, because
   * the pending line is cleared in the same callback that records.
   */
  pendingSaid: string | null;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  /**
   * Land on the newest end, and stay there as the conversation grows.
   *
   * 🔴 THE END, NOT THE TOP. Opening a forty-turn session at its beginning is a filing cabinet, not
   * a conversation — the thing a learner wants is what was just said, with the run-up above it.
   *
   * 🔴 KEYED ON THE COUNT, NOT ON THE ARRAY. `moments` is rebuilt by `useMemo` whenever any of the
   * five arrays it reads is replaced, which an autosave does on a keystroke; depending on the
   * identity would scroll the page down while somebody was reading it.
   */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [moments.length, pendingSaid]);

  return (
    <>
    <div className="mx-auto w-full max-w-(--canvas-column) px-6 pt-8">
      {/* 🔴 NO BANNER, AND ITS ABSENCE IS THE POINT. `canvas-history-view.tsx` carries one because a
          single rewound moment can be mistaken for the live answer — the one genuinely dangerous
          state that feature has. This view ENDS at the live answer, so there is nothing here to
          mistake: the newest thing on the page is the newest thing that happened. A permanent
          "you are viewing history" over a surface that includes the present would be false. */}
      {/* 🔴 SPACED, NOT RULED. A divider between turns would make this a record — a table of things
          that happened. The gap is what a chat uses, and the bubble is what already says where one
          turn ends and the next begins. */}
      <div className="space-y-8">
        {moments.map((moment) => (
          <CanvasMomentBody key={moment.momentId} learnerSide="end" moment={moment} />
        ))}

        {pendingSaid && (
          // 🔴 `via={null}` HERE TOO, THOUGH THIS ONE IS LIVE. The modality is tracked for an
          // ANSWER to a question (`answer-modality.ts`), not for an ordinary turn of conversation,
          // so nothing on this path has established whether these words were typed or spoken.
          // `LearnerUtterance` defaults to `"typed"`, and stamping that here would put a claim in
          // the DOM that nothing measured — the same fabrication the prop's own docs refuse.
          <div className="flex justify-end">
            <LearnerUtterance via={null}>{pendingSaid}</LearnerUtterance>
          </div>
        )}
      </div>

    </div>

    {/* 🔴🔴 WHERE THE CHARACTER STANDS IN THIS VIEW, AND IT WEARS THE ANSWER MARKER'S CLASSES TO
        THE LETTER. `#canvas-answer-end` is `mx-auto h-0 w-full max-w-(--canvas-column) px-6`, and
        `character-place.ts` positions off the measured RECT — so a marker nested one level deeper,
        inside the `px-6` column, would sit 24px to the right and the character would line up with
        the text instead of with the column, differing between the two views for no reason anybody
        could see. Same classes, same level, same geometry.

        🔴 AND IT MUST HAVE A WIDTH. The dock reads `width === 0` as "not laid out yet" for an
        `under` anchor and falls back to the corner — a zero-height marker is deliberate, a
        zero-WIDTH one is the feature silently doing nothing. That fault has shipped here once
        already; `w-full` is what keeps it fixed.

        It is also what the scroll lands on, so there is one element rather than two doing
        near-identical jobs. */}
    <div
      aria-hidden="true"
      className="mx-auto h-0 w-full max-w-(--canvas-column) px-6"
      id="canvas-conversation-end"
      ref={endRef}
    />
    </>
  );
}
