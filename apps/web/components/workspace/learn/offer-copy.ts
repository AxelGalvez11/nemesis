// The one line above "Learn this" that says why it is being offered now.
//
// 🔴 IT ONLY SPEAKS WHEN IT HAS SOMETHING TO SAY. Most answers carry no reason and the offer stays
// a bare button — which is right, because a nudge on every single reply is not a nudge, it is
// nagging, and the learner stops seeing it. The line appears when Nemesis has actually noticed
// something: a subject the learner keeps circling, or reasoning they have just produced.
//
// 🔴 IT REPORTS AN OBSERVATION, NEVER A VERDICT ABOUT THE LEARNER. "You keep coming back to this"
// is a fact about the conversation. "You seem confused about this" is a claim about them, and the
// model is told in as many words not to make one (see lib/learn/turn-router.ts's contract).
//
// Lives in `components/workspace/learn/` because the learner-copy guard scans this directory.

import type { TurnOffer } from "@/lib/learn/turn-router";

export function offerLine(reason: TurnOffer | undefined): string | null {
  if (reason === "returning") return "You keep coming back to this.";
  if (reason === "reasoning") return "You're working something out here.";
  return null;
}
