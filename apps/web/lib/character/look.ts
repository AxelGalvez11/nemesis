// What the character is made of: one shape, and the app's own accent.
//
// 🔴 ONE SHAPE (owner 2026-08-20: "can we just keep the circle blob shape?"). The engine can
// morph between eight silhouettes and the customiser used to offer all of them. A learner
// choosing a droplet or a hexagon changed what the product's character IS, per device, which
// makes it nobody's character. The catalogue stays — several animations draw their own body and
// need it — but the resting form is the circle, everywhere, for everyone.
//
// 🔴 AND ONE COLOUR CONTROL. The character used to carry its own twelve-colour palette beside
// the app's accent picker. Two pickers that both change "the colour" and disagree with each
// other is worse than either alone. It reads the accent now, so one choice paints the send
// button and the character together.

import { ACCENT_COLORS, isAccent } from "@/lib/accent";
import { SHAPE_BY_ID } from "@/lib/bloub/skins";

/** The resting silhouette. Not a preference. */
export const CHARACTER_SHAPE: number[] = SHAPE_BY_ID.get("cercle")!.radii;

/**
 * Ink for an accent choice.
 *
 * `"default"` deliberately resolves to the near-black/near-white pair rather than to a colour:
 * choosing Default in the app REMOVES the accent override so the theme's own neutral applies,
 * and the character has to say the same thing. A character that went blue while the rest of the
 * chrome went graphite would make Default look broken.
 */
export function inkFor(accent: string | undefined, theme: string | undefined): string {
  if (accent && isAccent(accent) && accent !== "default") return ACCENT_COLORS[accent];
  return theme === "dark" ? "#f2f2f4" : "#0a0a0c";
}
