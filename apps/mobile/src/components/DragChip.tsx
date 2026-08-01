import { useEffect } from "react";
import { StyleSheet, Text, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The thing that rides your finger while a row is being dragged onto a folder
// (see useRowDrag). The row itself stays put and dims, so this reads as the
// card you are holding and the slot it came out of.
//
// 🔴 IT WAS A SMALL ACCENT PILL, AND THAT IS EXACTLY WHAT THE OWNER'S NOTE WAS
// ABOUT (2026-08-01: "the entire card should appear to be picked up"). A capsule
// carrying the name says "a label about this row is following you"; a card in
// the page's own surface, raised off it with a real shadow, says "you are
// holding this row". Same information, and only the second one matches what the
// finger is doing.
//
// ONE ANIMATED NODE, STILL — and that constraint is why this is a stand-in
// rather than the real row lifting where it sits. Moving the actual row means an
// animated style on every row in the list; this is one node whether the Library
// holds ten notes or a thousand. The sidebar's chats DO lift in place, because
// that list is a short one inside a ~330pt panel that clips its own overflow, so
// a window-positioned card there would be cut off at the panel's edge — the same
// reason the drawer's MiniMenu has to escape into a Modal.
//
// Positioned in WINDOW coordinates, matching what useRowDrag hit-tests against,
// and it never takes touches: the gesture underneath owns the whole drag.

/** Wide enough to read as a row rather than a chip, narrow enough that the hand
 *  holding it is never covering most of it. */
const CARD_W = 244;
/** Kept off the screen edges so the card never looks half-swallowed. */
const EDGE_MARGIN = 10;
/** How far above the fingertip the card sits, so the hand is not on top of the
 *  thing it is carrying. */
const FINGER_LIFT = 34;

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
  const { width } = useWindowDimensions();
  // The pick-up itself: the card swells slightly as it comes off the page.
  // Driven from a shared value rather than an `entering` animation, because
  // those are unreliable inside a native Modal and this component is one of the
  // few that has no idea what it is being rendered into.
  const lift = useSharedValue(0);

  useEffect(() => {
    lift.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 140 : 100,
      easing: Easing.out(Easing.cubic),
    });
  }, [lift, visible]);

  const animated = useAnimatedStyle(() => {
    // Centred on the fingertip, then nudged back inside both edges — a row
    // picked up near the right of the screen would otherwise hang off it.
    const left = Math.min(
      Math.max(fingerX.value - CARD_W / 2, EDGE_MARGIN),
      Math.max(EDGE_MARGIN, width - CARD_W - EDGE_MARGIN),
    );
    return {
      opacity: lift.value,
      transform: [
        { translateX: left },
        { translateY: fingerY.value - FINGER_LIFT },
        // Starts near the row's own size and grows: the card looks like it came
        // off the page rather than appearing above it.
        { scale: 0.96 + lift.value * 0.07 },
      ],
    };
  });

  if (!visible) return null;
  return (
    <Animated.View style={[styles.card, animated]} pointerEvents="none" testID="drag-chip">
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      position: "absolute",
      top: 0,
      left: 0,
      width: CARD_W,
      paddingHorizontal: space(4),
      paddingVertical: space(3),
      // The page's own card language — surface fill, hairline border, large
      // radius — so what you are holding is recognisably the row you grabbed.
      borderRadius: radius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      // A real shadow is what sells "off the page"; the flat pill had none.
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
      zIndex: 50,
    },
    label: { ...type.body, color: c.text, fontWeight: "600" },
  });
