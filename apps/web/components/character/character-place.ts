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
  // would sit ON the composer rather than beside it. Above is the old arrangement, unchanged.
  return { inset: Math.max(EDGE, anchor.left), offset: Math.max(bottom, floor - coveredTop + gap), beside: false };
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
