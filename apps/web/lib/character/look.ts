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
import { SHAPE_BY_ID, mixHex } from "@/lib/bloub/skins";

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

// ── Colour: where it belongs, and where it stopped belonging ──────────────────

/**
 * The stops one orbit arc is drawn with.
 *
 * 🔴🔴 THE RAINBOW IS GONE (owner, 2026-08-21: *"remove the colorful swirls from the mascot"*).
 * Upstream builds every arc's gradient off a hue wheel — `RINGS` spreads six arcs across the full
 * 360°, `COMET_RIBBONS` steps 85° a ribbon — so a search or a poke threw a spectrum around a
 * character that is otherwise one flat ink. Two problems, and the second is the real one:
 *
 *   · it competes with the page. The character sits beside dense reading material, and the whole
 *     reason it is flat — no gradient, no gloss, no shadow — is that a rendered-looking object next
 *     to a paragraph pulls the eye off the paragraph. Six saturated rings undo that in one frame.
 *   · it says nothing. Colour is the loudest signal a small mark has, and it was spent on decoration
 *     that meant the same thing in every state. Spending it here left nothing for the one moment
 *     that genuinely needs a signal — see `pulseTint`, which is where it went instead.
 *
 * 🔴 THE FADE STAYS, BECAUSE IT IS DOING A JOB. An orbit ring is a stroke passing behind the body
 * and back out in front; ends that dissolve into the page read as an arc going round something,
 * and a hard-ended band reads as a hoop laid on top. So the stops still travel — from near-paper at
 * the ends to full ink in the middle — they simply travel in one colour now.
 *
 * 🔴 AND IT IS DONE HERE RATHER THAN IN `lib/bloub/decor.ts`. That file is vendored whole from
 * upstream and must stay a plain copy so re-vendoring is a copy rather than a merge; the seeds keep
 * their hues and this product declines to use them.
 */
export function arcStops(ink: string, paper: string, count: number): string[] {
  if (count <= 1) return [ink];
  return Array.from({ length: count }, (_, i) => {
    // 0 at the ends, 1 in the middle.
    const along = i / (count - 1);
    const centred = 1 - Math.abs(along * 2 - 1);
    return mixHex(paper, ink, 0.28 + 0.72 * centred);
  });
}

/**
 * The pulse palette: the app's own accents, in the order the picker shows them.
 *
 * 🔴 THE PRODUCT'S COLOURS, NOT A HUE WHEEL, and that is the difference between this and what it
 * replaces. A wheel produces colours nothing else in Nemesis uses, which is why the swirls read as
 * belonging to some other application. These are the six a learner can already choose from, so a
 * thinking pulse looks like the same product whichever one they picked.
 */
export const PULSE_CYCLE: readonly string[] = [
  ACCENT_COLORS.blue,
  ACCENT_COLORS.purple,
  ACCENT_COLORS.pink,
  ACCENT_COLORS.orange,
  ACCENT_COLORS.yellow,
  ACCENT_COLORS.green,
];

/** Seconds one colour holds before it has fully become the next. */
export const PULSE_PERIOD = 2.6;

/**
 * The colour a thinking dot is drawn in at this instant.
 *
 * 🔴🔴 COLOUR NOW MEANS ONE THING: NEMESIS HAS THE FLOOR (owner, 2026-08-21: *"can you add a
 * colorful pulsing as its thinking"*). Every other state is flat ink. So a learner does not have to
 * learn what the colour means — it is the only time the character is coloured at all, and it stops
 * the moment the answer arrives.
 *
 * 🔴 A DRIFT, NOT A FLASH. Adjacent accents are blended rather than swapped, so the dots move
 * through the palette the way a slow gradient does. Cutting between six saturated colours every two
 * and a half seconds beside a paragraph somebody is reading is a strobe, not a pulse.
 *
 * 🔴 THE THREE DOTS ARE OFFSET, NOT IN UNISON. In step they read as one object changing colour;
 * a third of a cycle apart they read as a sequence travelling along the row, which is what the
 * three-dot figure means in the first place.
 *
 * 🔴 AND REDUCED MOTION HOLDS A COLOUR RATHER THAN LOSING IT. Someone who asked the system to stop
 * moving still has to be able to tell that it is working, and the dots' own motion is already the
 * thing being held — see `still` in the renderer. Each dot keeps a fixed, distinct accent.
 */
export function pulseTint(clock: number, index: number, reduced: boolean): string {
  const count = PULSE_CYCLE.length;
  if (reduced) return PULSE_CYCLE[(index * 2) % count] ?? PULSE_CYCLE[0]!;
  const offset = index / 3;
  const position = (clock / PULSE_PERIOD + offset) * count;
  const from = Math.floor(position) % count;
  const to = (from + 1) % count;
  // 🔴 SMOOTHSTEP, SO THE COLOUR RESTS. A linear blend spends the whole cycle mid-transition and
  // never actually looks like any of the six; easing the crossing lets each accent be itself for
  // most of its turn and hurries through the muddy part in between.
  const t = position - Math.floor(position);
  const eased = t * t * (3 - 2 * t);
  return mixHex(PULSE_CYCLE[from] ?? "#000", PULSE_CYCLE[to] ?? "#000", eased);
}
