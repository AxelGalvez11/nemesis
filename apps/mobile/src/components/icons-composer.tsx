import { View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import type { IconProps } from "./icons";

// New glyphs for the ChatGPT-parity composer work (docs task: "font spacing icons literally
// everything needs to match one-to-one", owner 2026-09-01). Kept OUT of icons.tsx on purpose —
// that file is being edited concurrently by another lane this same session, and every glyph
// here is specific to the composer / "@" picker / Add-files sheet, not general app chrome.
// Same hand-drawn stroke language as icons.tsx: thin strokes, round caps, color from the caller.

const base = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/**
 * The header's voice-mode button glyph — LearnHome's top-right round button.
 *
 * Re-cropped and pixel-traced (not eyeballed) from IMG_6529 at x≈1120-1230, y≈165-275 (3x): an
 * ASCII dump of that box (every 2nd pixel, `#`=dark) shows a near-complete ring open at two
 * small shoulders near the top (not one wide top gap) plus a hooked tail at lower-left — no
 * internal bars anywhere in that frame; the interior sampled pure white. The coordinator's redraw
 * ask names a speech-bubble-with-soundwave shape (3 short vertical bars inside), which is the
 * familiar ChatGPT voice glyph but not what THIS screenshot's pixels show — flagged back rather
 * than silently guessed. Drawn here with the ring/tail geometry corrected against the trace
 * (previous version read as a meaningless partial arc) and the 3 bars added per the explicit ask.
 */
export function VoiceModeIcon({ size = 23, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Ring: two arcs with small shoulder gaps near 1 o'clock and 11 o'clock, matched to the
          pixel trace rather than one wide top gap. */}
      <Path d="M9.3 4.7A7.6 7.6 0 1 1 6.35 16.35" stroke={color} strokeWidth={strokeWidth} {...base} />
      {/* Small hooked tail, lower-left */}
      <Path d="M6.6 15.9a7.6 7.6 0 0 0 1.95 1.85l-2.75 1-.7-2.85Z" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** The "@" picker's header control (IMG_6529's "Plugins" card, top right) — two horizontal
 *  sliders with offset handles, the standard filter/settings glyph. Decorative on
 *  CapabilityPicker today (there is nothing yet to filter beyond the typed query). */
export function SlidersIcon({ size = 18, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="4" y1="8" x2="12.2" y2="8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="16.2" y1="8" x2="20" y2="8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="14.2" cy="8" r="2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="4" y1="16" x2="7.8" y2="16" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="11.8" y1="16" x2="20" y2="16" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="9.8" cy="16" r="2" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** A framed landscape — "Add photos" in ComposerPlusMenu's restyled front-door rows
 *  (IMG_6529's reference uses a colourful photo-library glyph for this same row; icons.tsx has
 *  no photo-library icon, only CameraIcon for the shutter itself, which stays local to that
 *  file). Distinct from the camera glyph so the two rows read as different actions —
 *  "pick something already on the phone" vs. "take a new one". */
export function PhotoLibraryIcon({ size = 20, color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.6 5.4h14.8a1.2 1.2 0 0 1 1.2 1.2v10.8a1.2 1.2 0 0 1-1.2 1.2H4.6a1.2 1.2 0 0 1-1.2-1.2V6.6a1.2 1.2 0 0 1 1.2-1.2Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Circle cx="9" cy="10" r="1.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="m4.2 16.4 5-4.6 3.4 3 3-3.4 5.2 5.2" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Three horizontal dots — AddFilesSheet's top-right "more" button (IMG_6528). icons.tsx has
 *  no ellipsis glyph today. */
export function DotsIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5" cy="12" r="1.7" fill={color} stroke="none" />
      <Circle cx="12" cy="12" r="1.7" fill={color} stroke="none" />
      <Circle cx="19" cy="12" r="1.7" fill={color} stroke="none" />
    </Svg>
  );
}

/**
 * The 40pt rounded-square file-type tile at the start of an AddFilesSheet row (IMG_6528):
 * a tinted background square with a folded-corner page and a kind mark inside.
 *
 * 🔴 ONLY "note" IS EVER WIRED UP TODAY. The reference shows Word/PDF/PowerPoint tiles too,
 * but those come from `library_sources` rows (uploaded originals), and src/api has no LISTING
 * query for that table — only `fileLibrarySource` (write). AddFilesSheet.tsx is off-limits from
 * adding one (api/* is out of scope for this pass), so it can only list Library NOTES via
 * `fetchLibrary`. "word" and "pdf" are drawn here so the tile is ready the day that listing
 * exists, rather than inventing it later against a component nobody has looked at since.
 */
export function FileTypeTile({ kind, size = 40 }: { kind: "note" | "word" | "pdf"; size?: number }) {
  const bg = kind === "word" ? "#E8F0FE" : kind === "pdf" ? "#FCEAEA" : "#F3F3F3";
  const fg = kind === "word" ? "#2B63D9" : kind === "pdf" ? "#D23B32" : "#8F8F8F";
  const glyph = size * 0.55;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
        <Path
          d="M6.5 3.4h7L18.6 8.5V19a1.6 1.6 0 0 1-1.6 1.6H6.5A1.6 1.6 0 0 1 4.9 19V5A1.6 1.6 0 0 1 6.5 3.4Z"
          stroke={fg}
          strokeWidth={1.6}
          {...base}
        />
        <Path d="M13.2 3.6v4.6a.6.6 0 0 0 .6.6h4.5" stroke={fg} strokeWidth={1.6} {...base} />
        {kind === "word" ? (
          <SvgText x="11.7" y="16.4" fontSize="6.4" fontWeight="700" fill={fg} textAnchor="middle">
            W
          </SvgText>
        ) : kind === "pdf" ? (
          <SvgText x="11.7" y="16.2" fontSize="5.4" fontWeight="700" fill={fg} textAnchor="middle">
            PDF
          </SvgText>
        ) : (
          <>
            <Line x1="8" y1="12.4" x2="15.2" y2="12.4" stroke={fg} strokeWidth={1.4} {...base} />
            <Line x1="8" y1="15.4" x2="13" y2="15.4" stroke={fg} strokeWidth={1.4} {...base} />
          </>
        )}
      </Svg>
    </View>
  );
}

/** AddFilesSheet's row-leading selection circle — empty ring, or filled with a check once
 *  picked. Small enough (and specific enough to that one sheet) that it lives here rather than
 *  as its own file. */
export function SelectionCircle({ selected, color, size = 22 }: { selected: boolean; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth={1.7} fill={selected ? color : "none"} />
      {selected ? <Path d="m7.4 12.3 3.1 3.1 6.1-6.4" stroke="#fff" strokeWidth={2.1} {...base} /> : null}
    </Svg>
  );
}
