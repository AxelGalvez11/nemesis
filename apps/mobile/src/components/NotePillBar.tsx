import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { GlassSurface } from "./GlassSurface";
import { PlusIcon, SearchIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space } from "@/theme/tokens";

// The note screen's floating bottom pill bar (owner 2026-07-21, matching their
// Safari-style reference crop): back · forward · search · new note · recents ·
// outline, browser-style. Pure chrome — every action is a callback into
// note.tsx, which owns the history stack and the sheets the buttons open.
//
// Semantics (owner picked "browser-style"): ‹ › step through the notes you've
// opened (‹ leaves to the Library once there's nothing left to step back to),
// the magnifier searches your notes, + starts a new note, the numbered square
// opens the TAB VIEWER (owner 2026-07-21 — NoteTabsSheet's card grid), and ≡
// jumps to a heading in this note.

// Owner 2026-07-22: "make the buttons bigger in the notes library, because
// they look a bit small". 44 was the bare iOS minimum target and the glyphs
// inside it were smaller still, so the bar read as a row of hints rather than
// buttons. 52 across six buttons plus the bar's padding is 324pt — comfortably
// inside the narrowest phone this ships to, so nothing has to wrap or shrink.
const BUTTON = control.xl;
/** The bar's own height, exported so note.tsx's bottom scroll spacer clears
 *  the real control rather than a number that drifts from it. */
export const NOTE_PILL_BAR_HEIGHT = 62;

export function NotePillBar({
  canForward,
  recentCount,
  busy = false,
  onBack,
  onForward,
  onSearch,
  onNew,
  onRecents,
  onOutline,
}: {
  canForward: boolean;
  /** Open tabs (distinct notes in history) — the count inside the square. */
  recentCount: number;
  /** True while "+" is mid-create; dims the button and ignores re-taps. */
  busy?: boolean;
  onBack: () => void;
  onForward: () => void;
  onSearch: () => void;
  onNew: () => void;
  onRecents: () => void;
  onOutline: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const buttons: { key: string; label: string; disabled?: boolean; onPress: () => void; child: ReactNode }[] = [
    { child: <ChevronGlyph direction="left" color={c.text} />, key: "back", label: "Back", onPress: onBack },
    { child: <ChevronGlyph direction="right" color={canForward ? c.text : c.text3} />, disabled: !canForward, key: "forward", label: "Forward", onPress: onForward },
    { child: <SearchIcon size={22} color={c.text} strokeWidth={1.9} />, key: "search", label: "Search notes", onPress: onSearch },
    { child: <PlusIcon size={24} color={busy ? c.text3 : c.text} strokeWidth={1.8} />, disabled: busy, key: "new", label: "New note", onPress: onNew },
    { child: <RecentsGlyph color={c.text} count={recentCount} countStyle={styles.recentsCount} />, key: "recents", label: "Note tabs", onPress: onRecents },
    { child: <OutlineGlyph color={c.text} />, key: "outline", label: "Note outline", onPress: onOutline },
  ];
  return (
    <GlassSurface style={styles.bar} fallbackColor={c.glassPanel} shadow>
      {buttons.map((btn) => (
        <Pressable
          key={btn.key}
          onPress={btn.onPress}
          disabled={btn.disabled}
          style={({ pressed }) => [styles.btn, pressed && !btn.disabled && styles.btnPressed]}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={btn.label}
          accessibilityState={{ disabled: !!btn.disabled }}
          testID={`note-bar-${btn.key}`}
        >
          {btn.child}
        </Pressable>
      ))}
    </GlassSurface>
  );
}

function ChevronGlyph({ direction, color }: { direction: "left" | "right"; color: string }) {
  const d = direction === "left" ? "M14.4 5.6 8 12l6.4 6.4" : "M9.6 5.6 16 12l-6.4 6.4";
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Safari-tabs-style rounded square with the visit count inside (capped at 9+). */
function RecentsGlyph({ color, count, countStyle }: { color: string; count: number; countStyle: object }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4" stroke={color} strokeWidth={1.9} fill="none" />
      </Svg>
      <Text style={[countStyle, { color }]}>{count > 9 ? "9+" : Math.max(count, 1)}</Text>
    </View>
  );
}

/** ≡ with a shorter middle line — reads as "contents", not a hamburger menu. */
function OutlineGlyph({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Line x1="5" y1="7.2" x2="19" y2="7.2" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Line x1="5" y1="12" x2="15.4" y2="12" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Line x1="5" y1="16.8" x2="19" y2="16.8" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: space(1.5),
      height: NOTE_PILL_BAR_HEIGHT,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
      overflow: "hidden",
    },
    btn: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: "center", justifyContent: "center" },
    btnPressed: { backgroundColor: c.surface },
    recentsCount: { position: "absolute", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"], letterSpacing: -0.2 },
  });
