import { StyleSheet, View } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";

// A soft blur behind the iOS status bar (time / wifi / battery) so content scrolling
// underneath it never clashes with the clock and signal glyphs. The blur is strongest
// right under the status bar and fades smoothly to fully clear a little below — a vertical
// alpha gradient (SVG) masks the BlurView, so the page reads "clear → blurry" toward the
// top exactly as the owner asked. Rendered once, globally, above screen content but below
// the TopBar's own glass controls; never intercepts touches.
//
// Uses only modules already in the app — expo-blur, react-native-svg, and MaskedView
// (which react-navigation already ships) — so it changes no native code and rides the
// over-the-air update lane. `intensity` on the BlurView is the peak strength at the top.
//
// Owner call 2026-07-18: taller + stronger so it clearly backs the TopBar's centered title
// (the chat name especially) as messages scroll under it, and the fade is more gradual. The
// fade stays FULLY solid through the status-bar inset itself (so the clock/wifi never lose
// their backing), then eases to clear over the extra span below — solidStop is computed from
// the live inset so the hand-off lands right at the bottom of the status bar on every device.
const FADE_EXTRA = 46; // points below the status-bar inset over which the blur eases to clear

export function StatusBarBlur({ intensity = 52 }: { intensity?: number }) {
  const insets = useSafeAreaInsets();
  const { resolvedMode } = useTheme();
  const inset = Math.max(insets.top, 20);
  const height = inset + FADE_EXTRA;
  // Hold full strength through the status bar, then start the gradual fade just below it.
  const solidStop = Math.min(0.72, inset / height);
  const tint: BlurTint = resolvedMode === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight";

  return (
    <View style={[styles.host, { height }]} pointerEvents="none">
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="statusFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset={String(solidStop)} stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#statusFade)" />
          </Svg>
        }
      >
        <BlurView tint={tint} intensity={intensity} style={StyleSheet.absoluteFill} />
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex sits above scrolling content but below the TopBar (rendered after it).
  host: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5 },
});
