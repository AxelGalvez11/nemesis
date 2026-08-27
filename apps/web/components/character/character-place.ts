// Where the character stands relative to the composer.
//
// 🔴 ITS OWN MODULE, AND THE REASON IS TESTABILITY RATHER THAN TIDINESS. This was arithmetic
// inside the dock's layout effect, and the dock imports its own stylesheet — so nothing could
// load it outside a browser, and "is the character beside the composer or on top of it?" could
// only be answered by opening one and looking. A placement that is obviously wrong on screen is
// invisible in a diff, so it is the last thing that should be uncheckable.

/**
 * Where the character stands next to the composer.
 *
 * 🔴 A PURE FUNCTION, AND THAT IS THE POINT. This used to be arithmetic inside a layout effect,
 * which meant the only way to check it was to open a browser and look — so it was never
 * checked, and "beside" versus "above" is exactly the kind of thing that is obviously wrong
 * once seen and invisible in a diff. Given four rectangles it answers in numbers.
 *
 * `inset` is a CSS `left` and `offset` is a CSS `bottom`, both measured inside whatever the
 * dock is positioned within.
 */
/**
 * Where the character stands ON TOP OF the composer, at its left edge.
 *
 * 🔴 THE OWNER'S THIRD ARRANGEMENT IN THREE DAYS, AND ALL THREE ARE STILL HERE ON PURPOSE. The
 * shoulder (2026-08-20), then the composer's left margin (2026-08-26 morning), then under the
 * answer (2026-08-26 afternoon), now this (2026-08-26 evening: *"I want it to be on top on the
 * left of the chat composer"*, then *"make sure its on top of the composer not in inside it, top
 * left"*). Each is a handful of lines and they share every other behaviour, so keeping the
 * arithmetic for all of them costs almost nothing and makes the next reversal a prop change.
 *
 * 🔴 AND IT IS THE ARITHMETIC `placeBeside` ALREADY FELL BACK TO, NOT A SECOND COPY OF IT. The
 * margin arrangement has always had to climb onto the composer's shoulder on a narrow window,
 * where there is no margin to stand in — so this shape was written, tested and shipped months
 * before it had a name. Two copies would be two chances to fix a clamp in one of them.
 *
 * `coveredTop` rather than the composer's own top: an open `+` menu is absolutely positioned
 * inside the composer, so the composer's rect never grows to include it and the character would
 * stand on the menu.
 */
export function placeAbove(input: {
  /** The composer's left edge, in the dock's own coordinate space. */
  readonly anchor: { readonly left: number };
  /** The top of the composer INCLUDING an open menu. */
  readonly coveredTop: number;
  /** Bottom edge of the container the dock sits in. */
  readonly floor: number;
  readonly size: number;
  readonly gap: number;
  /** Floor for `offset`, from the caller's `bottom` prop. */
  readonly bottom: number;
}): { readonly inset: number; readonly offset: number } {
  const { anchor, coveredTop, floor, gap, bottom } = input;
  return { inset: Math.max(EDGE, anchor.left), offset: Math.max(bottom, floor - coveredTop + gap) };
}

export function placeBeside(input: {
  /** The composer, in the dock's own coordinate space. */
  readonly anchor: { readonly left: number; readonly top: number; readonly height: number };
  /** The top of the composer INCLUDING an open menu, for the fall-back placement. */
  readonly coveredTop: number;
  /** Bottom edge of the container the dock sits in. */
  readonly floor: number;
  readonly size: number;
  readonly gap: number;
  /** Floor for `offset`, from the caller's `bottom` prop. */
  readonly bottom: number;
}): { readonly inset: number; readonly offset: number; readonly beside: boolean } {
  const { anchor, coveredTop, floor, size, gap, bottom } = input;
  const beside = anchor.left - size - gap;
  if (beside >= EDGE) {
    return {
      inset: beside,
      // Level with the middle of the composer. The character's own centre is `offset + size / 2`
      // off the floor; the composer's is `floor - top - height / 2`.
      offset: Math.max(bottom, floor - anchor.top - anchor.height / 2 - size / 2),
      beside: true,
    };
  }
  // 🔴 NO ROOM BESIDE IT, SO IT GOES BACK ON TOP. On a narrow window the composer runs the full
  // width and there is no margin to stand in; clamped to the left edge there, the character
  // would sit ON the composer rather than beside it. Above is the old arrangement, unchanged —
  // and it is now `placeAbove`, called rather than repeated, so the two cannot drift.
  return { ...placeAbove({ anchor, coveredTop, floor, size, gap, bottom }), beside: false };
}

/**
 * Where the character rests UNDER the last thing Nemesis said.
 *
 * 🔴🔴 THE REFERENCE IS CLAUDE, MEASURED (owner 2026-08-26: *"the claude has their mascot below
 * answers so could we do the same?"*). At a 1470px viewport their mark is 32 x 32, sits at the
 * left edge of the answer's own text column, and its row carries `margin-top: 24px`. Ours is
 * bigger, so it takes the same 24px gap and the same left alignment and nothing else.
 *
 * 🔴 CLAMPED INTO THE ROOM IT HAS, BOTH WAYS. The anchor is inside a scroller, so it can be
 * anywhere including off the top or under the composer. Without the clamp the character rides the
 * scroll straight out of its container and is simply gone, which reads as a bug rather than as a
 * character that has scrolled away with its answer.
 */
export function placeUnder(input: {
  /** The end of the answer, in the dock's own coordinate space. */
  readonly anchor: { readonly left: number; readonly bottom: number };
  /** Bottom edge of the container the dock sits in. */
  readonly floor: number;
  readonly size: number;
  readonly gap: number;
  /** Floor for `offset`, from the caller's `bottom` prop: never lower than the composer's shoulder. */
  readonly bottom: number;
}): { readonly inset: number; readonly offset: number } {
  const { anchor, floor, size, gap, bottom } = input;
  // `offset` is a CSS `bottom`, so it grows upwards: the character's own bottom edge sits `gap`
  // below where the answer ended.
  const under = floor - anchor.bottom - gap - size;
  const ceiling = floor - size - EDGE;
  return {
    inset: Math.max(EDGE, anchor.left),
    offset: Math.min(Math.max(bottom, under), Math.max(bottom, ceiling)),
  };
}

/** Closest the character is allowed to get to the edge of its container, px. */
const EDGE = 8;
