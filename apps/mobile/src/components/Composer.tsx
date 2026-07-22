import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
// Plain RN Animated (aliased — reanimated's default export below already
// claims the name `Animated`) drives the record-mode waveform's looping
// stagger; Reanimated's shared values drive Bounce's spring-on-press. Two
// animation systems in one file, on purpose — the waveform is a background
// loop with no gesture to respond to, exactly the "RN Animated" the owner
// spec called for, not the press-responsive job Reanimated is doing above it.
import { Animated as RNAnimated, Easing, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { ArrowUpIcon, ChevronIcon, MicIcon, PlusIcon } from "./icons";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The one composer — a ChatGPT-style two-row card (owner 2026-07-21, "exactly
// like ChatGPT"): the text field spans the top row on its own; the controls sit
// on a row below it — "+" bottom-left, and bottom-right EITHER a mic (field
// empty — tap to dictate) OR the upward-arrow send circle (once there's text).
// Opaque surface card (not glass): ChatGPT's composer is a plain white card on
// a white page, hairline border and all; dark mode gets the same card in the
// dark surface color. The buttons spring on press (owner: smoother
// micro-animations for sending).
//
// Chat/Record mode pill (owner 2026-07-21, "chat/recorder toggle from the
// webapp"): mirrors web's composer.tsx ModePill — a small bordered pill at
// the controls row's bottom-right, just left of the send/mic circle, that
// flips between "Chat" and "Record". Only rendered when a caller wires
// `onModeChange` (chat.tsx does; notebook.tsx's composer calls don't, so its
// two Composer usages render exactly as before — no pill, no layout change).
// In record mode the field is replaced by a decorative waveform strip; the
// "+" and send/mic circle both disappear (nothing to attach or send while
// recording — Record's own control bar, not this composer, drives
// start/stop/save). The waveform row (21px) and the mode pill (36px, same
// height as the round buttons) are sized so the card's TOTAL height is
// identical in both modes — see COMPOSER_PILL_HEIGHT below, which stays
// accurate without any mode-conditional math.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The card's own rendered height when the field holds one line (top padding 10
 *  + one 21px input line + row gap 4 + the 36px controls row + bottom padding 8
 *  + 2px of border) — exported so a caller anchoring something ABOVE the
 *  composer (chat.tsx's ComposerPlusMenu) sizes off the same number this card
 *  actually renders at, same precedent as StudyModeMenu.tsx's exported FAB_SIZE. */
export const COMPOSER_PILL_HEIGHT = 81;

// A press target that springs down slightly on touch and back on release — reanimated
// on the UI thread, so it stays smooth regardless of JS-thread load.
function Bounce({
  onPress,
  disabled,
  style,
  accessibilityLabel,
  testID,
  hitSlop,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: object | object[];
  accessibilityLabel: string;
  testID?: string;
  hitSlop?: number;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const spring = { damping: 13, stiffness: 380 };
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPressIn={() => {
        scale.value = withSpring(0.85, spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, spring);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

export type ComposerMode = "chat" | "record";

export function Composer({
  value,
  onChangeText,
  onSend,
  onPlus,
  sending = false,
  placeholder,
  inputRef,
  testID,
  mode = "chat",
  onModeChange,
  modeLocked = false,
  recordingActive = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPlus?: () => void;
  sending?: boolean;
  placeholder: string;
  inputRef?: RefObject<TextInput | null>;
  testID?: string;
  /** "chat" (default) or "record". Only chat.tsx drives this away from the
   *  default today — every other caller gets the classic single-mode card. */
  mode?: ComposerMode;
  /** Wiring this in is what turns the mode pill on (see file-header note). */
  onModeChange?: (mode: ComposerMode) => void;
  /** True while a recording is live or awaiting Save — the pill stops
   *  responding to taps so flipping modes can't strand/destroy it. */
  modeLocked?: boolean;
  /** True only while actually recording — pulses the waveform strip. */
  recordingActive?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const canSend = value.trim().length > 0 && !sending;
  const showModePill = !!onModeChange;
  const isRecordMode = mode === "record";

  // Voice dictation: the transcript is merged onto whatever was already typed when
  // the mic was tapped (captured in dictationBase), so speaking adds to your draft
  // rather than clobbering it.
  const dictationBase = useRef("");
  const { listening, start, stop } = useSpeechInput((transcript) => {
    const base = dictationBase.current;
    onChangeText(base ? `${base} ${transcript}` : transcript);
  });
  const onMic = () => {
    if (listening) {
      stop();
      return;
    }
    dictationBase.current = value.trim();
    void start();
  };

  return (
    <View style={styles.card}>
      {isRecordMode ? (
        <WaveformStrip active={recordingActive} />
      ) : (
        <TextInput
          ref={inputRef}
          testID={testID}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.text3}
          multiline
          editable={!sending}
        />
      )}
      <View style={styles.controls}>
        {isRecordMode ? null : (
          <Bounce style={styles.round} onPress={onPlus} disabled={!onPlus} hitSlop={6} accessibilityLabel="New" testID="composer-plus">
            <PlusIcon size={22} color={c.text} strokeWidth={1.9} />
          </Bounce>
        )}
        <View style={styles.trailing}>
          {showModePill && (
            <Bounce
              style={styles.modePill}
              onPress={() => onModeChange?.(isRecordMode ? "chat" : "record")}
              disabled={modeLocked}
              accessibilityLabel={isRecordMode ? "Switch to Chat mode" : "Switch to Record mode"}
              testID="composer-mode-pill"
            >
              <Text style={styles.modeLabel}>{isRecordMode ? "Record" : "Chat"}</Text>
              <View style={styles.modeChevron}>
                <ChevronIcon size={10} color={c.text} strokeWidth={2} />
              </View>
            </Bounce>
          )}
          {!isRecordMode &&
            (canSend ? (
              <Bounce style={[styles.round, styles.sendOn]} onPress={onSend} accessibilityLabel="Send" testID="composer-send">
                <ArrowUpIcon size={18} color={c.onAccent} />
              </Bounce>
            ) : (
              <Bounce
                style={[styles.round, listening && styles.micOn]}
                onPress={onMic}
                accessibilityLabel={listening ? "Stop dictation" : "Dictate"}
                testID="composer-mic"
              >
                <MicIcon size={20} color={listening ? c.onAccent : c.text} />
              </Bounce>
            ))}
        </View>
      </View>
    </View>
  );
}

const WAVEFORM_BARS = 24;

/** Decorative strip that replaces the text field in record mode (owner spec:
 *  "a row of ~24 short rounded bars"). Idle: static, low opacity. Active:
 *  each bar loops opacity+scaleY on a staggered delay via plain RN Animated
 *  (useNativeDriver — 24 concurrent loops cost nothing once handed to the
 *  native thread). Purely decorative — no testID, per the repo convention of
 *  testIDs on interactive elements only. */
function WaveformStrip({ active }: { active: boolean }) {
  const styles = useThemedStyles(createStyles);
  const anims = useRef(Array.from({ length: WAVEFORM_BARS }, () => new RNAnimated.Value(0))).current;

  useEffect(() => {
    if (!active) {
      anims.forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
      return;
    }
    const loops = anims.map((value, index) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay((index % 8) * 70),
          RNAnimated.timing(value, { duration: 260, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true }),
          RNAnimated.timing(value, { duration: 260, easing: Easing.inOut(Easing.quad), toValue: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, anims]);

  return (
    <View style={styles.waveform}>
      {anims.map((value, index) => {
        const baseHeight = 5 + ((index * 7) % 13);
        return (
          <RNAnimated.View
            key={index}
            style={[
              styles.waveBar,
              { height: baseHeight },
              active
                ? {
                    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                    transform: [{ scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
                  }
                : styles.waveBarIdle,
            ]}
          />
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Two rows: the field alone on top, the "+" / mic-or-send row underneath —
    // ChatGPT's card geometry (rounded ~26, hairline border, opaque surface).
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 26,
      paddingHorizontal: space(2),
      paddingTop: space(2.5),
      paddingBottom: space(2),
      gap: space(1),
    },
    input: {
      maxHeight: 120,
      paddingHorizontal: space(2),
      paddingVertical: 0,
      lineHeight: 21,
      color: c.text,
      fontSize: type.small.fontSize + 1,
    },
    // "+" pinned left (omitted entirely in record mode); `trailing`'s own
    // marginLeft:"auto" pins the pill/mic/send group right regardless — NOT
    // justifyContent:"space-between" on this row, which degenerates to
    // flex-start with only one child (record mode has no "+" to pair against).
    controls: { flexDirection: "row", alignItems: "center" },
    round: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    sendOn: { backgroundColor: c.accent },
    micOn: { backgroundColor: c.accent },
    // Mode pill + send/mic circle, grouped so they sit adjacent at the row's
    // right edge (owner spec: pill "to the LEFT of the send/mic circle").
    trailing: { flexDirection: "row", alignItems: "center", gap: space(1.5), marginLeft: "auto" },
    // Same 36px height as `round` so the controls row's height — and so
    // COMPOSER_PILL_HEIGHT — doesn't shift between chat and record mode.
    modePill: {
      height: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: space(1),
      paddingHorizontal: space(2.5),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.line,
    },
    modeLabel: { fontSize: 13, fontWeight: "600", color: c.text },
    // ChevronIcon points right by default; rotated to point down, read as a
    // "pick one of two" affordance rather than a disclosure/expand arrow.
    modeChevron: { transform: [{ rotate: "90deg" }] },
    // Same 21px as `input`'s lineHeight so record mode's row matches chat
    // mode's row exactly — see the file-header note on COMPOSER_PILL_HEIGHT.
    waveform: { height: 21, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space(2) },
    waveBar: { width: 3, borderRadius: 1.5, backgroundColor: c.text },
    waveBarIdle: { opacity: 0.25 },
  });
