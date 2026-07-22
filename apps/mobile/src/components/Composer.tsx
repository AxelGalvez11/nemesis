import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { ArrowUpIcon, CloseIcon, MicIcon, PlusIcon } from "./icons";
import { EffortLabel } from "./ComposerEffortMenu";
import { LiveWaveform } from "./LiveWaveform";
import type { ChatEffort } from "@/lib/chat-effort";
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
// RECORD MODE (owner 2026-07-22, second pass — this replaced BOTH the original
// Chat/Record toggle pill AND the "+"-menu row that briefly took its place).
// Record now lives on the composer itself, laid out like ChatGPT's voice
// button, and the composer is the ONLY control surface for it:
//
//   chat, empty   "+"        field     Medium · mic · (∿) enter record
//   chat, draft   "+"        field     Medium · mic · (↑) send
//   record mode   (●) start  live waveform        · (✕) leave record
//
// Every transformation the owner asked for is in that table: the round accent
// button swaps its wave glyph for an ✕ to escape, "+" becomes the record
// start/stop control, and the field's slot is taken by a waveform of the audio
// ACTUALLY coming in (LiveWaveform, fed by lib/mic-level.ts). In record mode
// the dictation mic steps aside — you are already talking to the microphone.
//
// The mic holds its own slot in BOTH chat rows (owner 2026-07-22, "also add
// dictation to the chat composer"): it used to hand that slot to Send and so
// disappeared the instant you typed. Only the LAST slot swaps now, between
// Send and record — never both at once, since two accent-filled circles side
// by side read as one control split in half.
//
// The Instant/Medium/High intelligence dial is the BARE TEXT label in the
// trailing cluster, just left of the mic — the owner's reference screenshot
// (2026-07-22) puts it exactly there. It has moved twice: three rows inside the
// "+" menu, then a bordered pill left of the field, now this. The label renders
// here; ComposerEffortMenu.tsx explains why its dropdown belongs to the caller.
//
// The accent circle is ACCENT-colored, never a hardcoded green — it follows
// whatever swatch the student picked in Appearance settings (owner
// 2026-07-22: "it shouldn't be strictly green, only if chosen in appearance
// settings").
//
// Record mode is ONE row in both layouts — there is no field to stack above
// it, so `compact` doesn't apply. RecordSession.tsx keeps only the decision
// that can't live on a one-row bar: Save vs Discard once there's a transcript.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The TALL card's rendered height with a one-line field (top padding 10 + one
 *  21px input line + row gap 4 + the 36px controls row + bottom padding 8 + 2px
 *  of border) — exported so a caller anchoring something ABOVE the composer
 *  (chat.tsx's ComposerPlusMenu) sizes off the same number this card actually
 *  renders at, same precedent as StudyModeMenu.tsx's exported FAB_SIZE. */
export const COMPOSER_PILL_HEIGHT = 81;

/** The COMPACT card's rendered height: 4px top padding + a 36px control row +
 *  4px bottom padding + 2px of border. Record mode renders at this height too
 *  (it reuses the compact card's padding). */
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

/** The sound-wave glyph on the round accent button that ENTERS record mode —
 *  five bars of mixed height, the same shorthand ChatGPT's voice button uses.
 *  Local to this file rather than added to the shared icon set, same rule the
 *  other one-off glyphs here follow. */
function WaveGlyph({ size = 20, color }: { size?: number; color: string }) {
  const bars: [number, number][] = [
    [5, 5],
    [9, 8],
    [12, 3],
    [15, 8],
    [19, 5],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {bars.map(([x, reach]) => (
        <Line key={x} x1={x} y1={12 - reach} x2={x} y2={12 + reach} stroke={color} strokeWidth={2} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** Filled dot — "start recording", the universal record glyph. Sized to fill
 *  most of its circle: a smaller dot on the quiet surface button read as a
 *  disabled control rather than an invitation. */
function RecordDotGlyph({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="8.5" fill={color} />
    </Svg>
  );
}

/** Filled rounded square — "stop", shown once a recording is running. */
function StopGlyph({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="7" y="7" width="10" height="10" rx="2.5" fill={color} />
    </Svg>
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
  onRecordToggle,
  modeLocked = false,
  recordingActive = false,
  compact = false,
  effort,
  effortMenuOpen = false,
  onEffortToggle,
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
  /** Wiring this in is what turns the round record button on (see the file
   *  header's layout table). Without it there is nothing to enter, so the
   *  button doesn't render at all. */
  onModeChange?: (mode: ComposerMode) => void;
  /** Starts the recording, or stops a running one — the "+"-slot button in
   *  record mode. The host owns which of the two it means (it holds the
   *  session state); this card only picks the glyph. */
  onRecordToggle?: () => void;
  /** True while a recording is live OR stopped-but-unsaved — the ✕ stops
   *  responding so leaving record mode can't strand/destroy a transcript. */
  modeLocked?: boolean;
  /** True only while actually recording — drives the live waveform and swaps
   *  the record button's glyph to "stop". */
  recordingActive?: boolean;
  /** Single-row layout. The tall two-row card is the empty-chat landing
   *  presentation; once a conversation is underway the composer shrinks back
   *  to one row so the messages own the screen (owner 2026-07-22). Ignored in
   *  record mode, which is one row either way. */
  compact?: boolean;
  /** The Instant/Medium/High level to show on the pill. Pair it with
   *  onEffortToggle — without BOTH, no pill renders (every non-chat caller). */
  effort?: ChatEffort;
  /** Whether the caller's EffortPopup is currently showing — only spins the
   *  pill's chevron; the menu itself is the caller's to render. */
  effortMenuOpen?: boolean;
  onEffortToggle?: () => void;
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

  // Record mode's own control bar: start/stop on the left, what the microphone
  // is hearing across the middle, and the way out on the right.
  if (isRecordMode) {
    // modeLocked and recordingActive together name all three session states:
    // idle (neither), recording (both), reviewable (locked, not active). The
    // record button is live for the first two — start, then stop — and inert
    // in the third, where re-starting would clobber a transcript that hasn't
    // been saved yet. That decision belongs to RecordSession's Save/Discard.
    const recordDisabled = modeLocked && !recordingActive;
    return (
      <View style={[styles.card, styles.cardCompact]}>
        <View style={styles.recordRow}>
          <Bounce
            style={[styles.round, styles.recordToggle, recordingActive && styles.recordToggleOn, recordDisabled && styles.controlOff]}
            onPress={onRecordToggle}
            disabled={recordDisabled || !onRecordToggle}
            hitSlop={6}
            accessibilityLabel={recordingActive ? "Stop recording" : "Start recording"}
            testID="composer-record-toggle"
          >
            {recordingActive ? <StopGlyph color={c.onAccent} /> : <RecordDotGlyph color={c.danger} />}
          </Bounce>
          <View style={styles.recordWave}>
            <LiveWaveform active={recordingActive} height={22} testID="composer-waveform" />
          </View>
          {/* Same round accent button that entered record mode, now wearing an
              ✕ (owner 2026-07-22) — one button, one place, both directions. */}
          <Bounce
            style={[styles.round, styles.recordCircle, modeLocked && styles.controlOff]}
            onPress={() => onModeChange?.("chat")}
            disabled={modeLocked}
            hitSlop={6}
            accessibilityLabel="Leave record mode"
            testID="composer-record-exit"
          >
            <CloseIcon size={18} color={c.onAccent} strokeWidth={2.4} />
          </Bounce>
        </View>
      </View>
    );
  }

  const plusButton = (
    <Bounce style={styles.round} onPress={onPlus} disabled={!onPlus} hitSlop={6} accessibilityLabel="New" testID="composer-plus">
      <PlusIcon size={22} color={c.text} strokeWidth={1.9} />
    </Bounce>
  );
  // The intelligence level, as bare text just left of the mic — the owner's
  // reference screenshot puts it there, in the trailing cluster, not on the
  // left beside "+" where it spent one revision. The menu it opens is the
  // CALLER's to render, at the screen root; see ComposerEffortMenu.tsx.
  const effortLabel = effort && onEffortToggle ? (
    <EffortLabel effort={effort} open={effortMenuOpen} onToggle={onEffortToggle} />
  ) : null;
  // Dictation is ALWAYS on the card (owner 2026-07-22: "also add dictation to
  // the chat composer"). It used to share the trailing slot with Send and so
  // vanished the moment you typed a character — which is exactly when someone
  // reaching for it has already given up on typing. It now holds its own slot
  // in every state; only its FILL changes, going accent while listening.
  const micButton = (
    <Bounce
      style={[styles.round, listening && styles.micOn]}
      onPress={onMic}
      hitSlop={6}
      accessibilityLabel={listening ? "Stop dictation" : "Dictate"}
      testID="composer-mic"
    >
      <MicIcon size={20} color={listening ? c.onAccent : c.text} />
    </Bounce>
  );
  // The last slot is whichever action the draft calls for: Send once there's
  // something to send, otherwise the record entry point — ChatGPT's voice
  // button in the same spot (owner reference crop, 2026-07-22). They SWAP
  // rather than stack, because both are accent-filled and two accent circles
  // side by side read as one control split in half. Record only appears where
  // record mode is actually wired up; other callers just get Send-or-nothing.
  const sendOrRecordButton = canSend ? (
    <Bounce style={[styles.round, styles.sendOn]} onPress={onSend} accessibilityLabel="Send" testID="composer-send">
      <ArrowUpIcon size={18} color={c.onAccent} />
    </Bounce>
  ) : onModeChange ? (
    <Bounce
      style={[styles.round, styles.recordCircle]}
      onPress={() => onModeChange("record")}
      hitSlop={6}
      accessibilityLabel="Record"
      testID="composer-record"
    >
      <WaveGlyph color={c.onAccent} />
    </Bounce>
  ) : null;
  const field = (
    <TextInput
      ref={inputRef}
      testID={testID}
      style={[styles.input, compact && styles.inputCompact]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      // Gray on purpose (owner 2026-07-22) — one of only two exceptions to the
      // flat pure-black/white text, since a placeholder at full strength reads
      // as a message the student already typed.
      placeholderTextColor={c.textHint}
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
          {effortLabel}
          {micButton}
          {sendOrRecordButton}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {field}
      <View style={styles.controls}>
        {plusButton}
        <View style={styles.trailing}>
          {effortLabel}
          {micButton}
          {sendOrRecordButton}
        </View>
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
    // "+" pinned left; `trailing`'s own marginLeft:"auto" pins the mic/send +
    // record group right regardless — NOT justifyContent:"space-between" on
    // this row, which would degenerate to flex-start if the row ever held a
    // single child again.
    controls: { flexDirection: "row", alignItems: "center" },
    round: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    sendOn: { backgroundColor: c.accent },
    micOn: { backgroundColor: c.accent },
    // The record circle — ACCENT-filled, so it is whatever color Appearance
    // settings is set to and never a hardcoded green (owner 2026-07-22).
    // Wears the wave glyph entering record mode and an ✕ leaving it.
    recordCircle: { backgroundColor: c.accent },
    // Start/stop sits in the "+" slot in record mode: a quiet surface circle
    // holding the red record dot, which fills with accent once running so
    // "recording" reads from across the room.
    recordToggle: { backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
    recordToggleOn: { backgroundColor: c.accent, borderColor: c.accent },
    // Dimmed, not hidden: an inert control that vanished would read as a bug,
    // and both of these go inert only to protect an unsaved transcript.
    controlOff: { opacity: 0.4 },
    // Send/mic circle + the record circle, grouped so they sit adjacent at the
    // row's right edge.
    trailing: { flexDirection: "row", alignItems: "center", gap: space(1.5), marginLeft: "auto" },
    // One row: "+", field, then mic-or-send and the record circle. Vertically
    // centered on the field's first line so a growing multi-line draft pushes
    // upward, not the buttons.
    cardCompact: { paddingTop: space(1), paddingBottom: space(1), gap: 0 },
    compactRow: { flexDirection: "row", alignItems: "flex-end", gap: space(1) },
    // minWidth:0 lets the field be the thing that gives way as the row fills —
    // without it a long draft pushes the row wider than the card and the
    // trailing buttons drift off the edge.
    inputCompact: { flex: 1, minWidth: 0, paddingBottom: space(1.5), paddingHorizontal: space(1) },
    recordRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(1) },
    // The waveform takes the field's slot — it is what you watch while
    // recording, so it gets all the room the two buttons don't.
    recordWave: { flex: 1 },
  });
