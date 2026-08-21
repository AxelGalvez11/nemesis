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


/**
 * Where the character looks, given the pointer.
 *
 * 🔴 NOT bloub's `lookTarget`, AND THIS IS THE WHOLE DIFFERENCE. Upstream's version is
 * `yaw: -TURN + nx * YAW_MAX` with `TURN = 26`, because in that project the character sits
 * beside a settings panel and is supposed to face it. Ported here, that constant meant the
 * character faced 26 degrees LEFT with the pointer dead centre, and the ±16 degrees of tracking
 * were never enough to bring it back — so it read as stuck staring at the wall, which is exactly
 * what the owner saw. Nemesis has no panel to face; the resting direction is straight ahead.
 */
export const YAW_RANGE = 26;
export const PITCH_RANGE = 15;
/** Slightly above the equator: attentive rather than absent. */
export const PITCH_REST = 8;

export interface Aimed {
  yaw: number;
  pitch: number;
  mix: number;
  spin: number;
  wander: number;
}

export function aimFor(nx: number, ny: number, pointer: boolean): Aimed {
  return {
    yaw: nx * YAW_RANGE,
    // Screen y grows downward; a positive pitch looks up.
    pitch: PITCH_REST - ny * PITCH_RANGE,
    mix: 1,
    spin: 0,
    // With no pointer the head keeps its drift, so a touch device or a keyboard arrival still
    // gets something alive rather than a fixed stare.
    wander: pointer ? 0 : 1,
  };
}
