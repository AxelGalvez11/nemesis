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

/** Closest the character is allowed to get to the edge of its container, px. */
const EDGE = 8;
