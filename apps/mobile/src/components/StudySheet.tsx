import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { CloseIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

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
//    down from collapsed to close. Expansion works by animating the BODY's
//    maxHeight between a collapsed cap and the full window (minus the top
//    inset), so consumers must NOT hard-cap their own scroll areas — the sheet
//    is the one owner of "how tall".

// How many pixels of upward drag count as the full collapsed→expanded ride.
const EXPAND_DRAG_DISTANCE = 260;
// Flicking down faster than this (px/s) from collapsed closes the sheet.
const CLOSE_VELOCITY = 700;

export function SlideUpSheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  // 0 = collapsed, 1 = expanded. Drives the body's maxHeight (a layout prop,
  // so this value can never ride the native driver — separate from `progress`,
  // which stays native for the cheap slide transform).
  const expand = useRef(new Animated.Value(0)).current;
  // JS-side mirrors for gesture math (Animated.Value has no sync read).
  const expandNowRef = useRef(0);
  const dragStartRef = useRef(0);

  useEffect(() => {
    if (visible) {
      // The keyboard would otherwise sit ABOVE this inline sheet (it's not a
      // native modal). One central dismiss fixes every consumer; sheets that
      // contain their own input re-focus it after their slide-in lands
      // (NoteListSheet's 260ms pattern), which re-opens the keyboard cleanly.
      Keyboard.dismiss();
    } else {
      // Reopen always starts collapsed.
      expand.stopAnimation();
      expand.setValue(0);
      expandNowRef.current = 0;
    }
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress, expand]);

  const settleExpand = (to: 0 | 1) => {
    expandNowRef.current = to;
    Animated.timing(expand, {
      toValue: to,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  // Header drag: up expands, down collapses/closes. runOnJS because it drives
  // RN Animated values (JS-side), same pattern GraphNodeView's drag uses.
  const headerPan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(8)
    .onStart(() => {
      dragStartRef.current = expandNowRef.current;
    })
    .onUpdate((event) => {
      const next = Math.min(1, Math.max(0, dragStartRef.current - event.translationY / EXPAND_DRAG_DISTANCE));
      expandNowRef.current = next;
      expand.setValue(next);
    })
    .onEnd((event) => {
      const flickDown = event.velocityY > CLOSE_VELOCITY;
      if (flickDown && dragStartRef.current === 0) {
        // Collapsed + hard flick down = close (the sheet idiom).
        settleExpand(0);
        onClose();
        return;
      }
      if (flickDown) {
        settleExpand(0);
        return;
      }
      if (event.velocityY < -CLOSE_VELOCITY) {
        settleExpand(1);
        return;
      }
      settleExpand(expandNowRef.current >= 0.5 ? 1 : 0);
    });

  // Slides off the bottom of the window, not just its own height, so it starts
  // fully offscreen regardless of how tall the content ends up being.
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  // Body height budget: collapsed keeps the familiar part-screen sheet;
  // expanded runs to just under the status bar.
  const collapsedMax = Math.min(Math.round(height * 0.55), 500);
  const expandedMax = Math.max(collapsedMax, height - insets.top - space(14));
  const bodyMaxHeight = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedMax, expandedMax],
    extrapolate: "clamp",
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID={testID}>
      {/* Transparent tap-catcher — dismiss on an outside tap WITHOUT blurring the page.
          The sheet's own glass supplies the only blur (owner: confine blur to the component). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
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
          <Animated.View style={[styles.body, { maxHeight: bodyMaxHeight, paddingBottom: insets.bottom + space(5) }]}>
            {children}
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
    body: { paddingHorizontal: space(4) },
  });
