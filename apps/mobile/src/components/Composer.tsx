import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { ArrowUpIcon, MicIcon, PlusIcon } from "./icons";
import { LiveWaveform } from "./LiveWaveform";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The one composer — a ChatGPT-style card (owner 2026-07-21, "exactly like
// ChatGPT"). Opaque surface card (not glass): ChatGPT's composer is a plain
// white card on a white page, hairline border and all; dark mode gets the same
// card in the dark surface color. The buttons spring on press (owner: smoother
// micro-animations for sending).
//
// TWO LAYOUTS (owner 2026-07-22). The tall two-row card — field alone on top,
// "+" and mic/send on a row beneath — is the EMPTY-chat landing presentation.
// Once a conversation is underway the caller passes `compact` and it collapses
// to a single row ("+", field, mic/send), so the messages own the screen. The
// two heights are exported below; a caller anchoring anything above the
// composer must pick the one matching the layout it rendered.
//
// RECORD MODE (owner 2026-07-22, replacing the Chat/Record pill that briefly
// lived here): record mode is entered from the "+" menu, not from a toggle on
// the card. While it's on, the card shows a "Record ✕" chip — which names the
// mode and is the way back out — beside a waveform of the audio actually
// coming in (components/LiveWaveform.tsx). There's no field, "+" or send
// button in this mode: RecordSession's own control bar drives start/stop/save.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The TALL card's rendered height with a one-line field (top padding 10 + one
 *  21px input line + row gap 4 + the 36px controls row + bottom padding 8 + 2px
 *  of border) — exported so a caller anchoring something ABOVE the composer
 *  (chat.tsx's ComposerPlusMenu) sizes off the same number this card actually
 *  renders at, same precedent as StudyModeMenu.tsx's exported FAB_SIZE. */
export const COMPOSER_PILL_HEIGHT = 81;

/** The COMPACT card's rendered height: 4px top padding + a 36px control row +
 *  4px bottom padding + 2px of border. */
export const COMPOSER_COMPACT_HEIGHT = 46;

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
  compact = false,
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
  /** True while a recording is live or awaiting Save — the chip's ✕ stops
   *  responding to taps so leaving record mode can't strand/destroy it. */
  modeLocked?: boolean;
  /** True only while actually recording — drives the live waveform. */
  recordingActive?: boolean;
  /** Single-row layout. The tall two-row card is the empty-chat landing
   *  presentation; once a conversation is underway the composer shrinks back
   *  to one row so the messages own the screen (owner 2026-07-22). */
  compact?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const canSend = value.trim().length > 0 && !sending;
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

  // Record mode owns the whole card: the chip says what mode you're in and its
  // ✕ is the way out, so there's nothing to type or send here. Record's own
  // control bar (RecordSession) still drives start/stop/save.
  if (isRecordMode) {
    return (
      <View style={styles.card}>
        <View style={styles.recordRow}>
          <Bounce
            style={styles.recordChip}
            onPress={() => onModeChange?.("chat")}
            disabled={modeLocked}
            accessibilityLabel="Leave record mode"
            testID="composer-record-chip"
          >
            <Text style={styles.recordChipLabel}>Record</Text>
            <Text style={[styles.recordChipClose, modeLocked && styles.recordChipCloseOff]}>✕</Text>
          </Bounce>
          <View style={styles.recordWave}>
            <LiveWaveform active={recordingActive} height={22} testID="composer-waveform" />
          </View>
        </View>
      </View>
    );
  }

  const plusButton = (
    <Bounce style={styles.round} onPress={onPlus} disabled={!onPlus} hitSlop={6} accessibilityLabel="New" testID="composer-plus">
      <PlusIcon size={22} color={c.text} strokeWidth={1.9} />
    </Bounce>
  );
  const sendButton = canSend ? (
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
  );
  const field = (
    <TextInput
      ref={inputRef}
      testID={testID}
      style={[styles.input, compact && styles.inputCompact]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.text3}
      multiline
      editable={!sending}
    />
  );

  if (compact) {
    return (
      <View style={[styles.card, styles.cardCompact]}>
        <View style={styles.compactRow}>
          {plusButton}
          {field}
          {sendButton}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {field}
      <View style={styles.controls}>
        {plusButton}
        <View style={styles.trailing}>{sendButton}</View>
      </View>
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
    // One row: "+", field, then mic-or-send. Vertically centered on the field's
    // first line so a growing multi-line draft pushes upward, not the buttons.
    cardCompact: { paddingTop: space(1), paddingBottom: space(1), gap: 0 },
    compactRow: { flexDirection: "row", alignItems: "flex-end", gap: space(1) },
    inputCompact: { flex: 1, paddingBottom: space(1.5), paddingHorizontal: space(1) },
    recordRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(1) },
    recordChip: {
      height: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: space(1.5),
      paddingHorizontal: space(3),
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.accentLine,
      backgroundColor: c.accentFaint,
    },
    recordChipLabel: { fontSize: 13, fontWeight: "600", color: c.accent },
    recordChipClose: { fontSize: 13, fontWeight: "700", color: c.accent },
    // Dimmed, not hidden: while a recording is live the ✕ is deliberately inert
    // so leaving can't silently bin an unsaved transcript.
    recordChipCloseOff: { opacity: 0.4 },
    recordWave: { flex: 1 },
  });
