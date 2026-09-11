import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";

// The phone's line-icon set — hand-drawn to match the desktop app's icon language
// (thin strokes, round caps, monochrome; color comes from the caller, usually a
// theme text tone). One component per glyph so the tab bar and drawer can render
// real icons instead of the old text symbols (◆ ▤ ▦ ▣).

export interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

const base = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function MicIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="9" y="3" width="6" height="11" rx="3" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M5.8 11a6.2 6.2 0 0 0 12.4 0" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="12" y1="17.4" x2="12" y2="21" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function HomeIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3.8 10.9 12 4l8.2 6.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6 9.8V19a1.4 1.4 0 0 0 1.4 1.4h9.2A1.4 1.4 0 0 0 18 19V9.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M9.8 20.2v-4.6a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v4.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function LibraryIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6.7 3.6H19a.6.6 0 0 1 .6.6v15.6a.6.6 0 0 1-.6.6H6.7A2.35 2.35 0 0 1 4.4 18V5.9a2.35 2.35 0 0 1 2.3-2.3Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Path d="M4.4 18a2.35 2.35 0 0 1 2.3-2.3h12.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.6" y1="7.4" x2="15.4" y2="7.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function StudyIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6.8" y="3.8" width="13.4" height="10.4" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M17.2 17.2v.9a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8V9.6a1.8 1.8 0 0 1 1.8-1.8h.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="10.2" y1="8" x2="17" y2="8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="10.2" y1="10.8" x2="14.6" y2="10.8" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function GraphIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="7.5" x2="6.4" y2="15.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="12" y1="7.5" x2="17.6" y2="15.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="7.6" y1="17.6" x2="16.4" y2="17.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="12" cy="5.2" r="2.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="5.2" cy="17.6" r="2.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="18.8" cy="17.6" r="2.5" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function CalendarIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4" y="5.4" width="16" height="15" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="4" y1="9.9" x2="20" y2="9.9" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="3.4" x2="8.2" y2="6.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="15.8" y1="3.4" x2="15.8" y2="6.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="8.6" cy="13.6" r="1.15" fill={color} stroke="none" />
    </Svg>
  );
}

export function SessionsIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8.2 7.6h10a1.7 1.7 0 0 1 1.7 1.7v6.6a1.7 1.7 0 0 1-1.7 1.7h-4.9l-3 2.8a.5.5 0 0 1-.84-.37V17.6h-1.26a1.7 1.7 0 0 1-1.7-1.7V9.3a1.7 1.7 0 0 1 1.7-1.7Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Path d="M4.1 13.4V5.9a1.7 1.7 0 0 1 1.7-1.7h9.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function ChatIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5.8 4.4h12.4a1.8 1.8 0 0 1 1.8 1.8v8a1.8 1.8 0 0 1-1.8 1.8h-7.9l-3.6 3.4a.5.5 0 0 1-.85-.36V16a1.8 1.8 0 0 1-1.85-1.8v-8a1.8 1.8 0 0 1 1.8-1.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Line x1="8.4" y1="8.6" x2="15.6" y2="8.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.4" y1="11.6" x2="13.2" y2="11.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function PlusIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="5.5" x2="12" y2="18.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="5.5" y1="12" x2="18.5" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Closed folder outline — marks folder rows in Library/Study trees. */
/** Spiral notebook — the Notebooks page (drawer nav). */
export function NotebookIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="5.4" y="3.8" width="13.2" height="16.4" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="9.4" y1="3.8" x2="9.4" y2="20.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="3.6" y1="7.6" x2="5.4" y2="7.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="3.6" y1="12" x2="5.4" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="3.6" y1="16.4" x2="5.4" y2="16.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Power plug — the Plugins page (drawer nav). */
export function PluginIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="9" y1="3.4" x2="9" y2="7.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="15" y1="3.4" x2="15" y2="7.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path
        d="M6.6 7.4h10.8v3.2a5.4 5.4 0 0 1-10.8 0Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Line x1="12" y1="16" x2="12" y2="20.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function FolderIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3.8 7.2a1.8 1.8 0 0 1 1.8-1.8h3.6a1.8 1.8 0 0 1 1.35.6l1.1 1.25a1.8 1.8 0 0 0 1.35.6h5.4a1.8 1.8 0 0 1 1.8 1.8v7.15a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
    </Svg>
  );
}

export function FolderOpenIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3.8 9.1V7.2a1.8 1.8 0 0 1 1.8-1.8h3.6a1.8 1.8 0 0 1 1.35.6l1.1 1.25a1.8 1.8 0 0 0 1.35.6h5.4a1.8 1.8 0 0 1 1.8 1.8v.55"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Path
        d="M4.45 9.7h15.1a1.25 1.25 0 0 1 1.17 1.7l-2.18 5.75a2.2 2.2 0 0 1-2.06 1.42H5.8a2 2 0 0 1-1.94-1.53l-1.1-4.55A2.25 2.25 0 0 1 4.95 9.7Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
    </Svg>
  );
}

/** Right-pointing chevron; rotate 90° for the expanded (pointing-down) state. */
export function ChevronIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m9 5.8 6.2 6.2L9 18.2" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Map-pin outline — marks a pinned canvas/project (Projects page row, owner
 *  spec item 8: "a pin glyph when pinned"). */
export function PinIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 20.6c3.6-4.1 6.2-7.6 6.2-11a6.2 6.2 0 1 0-12.4 0c0 3.4 2.6 6.9 6.2 11Z"
        stroke={color}
        strokeWidth={strokeWidth}
        {...base}
      />
      <Circle cx="12" cy="9.6" r="2.1" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function MailIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M4.2 7 12 12.4 19.8 7" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function SparkleIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M18.5 14c.2 1.6.6 2 2.2 2.2-1.6.2-2 .6-2.2 2.2-.2-1.6-.6-2-2.2-2.2 1.6-.2 2-.6 2.2-2.2Z" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function ThemeIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M12 4a8 8 0 0 0 0 16Z" fill={color} stroke="none" />
    </Svg>
  );
}

export function FileIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.5 3.4h7L18.6 8.5V19a1.6 1.6 0 0 1-1.6 1.6H6.5A1.6 1.6 0 0 1 4.9 19V5A1.6 1.6 0 0 1 6.5 3.4Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M13.2 3.6v4.6a.6.6 0 0 0 .6.6h4.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="13" x2="14.8" y2="13" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="16" x2="13" y2="16" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function LifeRingIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="12" cy="12" r="3.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6.2 6.2 9.6 9.6M14.4 14.4l3.4 3.4M17.8 6.2 14.4 9.6M9.6 14.4l-3.4 3.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function TrashIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.6 6.4h14.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M9.2 6.4V5a1.4 1.4 0 0 1 1.4-1.4h2.8A1.4 1.4 0 0 1 14.8 5v1.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6.4 6.4 7.2 19a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5l.8-12.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function LogoutIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 4.4H6.6A1.6 1.6 0 0 0 5 6v12a1.6 1.6 0 0 0 1.6 1.6H14" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M17.5 8.5 21 12l-3.5 3.5M20.4 12H10" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function ArrowUpIcon({ size = 23, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="19" x2="12" y2="6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6.5 11.5 12 6l5.5 5.5" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Jump to the newest message. The mirror of ArrowUpIcon (the send button), so
 *  the two read as a pair — up sends, down returns you to the bottom. */
export function ArrowDownIcon({ size = 23, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="5" x2="12" y2="18" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M6.5 12.5 12 18l5.5-5.5" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function CloseIcon({ size = 23, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

export function SearchIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="10.5" cy="10.5" r="6.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="15.4" y1="15.4" x2="20" y2="20" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/**
 * The settings gear, generated rather than pasted.
 *
 * The previous glyph was a 12-lobe outline whose valleys were about as wide as the
 * stroke drawn into them, so at the sizes this app actually uses it (18-23px) the
 * strokes either side of each notch merged and the icon rendered as a lumpy blob
 * instead of a gear. Computing the path fixes the ratio at the source: the notch is
 * NOTCH_DEPTH deep against a 1.6 stroke, so it stays open at any size, and every
 * tooth is identical by construction rather than by hand-drawn arcs.
 *
 * Built once at module load, like Orb.tsx's lattice.
 */
const GEAR_TEETH = 6;
const GEAR_TIP_R = 9.6; // tooth tip
const GEAR_ROOT_R = 6.6; // valley floor — 3.0 below the tip, well clear of the stroke
const GEAR_HUB_R = 2.9;
const GEAR_TIP_HALF = 11; // degrees of tip arc either side of a tooth's centre
const GEAR_FLANK = 6; // degrees the tooth flank slants over

function gearPoint(angleDeg: number, radius: number): string {
  const a = ((angleDeg - 90) * Math.PI) / 180; // -90 so tooth 0 points up
  return `${(12 + radius * Math.cos(a)).toFixed(2)} ${(12 + radius * Math.sin(a)).toFixed(2)}`;
}

const GEAR_PATH = (() => {
  const pitch = 360 / GEAR_TEETH;
  let d = `M ${gearPoint(-GEAR_TIP_HALF, GEAR_TIP_R)}`;
  for (let i = 0; i < GEAR_TEETH; i++) {
    const centre = i * pitch;
    // Across the tip, down the trailing flank, along the valley, up the next flank.
    d += ` A ${GEAR_TIP_R} ${GEAR_TIP_R} 0 0 1 ${gearPoint(centre + GEAR_TIP_HALF, GEAR_TIP_R)}`;
    d += ` L ${gearPoint(centre + GEAR_TIP_HALF + GEAR_FLANK, GEAR_ROOT_R)}`;
    d += ` A ${GEAR_ROOT_R} ${GEAR_ROOT_R} 0 0 1 ${gearPoint(centre + pitch - GEAR_TIP_HALF - GEAR_FLANK, GEAR_ROOT_R)}`;
    d += ` L ${gearPoint(centre + pitch - GEAR_TIP_HALF, GEAR_TIP_R)}`;
  }
  return `${d} Z`;
})();

export function SettingsIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={GEAR_PATH} stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="12" cy="12" r={GEAR_HUB_R} stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

// ── The composer's "+" capability icons (ComposerPlusMenu.tsx) ────────────────────────────
//
// One glyph per entry in COMPOSER_CAPABILITIES (src/learn/web.ts, re-exporting the web's
// composer-capability.ts) — Course, Deep research, Web search, Document, PDF, Spreadsheet,
// Presentation. Same hand-drawn stroke language as the rest of this file; the web's own icons
// are Codicon names ("map", "telescope", "globe", "file", "file-pdf", "table",
// "device-camera-video") and these are this app's line-icon equivalents, not ports of the glyphs
// themselves — Codicon's set isn't available here.

/** Folded map, for Course — a persistent learning PATH through a subject. */
export function MapIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3.6 6.4 9 4.2l6 2.2 5.4-2.2v13.4L15 19.8l-6-2.2-5.4 2.2Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="9" y1="4.2" x2="9" y2="17.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="15" y1="6.4" x2="15" y2="19.8" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** A telescope, for Deep research — going away and coming back with a report. */
export function TelescopeIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.4" y="10.4" width="13" height="4.2" rx="1.4" transform="rotate(-24 9.9 12.5)" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="16.4" cy="8.2" r="1.3" fill={color} stroke="none" />
      <Path d="M6.6 15.6 4.4 20.2M10.2 17 8.6 21.2" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** A globe, for Web search — live pages, answered now. */
export function GlobeIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="3.8" y1="12" x2="20.2" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M12 3.8c2.8 2.2 2.8 14.2 0 16.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M12 3.8c-2.8 2.2-2.8 14.2 0 16.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** A plain page of text, for the Document capability — kept distinct from FileIcon above,
 *  which marks the unrelated system file picker ("Add a file"). */
export function DocumentIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="5.2" y="3.4" width="13.6" height="17.2" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="8.4" x2="15.8" y2="8.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="12" x2="15.8" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.2" y1="15.6" x2="12.6" y2="15.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** FileIcon's folded-corner page, labelled — the PDF capability specifically. */
export function PdfIcon({ size = 23, color, strokeWidth = 1.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.5 3.4h7L18.6 8.5V19a1.6 1.6 0 0 1-1.6 1.6H6.5A1.6 1.6 0 0 1 4.9 19V5A1.6 1.6 0 0 1 6.5 3.4Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M13.2 3.6v4.6a.6.6 0 0 0 .6.6h4.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <SvgText x="11.7" y="16.9" fontSize="6.2" fontWeight="700" fill={color} textAnchor="middle">
        PDF
      </SvgText>
    </Svg>
  );
}

/** A ruled grid, for the Spreadsheet capability. */
export function TableIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.8" y="4.4" width="16.4" height="15.2" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="3.8" y1="9.6" x2="20.2" y2="9.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="3.8" y1="14.8" x2="20.2" y2="14.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="10" y1="4.4" x2="10" y2="19.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="15.4" y1="4.4" x2="15.4" y2="19.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** A presentation frame with a play mark, for the Presentation (slide deck) capability. */
export function SlidesIcon({ size = 23, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.4" y="4.6" width="17.2" height="11.4" rx="1.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M10.2 8.4 14.6 10.3 10.2 12.2Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" fill="none" />
      <Line x1="9" y1="19.6" x2="15" y2="19.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="12" y1="16" x2="12" y2="19.6" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}
