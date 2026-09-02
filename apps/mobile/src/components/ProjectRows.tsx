import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { Easing as ReEasing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { FolderIcon, PinIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The two row shapes a canvas/project list draws with, shared by the drawer's Pinned /
// Projects / Canvases sections and the Projects page — same "lift while held" gesture
// feedback (see AppDrawer's ChatRow, which this generalizes), same tile, same type ramp.
// Split out here per the parity spec ("extract components/ProjectRows.tsx if the drawer
// grows") rather than duplicated: the drawer already owns a lot of chrome on its own.

/** Animates a row's pick-up while `useRowDrag`'s hold gesture has it lifted — scale plus a
 *  raised shadow, not a colour change (a row already uses its background for the pressed
 *  state). One hook so CanvasRow and ProjectRow don't each carry the same three lines. */
function useLiftAnimation(lifted: boolean) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withTiming(lifted ? 1 : 0, { duration: lifted ? 140 : 120, easing: ReEasing.out(ReEasing.cubic) });
  }, [lift, lifted]);
  return useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lift.value * 0.04 }],
    shadowOpacity: lift.value * 0.35,
    shadowRadius: 4 + lift.value * 12,
    elevation: lift.value * 10,
  }));
}

/** The small tile every project row leads with: the project's own color when set, a
 *  neutral surface otherwise — always the folder glyph. The web reserves a distinct
 *  icon-per-project as a nicety this pass doesn't reach for. */
export function ProjectTile({ color, size = 30 }: { color: string | null; size?: number }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: color ?? c.surface2,
        borderRadius: radius.sm,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <FolderIcon size={Math.round(size * 0.55)} color={color ? c.onAccent : c.text2} strokeWidth={1.8} />
    </View>
  );
}

export function CanvasRow({
  label,
  time,
  lifted = false,
  gesture,
  onPress,
  indent = false,
  testID,
}: {
  label: string;
  time?: string;
  lifted?: boolean;
  /** Omit where a row has no hold-menu (the Projects page's nested, tap-only rows) —
   *  a GestureDetector that only ever lands on "do nothing" still eats a long tap, so
   *  a plain Pressable is the honest choice rather than passing an inert gesture. */
  gesture?: ReturnType<typeof Gesture.Pan>;
  onPress: () => void;
  /** Nested under an expanded project — a touch more left padding. */
  indent?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const animated = useLiftAnimation(lifted);
  const row = (
    <Reanimated.View style={[styles.rowShadow, animated]}>
      <Pressable
        testID={testID}
        style={({ pressed }) => [
          styles.row,
          indent && styles.rowIndent,
          pressed && styles.rowPressed,
          lifted && styles.rowLifted,
        ]}
        onPress={onPress}
        accessibilityHint={gesture ? "Touch and hold to rename, pin, file, or delete this canvas." : undefined}
      >
        <Text style={styles.canvasTitle} numberOfLines={1}>
          {label}
        </Text>
        {time ? <Text style={styles.rowTime}>{time}</Text> : null}
      </Pressable>
    </Reanimated.View>
  );
  return gesture ? <GestureDetector gesture={gesture}>{row}</GestureDetector> : row;
}

export function ProjectRow({
  name,
  color,
  trailing,
  lifted,
  gesture,
  onPress,
  compact = false,
  testID,
}: {
  name: string;
  color: string | null;
  /** The Projects page adds a relative-time stamp and a pin glyph here; the drawer's
   *  row is icon + name only ("no chevron at rest" — spec item 2). */
  trailing?: ReactNode;
  lifted: boolean;
  gesture: ReturnType<typeof Gesture.Pan>;
  onPress: () => void;
  /** The drawer's rows are tighter than the Projects page's own list. */
  compact?: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const animated = useLiftAnimation(lifted);
  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View style={[styles.rowShadow, animated]}>
        <Pressable
          testID={testID}
          style={({ pressed }) => [
            styles.row,
            compact ? styles.projectRowCompact : styles.projectRowWide,
            pressed && styles.rowPressed,
            lifted && styles.rowLifted,
          ]}
          onPress={onPress}
          accessibilityHint="Touch and hold to rename, pin, or delete this project."
        >
          <ProjectTile color={color} size={compact ? 26 : 34} />
          <Text style={styles.projectName} numberOfLines={1}>
            {name}
          </Text>
          {trailing}
        </Pressable>
      </Reanimated.View>
    </GestureDetector>
  );
}

/** The pin glyph the Projects page shows beside a pinned row's timestamp. */
export function PinnedMark() {
  const { colors: c } = useTheme();
  return <PinIcon size={13} color={c.text3} strokeWidth={1.8} />;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // The shadow's own colour/offset are static; only opacity/radius and the
    // scale animate, matching AppDrawer's ChatRow.
    rowShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 } },
    row: {
      alignItems: "center",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: space(2.5),
      marginHorizontal: space(2),
      paddingHorizontal: space(3.5),
      paddingVertical: space(2.5),
    },
    rowIndent: { paddingLeft: space(3.5) + space(5) },
    rowPressed: { backgroundColor: c.surface },
    rowLifted: { backgroundColor: c.surface2, borderColor: c.line, borderWidth: 1 },
    canvasTitle: { color: c.text2, flex: 1, fontSize: type.small.fontSize + 1, minWidth: 0 },
    rowTime: { color: c.text3, fontSize: type.micro.fontSize, fontVariant: ["tabular-nums"] },

    projectRowCompact: { gap: space(2.5) },
    projectRowWide: { gap: space(3), paddingVertical: space(3) },
    projectName: { color: c.text, flex: 1, fontSize: type.small.fontSize + 1, fontWeight: "500", minWidth: 0 },
  });
