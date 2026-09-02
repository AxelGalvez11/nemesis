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
