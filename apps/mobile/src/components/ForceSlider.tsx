import { memo, useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import type { ThemeColors } from "@/theme/palette";
import { radius, space, type } from "@/theme/tokens";

// Small continuous slider for the phone Graph screen's Gravity/Repulsion
// controls (see graph.tsx). Previously built on PanResponder + an inner
// Pressable thumb — glitchy, because the Pressable was a second touch
// target nested inside the PanResponder's track: RN's classic responder
// system reports `locationX` relative to whichever view the touch is
// CURRENTLY over, so once a drag crossed onto or off the thumb, locationX
// jumped and the value jumped with it.
//
// Rebuilt on ONE react-native-gesture-handler Gesture.Pan() attached
// directly to the track; the thumb is now a plain, non-touchable View, so
// there is no second target to steal the gesture. RNGH's pan event `x` is
// reported relative to the view the gesture is ATTACHED to — the track —
// continuously, for the whole gesture, regardless of which child the
// finger happens to be over. That is what actually fixes the jumpiness
// (not just swapping libraries): there is no page-offset measurement to go
// stale and no nested target to hand touches back and forth with.
// `.runOnJS(true)` runs the gesture's callbacks straight on the JS thread —
// same thread a Pressable's onPress would run on — which is what lets them
// call the plain `onChange` prop directly.

const THUMB = 22;
const TRACK_H = 22;

export interface ForceSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  c: ThemeColors;
}

export const ForceSlider = memo(function ForceSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  c,
}: ForceSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  // The gesture callbacks below read from this ref (refreshed every render)
  // instead of closing over props directly. Gesture.Pan() is rebuilt fresh
  // each render (cheap — RNGH reconciles it onto the same underlying native
  // handler rather than tearing it down), so the closure is normally fresh
  // too; reading through `live` is belt-and-suspenders so a callback still
  // sees current values even if some render's closure outlives its render.
  const live = useRef({ max, min, onChange, step, trackWidth });
  live.current = { max, min, onChange, step, trackWidth };

  const applyAtRatio = useCallback((ratio: number) => {
    const { max: hi, min: lo, onChange: emit, step: gran } = live.current;
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const raw = lo + clampedRatio * (hi - lo);
    const stepped = Math.round(raw / gran) * gran;
    const clamped = Math.min(hi, Math.max(lo, stepped));
    emit(Number(clamped.toFixed(2)));
  }, []);

  // onBegin (not onStart) fires the instant a touch lands, with no
  // activation threshold to clear first — so tapping anywhere on the track
  // jumps the thumb there immediately, matching the old PanResponder's
  // onPanResponderGrant. onUpdate then tracks the finger continuously as it
  // moves, on or off the track. Both handlers read the same `x` — the
  // touch's position relative to the track view — so a tap and a drag use
  // identical math.
  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .hitSlop({ bottom: 12, top: 12 })
    .onBegin((e) => {
      const w = live.current.trackWidth;
      if (w > 0) applyAtRatio(e.x / w);
    })
    .onUpdate((e) => {
      const w = live.current.trackWidth;
      if (w > 0) applyAtRatio(e.x / w);
    });

  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const thumbLeft = Math.max(0, Math.min(trackWidth - THUMB, ratio * trackWidth - THUMB / 2));

  return (
    <View style={sliderStyles.row}>
      <View style={sliderStyles.labelRow}>
        <Text style={[sliderStyles.label, { color: c.text2 }]}>{label}</Text>
        <Text style={[sliderStyles.value, { color: c.text3 }]}>{value.toFixed(1)}×</Text>
      </View>
      <GestureDetector gesture={panGesture}>
        <View
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          accessibilityLabel={label}
          accessibilityRole="adjustable"
          accessibilityValue={{ max, min, now: Number(value.toFixed(2)) }}
          onAccessibilityAction={(event) => {
            const gran = live.current.step;
            const delta = gran / (max - min || 1);
            if (event.nativeEvent.actionName === "increment") applyAtRatio(ratio + delta);
            else if (event.nativeEvent.actionName === "decrement") applyAtRatio(ratio - delta);
          }}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          style={[sliderStyles.track, { backgroundColor: c.surface2 }]}
        >
          <View
            pointerEvents="none"
            style={[sliderStyles.fill, { backgroundColor: c.accentFaint, width: `${ratio * 100}%` }]}
          />
          <View pointerEvents="none" style={[sliderStyles.thumb, { backgroundColor: c.accent, left: thumbLeft }]} />
        </View>
      </GestureDetector>
    </View>
  );
});

const sliderStyles = StyleSheet.create({
  row: { gap: space(1.5) },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...type.micro },
  value: { ...type.micro },
  track: {
    height: TRACK_H,
    borderRadius: radius.pill,
    justifyContent: "center",
    overflow: "hidden",
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  thumb: {
    position: "absolute",
    top: (TRACK_H - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
});
