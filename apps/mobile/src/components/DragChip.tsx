import { StyleSheet, Text } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The label that rides your finger while a row is being dragged onto a folder
// (see useRowDrag). The row itself stays put and dims — moving the real row
// would mean an animated style on every row in the list, where this is one
// animated node no matter how long the list is.
//
// Positioned in WINDOW coordinates, matching what useRowDrag hit-tests against,
// and it never takes touches: the gesture underneath owns the whole drag.

const CHIP_MAX_W = 220;

export function DragChip({
  label,
  fingerX,
  fingerY,
  visible,
}: {
  label: string;
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
  visible: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const animated = useAnimatedStyle(() => ({
    // Sits above and left of the fingertip so the finger doesn't cover it.
    transform: [{ translateX: fingerX.value - 24 }, { translateY: fingerY.value - 46 }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[styles.chip, animated]} pointerEvents="none" testID="drag-chip">
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    chip: {
      position: "absolute",
      top: 0,
      left: 0,
      maxWidth: CHIP_MAX_W,
      paddingHorizontal: space(3),
      paddingVertical: space(2),
      borderRadius: radius.pill,
      backgroundColor: c.accent,
      borderWidth: 1,
      borderColor: c.accentLine,
      zIndex: 50,
    },
    label: { ...type.small, color: c.onAccent, fontWeight: "600" },
  });
