// The two glyphs the Canvas composer needs that `components/icons.tsx` does not already carry.
//
// They live here rather than in `icons.tsx` because that file is the app-wide set and both of
// these are drawn to the ChatGPT reference's proportions (a 24pt glyph inside a 36pt control),
// which is a decision about THIS composer and not about the app. If a second surface ever wants
// them, that is the moment to move them — not before.
//
// Stroke, never fill, and `strokeWidth` scales with `size`, so a glyph asked for at 24 has the
// same visual weight as `icons.tsx`'s do at 23.

import Svg, { Circle, Path } from "react-native-svg";

interface GlyphProps {
  size?: number;
  color: string;
}

/**
 * The dial — two sliders with knobs on them, the reference's "how hard should this think" control.
 *
 * 🔴 IT IS DRAWN AS A DIAL BECAUSE IT IS ONE. On this surface it cycles `lib/chat-effort.ts`'s
 * Instant / Medium / High, which `sendChat` genuinely acts on. A glyph that looked like a dial and
 * changed nothing would be the dead-lane shape `learn.tsx`'s header was written to keep off this
 * screen.
 */
export function DialGlyph({ size = 24, color }: GlyphProps) {
  const w = size / 14;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8h5M15 8h5" stroke={color} strokeWidth={w} strokeLinecap="round" />
      <Circle cx={12} cy={8} r={2.4} stroke={color} strokeWidth={w} />
      <Path d="M4 16h9M19 16h1" stroke={color} strokeWidth={w} strokeLinecap="round" />
      <Circle cx={16} cy={16} r={2.4} stroke={color} strokeWidth={w} />
    </Svg>
  );
}

/** A page with a folded corner — the chip that stands for an attached document. 9pt inside a 14pt
 *  disc on the source pills, larger on the composer chip; the same drawing either way. */
export function DocumentGlyph({ size = 12, color }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path d="M3 1.5h4l2 2v7H3z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M7 1.5v2h2" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}
