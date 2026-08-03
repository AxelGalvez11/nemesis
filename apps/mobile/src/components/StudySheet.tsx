import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Keyboard, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
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
  page = false,
  portal = false,
  hideClose = false,
  compactTitle = false,
  headerDivider = false,
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
  /** A real edge-to-edge page surface: no grabber, rounded sheet edge, outside
   *  tap target, or collapsed resting state. Used by Study flows whose work
   *  needs the whole phone rather than a taller bottom sheet. */
  page?: boolean;
  /** Render into a native Modal instead of inline, so the surface is measured
   *  against the WINDOW rather than whatever view it was declared in.
   *
   *  🔴 A sheet declared inside another panel is NOT full screen, however much
   *  it asks to be. `styles.layer` is StyleSheet.absoluteFill, and an absolutely
   *  positioned child resolves against its parent's content box — so the image
   *  cloze editor, declared inside the add-card page's body, was inset by that
   *  page's padding and started below its header. MiniMenu already carries the
   *  same escape hatch, added for the same reason one level down (see its
   *  `portal` prop). Only reach for it when the sheet really is nested. */
  portal?: boolean;
  hideClose?: boolean;
  compactTitle?: boolean;
  headerDivider?: boolean;
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
    startExpanded: fullScreen || page,
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
  // A portalled sheet lives in a native Modal, which is mounted or not — there
  // is no "present but transparent to touches" state to hide in, so it has to
  // outlive `visible` by exactly the length of the close animation or the sheet
  // would vanish instead of sliding away. Inline sheets ignore this entirely.
  const [portalMounted, setPortalMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setPortalMounted(true);
    }
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setPortalMounted(false);
    });
  }, [visible, progress]);

  // Slides off the bottom of the window, not just its own height, so it starts
  // fully offscreen regardless of how tall the content ends up being.
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  /** Inline by default; inside a native Modal when the sheet is nested. */
  const wrap = (body: ReactNode) => {
    if (!portal) return body;
    if (!portalMounted) return null;
    return (
      <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
        {/* Gesture-handler needs its own root inside a Modal: the Modal is a
            separate native view tree, and without this the image cloze editor's
            box-drawing Pan simply never fires. */}
        <GestureHandlerRootView style={styles.flex}>{body}</GestureHandlerRootView>
      </Modal>
    );
  };

  if (page) {
    return wrap(
      <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents={visible ? "auto" : "none"} testID={testID}>
        <Animated.View
          style={[
            styles.pageWrap,
            {
              bottom: keyboardHeight,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.page}>
            <View style={[styles.pageHeader, { paddingTop: insets.top + space(2) }]}>
              <Text style={styles.pageTitle}>{title}</Text>
              {!hideClose ? (
                <Pressable onPress={onClose} hitSlop={8} style={styles.pageCloseBtn} accessibilityLabel={`Close ${title}`}>
                  <CloseIcon size={18} color={c.text} />
                </Pressable>
              ) : null}
            </View>
            <View
              style={[
                styles.pageBody,
                { paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom + space(3) },
              ]}
            >
              {children}
            </View>
          </View>
        </Animated.View>
      </View>,
    );
  }

  return wrap(
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
              <View style={[styles.header, headerDivider && styles.headerDivider]}>
                <Text style={compactTitle ? styles.titleCompact : styles.title}>{title}</Text>
                {!hideClose ? (
                  <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel={`Close ${title}`}>
                    <CloseIcon size={14} color={c.text2} />
                  </Pressable>
                ) : null}
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
    </View>,
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
    flex: { flex: 1 },
    sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
    sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.line, borderBottomWidth: 0 },
    pageWrap: { position: "absolute", left: 0, right: 0, top: 0 },
    page: { flex: 1, backgroundColor: c.bg },
    pageHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingBottom: space(3),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    pageTitle: { ...type.title, color: c.text },
    pageCloseBtn: {
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      backgroundColor: c.surface2,
      alignItems: "center",
      justifyContent: "center",
    },
    pageBody: { flex: 1, paddingHorizontal: space(4), paddingTop: space(3) },
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
    headerDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
    title: { ...type.title, color: c.text },
    titleCompact: { ...type.small, fontWeight: "600", color: c.textHint },
    closeBtn: { width: control.sm, height: control.sm, borderRadius: control.sm / 2, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
    body: { paddingHorizontal: space(4) },
  });
