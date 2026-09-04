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

/**
 * One thing staged at the head of the composer's text line.
 *
 * 🔴 THE SHAPE IS THE MEASUREMENT AT THE TOP OF THIS FILE, AND IT NOW HAS TWO USERS. A capability
 * was the first; a project is the second (owner, 2026-09-03: *"users should be able to add it to a
 * folder or project ... compare with ChatGPT because it looks different when you add it"*). Measured
 * on chatgpt.com the same day, choosing a project puts a `contenteditable="false"` span at the head
 * of the paragraph — 20px folder glyph, label at 16px weight 400, `padding: 0 4px`, radius 0,
 * transparent, removed with Backspace. That is this component, already built and already measured.
 *
 * 🔴 SO THE PROJECT IS NOT A PILL ON A STRIP ANY MORE. It was a filled chip in the row UNDER the
 * composer, which is a different object in a different place from the thing the reference draws —
 * and that difference is what the owner was pointing at. The strip's button stays where he asked
 * for it on 2026-08-29; it is the DOOR. What you chose shows up in the line you are typing.
 */
function ComposerToken({
  icon,
  label,
  tint,
  className,
  ...marks
}: {
  icon: string;
  label: string;
  /** A CSS custom property NAME, e.g. `--ui-kind-blue`. */
  tint: string;
  className?: string;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <span
      className={cn(
        // 🔴 §46.3-exempt: the token shares the input's own line and must be exactly the input's
        // size — and that size is the 16px iOS-zoom threshold, not a step on the type scale. A
        // token here would let the label and the words it sits beside drift apart.
        "flex shrink-0 items-center gap-[4px] whitespace-nowrap px-[4px] text-[16px] leading-[26px]",
        className,
      )}
      // 🔴 AN INLINE `color`, NOT A TAILWIND ARBITRARY CLASS. `text-(--var)` needs the token name at
      // build time and Tailwind cannot see one that arrives through a record lookup — the class
      // would simply never be generated, and the token would paint in the inherited colour with
      // nothing on screen to say anything had gone wrong. `AddMenuRow` carries the same note for
      // the same reason: these two are the one colour, in the menu and then on the line.
      style={{ color: `var(${tint})` }}
      {...marks}
    >
      <Codicon className="shrink-0" name={icon} size="20px" />
      {/* Truncated rather than wrapped: a long label must never push the caret onto a second line
          of a composer that is one line tall. 16rem is the reference's own cap. */}
      <span className="max-w-[16rem] truncate">{label}</span>
    </span>
  );
}

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
    <ComposerToken className={className} data-capability={capability} icon={copy.icon} label={copy.label} tint={copy.tint} />
  );
}

/**
 * The project this chat will be filed into, on the composer's own line.
 *
 * 🔴 THE GLYPH IS THE PROJECT'S OWN, AND ITS COLOUR IS NOT. A project may carry a chosen icon; it
 * no longer carries a colour (owner, 2026-09-03, the accent sweep — see project-customize-dialog).
 * `--ui-text-secondary` is what every capability tint resolves to now, so the two tokens that can
 * share this line share one ink rather than one of them re-introducing a hue.
 */
/* 🪦 `ProjectToken` STOOD HERE FOR ONE DAY. It put the chosen project inline at the head of the
   composer's line, copied from chatgpt.com — and the owner read it as a mode the moment he used it
   (2026-09-03: *"the project shows up in the chat bar as if it's a mode. But I need it to be down
   there where it says choose project instead"*). The project is shown on the control that sets it
   now; `project-picker.tsx` has the reasoning and `canvas-home.tsx` the tombstone.

   🔴 `ComposerToken` ABOVE IS UNTOUCHED AND IS STILL SHARED. It was extracted for this, and the
   capability chip is still built from it — the measurement it carries came from the reference and
   is right whatever else sits on that line. */

/* 🪦 `backspaceClearsToken` WENT WITH THE TOKEN. It answered "which of the two things on this line
   does Backspace take off", and there is only one thing on the line again. `backspaceClearsCapability`
   below is the original and never stopped being the answer. */

export function backspaceClearsCapability(
  event: { key: string; currentTarget: { selectionStart: number | null; selectionEnd: number | null } },
): boolean {
  return event.key === "Backspace" && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0;
}
