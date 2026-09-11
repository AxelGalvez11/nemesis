import { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import Svg from "react-native-svg";
import type { IconProps } from "./icons";

// New glyphs for the ChatGPT-parity pass (Settings sheet, Library, the document
// viewer, Plugins — owner 2026-09-01: "font spacing icons literally everything
// needs to match one-to-one"). Kept in ONE shared file rather than one per screen
// because this pass touches four screens at once and a second ad-hoc icon file per
// screen would fragment the same hand-drawn language icons.tsx already
// established. Do NOT add to icons.tsx itself — several other agents are editing
// the mobile tree concurrently and that file is outside this task's boundary.
//
// Same drawing language as icons.tsx: thin round strokes, color from the caller,
// nothing baked in but geometry. Each settings-row glyph below was hand-traced
// from a crop of IMG_6548 (~/Downloads/chatgptios) at 2x zoom — see the crop notes
// on each one.

const base = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** "Personalization" — a circle with a simple closed-eye smile. Cropped from
 *  IMG_6548 at (120,895)-(190,965) native px. */
export function SmileyIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M8.6 13.2c.7 1.2 1.9 1.9 3.4 1.9s2.7-.7 3.4-1.9" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** "Plugins" — an @ with a plug prong at its top, the reference's own hybrid glyph
 *  (a socket ring circling a plug head). Cropped IMG_6548 (120,1195)-(190,1265). */
export function PluginAtIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path
        d="M14.3 9.6a3 3 0 1 0 .5 4.4c.3-.4.4-.9.4-1.4V9.6"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Line x1="10.4" y1="7.7" x2="10.4" y2="9.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="13" y1="7.7" x2="13" y2="9.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** "Subscription" — a rounded square with a centered +. Cropped IMG_6548
 *  (120,1795)-(190,1865). */
export function PlusSquareIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="12" y1="8.4" x2="12" y2="15.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.4" y1="12" x2="15.6" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** "Restore purchases" — an open circular arrow. Cropped IMG_6548 strip 2. */
export function RefreshIcon({ size = 23, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18.4 8.4A8 8 0 1 0 20 13" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M18.4 3.6v5h-5" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** "Upgrade plan" — a single four-point sparkle, blue in the reference (the
 *  caller supplies the color; Settings passes c.blue). Distinct from icons.tsx's
 *  SparkleIcon, which draws a big+small PAIR for the composer's AI cue — this row
 *  wants exactly one mark, matching the crop. */
export function SparkleSingleIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.2c.5 4.6 2.2 6.3 6.8 6.8-4.6.5-6.3 2.2-6.8 6.8-.5-4.6-2.2-6.3-6.8-6.8 4.6-.5 6.3-2.2 6.8-6.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
    </Svg>
  );
}

/** "Usage and limits" — a rounded-square frame around a small zigzag trend line.
 *  Cropped IMG_6548 strip 2. */
export function UsageChartIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6.6 14.4 9.8 10l2.6 3.4 4.9-6.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** "Appearance" — a small sun: a circle ring with eight short dash rays, drawn
 *  with a dotted stroke to match the reference's dotted-ray treatment. Cropped
 *  IMG_6548 strip 2. */
export function SunIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const inner = 7.6;
    const outer = 10.2;
    const x1 = 12 + inner * Math.cos(a);
    const y1 = 12 + inner * Math.sin(a);
    const x2 = 12 + outer * Math.cos(a);
    const y2 = 12 + outer * Math.sin(a);
    return { x1, x2, y1, y2 };
  });
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="4.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      {rays.map((r, i) => (
        <Line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** The avatar's edit badge (settings.tsx) — a small pencil, no-op for now. Same
 *  glyph note.tsx draws locally for its own edit toggle (this file's the shared
 *  home for icons added in this pass, so it isn't re-duplicated a third time). */
export function PencilIcon({ size = 14, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m14.3 4.6 5.1 5.1-9.9 9.9-5.9 1 1-5.9Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="12.6" y1="6.3" x2="17.7" y2="11.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Horizontal "…" — the same three-dot glyph nearly every screen in this app
 *  re-declares locally (note.tsx, library.tsx, study.tsx, canvas.tsx, chat.tsx,
 *  notebooks.tsx, notebook.tsx) rather than sharing one from icons.tsx. This pass
 *  follows that precedent instead of breaking it. */
export function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.7" fill={color} />
      <Circle cx="12" cy="12" r="1.7" fill={color} />
      <Circle cx="18.4" cy="12" r="1.7" fill={color} />
    </Svg>
  );
}

// ── Library row type glyphs (IMG_6539: a 48pt tile per row, one glyph inside) ──

/** A plain page outline — the base every file-type tile in this section shares.
 *  Ported from the old library.tsx's PageOutline (same shape), which this file
 *  now supersedes as the shared home for these glyphs. */
function PageOutline({ color, strokeWidth }: { color: string; strokeWidth: number }) {
  return (
    <Path
      d="M6.5 3.4h6.2L18 8.6V19a1.4 1.4 0 0 1-1.4 1.4H6.5A1.4 1.4 0 0 1 5.1 19V4.8A1.4 1.4 0 0 1 6.5 3.4Z"
      stroke={color}
      strokeWidth={strokeWidth}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** A markdown note — page + two plain lines (lighter than the Doc glyph's three,
 *  since a Nemesis note is prose, not a dense paragraph). */
export function NoteFileIcon({ size = 22, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <PageOutline color={color} strokeWidth={strokeWidth} />
      <Line x1="8.1" y1="11.4" x2="14.9" y2="11.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="8.1" y1="14.6" x2="13.2" y2="14.6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** A PDF attachment — page + red "PDF" wordmark, same shape language as
 *  icons.tsx's PdfIcon but sized for a 48pt library tile. */
export function PdfFileIcon({ size = 22, color, strokeWidth = 1.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <PageOutline color={color} strokeWidth={strokeWidth} />
      <SvgText x="11.5" y="16.6" fontSize="6" fontWeight="700" fill={color} textAnchor="middle">
        PDF
      </SvgText>
    </Svg>
  );
}

/** A Word document — page + blue "DOC" wordmark. */
export function DocFileIcon({ size = 22, color, strokeWidth = 1.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <PageOutline color={color} strokeWidth={strokeWidth} />
      <SvgText x="11.5" y="16.6" fontSize="5.4" fontWeight="700" fill={color} textAnchor="middle">
        DOC
      </SvgText>
    </Svg>
  );
}

/** A flashcard deck — two stacked rounded cards. */
export function DeckFileIcon({ size = 22, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="5.6" y="6.2" width="13.4" height="10.2" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Rect x="3.4" y="8.8" width="13.4" height="10.2" rx="1.8" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}
