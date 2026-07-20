import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "./GlassSurface";
import { CloseIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// A liquid-glass panel that slides up from the bottom edge — the Study screen's
// Stats sheet and its "coming soon" placeholders both ride this. Mirrors
// AppDrawer's DrawerShell: always mounted, one Animated.Value driven by
// Animated.timing (translateY here instead of translateX), pointer events
// gated on `visible` rather than mount/unmount so the close animation always
// plays and there's no first-open flicker.
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

  useEffect(() => {
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
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"} testID={testID}>
      {/* Transparent tap-catcher — dismiss on an outside tap WITHOUT blurring the page.
          The sheet's own glass supplies the only blur (owner: confine blur to the component). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
        <GlassSurface style={styles.sheet} fallbackColor={c.glassPanel}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel={`Close ${title}`}>
              <CloseIcon size={14} color={c.text2} />
            </Pressable>
          </View>
          <View style={[styles.body, { paddingBottom: insets.bottom + space(5) }]}>{children}</View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
    sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.line, borderBottomWidth: 0 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(4),
      paddingTop: space(3.5),
      paddingBottom: space(2),
    },
    title: { ...type.title, color: c.text },
    closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
    body: { paddingHorizontal: space(4) },
  });
