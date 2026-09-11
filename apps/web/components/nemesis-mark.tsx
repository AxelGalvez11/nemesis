// The Nemesis mark, drawn: three dots, two up and one down.
//
// 🔴🔴 THE OWNER CHOSE THIS ON 2026-09-11, AND THE DOT SIZE IS THE PART THAT CANNOT DRIFT. From nine directions
// the owner picked three dots, then asked for the ring around them to go, for the triangle to point down ("two
// dots up and one dot down"), and for a mark that "doesn't resemble any other famous logo". Every candidate was
// scored against the 3,459 brand logos in Simple Icons: both shapes scaled to one size, turned or flipped to their
// best match, then measured on how much of the shape overlaps. For scale, Asana against Julia, two marks people
// genuinely confuse, is 87%. Three equal dots at the first sketch's size overlap Asana 55% and Julia 48%, and dots
// that nearly touch ARE Asana's logo (94%). At a radius of 0.36 of the spacing circle every logo in the set is
// under 50%: Asana 42%, Julia 37%, the closest of all 46%. Turning the mark over changes none of these numbers;
// only the dot size does.
//
// 🔴 DRAWN AND NOT AN IMAGE FILE. The mark used to be `/nemesis/logo.png`, a raster that went stale while the
// marketing site had already moved on, and nothing could say so because a PNG cannot be wrong at compile time.
// It takes its colour from the text around it (`currentColor`), so one drawing serves a light page and a dark one.
//
// Geometry is identical to app/icon.svg, app/apple-icon.tsx, scripts/brand-raster.mts and the marketing site's
// components/NemesisMark.tsx; lib/nemesis-mark.test.ts holds every copy to these numbers.

/** Three circles in a 100-unit box: centres on a circle of radius 30 at 210°, 330° and 90°, radius 10.8. */
export const MARK_DOTS = [
  { cx: 24.02, cy: 35, r: 10.8 },
  { cx: 75.98, cy: 35, r: 10.8 },
  { cx: 50, cy: 80, r: 10.8 },
] as const;

/**
 * The square the mark sits in. The ink spans x 13.22 to 86.78 and y 24.2 to 90.8, and the square is 80.8 units, so
 * the dots fill 91% of it across. It is centred OPTICALLY: two dots above one put the weight high, so the square's
 * middle (y 54) sits between the middle of the ink (57.5) and the middle of the three dots (50).
 */
export const MARK_VIEWBOX = "9.6 13.6 80.8 80.8";

export function NemesisMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" height={size} viewBox={MARK_VIEWBOX} width={size}>
      <g fill="currentColor">
        {MARK_DOTS.map((dot) => (
          <circle cx={dot.cx} cy={dot.cy} key={`${dot.cx},${dot.cy}`} r={dot.r} />
        ))}
      </g>
    </svg>
  );
}
