// The one sentence that tells a learner why they are looking at a correction.
//
// 🔴 IT LIVES HERE SO THE SCREEN AND THE VOICE CANNOT DRIFT APART. This copy used to be a ternary
// inline in `canvas-policy-view.tsx`, which was fine while the screen was the only thing that said
// it. Voice mode reads the lead-in too — hearing only the answer loses whether the learner was
// right, which is the part that teaches — and a second copy of a three-branch ternary is two
// wordings that agree until somebody edits one.
//
// 🔴 AND IT IS IN `components/workspace/learn/` ON PURPOSE, NOT IN `lib/learn/`. The learner-copy
// guard (`canvas-learner-copy.test.ts`) scans THIS directory. Copy moved one folder up for
// tidiness would leave the assistant-voice rules — no "let's", no praise inflation, no hedging —
// silently unenforced on exactly the sentence a learner hears when they got something wrong.

import type { LearnerObjectiveStatus } from "@/lib/learn/learner-evidence";

/**
 * What to say before the answer.
 *
 * 🔴 THREE STATES THAT KEEP THEIR MEANINGS. `incorrect` had something to repair, `partial` had
 * something right worth keeping, and `not_demonstrated` had no attempt at all — so the last one is
 * never told it was wrong. Merging them would tell a learner who said nothing that they had erred.
 */
export function correctionLead(status: LearnerObjectiveStatus): string {
  if (status === "partial") return "You had part of this.";
  if (status === "not_demonstrated") return "No attempt came back on this one. Here it is.";
  return "Here's the one to fix.";
}
