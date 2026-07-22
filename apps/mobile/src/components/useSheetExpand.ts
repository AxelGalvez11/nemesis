import { useEffect, useRef } from "react";
import { Animated, Easing, useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "@/theme/tokens";

// Drag-to-expand for bottom sheets — pull the grabber UP to grow the sheet
// toward full screen, DOWN to collapse it back, or flick down from collapsed
// to close. Owner 2026-07-21 asked for this on the Study stats sheet; owner
// 2026-07-22 generalised it: "any popup menu from the bottom should allow the
// user to swipe/drag it up to expand its size."
//
// Extracted out of StudySheet.tsx, which had the only copy. Everything that
// slides up from the bottom edge now shares it — SlideUpSheet (Study stats,
// chat's Sources/Deliverable/Upgrade/Attach) plus NoteListSheet and
// NoteTabsSheet, which were hand-rolled and so had no drag at all.
//
// Expansion works by animating the BODY's maxHeight between a collapsed cap
// and the full window (minus the top inset), so a consumer must NOT hard-cap
// its own scroll area — this hook is the one owner of "how tall".

/** How many points of upward drag count as the full collapsed→expanded ride. */
const EXPAND_DRAG_DISTANCE = 260;
/** Flicking down faster than this (points/s) from collapsed closes the sheet. */
const CLOSE_VELOCITY = 700;

export interface SheetExpand {
  /** Attach to a GestureDetector wrapping the sheet's grabber/header. */
  headerPan: ReturnType<typeof Gesture.Pan>;
  /** Drive the body's maxHeight with this — it's a layout prop, so the value
   *  can never ride the native driver. */
  bodyMaxHeight: Animated.AnimatedInterpolation<number>;
}

export function useSheetExpand({
  visible,
  onClose,
  collapsedRatio = 0.55,
  collapsedCap = 500,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fraction of the window the collapsed sheet may fill. */
  collapsedRatio?: number;
  /** Hard ceiling on the collapsed height, for tall phones. */
  collapsedCap?: number;
}): SheetExpand {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // 0 = collapsed, 1 = expanded.
  const expand = useRef(new Animated.Value(0)).current;
  // JS-side mirrors for the gesture maths (Animated.Value has no sync read).
  const expandNowRef = useRef(0);
  const dragStartRef = useRef(0);

  // Reopening always starts collapsed — a sheet that remembered "expanded"
  // would come back full-screen for an unrelated, possibly tiny, list.
  useEffect(() => {
    if (visible) return;
    expand.stopAnimation();
    expand.setValue(0);
    expandNowRef.current = 0;
  }, [visible, expand]);

  const settleExpand = (to: 0 | 1) => {
    expandNowRef.current = to;
    Animated.timing(expand, {
      toValue: to,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  // runOnJS because it drives RN Animated values (JS-side), the same pattern
  // GraphNodeView's drag uses.
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

  // Collapsed keeps the familiar part-screen sheet; expanded runs to just under
  // the status bar. Math.max guards the case where a short window makes the
  // "expanded" ceiling land below the collapsed one.
  const collapsedMax = Math.min(Math.round(height * collapsedRatio), collapsedCap);
  const expandedMax = Math.max(collapsedMax, height - insets.top - space(14));
  const bodyMaxHeight = expand.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedMax, expandedMax],
    extrapolate: "clamp",
  });

  return { bodyMaxHeight, headerPan };
}
