import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { IconProps } from "./icons";

// Icons drawn fresh for the iOS parity pass (docs: nemesis-ios-catchup), copied by eye from
// the owner's ChatGPT reference screenshots (~/Downloads/chatgptios) rather than borrowed from
// icons.tsx — that file is being edited concurrently by another agent, so every new glyph this
// pass needs lives here instead. Same hand-drawn stroke language as icons.tsx (thin strokes,
// round caps/joins, monochrome; colour comes from the caller): `base` below is copied from
// there rather than imported, for the same "don't touch icons.tsx" reason.

const base = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Sidebar nav "Library" — three book spines on a shelf, the third leaning. Redrawn from
 *  IMG_6531 (crop `icon_library.png`): three rounded-rect spines, the first two upright and
 *  touching, the third tilted a few degrees like a book leaning on its neighbours. */
export function LibraryShelfIcon({ size = 22, color, strokeWidth = 2 }: IconProps) {
  // Coordinator feedback (on-simulator diff against IMG_6531): the old spines sat only
  // 0.7 units apart at a 1.7 default stroke, so at the nav row's 22pt render size the
  // gaps disappeared and it read as three plain strokes, not a book. Gaps widened to 1.4
  // units, default stroke bumped to 2, and the third spine's tilt now uses
  // `rotate(angle cx cy)` — a single, unambiguous SVG transform — instead of a
  // hand-composed translate+rotate pair.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.6" y="4" width="4.6" height="15.6" rx="2.3" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Rect x="9.6" y="4" width="4.6" height="15.6" rx="2.3" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Rect
        x="15.6"
        y="4"
        width="4.6"
        height="15.6"
        rx="2.3"
        transform="rotate(10 17.9 11.8)"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
    </Svg>
  );
}

/** Sidebar nav "Projects" / a project's own glyph — an open folder with a tabbed flap,
 *  redrawn from IMG_6531 + IMG_6538 (the same glyph both places): a small bump on the flap's
 *  ridge before it drops to the folder's right edge, and a horizontal seam where the flap
 *  meets the body. Also used for a pinned project row (drawer), a project tile (Projects
 *  page), and "Add to project" rows (MiniMenu) — one glyph, one shape, everywhere a project
 *  is named. */
export function ProjectFolderIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.2 7.6a2 2 0 0 1 2-2h3.1c.7 0 1.2.2 1.7.7l.9.85c.4.4.9.6 1.5.6h4.4a2 2 0 0 1 2 2v8.15a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Path d="M4.2 11.4h15.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Sidebar nav "Plugins" — a circle around a stylised plug (the reference's glyph reads as an
 *  "@" from a glance but is actually a two-prong plug with a looping cord-tail). Redrawn from
 *  IMG_6531 (crop `icon_plugins.png`): outer circle, a rotated-square plug body in the middle,
 *  two short prongs off its top corners, and a curved tail sweeping from the body's right
 *  side down and around toward the circle's lower-left, open rather than closed (matching the
 *  reference's "@"-style tail gap). */
export function PluginsGlyphIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  // Coordinator asked for the same on-simulator check as the Library icon got. The
  // outer ring was a fully CLOSED Circle plus an unrelated decorative squiggle placed
  // near the plug — neither corresponds to the reference, whose outer loop is an
  // "@"-style OPEN arc (a ~300° sweep, gap at lower-left). Replaced both with a single
  // arc Path (hand-computed: start/end points at 190°/130° around the circle, so the
  // drawn sweep is the major 300° arc, large-arc-flag 1, sweep-flag 1 for clockwise).
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3.83 10.56 A 8.3 8.3 0 1 1 6.66 18.36" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Rect x="9.8" y="9.8" width="4.6" height="4.6" rx="0.6" transform="rotate(45 12.1 12.1)" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M10.3 8.9 9 7.6M13.9 8.9l1.3-1.3" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Sidebar nav "Calendar" — a plain grid calendar in the same stroke language as the three
 *  glyphs above (the reference shows "Scheduled", a clock; Nemesis's Calendar page is an
 *  actual calendar grid, so this keeps the family's proportions rather than copying the
 *  clock). */
export function CalendarGlyphIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.8" y="5" width="16.4" height="15.4" rx="2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M3.8 9.6h16.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M8 3.4v3.4M16 3.4v3.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="8.3" cy="13.6" r="1.05" fill={color} stroke="none" />
      <Circle cx="12" cy="13.6" r="1.05" fill={color} stroke="none" />
      <Circle cx="8.3" cy="16.8" r="1.05" fill={color} stroke="none" />
    </Svg>
  );
}

/** A plain pencil — "Rename" (drawer row menu) and "Edit project" (project "…" menu). */
export function PencilIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M15.7 4.9 19.1 8.3 8.4 19H5v-3.4Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Path d="M13.8 6.8 17.2 10.2" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Upload-style share arrow — "Share" (drawer row menu), matching IMG_6536's glyph. */
export function ShareIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 15V4.2M8.2 8 12 4.2 15.8 8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M5 12.5v5.3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.3" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** A folder with a "+" corner — "New project…" (Add-to-project submenu). */
export function FolderPlusIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.2 7.6a2 2 0 0 1 2-2h3.1c.7 0 1.2.2 1.7.7l.9.85c.4.4.9.6 1.5.6h1.7a2 2 0 0 1 2 2v8.15a2 2 0 0 1-2 2H6.2a2 2 0 0 1-2-2Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Path d="M4.2 11.4h6.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M18.6 11.4v6M15.6 14.4h6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Sliders / equalizer — "Edit instructions" (project "…" menu), matching IMG_6544's glyph. */
export function SlidersIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 7.2h9.4M16.6 7.2H20M4 16.8h3.4M10.6 16.8H20" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="15" cy="7.2" r="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="9" cy="16.8" r="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** A camera body — "Take photo" (Add-sources sheet). */
export function CameraIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 8.6a1.7 1.7 0 0 1 1.7-1.7h1.6l1-1.6h7.4l1 1.6h1.6A1.7 1.7 0 0 1 20 8.6v9a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 17.6Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Circle cx="12" cy="13" r="3.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Stacked photos — "Add photos" (Add-sources sheet). */
export function ImagesIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.6" y="6.6" width="13.6" height="13" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M7.2 6.6V6a2 2 0 0 1 2-2h8.2a2 2 0 0 1 2 2v9.2a2 2 0 0 1-2 2h-.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="7.6" cy="10.6" r="1.3" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="m5 17.4 3.4-3.6 2.6 2.6 2.4-2.8 3.8 3.8" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** A paperclip — "Add files" (Add-sources sheet). */
export function PaperclipIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M16.5 8.2 9.9 14.8a2.6 2.6 0 0 0 3.7 3.7l6.6-6.6a4.4 4.4 0 0 0-6.2-6.2L7.4 12.3a6.2 6.2 0 0 0 8.8 8.8"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
    </Svg>
  );
}

/** Pencil-in-square "compose" glyph — the drawer's floating "Chat" pill's icon (the
 *  ChatGPT-style mark the owner's crop shows). Moved here from AppDrawer.tsx, which was
 *  over this pass's 900-line cap; a one-off glyph belongs with the rest of them. */
export function ComposeIcon({ size = 23, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11.3 5.4H7.1A2.6 2.6 0 0 0 4.5 8v8.9a2.6 2.6 0 0 0 2.6 2.6H16a2.6 2.6 0 0 0 2.6-2.6v-4.2M18.9 3.8l1.3 1.3a1.7 1.7 0 0 1 0 2.4l-7.5 7.5-3.9 1 1-3.9 7.5-7.5a1.7 1.7 0 0 1 2.4 0Z"
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Horizontal "…" — project.tsx's header overflow button. canvas.tsx and chat.tsx each
 *  keep a local copy of the same three-dot glyph for the same one-off reason; this is the
 *  new screen's copy. */
export function MoreDotsIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.6" cy="12" r="1.7" fill={color} />
      <Circle cx="12" cy="12" r="1.7" fill={color} />
      <Circle cx="18.4" cy="12" r="1.7" fill={color} />
    </Svg>
  );
}

/** Corner brackets around a text line — "Add text" (Add-sources sheet), the reference's
 *  "scan text" glyph. */
export function ScanTextIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M7.6 10.2h8.8M7.6 13.8h5.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}
