// Gmail's mark: a mostly white envelope with a red flap and thin coloured edges, drawn as our own
// vectors.
//
// 🔴 REDRAWN 2026-08-26 AFTER A REVIEW CAUGHT THE FIRST VERSION. The first draft filled the whole
// envelope with four solid colour quadrants meeting in the middle, which reads as a colour-blocked
// rectangle, not an envelope. The real mark is mostly WHITE: a red flap traced as a thick
// checkmark stroke, not a filled triangle, sitting on a white interior, with blue, green and
// yellow appearing only as thin bands at the envelope's own left, right and bottom edges. That is
// what is drawn below: a white base, three edge bands, then the red stroke on top.
//
// 🔴 THE CLIP ID IS PER RENDER, NOT HARDCODED. This tile draws twice on one page load whenever an
// app is connected: once in the "Connected" strip, once in its row in the grid below. A fixed
// `id="clip"` would collide the second time an SVG with that id lands in the DOM, and the loser
// would silently lose its rounded corners. `useId` gives every instance its own name.

import { useId } from "react";

export function GmailMark({ size = 32 }: { size?: number }) {
  const clip = useId();
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 32 32" width={size}>
      <defs>
        <clipPath id={clip}>
          <rect height="16" rx="3" ry="3" width="26" x="3" y="9" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect fill="#FFFFFF" height="16" width="26" x="3" y="9" />
        <rect fill="#4285F4" height="16" width="2.5" x="3" y="9" />
        <rect fill="#34A853" height="16" width="2.5" x="26.5" y="9" />
        <rect fill="#FBBC04" height="2.5" width="21" x="5.5" y="22.5" />
        <path
          d="M 6 10.5 L 16 19.5 L 26 10.5"
          fill="none"
          stroke="#EA4335"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.4"
        />
      </g>
    </svg>
  );
}
