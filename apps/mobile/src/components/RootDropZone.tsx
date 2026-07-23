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
    // Deliberately a BAND, not a hairline chip (owner 2026-07-23: the box should
    // "highlight the out of folders space"). It was a 46pt strip in the app's
    // quietest colors, which read as a caption rather than a place to let go of
    // something; at 62pt with the accent on it, it reads as the destination it
    // is, and it is a far easier thing to hit with a finger mid-drag.
    zone: {
      position: "absolute",
      left: space(3),
      right: space(3),
      height: 62,
      borderRadius: radius.lg,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: c.accentLine,
      backgroundColor: c.accentFaint,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 20,
    },
    // Measurable but invisible when nothing is being dragged — see the note above.
    zoneIdle: { opacity: 0 },
    zoneActive: { opacity: 1 },
    // Over: the outline goes solid and the fill deepens, so "let go here" is
    // unmistakable next to the merely-available state above.
    zoneOver: { backgroundColor: c.accent, borderColor: c.accent, borderStyle: "solid" },
    label: { ...type.small, color: c.accent, fontWeight: "600" },
    labelOver: { color: c.onAccent, fontWeight: "700" },
  });
