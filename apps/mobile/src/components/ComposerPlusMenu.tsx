import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GlassSurface } from "./GlassSurface";
import { FileIcon, LibraryIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Composer "+" mini menu (chat.tsx) — same always-mounted fade+rise,
// anchored-above-a-control shape as StudyModeMenu.tsx (that screen's FAB, this
// screen's composer pill; GlassSurface `opaque` for the same page-bleed-through
// fix). Two rows:
//  - "Attach from Library" opens AttachLibrarySheet.tsx.
//  - "Add a file" opens the system picker for a lecture the student was given
//    (PDF / Word / PowerPoint). It fills the SAME one-shot chip: a deck and an
//    attached note are the same thing once they are text.
//  - "Take photo" opens PhotoCaptureSheet.tsx — the shot is uploaded, read by
//    the server, and lands in the SAME one-shot attachment chip the Library
//    picker fills, because a photograph and an attached note are the same thing
//    once they are text (owner 2026-07-24).
//
// A third row briefly opened Record from here (owner 2026-07-22, morning).
// Record moved OUT the same day: it's the round accent button on the composer
// itself now (Composer.tsx's file header has the layout), so recording is one
// tap from the card rather than two through a menu. Only the row left — record
// mode itself is untouched.
//
// The Instant/Medium/High intelligence dial spent one revision as three rows
// in here and moved straight back out (owner 2026-07-22: "move the
// intelligence picker out of the '+' menu, it should have its own pill box").
// It's ComposerEffortMenu.tsx now — a pill on the composer row itself. Don't
// re-add it here; the menu is for one-off actions, not the standing dial.
// The "Deep research" row was removed 2026-07-27 (owner). The CONTROL only:
// research itself is untouched, because routeForTurn already sends a question
// that needs current sources down the research lane on its own — which is what
// the toggle was forcing by hand.
export function ComposerPlusMenu({
  visible,
  onClose,
  bottomOffset,
  onAttach,
  onAddFile,
  onTakePhoto,
}: {
  visible: boolean;
  onClose: () => void;
  /** Distance from the screen's bottom edge to just above the composer pill —
   *  computed by the caller from the same padding/height numbers the composer
   *  row itself renders with (see Composer.tsx's COMPOSER_PILL_HEIGHT). */
  bottomOffset: number;
  onAttach: () => void;
  /** Opens the system file picker for a PDF / Word / PowerPoint (api/documents.ts). */
  onAddFile: () => void;
  onTakePhoto: () => void;
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
  // Every row hands off to a sheet or a system picker, so every row closes the
  // menu on the way out.
  const pickAndClose = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.host]} pointerEvents={visible ? "auto" : "none"} testID="composer-plus-menu">
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
            testID="composer-plus-file"
            onPress={() => pickAndClose(onAddFile)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
          >
            <FileIcon size={17} color={c.text2} />
            <Text style={styles.rowLabel}>Add a file</Text>
          </Pressable>
          <Pressable
            testID="composer-plus-camera"
            onPress={() => pickAndClose(onTakePhoto)}
            style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
            accessibilityRole="button"
          >
            <CameraIcon size={17} color={c.text2} />
            <Text style={styles.rowLabel}>Take photo</Text>
          </Pressable>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

/** Local camera glyph — components/icons.tsx has
 *  no camera, and a one-off glyph stays in the file that needs it. */
function CameraIcon({ size = 17, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="M12 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" fill="none" stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}


const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // See ComposerEffortMenu's `host` — iOS paints siblings in tree order and
    // ignores `position: absolute` for stacking, so this menu needs to say out
    // loud that it belongs on top (owner 2026-07-23: the "+" menu "clashed with
    // text behind it", which was the landing page's starter rows drawing over
    // the panel).
    host: { zIndex: 30 },
    menuWrap: { position: "absolute", left: space(3), minWidth: 224 },
    menu: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", gap: space(2.5), paddingVertical: space(3), paddingHorizontal: space(4) },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.line },
    rowPressed: { backgroundColor: c.surface },
    rowLabel: { ...type.body, color: c.text },
  });
