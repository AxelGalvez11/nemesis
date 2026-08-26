"use client";

// The two buttons standing between a model's intention and somebody's real calendar or mailbox.
//
// 🔴🔴🔴 THIS IS THE ONLY WAY A WRITE HAPPENS, AND EVERY WORD ON IT COMES FROM THE ARGUMENTS
// RATHER THAN FROM THE MODEL'S PROSE. `summarise()` reads the call's own argument object and
// names recipients first where there are any; `PendingDelete.target` is looked up from the row
// that is about to go. A card that describes one thing while a different thing runs converts the
// learner's click from consent into a rubber stamp, which is worse than having no card at all.
//
// 🔴 IT IS DELIBERATELY A CARD, ON A SURFACE THAT BANS CARDS. Everywhere else on the Canvas the
// rule is no borders, no panels, no toolbars — the material is the thing on screen. This is the
// exception the rule was always going to have: a control that sends an email must not read as
// another line of the answer, and the one thing it may never be is easy to click past.
//
// 🔴 NO DEFAULT, NO PRE-FOCUS, NO ENTER-TO-CONFIRM. Both buttons are the same size and neither is
// the one a stray keystroke picks.

import { useState } from "react";

import { confirmationCopy, type PendingConfirmation } from "@/lib/learn/canvas-tools";

export function ConfirmCard({
  pending,
  onAnswer,
}: {
  pending: PendingConfirmation;
  /** `true` does it, `false` drops it. Both clear the card. */
  onAnswer: (approve: boolean) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const copy = confirmationCopy(pending);

  const answer = async (approve: boolean) => {
    // 🔴 ONE PRESS ONLY. A second click while the first is in flight is a second email.
    if (busy) return;
    setBusy(true);
    try {
      await onAnswer(approve);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-3 flex flex-col gap-3 rounded-[10px] border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-3"
      role="group"
      aria-label="Confirm before this happens"
    >
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[length:var(--canvas-text-small)] text-(--ui-text-primary)">{copy.title}</p>
        <p className="m-0 text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">{copy.detail}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="flex h-[30px] items-center justify-center rounded-[6px] bg-(--ui-text-primary) px-3 text-[length:var(--canvas-text-meta)] font-medium text-(--ui-bg-editor) transition-opacity hover:opacity-85 disabled:opacity-50"
          disabled={busy}
          onClick={() => void answer(true)}
          type="button"
        >
          {copy.verb}
        </button>
        <button
          className="flex h-[30px] items-center justify-center rounded-[6px] px-3 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) disabled:opacity-50"
          disabled={busy}
          onClick={() => void answer(false)}
          type="button"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
