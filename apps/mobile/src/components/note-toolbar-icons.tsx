import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { IconProps } from "./icons";

// Formatting glyphs for the note editor's keyboard toolbar (NoteBlockEditor.tsx).
//
// Owner 2026-07-22: "the editing tool bar should use common formatting icons
// instead of the syntax for markdown." The toolbar used to render TEXT — "==",
// "<>", "[[ ]]", "1.", "—", "▦" — which is the markup itself, so the row read
// as a cheat-sheet of syntax rather than a set of buttons. These are the same
// fourteen actions drawn the way every other editor draws them.
//
// Same language as components/icons.tsx (24 viewBox, thin round-capped strokes,
// color from the caller) and split into their own file to keep that shared set
// scoped to app chrome — these exist only for the note toolbar.

const base = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Heading — the "H" every rich-text editor uses (the button CYCLES H1→H2→H3,
 *  so no single level is drawn). Strokes, not a typed letter. */
export function HeadingIcon({ size = 22, color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="6.5" y1="5.5" x2="6.5" y2="18.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="17.5" y1="5.5" x2="17.5" y2="18.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="6.5" y1="12" x2="17.5" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Bold — the classic two-bowl "B". */
export function BoldIcon({ size = 22, color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 4.8h6a3.6 3.6 0 0 1 0 7.2H7Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M7 12h6.8a3.6 3.6 0 0 1 0 7.2H7Z" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Italic — slanted stem between two serifs. */
export function ItalicIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="18.5" y1="5" x2="10.5" y2="5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="13.5" y1="19" x2="5.5" y2="19" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="14.6" y1="5" x2="9.4" y2="19" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Underline — a "U" bowl sitting on its rule. */
export function UnderlineIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.6 4.5v6.2a5.4 5.4 0 0 0 10.8 0V4.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="5.5" y1="19.5" x2="18.5" y2="19.5" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Highlight — a marker nib over the band it lays down. */
export function HighlightIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14.8 3.9 20.1 9.2 11.6 17.7H6.3v-5.3Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="11.6" y1="6.6" x2="17.4" y2="12.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="4" y1="20.8" x2="20" y2="20.8" stroke={color} strokeWidth={strokeWidth + 0.6} {...base} />
    </Svg>
  );
}

/** Strikethrough — an "S" cut by its rule. */
export function StrikethroughIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M16.8 7.3A4.7 4.7 0 0 0 12.3 4.8C9.6 4.8 8 6.1 8 7.9c0 1.3.9 2.2 2.4 2.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M7.1 15.2c.4 2.4 2.4 4 5.4 4 3 0 4.9-1.5 4.9-3.6 0-.9-.3-1.7-.9-2.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Inline code — the universal angle-bracket pair. */
export function CodeIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m15.6 7.8 4.2 4.2-4.2 4.2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M8.4 7.8 4.2 12l4.2 4.2" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Bullet list — dots and their lines. */
export function BulletListIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5" cy="6.5" r="1.5" fill={color} />
      <Circle cx="5" cy="12" r="1.5" fill={color} />
      <Circle cx="5" cy="17.5" r="1.5" fill={color} />
      <Line x1="9.8" y1="6.5" x2="20" y2="6.5" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="9.8" y1="12" x2="20" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="9.8" y1="17.5" x2="20" y2="17.5" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Numbered list — real numerals beside their lines. SvgText (not RN <Text>)
 *  so the digits are part of the drawing and scale with the icon. */
export function NumberedListIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  // Two rows, not three: at toolbar size a third numeral turns the column into
  // an illegible smudge (caught on screenshot), and "1 / 2" already says
  // "ordered" against the round dots of the bullet icon beside it.
  const digit = { fill: color, fontSize: 10, fontWeight: "700" as const, textAnchor: "middle" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <SvgText x="5" y="11.4" {...digit}>
        1
      </SvgText>
      <SvgText x="5" y="20.4" {...digit}>
        2
      </SvgText>
      <Line x1="11" y1="8" x2="20.4" y2="8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="11" y1="17" x2="20.4" y2="17" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Quote — the indent bar a blockquote actually draws, beside its text. */
export function QuoteIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="4.6" y1="5.5" x2="4.6" y2="18.5" stroke={color} strokeWidth={strokeWidth + 0.9} {...base} />
      <Line x1="9.6" y1="8" x2="20" y2="8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="9.6" y1="12" x2="20" y2="12" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="9.6" y1="16" x2="16.4" y2="16" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Wiki link — a page with a link on it: this links to another NOTE, which is
 *  what separates it from the plain web link beside it. */
export function WikiLinkIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.6 3.6h6.2L18 8.8V20a1.4 1.4 0 0 1-1.4 1.4H6.6A1.4 1.4 0 0 1 5.2 20V5A1.4 1.4 0 0 1 6.6 3.6Z" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M10.4 15.6a2 2 0 0 0 3 .2l1.2-1.2a2.1 2.1 0 0 0-3-3l-.7.7" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M12.2 13.4a2 2 0 0 0-3-.2L8 14.4a2.1 2.1 0 0 0 3 3l.7-.7" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Link — the two-ring chain every editor uses for a web address. */
export function LinkIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10.2 13.4a4.2 4.2 0 0 0 6.3.5l2.5-2.5a4.2 4.2 0 0 0-5.9-5.9l-1.4 1.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M13.8 10.6a4.2 4.2 0 0 0-6.3-.5L5 12.6a4.2 4.2 0 0 0 5.9 5.9l1.4-1.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Divider — a strong rule with text above and below it. */
export function DividerIcon({ size = 22, color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="6" y1="6.6" x2="18" y2="6.6" stroke={color} strokeWidth={strokeWidth - 0.4} opacity={0.55} {...base} />
      <Line x1="3.6" y1="12" x2="20.4" y2="12" stroke={color} strokeWidth={strokeWidth + 0.5} {...base} />
      <Line x1="6" y1="17.4" x2="18" y2="17.4" stroke={color} strokeWidth={strokeWidth - 0.4} opacity={0.55} {...base} />
    </Svg>
  );
}

/** Table — a grid with its header row picked out. */
export function TableIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.6" y="4.8" width="16.8" height="14.4" rx="2" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="3.6" y1="9.6" x2="20.4" y2="9.6" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="3.6" y1="14.4" x2="20.4" y2="14.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="12" y1="9.6" x2="12" y2="19.2" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}

/** Put the keyboard away — the keyboard slab with an arrow leaving it downwards,
 *  which is how iOS itself draws this action. Lives with the toolbar glyphs
 *  because it sits on the toolbar's rail, even though it formats nothing. */
export function KeyboardDownIcon({ size = 22, color, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="2.5" y="4" width="19" height="11" rx="2" stroke={color} strokeWidth={strokeWidth} {...base} />
      {/* Two short key rows rather than a full grid: at 22pt a real keyboard
          layout turns into grey mush, where two rows still read as "keyboard". */}
      <Line x1="6" y1="7.8" x2="18" y2="7.8" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Line x1="8.5" y1="11.4" x2="15.5" y2="11.4" stroke={color} strokeWidth={strokeWidth} {...base} />
      <Path d="M12 17v4m0 0-2.4-2.4M12 21l2.4-2.4" stroke={color} strokeWidth={strokeWidth} {...base} />
    </Svg>
  );
}
