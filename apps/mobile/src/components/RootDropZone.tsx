import { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The "move it out of every folder" target (owner 2026-07-23: "allow items to
// be dragged out of folders"). Dropping onto a folder row moves an item IN;
// there was no equivalent for moving one back to the top level, so anything
// dragged into a folder could only be got out again through the menu.
//
// ALWAYS MOUNTED, and that's the important part rather than a detail: useRowDrag
// snapshots every droppable row's window rect in the pan's onStart, which runs
// in the same tick as the setState that would have revealed a drag-only strip.
// A zone that appeared when the drag began would therefore never be measured,
// and would never accept a drop. So it stays mounted and merely turns
// invisible — it's absolutely positioned, so costing no layout either way.

export const RootDropZone = forwardRef<View, { label: string; active: boolean; over: boolean; top: number }>(
  function RootDropZone({ label, active, over, top }, ref) {
    const styles = useThemedStyles(createStyles);
    return (
      <View
        ref={ref}
        // Never takes touches: the drag gesture owns the screen while it runs,
        // and when idle this must not sit on top of the list.
        pointerEvents="none"
        style={[styles.zone, { top }, active ? styles.zoneActive : styles.zoneIdle, over && styles.zoneOver]}
        testID="root-drop-zone"
      >
        <Text style={[styles.label, over && styles.labelOver]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  },
);

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    zone: {
      position: "absolute",
      left: space(4),
      right: space(4),
      height: 46,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.line2,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 20,
    },
    // Measurable but invisible when nothing is being dragged — see the note above.
    zoneIdle: { opacity: 0 },
    zoneActive: { opacity: 1 },
    zoneOver: { backgroundColor: c.accentFaint, borderColor: c.accentLine, borderStyle: "solid" },
    label: { ...type.small, color: c.text3 },
    labelOver: { color: c.accent, fontWeight: "600" },
  });
