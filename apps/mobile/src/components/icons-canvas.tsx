import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import type { CanvasFileKind } from "@/lib/canvas-file-kind";
import type { IconProps } from "./icons";

// Icons for the canvas screen's ChatGPT-parity pass that icons.tsx doesn't already carry —
// kept in their own file per the slice's instructions so icons.tsx (the app-wide line-icon
// set) doesn't grow glyphs only one screen uses. Same hand-drawn, thin-stroke language as
// icons.tsx; every shape below is read off the reference screenshots named in its comment.

const base = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** The header pill's left glyph — new chat (IMG_6532/6551): a square with a pencil overlapping
 *  its bottom-right corner. */
export function ComposeIcon({ size = 23, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M20.4 3.6a1.8 1.8 0 0 1 0 2.55L12.7 13.8l-3 .7.7-3 7.7-7.7a1.8 1.8 0 0 1 2.3-.2z"
        {...base}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

/** The action row's copy glyph — two overlapping rounded rectangles (IMG_6533). */
export function CopyIcon({ size = 18, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="8" y="8" width="12" height="12" rx="2.5" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A2.5 2.5 0 0 0 6.5 16H8" {...base} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** The action row's rate glyph (IMG_6533): a thumbs-up with a smaller thumbs-down tucked at
 *  its base — one static icon in the reference, not two buttons. `state` recolors it toward
 *  the vote already cast; the tap target still toggles a single value (see CanvasTurn's
 *  `rating` state) rather than being two independent controls. */
export function ThumbsIcon({ size = 18, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8 10v9h8.5a2 2 0 0 0 2-1.7l1-6a2 2 0 0 0-2-2.3H14l.6-3.3A1.6 1.6 0 0 0 13 3.8L8 10z"
        {...base}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path d="M8 10H5.5A1.5 1.5 0 0 0 4 11.5v6A1.5 1.5 0 0 0 5.5 19H8" {...base} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** The action row / "…" menu's share glyph — a box with an arrow lifting out of it (IMG_6533,
 *  IMG_6536). */
export function ShareBoxIcon({ size = 18, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v11" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M8 7l4-4 4 4" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" {...base} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** The long-press menu's Read Aloud glyph — a speaker with two sound-wave arcs (IMG_6561). */
export function SpeakerIcon({ size = 20, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 10v4h3.5L12 17.5v-11L7.5 10H4z" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M16 9.5a4 4 0 0 1 0 5" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M18.5 7a7.5 7.5 0 0 1 0 10" {...base} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** The long-press menu's retry glyph — a circular refresh arrow (IMG_6561). */
export function RetryIcon({ size = 20, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 12a8 8 0 0 1 13.66-5.66L20 8" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M20 4v4.5h-4.5" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M20 12a8 8 0 0 1-13.66 5.66L4 16" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M4 20v-4.5h4.5" {...base} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** The "Add to project" submenu's leading row — a folder with a plus (IMG_6537's "New
 *  project" row). */
export function FolderPlusIcon({ size = 20, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6a1.5 1.5 0 0 1 1.5-1.5H9l2 2.2h8.5A1.5 1.5 0 0 1 21 8.2v9.3A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5V6z" {...base} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 11.5v5M9.5 14h5" {...base} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** Attachments — this canvas's uploaded material (IMG_6536's paperclip row). */
export function PaperclipIcon({ size = 20, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M17.5 8.5 10 16a3 3 0 1 1-4.2-4.2l8-8a2 2 0 1 1 2.8 2.8l-7.6 7.6a1 1 0 1 1-1.4-1.4l6.9-6.9"
        {...base}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

/** Deliverable / attachment row chevron — "›" (IMG_6559). */
export function RowChevronIcon({ size = 16, color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 5l7 7-7 7" {...base} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

const FILE_TILE_COLOR: Record<CanvasFileKind, { bg: string; fg: string }> = {
  word: { bg: "#2B579A", fg: "#ffffff" },
  pdf: { bg: "#D93831", fg: "#ffffff" },
  slides: { bg: "#D24726", fg: "#ffffff" },
  sheet: { bg: "#1D6F42", fg: "#ffffff" },
  image: { bg: "#EDEDED", fg: "#6b6b6f" },
  generic: { bg: "#EDEDED", fg: "#6b6b6f" },
};

/**
 * The attachment card's file-type badge (IMG_6542's blue Word tile, IMG_6559's orange
 * PowerPoint tile). One component for both cards item 3 and item 9 draw, sized by the caller —
 * 36pt above the learner's bubble, 20pt on a finished answer's deliverable row (measured
 * separately; the reference uses two different sizes for the two contexts).
 */
export function FileTypeIcon({ kind, size = 36 }: { kind: CanvasFileKind; size?: number }) {
  const { bg, fg } = FILE_TILE_COLOR[kind];
  if (kind === "image") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x="2.5" y="2.5" width="19" height="19" rx="5" fill={bg} />
        <Circle cx="8.5" cy="9" r="1.6" fill={fg} />
        <Path d="M4.5 17l5-5.5 3.5 3.8L16 12l4 5" stroke={fg} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  const letter = kind === "word" ? "W" : kind === "pdf" ? "P" : kind === "slides" ? "P" : kind === "sheet" ? "X" : "F";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="2.5" y="2.5" width="19" height="19" rx="5" fill={bg} />
      <SvgText x="12" y="16.5" fontSize="11" fontWeight="700" fill={fg} textAnchor="middle">
        {letter}
      </SvgText>
    </Svg>
  );
}
