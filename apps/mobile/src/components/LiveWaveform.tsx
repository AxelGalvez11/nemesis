import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, type LayoutChangeEvent, StyleSheet, View } from "react-native";
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
//
// THREE STATES, NOT TWO (owner 2026-08-01: "make the recording mode in chat
// have grayed waveform thats active and dynamic, when user begins actually
// recording the waveform should switch to blue for 'on'"). A flat strip waiting
// for a tap looks like a broken meter, so "armed" moves too — but it must not
// be mistaken for audio, so it moves in grey and in a shape no room ever makes:
// one smooth sine walking left to right.
//
// ⚠️ AND YES, THAT IS THE CANNED PULSE THIS FILE'S FIRST PARAGRAPH SAYS WAS
// REMOVED. It is back for the ARMED state only, where there is nothing to
// meter — the mic is not running, so subscribeMicLevel has nothing to deliver.
// While recording, the bars are still real audio and nothing but real audio.
// Do not "restore consistency" by animating the live state too.

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
/** One pass of the armed wave from end to end. Slow: this is a resting state,
 *  and a quick idle animation reads as activity. */
const ARMED_PERIOD_MS = 2600;
/** How tall the armed wave gets. Deliberately well under a real voice peak so
 *  the two states are never confusable at a glance. */
const ARMED_AMPLITUDE = 0.3;
/** Sample points around the armed wave. Twelve is smooth enough that the
 *  interpolation's straight segments do not read as corners. */
const ARMED_STEPS = 12;

/**
 * What the strip is doing.
 *
 *  - "live" — the mic is running; bars are real levels.
 *  - "armed" — ready but not capturing; the grey resting wave.
 *  - "off" — nothing to say; flat.
 */
export type WaveformState = "off" | "armed" | "live";

export function LiveWaveform({
  state,
  height = 22,
  color,
  idleColor,
  testID,
}: {
  state: WaveformState;
  height?: number;
  /** The "on" colour, used only while live. */
  color?: string;
  /** The resting colour, used while armed or off. */
  idleColor?: string;
  testID?: string;
}) {
  const { colors: c } = useTheme();
  const [barCount, setBarCount] = useState(INITIAL_BARS);
  const live = state === "live";
  const armed = state === "armed";

  // Re-allocated whenever the measured bar count changes (i.e. once per real
  // layout). Animated values live here rather than in state so metering never
  // re-renders the tree.
  const scales = useMemo(
    () => Array.from({ length: barCount }, () => new Animated.Value(MIN_SCALE)),
    [barCount],
  );
  const history = useMemo(() => Array.from({ length: barCount }, () => MIN_SCALE), [barCount]);
  // ONE driving value for the whole armed wave, rather than one per bar: each
  // bar reads it at its own offset (see armedScales), so a strip of forty bars
  // costs exactly one running animation.
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!live) {
      history.fill(MIN_SCALE);
      for (const scale of scales) scale.setValue(MIN_SCALE);
      return;
    }
    return subscribeMicLevel((level) => {
      history.shift();
      history.push(MIN_SCALE + level * (1 - MIN_SCALE));
      for (let i = 0; i < scales.length; i += 1) scales[i].setValue(history[i]);
    });
  }, [live, history, scales]);

  useEffect(() => {
    if (!armed) {
      phase.stopAnimation();
      phase.setValue(0);
      return;
    }
    // Native driver: scaleY is one of the transforms the native animation
    // module can own outright, so the resting wave runs without waking
    // JavaScript once a second for the whole time a student is deciding whether
    // to start recording.
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: ARMED_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [armed, phase]);

  /**
   * The armed wave, as one interpolation per bar off the shared phase.
   *
   * Each bar samples the same sine a little further along (`i / barCount`),
   * which is what turns a row of bars pulsing in unison into a shape that
   * travels. The curve closes on itself — sin is the same at t and t+1 — so the
   * loop has no seam to see.
   */
  const armedScales = useMemo(() => {
    if (!armed) return null;
    const inputRange = Array.from({ length: ARMED_STEPS + 1 }, (_, step) => step / ARMED_STEPS);
    return Array.from({ length: barCount }, (_, bar) =>
      phase.interpolate({
        inputRange,
        outputRange: inputRange.map(
          (t) => MIN_SCALE + ARMED_AMPLITUDE * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t + bar / barCount))),
        ),
      }),
    );
  }, [armed, barCount, phase]);

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    // How many (bar + gap) units fit; the trailing bar needs no gap after it.
    const next = Math.max(MIN_BARS, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
    setBarCount((prev) => (prev === next ? prev : next));
  };

  const tint = live ? (color ?? c.accent) : (idleColor ?? c.text3);

  return (
    <View style={[styles.row, { height }]} onLayout={onLayout} testID={testID}>
      {scales.map((scale, index) => (
        <Animated.View
          // Keyed on the state as well as the index: a bar's scaleY is a
          // NATIVE-driven interpolation while armed and a JavaScript-set value
          // while live, and an Animated node cannot switch which side owns it in
          // place. Remounting on the transition is the supported way across.
          key={`${state}:${index}`}
          style={[
            styles.bar,
            {
              backgroundColor: tint,
              height,
              opacity: state === "off" ? 0.4 : 1,
              transform: [{ scaleY: armedScales ? armedScales[index] : scale }],
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
