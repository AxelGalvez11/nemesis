// The staged capability, drawn at the head of the composer's own text line.
//
// 🔴🔴 MEASURED ON THE REFERENCE, 2026-09-01, in the owner's signed-in Chrome. Choosing a tool from
// ChatGPT's `+` puts a `contenteditable="false"` span at the START OF THE PARAGRAPH the learner is
// typing into: 20px icon, 4px gap, 4px of padding each side, the label at 16px/26px in weight 400,
// no background, no border, no radius — and NO ✕. It is removed with Backspace, exactly as a
// character would be, and a second Backspace is not needed. Owner, 2026-09-01: *"the modes dont
// keep their color … chatgpt doesnt use the 'x' … user should be able to backspace to delete the
// mode."*
//
// 🔴 ONE COMPONENT BECAUSE THE TWO COMPOSERS HAD ALREADY DRIFTED. The front door and the session
// composer each wrote this chip out by hand, and by the time it was measured they disagreed about
// the line-height and the icon size. That is the same setup `AddMenuRow` exists to prevent, one
// file over, with the styling in the place of the list.
//
// 🔴🔴 THE TINT IS THE CAPABILITY'S OWN, AND `--ui-action` WAS THE DEFECT. Both chips wrapped the
// icon AND the label in the accent, so a Spreadsheet whose icon is green in the menu turned brown
// the instant it was chosen — the colour that names WHAT KIND OF THING you are about to get was
// thrown away at the exact moment it started to mean something. It is also a known trap here on
// its own terms: `course-map.test.ts` records `--ui-action` as a TEXT colour reading
// near-invisible in dark mode. The reference tints its own pill for the same reason we do; theirs
// is one blue only because every tool they offer shares one accent.
//
// PRESENTATION ONLY. It renders what it is handed. Removing it belongs to the field beside it,
// because Backspace is a keystroke in that field and not a control on this chip.

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

import { CAPABILITY_COPY, type ComposerCapability } from "@/lib/learn/composer-capability";

export function CapabilityChip({
  capability,
  className,
}: {
  capability: ComposerCapability;
  /** Where the chip sits on its composer's own text line. Spacing only. */
  className?: string;
}) {
  const copy = CAPABILITY_COPY[capability];
  return (
    <span
      className={cn(
        // 🔴 §46.3-exempt: the chip shares the input's own line and must be exactly the input's
        // size — and that size is the 16px iOS-zoom threshold, not a step on the type scale. A
        // token here would let the label and the words it sits beside drift apart.
        "flex shrink-0 items-center gap-[4px] whitespace-nowrap px-[4px] text-[16px] leading-[26px]",
        className,
      )}
      data-capability={capability}
      // 🔴 AN INLINE `color`, NOT A TAILWIND ARBITRARY CLASS. `text-(--var)` needs the token name at
      // build time and Tailwind cannot see one that arrives through a record lookup — the class
      // would simply never be generated, and the chip would paint in the inherited colour with
      // nothing on screen to say anything had gone wrong. `AddMenuRow` carries the same note for
      // the same reason: these two are the one colour, in the menu and then on the line.
      style={{ color: `var(${copy.tint})` }}
    >
      <Codicon className="shrink-0" name={copy.icon} size="20px" />
      {/* Truncated rather than wrapped: a long label must never push the caret onto a second line
          of a composer that is one line tall. 16rem is the reference's own cap. */}
      <span className="max-w-[16rem] truncate">{copy.label}</span>
    </span>
  );
}

/**
 * Whether this keystroke should take the staged capability off the line.
 *
 * 🔴🔴 IT IS A FUNCTION SO BOTH COMPOSERS ASK THE SAME QUESTION. The rule reads as one line at each
 * call site and would be copied wrongly the first time somebody moved it: the reference deletes its
 * pill on a Backspace pressed AT THE HEAD OF THE TEXT, which is not the same as "the box is empty".
 * A learner who has typed a sentence and walked the caret back to the front is standing exactly
 * where the chip is, and Backspace there means the chip.
 *
 * 🔴 AND ONLY WITH NOTHING SELECTED. Backspace over a selection deletes the selection; taking the
 * capability away as well would be two deletions for one keypress.
 */
export function backspaceClearsCapability(
  event: { key: string; currentTarget: { selectionStart: number | null; selectionEnd: number | null } },
): boolean {
  return event.key === "Backspace" && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0;
}
