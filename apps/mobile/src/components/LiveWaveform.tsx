import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { subscribeMicLevel } from "@/lib/mic-level";
import { useTheme } from "@/theme/ThemeProvider";

// A waveform that shows the audio ACTUALLY coming in, replacing the canned
// pulse the recorder used to draw. Levels arrive from lib/mic-level.ts (which
// the transcription hook feeds from the speech engine's own volume events).
//
// It scrolls: each new level enters at the right and every older reading
// shifts one bar left, so the strip reads as a history of the last couple of
// seconds rather than a row of bars pulsing in unison. Bars are driven with
// setValue on Animated values — no React state, so a live meter costs the
// screen around it exactly zero re-renders.

const BAR_COUNT = 24;
/** Floor so a silent room still shows a thin line of bars rather than an
 *  empty gap that reads as "broken". */
const MIN_SCALE = 0.12;

export function LiveWaveform({
  active,
  height = 22,
  color,
  testID,
}: {
  /** False parks the strip flat — a frozen pattern would imply live audio. */
  active: boolean;
  height?: number;
  color?: string;
  testID?: string;
}) {
  const { colors: c } = useTheme();
  const scales = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(MIN_SCALE))).current;
  const history = useRef<number[]>(Array.from({ length: BAR_COUNT }, () => MIN_SCALE)).current;

  useEffect(() => {
    if (!active) {
      history.fill(MIN_SCALE);
      for (const scale of scales) scale.setValue(MIN_SCALE);
      return;
    }
    return subscribeMicLevel((level) => {
      history.shift();
      history.push(MIN_SCALE + level * (1 - MIN_SCALE));
      for (let i = 0; i < scales.length; i += 1) scales[i].setValue(history[i]);
    });
  }, [active, history, scales]);

  return (
    <View style={[styles.row, { height }]} testID={testID}>
      {scales.map((scale, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              backgroundColor: color ?? c.accent,
              height,
              opacity: active ? 1 : 0.4,
              transform: [{ scaleY: scale }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 3 },
  bar: { flex: 1, borderRadius: 2, maxWidth: 4 },
});
