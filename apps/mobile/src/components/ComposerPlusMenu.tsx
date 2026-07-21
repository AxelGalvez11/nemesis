import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GlassSurface } from "./GlassSurface";
import { LibraryIcon, MicIcon, SearchIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Composer "+" mini menu (chat.tsx) — same always-mounted fade+rise,
// anchored-above-a-control shape as StudyModeMenu.tsx (that screen's FAB, this
// screen's composer pill; GlassSurface `opaque` for the same page-bleed-through
// fix). Two rows:
//  - "Attach from Library" opens AttachLibrarySheet.tsx.
//  - "Deep research" is a PERSISTENT toggle (checkmark on the right when on) —
//    stays on across sends until the student turns it off again, unlike the
//    attach flow's one-shot chip (owner spec calls it a "toggle row", which
//    reads as a mode rather than a per-message action).
// Mirrors web's own "+" AddMenu (apps/web/components/workspace/sessions/
// composer.tsx) in spirit — same two concepts, "Files"→"Attach from Library"
// and "Deep research" verbatim (right down to reusing a search-glyph icon for
// it, same as web's Codicon "search") — but WORKING here, where web's own
// "Deep research" item turned out to be an unwired stub with no onSelect.
export function ComposerPlusMenu({
  visible,
  onClose,
  bottomOffset,
  onAttach,
  onRecord,
  deepResearchOn,
  onToggleDeepResearch,
}: {
  visible: boolean;
  onClose: () => void;
  /** Distance from the screen's bottom edge to just above the composer pill —
   *  computed by the caller from the same padding/height numbers the composer
   *  row itself renders with (see Composer.tsx's COMPOSER_PILL_HEIGHT). */
  bottomOffset: number;
  onAttach: () => void;
  /** Opens the Record screen (app/record.tsx) for the active thread. */
  onRecord: () => void;
  deepResearchOn: boolean;
  onToggleDeepResearch: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  // Deep research is a toggle — stays open after picking it (only "Attach" and
  // an outside tap close the menu); Attach always closes it (it hands off to a
  // full-screen sheet next).
  const pickAndClose = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID="composer-plus-menu">
      {/* Transparent tap-catcher — dismiss on an outside tap WITHOUT blurring the
          page (owner: confine blur to the component), same as every other menu here. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View style={[styles.menuWrap, { bottom: bottomOffset, opacity: progress, transform: [{ translateY }] }]}>
        <GlassSurface style={styles.menu} fallbackColor={c.glassPanel} opaque>
          <Pressable
            testID="composer-plus-attach"
            onPress={() => pickAndClose(onAttach)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
          >
            <LibraryIcon size={17} color={c.text2} />
            <Text style={styles.rowLabel}>Attach from Library</Text>
          </Pressable>
          <Pressable
            testID="composer-plus-record"
            onPress={() => pickAndClose(onRecord)}
            style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
            accessibilityRole="button"
          >
            <MicIcon size={17} color={c.text2} />
            <Text style={styles.rowLabel}>Record</Text>
          </Pressable>
          <Pressable
            testID="composer-plus-deep-research"
            onPress={() => pickAndClose(onToggleDeepResearch)}
            style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityState={{ checked: deepResearchOn }}
          >
            <SearchIcon size={17} color={c.text2} />
            <Text style={styles.rowLabel}>Deep research</Text>
            <View style={styles.rowSpacer} />
            {deepResearchOn ? <CheckIcon size={16} color={c.accent} /> : null}
          </Pressable>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

/** Local checkmark glyph — the "Deep research" row's active indicator. No
 *  check icon exists in components/icons.tsx, and new glyphs stay local to the
 *  file that needs them rather than growing the shared set. */
function CheckIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.5 12.5 9.5 17.5 19.5 6.5" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    menuWrap: { position: "absolute", left: space(3), minWidth: 224 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(4) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    rowLabel: { ...type.body, color: c.text },
    rowSpacer: { flex: 1 },
  });
