import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { CloseIcon } from "./icons";
import { useKeyboardHeight } from "./shell-chrome";
import { useSheetExpand } from "./useSheetExpand";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// A liquid-glass panel that slides up from the bottom edge — the Study screen's
// Stats sheet, the chat screen's Sources/Deliverable/Upgrade/Attach sheets, and
// several others all ride this. Mirrors AppDrawer's DrawerShell: always mounted,
// one Animated.Value driven by Animated.timing (translateY here instead of
// translateX), pointer events gated on `visible` rather than mount/unmount so
// the close animation always plays and there's no first-open flicker.
//
// Owner asks 2026-07-21:
//  - Opening a sheet DISMISSES the keyboard, so the sheet is never hidden
//    behind it (these are inline views in the same hierarchy as the keyboard,
//    not native modals, so the OS gives them no z-guarantee over it).
//  - The header carries a grabber and a drag gesture: pull UP to expand the
//    sheet toward (near) full screen, pull DOWN to collapse it back — or flick
//    down from collapsed to close. Consumers must NOT hard-cap their own scroll
//    areas — the sheet is the one owner of "how tall".
//
// That drag lives in useSheetExpand.ts as of 2026-07-22, when the owner asked
// for it on EVERY bottom sheet — NoteListSheet and NoteTabsSheet are
// hand-rolled panels that never rode this component, so the behaviour had to
// move somewhere all three could reach.

export function SlideUpSheet({
  visible,
  onClose,
  title,
  children,
  fullScreen = false,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Open at full height instead of the usual part-screen rest position. For
   *  sheets that are really a whole form (owner 2026-07-23: "the add new card
   *  should be full screen"). The grabber still drags it back down. */
  fullScreen?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  // Sheets are inline views, not native modals, so the OS gives them no
  // guarantee of sitting above the keyboard — a sheet with fields in it (the
  // add-card form) had its inputs covered the moment you tapped one. Riding the
  // keyboard's height keeps the whole sheet in the space that's left.
  const keyboardHeight = useKeyboardHeight();
  const { bodyMaxHeight, headerPan } = useSheetExpand({
    visible,
    onClose,
    startExpanded: fullScreen,
    bottomInset: keyboardHeight,
  });

  // Slide in on open / out on close. This driver was accidentally dropped when
  // useSheetExpand was extracted (PR #250) — the effect that ran
  // `Animated.timing(progress, …)` went with the extraction, but `progress`,
  // its interpolation, and the `useEffect`/`Keyboard`/`Easing` imports stayed,
  // so `progress` was stuck at 0 and every SlideUpSheet rendered fully
  // off-screen (translateY = full window height). react-native-web previews
  // don't surface it, which is how it shipped. Restored 2026-07-23. Also drops
  // the keyboard on open, since this is an inline view (not a native modal) the
  // keyboard would otherwise cover.
  useEffect(() => {
    if (visible) Keyboard.dismiss();
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  // Slides off the bottom of the window, not just its own height, so it starts
  // fully offscreen regardless of how tall the content ends up being.
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents={visible ? "auto" : "none"} testID={testID}>
      {/* Transparent tap-catcher — dismiss on an outside tap WITHOUT blurring the page.
          The sheet's own glass supplies the only blur (owner: confine blur to the component). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View style={[styles.sheetWrap, { bottom: keyboardHeight, transform: [{ translateY }] }]}>
        <GlassSurface style={styles.sheet} fallbackColor={c.glassPanel}>
          <GestureDetector gesture={headerPan}>
            <View>
              <View style={styles.grabberRow}>
                <View style={styles.grabber} />
              </View>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel={`Close ${title}`}>
                  <CloseIcon size={14} color={c.text2} />
                </Pressable>
              </View>
            </View>
          </GestureDetector>
          {/* The home-indicator gap belongs UNDER the sheet, not inside it, once
              the keyboard has lifted the sheet clear of the bottom edge. */}
          <Animated.View
            style={[
              styles.body,
              { maxHeight: bodyMaxHeight, paddingBottom: (keyboardHeight > 0 ? 0 : insets.bottom) + space(5) },
            ]}
          >
            {children}
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Above every other overlay in the app (owner 2026-07-23: "attaching from
    // library clashes with the chat composer suggestions" — the sheet was
    // opening UNDERNEATH the chat starter rows and the composer, which are
    // absolutely positioned and rendered later in the tree).
    //
    // Tree order is what decides paint order on iOS, and only zIndex overrides
    // it. Every chat sheet is declared BEFORE the composer block, so all of them
    // were losing, not just the Attach picker — it's simply the one with a busy
    // landing screen behind it. Fixing it here fixes all of them at once, and
    // clears the app's other overlays too: RootDropZone 20, the Study select
    // bar 30, the Study "…" menu 40. A hidden sheet takes no touches
    // (pointerEvents above), so a high layer costs nothing when closed.
    layer: { zIndex: 60 },
    sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
    sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.line, borderBottomWidth: 0 },
    grabberRow: { alignItems: "center", paddingTop: space(2) },
    grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.line2 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingTop: space(1.5),
      paddingBottom: space(2),
    },
    title: { ...type.title, color: c.text },
    closeBtn: { width: control.sm, height: control.sm, borderRadius: control.sm / 2, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
    body: { paddingHorizontal: space(4) },
  });
