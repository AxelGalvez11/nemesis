import { useEffect, useMemo, useState } from "react";
import { Animated, type LayoutChangeEvent, StyleSheet, View } from "react-native";
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
//
// Width (owner 2026-07-23: "the waveform analyzer should be the full width of
// the chat composer but not clash with other icons"): the strip fills whatever
// horizontal space its parent gives it. The composer already hands it a
// flex:1 middle slot between the two round buttons, so "full width" = fill that
// slot edge-to-edge. Rather than a fixed 24 bars that topped out ~165pt and
// left dead space on the right, we MEASURE the slot on layout and render
// exactly as many 3pt bars as fit — denser on a big phone, fewer on a small
// one, always flush.

/** Fallback bar count for the first frame, before onLayout has measured the
 *  real width. Replaced immediately once the slot's width is known. */
const INITIAL_BARS = 24;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
/** Never collapse to a sliver of bars even in a very narrow slot. */
const MIN_BARS = 8;
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
  const [barCount, setBarCount] = useState(INITIAL_BARS);

  // Re-allocated whenever the measured bar count changes (i.e. once per real
  // layout). Animated values live here rather than in state so metering never
  // re-renders the tree.
  const scales = useMemo(
    () => Array.from({ length: barCount }, () => new Animated.Value(MIN_SCALE)),
    [barCount],
  );
  const history = useMemo(() => Array.from({ length: barCount }, () => MIN_SCALE), [barCount]);

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

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    // How many (bar + gap) units fit; the trailing bar needs no gap after it.
    const next = Math.max(MIN_BARS, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
    setBarCount((prev) => (prev === next ? prev : next));
  };

  return (
    <View style={[styles.row, { height }]} onLayout={onLayout} testID={testID}>
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
  row: { flexDirection: "row", alignItems: "center", gap: BAR_GAP },
  // flex:1 with no maxWidth: the derived bar count already targets ~BAR_WIDTH
  // per bar, and flex absorbs any rounding remainder so the strip lands exactly
  // flush to both edges of its slot.
  bar: { flex: 1, borderRadius: 2 },
});
