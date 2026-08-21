// What sits under a canvas answer to say where it came from: ONE pill, and the popup it opens.
//
// 🔴 THIS FILE USED TO DRAW A WRAPPING ROW, ONE PILL PER SOURCE, AND THAT SHAPE IS RETIRED (owner
// 2026-08-20). The instruction was plain: "the sources at the end should be in one singular pill
// component that users can click to bring a popup to see the sources." What he was looking at was
// eleven favicon pills wrapping over four lines under a single answer — "Japantimes", "Memeburn",
// "Axios", "Gurufocus", "Thenewstack" — which is half a phone screen spent on a list nobody reads
// in place. The web reached the same conclusion first and from the other direction: its chat
// surface collapsed to one "Sources" button with the list in a side rail, and its canvas note
// records that a row of domain names cannot be read at a glance because several of them repeat and
// none of them says what the source is.
//
// 🔴 THE NAME AND THE PROPS ARE UNCHANGED ON PURPOSE. Both callers — the Learn tab's live answer
// and `CanvasDocument`'s stored one — pass `pills` and a `testID` and get the new shape with no
// edit at all. That is deliberate: the Learn screen is under a separate decision right now and
// must not be touched, and a component that changes its own shape needs no wiring anywhere. The
// plural name is now slightly wrong for what it draws (one pill about several sources); renaming
// it means editing that screen, so it waits for the same decision.
//
// 🔴 THE PILL AND THE POPUP ARE `components/SourcesSheet.tsx`, NOT LOCAL COPIES. The Chat tab has
// shipped exactly this control for months. Two implementations of "here are the sources" is how
// the two surfaces drifted in the first place — this file's own favicon fallback and the sheet's
// were different code with different failure behaviour until 2026-08-20. There is one of each now.
//
// 🔴 THE SHEET IS PORTALLED. It is declared here, inside the answer, which is inside the canvas's
// ScrollView — and an inline `SlideUpSheet` measures itself against its nearest positioned
// ancestor, so it would open partway down the answer and then scroll away with it. `portal` mounts
// it in a native Modal against the window. See `SourcesPillSheet`.

import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { SourcesPillButton, SourcesPillSheet } from "../SourcesSheet";
import { PILL } from "./canvas-metrics";
import type { SourcePill } from "./canvas-sources";

export function CanvasSourcePills({ pills, testID }: { pills: readonly SourcePill[]; testID?: string }) {
  const [open, setOpen] = useState(false);
  // 🔴 SILENCE, NOT AN EMPTY ROW. An 18pt gap with nothing in it below an answer reads as a
  // section that failed to load. (After the hook, never before it.)
  if (pills.length === 0) return null;
  return (
    <View style={styles.row} testID={testID}>
      <SourcesPillButton dense pills={pills} onPress={() => setOpen(true)} testID={testID ? `${testID}-pill` : undefined} />
      <SourcesPillSheet
        portal
        visible={open}
        onClose={() => setOpen(false)}
        pills={pills}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // `mt-4` above the row, as the web. The pill sizes itself; the row only places it.
  row: { flexDirection: "row", alignItems: "center", marginTop: PILL.rowTop },
});
