// The Nemesis mark, drawn.
//
// 🔴 DRAWN AND NOT AN IMAGE FILE, WHICH IS THE WHOLE POINT. The mark used to be
// `/nemesis/logo.png` — a raster of the older glossy-bead logo — served from three places in
// this app while the marketing site had already moved to the flat three-bead form. Two products
// with two different marks, and no way to notice, because a PNG cannot be wrong at compile time.
//
// 🔴 IT TAKES ITS COLOUR FROM THE TEXT AROUND IT. `currentColor`, not a fill: the same component
// sits on a white auth card and on the dark account portal, and a raster needed a second file
// (`logo-white.png`) to do that — a second copy of the mark that nothing forced to stay in sync.
//
// Geometry is identical to app/icon.svg and app/apple-icon.tsx. If a bead moves, it moves in
// all three; there is no fourth copy hiding in a binary.

const BEADS = [40, 106, 172];

export function NemesisMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      height={size}
      viewBox="-66 -10 232 232"
      width={size}
    >
      <g fill="currentColor">
        {BEADS.map((cy) => (
          <ellipse cx={50} cy={cy} key={cy} rx={62} ry={20} transform={`rotate(-36 50 ${cy})`} />
        ))}
      </g>
    </svg>
  );
}
