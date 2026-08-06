// The sidebar's Chill glyph — a cup, matching the web nav's "coffee" codicon.
//
// Kept beside the games rather than added to components/icons.tsx: the same
// call plugins.tsx made, to stay inside this task's own files while other
// agents are editing the mobile tree. Same drawing language as icons.tsx —
// thin strokes, round caps, colour from the caller.

import Svg, { Line, Path } from "react-native-svg";

import type { IconProps } from "@/components/icons";

export function ChillIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  const base = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Cup */}
      <Path d="M4.6 9.4h11.2v5a4.6 4.6 0 0 1-4.6 4.6H9.2a4.6 4.6 0 0 1-4.6-4.6z" stroke={color} strokeWidth={strokeWidth} {...base} />
      {/* Handle */}
      <Path d="M15.8 11h1.6a2.4 2.4 0 0 1 0 4.8h-1.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      {/* Steam */}
      <Line x1="8" y1="4.4" x2="8" y2="6.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="12" y1="3.6" x2="12" y2="6.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}
