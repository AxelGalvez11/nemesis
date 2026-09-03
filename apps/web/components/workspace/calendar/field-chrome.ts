// The chrome every control in the calendar's forms wears.
//
// 🔴 SHARED SO THE TWO CANNOT DRIFT. The event editor and the repeat editor each
// had their own `const FIELD = "h-8 rounded-lg border …"`, and they had already
// drifted: after the editor's controls were sized to Google's 40px the repeat
// dropdown was still 36, sitting visibly short beside the date field above it.
//
// The heights are measured, not chosen. Google's event editor
// (calendar.google.com/r/eventedit) draws 40px controls and steps its rows 48px
// at a 16px root; this app's root is 18px, so the like-for-like figures are 45px
// and 54px. `docs/google-calendar-reference.md` has the method.

import { controlVariants } from "@/components/desktop-ui/control";
import { cn } from "@/lib/utils";

/** Google's 40px control at this app's root. */
export const CONTROL_HEIGHT = "h-[2.5rem]";

/** A native select wearing the same chrome as the Inputs beside it. */
export const FIELD = cn(controlVariants(), CONTROL_HEIGHT, "cursor-pointer appearance-none pr-7");

const CHEVRON =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23888' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M3 4.5 6 7.5 9 4.5'/></svg>\")";

/**
 * 🔴 THE WHOLE BACKGROUND SHORTHAND GOES INLINE, not just the image.
 *
 * `bg-[right_0.5rem_center]` and `bg-[length:0.75rem]` do not compile: Tailwind
 * reads a bare `bg-[…]` as a colour or an image, never as a position or a size,
 * so the arrow kept its natural size and TILED — six chevrons marching across
 * the timezone field. Setting `backgroundImage` inline and leaving the rest to
 * classes is the trap, because the half that silently failed is the half that
 * makes one arrow one arrow.
 */
export const CHEVRON_STYLE: React.CSSProperties = {
  backgroundImage: CHEVRON,
  backgroundPosition: "right 0.5rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "0.75rem",
};

/**
 * Date and time inputs, with the platform's own glyph turned down.
 *
 * `::-webkit-calendar-picker-indicator` is the little calendar and clock the
 * browser draws inside these fields. It cannot be replaced, only dimmed, and at
 * full strength it is the loudest thing in the row. It still opens the picker.
 */
export const DATE_FIELD = cn(
  CONTROL_HEIGHT,
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-35 [&::-webkit-calendar-picker-indicator]:hover:opacity-70",
);

/**
 * The same control, with its outline taken off.
 *
 * 🔴🔴 THIS IS WHAT "NOT SO BUNCHED UP" ACTUALLY NEEDED. Owner, 2026-09-03, of
 * the event editor: *"it looks a bit too close together… I need something that
 * is not so bunched up, something that is easier on the eyes"* and, of the same
 * box, *"a bit smaller"*. Those two pull against each other, and the way out is
 * not more padding: it is fewer edges. Six outlined boxes stacked eight pixels
 * apart read as a wall whatever the gap between them, because every one of them
 * draws its own rectangle. On a faint ground the row reads as writing, and the
 * air between rows is then free to do its job.
 *
 * 🔴 SAME HEIGHT AND SAME RADIUS AS `FIELD`, deliberately. A select inside the
 * repeat panel still wears the outlined chrome (it has a dropdown arrow to
 * carry), and the two sit in the same dialog — they must agree about their box
 * even when they disagree about their edge.
 *
 * 🔴 15px, NOT 13.5. The other half of "easier on the eyes" is the type, and a
 * control the size of a caption is what made this form feel like settings rather
 * than like an event.
 */
export const SOFT_FIELD = cn(
  CONTROL_HEIGHT,
  "flex w-full min-w-0 items-center gap-2 rounded-[0.75rem] border-0 px-[14px] text-left",
  "bg-[color-mix(in_srgb,var(--ui-base)_4.5%,transparent)] text-[15px] leading-5 text-(--ui-text-primary)",
  "outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--ui-base)_8%,transparent)]",
  "focus-visible:ring-2 focus-visible:ring-(--ui-stroke-primary)",
  // 🔴 THE PLATFORM GLYPH GOES, AND THE PILL BECOMES THE BUTTON. Dimming it was
  // right while these were outlined boxes; on a borderless pill it is the only
  // edge left in the row. `showPicker()` on the field itself is the replacement
  // — see `openPicker` in event-dialogs.tsx, which falls back to the glyph's own
  // behaviour where the browser has no such method.
  "[&::-webkit-calendar-picker-indicator]:hidden",
);
