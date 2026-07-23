import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

// The "move it out of every folder" target (owner 2026-07-23). Dropping onto a
// folder row moves an item IN; this strip near the top of the list is where you
// let go to send it back to the top level.
//
// Owner 2026-07-23 (round 2): "the 'move out of folders' box should not have
// text and should only highlight the area where the top level is." So the words
// are gone — the highlighted strip at the top of the list speaks for itself.
//
// ALWAYS MOUNTED, and that's the important part rather than a detail: useRowDrag
// snapshots every droppable row's window rect in the pan's onStart, which runs
// in the same tick as the setState that would have revealed a drag-only strip.
// A zone that appeared when the drag began would therefore never be measured,
// and would never accept a drop. So it stays mounted and merely turns
// invisible — it's absolutely positioned, so costing no layout either way.

export const RootDropZone = forwardRef<View, { active: boolean; over: boolean; top: number }>(
  function RootDropZone({ active, over, top }, ref) {
    const styles = useThemedStyles(createStyles);
    return (
      <View
        ref={ref}
        // Never takes touches: the drag gesture owns the screen while it runs,
        // and when idle this must not sit on top of the list.
        pointerEvents="none"
        style={[styles.zone, { top }, active ? styles.zoneActive : styles.zoneIdle, over && styles.zoneOver]}
        testID="root-drop-zone"
      />
    );
  },
);

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // A highlighted BAND marking the top-level area (owner 2026-07-23). Textless
    // now: a dashed accent outline over a faint accent fill reads as "drop here
    // to leave the folder" on its own, and it's an easy finger target mid-drag.
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
      zIndex: 20,
    },
    // Measurable but invisible when nothing is being dragged — see the note above.
    zoneIdle: { opacity: 0 },
    zoneActive: { opacity: 1 },
    // Over: the outline goes solid and the fill deepens, so "let go here" is
    // unmistakable next to the merely-available state above.
    zoneOver: { backgroundColor: c.accent, borderColor: c.accent, borderStyle: "solid" },
  });
