import { useEffect, type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, { Easing as ReEasing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { PinIcon, type IconProps } from "./icons";
import { ProjectFolderIcon } from "./icons-sidebar";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { inset, radius, row as rowToken, space, type } from "@/theme/tokens";

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
 *  icon-per-project as a nicety this pass doesn't reach for.
 *
 *  Default size 40 / radius.lg (16) — measured off IMG_6538 (`tile_zoom.png`): the tile's
 *  own bbox is 40.3×39.7pt at exactly the `row.tile` (68pt) pitch, and fitting the corner's
 *  inset profile against several rounded-rect radii lands on 48px = 16pt at 3x, i.e.
 *  radius.lg — not radius.sm/md as a first guess would suggest. */
export function ProjectTile({ color, size = 40 }: { color: string | null; size?: number }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: color ?? c.surface2,
        borderRadius: radius.lg,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <ProjectFolderIcon size={Math.round(size * 0.5)} color={color ? c.onAccent : c.text2} strokeWidth={1.8} />
    </View>
  );
}

export function CanvasRow({
  label,
  time,
  fresh = false,
  Icon,
  lifted = false,
  gesture,
  onPress,
  indent = false,
  testID,
}: {
  label: string;
  time?: string;
  /** A small accent dot in place of `time` — the drawer's Recents/Pinned rows carry no
   *  timestamp at all (IMG_6531 has none), only this: a canvas updated in the last five
   *  minutes gets a dot, measured off IMG_6531 (crop_recents.png) at ~10pt, coloured the
   *  reference's green (this app's light-mode `c.accent`). Takes precedence over `time` when
   *  both are set — no caller does that today, but the dot is the more urgent signal. */
  fresh?: boolean;
  /** A leading glyph — the drawer's Pinned rows carry one (folder for a project, a chat
   *  bubble for a canvas, IMG_6531); the Recents rows below them and the Projects page's
   *  nested rows carry none, so this stays optional and shifts the label over only when set. */
  Icon?: ComponentType<IconProps>;
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
  const { colors: c } = useTheme();
  const animated = useLiftAnimation(lifted);
  const row = (
    <Reanimated.View style={[styles.rowShadow, animated]}>
      <Pressable
        testID={testID}
        style={({ pressed }) => [
          styles.canvasRow,
          indent && styles.rowIndent,
          pressed && styles.rowPressed,
          lifted && styles.rowLifted,
        ]}
        onPress={onPress}
        accessibilityHint={gesture ? "Touch and hold to rename, pin, file, or delete this canvas." : undefined}
      >
        {Icon ? (
          <View style={styles.rowIcon}>
            <Icon size={20} color={c.text2} strokeWidth={1.6} />
          </View>
        ) : null}
        <Text style={styles.canvasTitle} numberOfLines={1}>
          {label}
        </Text>
        {fresh ? <View style={styles.freshDot} /> : time ? <Text style={styles.rowTime}>{time}</Text> : null}
      </Pressable>
    </Reanimated.View>
  );
  return gesture ? <GestureDetector gesture={gesture}>{row}</GestureDetector> : row;
}

/** The Projects page's tile row (IMG_6538): a 40pt colour tile, name, and whatever
 *  trailing content the page wants ("3 weeks ago" + a pin glyph). The drawer no longer
 *  uses this — its Pinned section renders a project the same plain, icon-led way it
 *  renders a canvas (see AppDrawer's use of CanvasRow with `Icon={ProjectFolderIcon}`),
 *  matching IMG_6531's un-tiled pinned rows. */
export function ProjectRow({
  name,
  color,
  trailing,
  lifted,
  gesture,
  onPress,
  testID,
}: {
  name: string;
  color: string | null;
  trailing?: ReactNode;
  lifted: boolean;
  gesture: ReturnType<typeof Gesture.Pan>;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const animated = useLiftAnimation(lifted);
  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View style={[styles.rowShadow, animated]}>
        <Pressable
          testID={testID}
          style={({ pressed }) => [styles.row, styles.projectRowWide, pressed && styles.rowPressed, lifted && styles.rowLifted]}
          onPress={onPress}
          accessibilityHint="Touch and hold to rename, pin, or delete this project."
        >
          <ProjectTile color={color} />
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
    // The Projects page's own tile row (ProjectRow, via projectRowWide below) — its
    // ~68pt row.tile pitch comes from its 40pt tile plus this padding, not an explicit
    // height, and stays that way; it wasn't part of the coordinator's diff.
    row: {
      alignItems: "center",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: space(2.5),
      marginHorizontal: space(2),
      paddingHorizontal: space(3.5),
      paddingVertical: space(2.5),
    },
    // The drawer's own row (Pinned + Recents) — split out from `row` above once the two
    // needed different heights: this one is EXPLICIT height: row.list (48), not
    // padding-derived (coordinator fix #2: on-simulator pitch was ~40.3pt). No
    // marginHorizontal — paddingHorizontal alone is the row's inset now, matching
    // AppDrawer's navRow (coordinator fix #3: inset.sidebarIcon, 26, not 22).
    canvasRow: {
      alignItems: "center",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: space(2.5),
      height: rowToken.list,
      paddingHorizontal: inset.sidebarIcon,
    },
    rowIndent: { paddingLeft: inset.sidebarIcon + space(5) },
    rowPressed: { backgroundColor: c.surface },
    rowLifted: { backgroundColor: c.surface2, borderColor: c.line, borderWidth: 1 },
    // c.text, not c.text2 — measured off IMG_6531 (the drawer's Recents rows read
    // near-black, not grey; the grey is reserved for a row's SECOND line, like the
    // Projects page's "3 weeks ago", which stays on rowTime below). 17pt (type.label) per
    // both the Projects-page spec ("name 17pt") and the drawer's own row.list text.
    canvasTitle: { color: c.text, flex: 1, fontSize: type.label.fontSize, minWidth: 0 },
    rowTime: { color: c.text3, fontSize: type.micro.fontSize, fontVariant: ["tabular-nums"] },
    // No fixed width any more (coordinator fix #3) — a 26-wide centering box stacked on
    // canvasRow's own 26 padding pushed the icon's ink past the target x; the icon now
    // sits flush at the row's own padding edge, same change as AppDrawer's navIcon.
    rowIcon: { alignItems: "center", justifyContent: "center" },
    // ~10pt, coloured the reference's green — see the `fresh` prop's own doc comment for
    // the measurement.
    freshDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },

    projectRowWide: { gap: space(3), paddingVertical: space(3) },
    projectName: { color: c.text, flex: 1, fontSize: type.label.fontSize, fontWeight: "500", minWidth: 0 },
  });
