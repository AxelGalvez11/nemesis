// Google Calendar's mark: a white sheet with a blue border, a folded corner and the date's
// numeral, drawn as our own vectors.
//
// 🔴 REDRAWN 2026-08-26 AFTER A REVIEW CAUGHT THE FIRST VERSION. The first draft drew two ring
// tabs above a rounded frame and a four-colour striped header, which reads as a spiral desk
// calendar or a binder at any size, not as Google Calendar. The real mark has no ring binding and
// is mostly blue and white; its single most recognisable feature is the numeral sitting in the
// middle, which the first draft left out entirely. This version is just that: a white square, a
// blue border, a folded top-right corner, and the numeral in Google Blue.
//
// 🔴 THE NUMERAL IS TEXT, NOT DRAWN GEOMETRY, ON PURPOSE. Two digits at this size are not worth
// hand-plotting as paths, and every platform this renders on ships a bold sans-serif. Checked at
// the tile's real 40px (not just at a magnified size a learner never actually sees): "31" stays
// legible at 30px of mark inside the 40px tile, in both the light and dark workspace themes, since
// the tile behind it is a fixed white regardless of theme (see plugin-icon.tsx's header).

export function GoogleCalendarMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 32 32" width={size}>
      <rect fill="#FFFFFF" height="22" rx="2" stroke="#4285F4" strokeWidth="2" width="22" x="5" y="5" />
      <polygon fill="#4285F4" points="20,5 27,5 27,12" />
      <text
        fill="#4285F4"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="15"
        fontWeight="700"
        textAnchor="middle"
        x="16"
        y="23"
      >
        31
      </text>
    </svg>
  );
}
