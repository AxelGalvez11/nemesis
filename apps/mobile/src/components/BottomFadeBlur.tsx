import { StyleSheet, View } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";

// The bottom half of StatusBarBlur, flipped (owner 2026-07-23: "in chats,
// remove the bottom border and replace with a fade to blur"). The chat used to
// stop dead at the composer — the message list ended on a hard horizontal edge,
// which is the "border" the owner means; nothing was drawn there, the cut
// itself was the line. Now the transcript runs to the bottom of the screen and
// dissolves into a blur under the composer, the same way it already dissolves
// under the status bar at the top.
//
// Same recipe as StatusBarBlur.tsx, and deliberately so — one visual language
// for both edges: a BlurView masked by a vertical alpha gradient (SVG), using
// only modules the app already ships (expo-blur, react-native-svg, MaskedView),
// so it changes no native code and rides the over-the-air update lane. Never
// takes touches; the composer sits on top of it.
//
// The gradient runs the other way from the top one: FULLY CLEAR at the top,
// easing to solid over `FADE_SPAN`, then solid the rest of the way down so the
// band behind the composer is evenly backed.

/** Points over which the blur eases in above the composer. Shorter than the top
 *  blur's span on purpose (owner 2026-07-23: "the bottom fade to blur should be
 *  lower") — a smaller ramp keeps the fade hugging the composer near the very
 *  bottom edge and leaves more of the transcript crisp above it.
 *
 *  EXPORTED because a scroll view under this has to reserve it: text that came
 *  to rest inside the ramp would sit there permanently washed out. Callers pad
 *  their content by the composer's height PLUS this, so at the end of a scroll
 *  the last line stops just clear of the fade and only passes through it while
 *  the list is actually moving. */
export const BOTTOM_FADE_SPAN = 28;

export function BottomFadeBlur({ height, intensity = 52 }: { height: number; intensity?: number }) {
  const { resolvedMode } = useTheme();
  const total = Math.max(1, height + BOTTOM_FADE_SPAN);
  // Where the ease-in finishes: everything below this offset is full strength.
  const solidStop = Math.min(0.95, BOTTOM_FADE_SPAN / total);
  const tint: BlurTint = resolvedMode === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight";

  return (
    <View style={[styles.host, { height: total }]} pointerEvents="none" testID="bottom-fade-blur">
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
                <Stop offset={String(solidStop)} stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="1" stopColor="#ffffff" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#bottomFade)" />
          </Svg>
        }
      >
        <BlurView tint={tint} intensity={intensity} style={StyleSheet.absoluteFill} />
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  // No zIndex on purpose. Stacking here is pure TREE ORDER — the caller renders
  // this after its scroll view and before its composer, which puts it between
  // the two on iOS (which paints siblings in order) and on web (where both this
  // and the composer are positioned, so the later one wins). A zIndex would
  // also lift it over the screen's bottom SHEETS, which are positioned and
  // rendered earlier, and it has no business covering those.
  host: { position: "absolute", bottom: 0, left: 0, right: 0 },
});
