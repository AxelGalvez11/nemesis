import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

// The "move it out of every folder" target. Dropping onto a folder row moves an
// item IN; letting go anywhere ELSE sends it back to the top level.
//
// Owner 2026-07-24: "moving items out of folders should highlight the area
// outside the folder (NOT the top area)." It was a 62pt strip pinned near the
// top of the list, which asked the student to carry a row all the way up to a
// specific band to do the most ordinary thing there is — take something out of
// a folder. So the zone is now the WHOLE list area, and the highlight says the
// true thing: everywhere that is not a folder means top level.
//
// It renders BEHIND the rows (zIndex 0 against the drop zone's old 20) so it is
// a wash under the list rather than a panel over it, and it never takes touches.
//
// TWO THINGS MAKE THIS SAFE, both of them non-obvious:
//
//  1. It registers as a FALLBACK target (useRowDrag's RegisteredRow.fallback).
//     A full-area zone contains every folder row's rectangle, so a single
//     first-match hit test would resolve nearly every drop to "top level" —
//     with registration order deciding which, so folders would appear to work
//     only sometimes. Fallbacks are hit-tested in a second pass, after every
//     ordinary target has been ruled out.
//  2. It stays ALWAYS MOUNTED and merely turns invisible. useRowDrag snapshots
//     every droppable row's window rect in the pan's onStart, which runs in the
//     same tick as the setState that would reveal a drag-only element — so a
//     zone that appeared when the drag began would never be measured, and would
//     never accept a drop.

export const RootDropZone = forwardRef<View, { active: boolean; over: boolean; top: number; bottom?: number }>(
  function RootDropZone({ active, over, top, bottom = 0 }, ref) {
    const styles = useThemedStyles(createStyles);
    return (
      <View
        ref={ref}
        // Never takes touches: the drag gesture owns the screen while it runs,
        // and when idle this must not sit between the list and the finger.
        pointerEvents="none"
        style={[
          styles.zone,
          { top, bottom },
          active ? styles.zoneActive : styles.zoneIdle,
          over && styles.zoneOver,
        ]}
        testID="root-drop-zone"
      />
    );
  },
);

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // The whole list area. Inset from the screen edges so the outline reads as
    // a region rather than a border drawn on the phone itself.
    zone: {
      position: "absolute",
      left: space(2),
      right: space(2),
      borderRadius: radius.lg,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: c.accentLine,
      // Under the rows, not over them — this is a backdrop.
      zIndex: 0,
    },
    // Measurable but invisible when nothing is being dragged — see the note above.
    zoneIdle: { opacity: 0 },
    // Available: an outline only. A filled wash across the entire list would
    // tint every row's background for the whole drag.
    zoneActive: { opacity: 1 },
    // The finger is NOT over a folder, so letting go means top level. Solid
    // outline plus the faintest fill — enough to answer "where does this land",
    // still light enough to read the rows through.
    zoneOver: { backgroundColor: c.accentFaint, borderColor: c.accent, borderStyle: "solid" },
  });
