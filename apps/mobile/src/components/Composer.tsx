import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { ArrowUpIcon, CloseIcon, MicIcon, PlusIcon } from "./icons";
import { LiveWaveform } from "./LiveWaveform";
import { composerAction } from "@/lib/composer-send";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

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
// NO INTELLIGENCE DIAL. Instant/Medium/High used to be a bare text label in the
// trailing cluster, just left of the mic. It is gone (owner 2026-07-31: "remove
// the 'instant, medium, high' because thats not necessary for the app") and so
// is the menu it opened. The routing behind it is untouched — every turn now
// simply goes at the default level; see the caller.
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
  accessibilityHint,
  testID,
  hitSlop,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: object | object[];
  accessibilityLabel: string;
  /** For a control whose consequence is not obvious from its label — Stop, whose
   *  label cannot say "and anything already saved stays saved". */
  accessibilityHint?: string;
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
      accessibilityHint={accessibilityHint}
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

/** The sound-wave glyph on the round accent button that ENTERS record mode.
 *
 *  FOUR bars, symmetric, tallest in the middle, thick with round caps — matched
 *  to ChatGPT's voice button from the owner's side-by-side (2026-07-31: "change
 *  the recording icon to be similar to chatgpt"). It used to be five thin bars
 *  with a DIP in the middle, which is the shape of an audio meter at rest rather
 *  than of speech, and at 20pt the extra bar just made it look busy next to the
 *  same-sized mic beside it.
 *
 *  Local to this file rather than added to the shared icon set, same rule the
 *  other one-off glyphs here follow. */
function WaveGlyph({ size = 20, color }: { size?: number; color: string }) {
  const bars: [number, number][] = [
    [6.5, 3.5],
    [10, 7],
    [14, 7],
    [17.5, 3.5],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {bars.map(([x, reach]) => (
        <Line key={x} x1={x} y1={12 - reach} x2={x} y2={12 + reach} stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** Filled dot — "start recording", the universal record glyph. Sized to fill
 *  most of its circle: a smaller dot on the quiet surface button read as a
 *  disabled control rather than an invitation. */
/** The accept tick on the dictation bar — a plain check, drawn here rather
 *  than pulled from icons.tsx for the same reason the record glyphs are. */
function CheckGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="m5 12.5 4.5 4.5L19 7" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

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
  attachment,
  attached = false,
  onStop,
  onCardLayout,
  chip,
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
  /** What is riding this turn — the photo tile or the attached-note pill. It
   *  renders INSIDE the card, above the text field, which is where ChatGPT puts
   *  it and where the owner asked for it (2026-07-30: an attachment sitting
   *  above the composer "does not actually go into the composer"). */
  attachment?: ReactNode;
  /** The CARD's own height, reported on every layout.
   *
   *  A host that measures the composer's outer block gets a number that also
   *  contains the block's padding, the landing's starter rows, and whatever
   *  the attachment slot is holding — fine for reserving scroll space, useless
   *  for lining anything up with the card itself. chat.tsx needs the latter: it
   *  starts the bottom blur half way down this card. */
  onCardLayout?: (height: number) => void;
  /** True when that attachment is actually riding the next turn. It is what
   *  makes an EMPTY box sendable: a photograph is a question by itself, and
   *  with only the typed text consulted the send button never appeared, so the
   *  picture could not be sent at all (owner 2026-07-30). Passed separately
   *  from `attachment` because the chip outlives the turn it went with — it
   *  lingers to offer "Save to Library" — and a lingering chip must not make an
   *  empty box look sendable. */
  attached?: boolean;
  /** Cancel the turn in flight. Wire it and the send button becomes a Stop square
   *  while `sending` — without it the button just goes inert, which is what the
   *  phone did before (owner 2026-07-30: "there is also no pause button for once
   *  it begins thinking and doing"). */
  onStop?: () => void;
  /** A capability staged on the next submission (Course, Deep research, …) — the composer's own
   *  §38 chip, rendered INSIDE the card at the start of the text row (unlike `attachment`,
   *  which gets its own slot above the field: a capability is a fact about the WORDS, a
   *  photo/note is a thing the words are about). LearnHome.tsx (the front door) is the first
   *  caller; wire it from `ComposerPlusMenu`'s `capabilities.onSelect`. */
  chip?: { label: string; onRemove: () => void };
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // The three-way decision lives in lib/composer-send.ts, tested. It used to be
  // one inline `value.trim().length > 0` here, and that expression is what made
  // an attached photo unsendable — see that file's header.
  const action = composerAction(value, { attached, sending });
  // 🔴 A STAGED CHIP NEEDS WORDS BEFORE IT CAN SEND — the web's own §38 rule ("a declaration
  // about words needs the words"), held here rather than left to whatever screen renders a
  // chip. Unlike `attached`, a chip never makes an EMPTY box sendable by itself; it only ever
  // narrows what typed words already made sendable. So the button still APPEARS (never falls
  // back to the record circle) but stays disabled until there is something typed.
  const chipBlocksSend = Boolean(chip) && value.trim().length === 0;
  const hasDraft = action !== "record" || Boolean(chip);
  const canSend = action === "send" && !chipBlocksSend;
  const isRecordMode = mode === "record";

  // Voice dictation: the transcript is merged onto whatever was already typed when
  // the mic was tapped (captured in dictationBase), so speaking adds to your draft
  // rather than clobbering it.
  const dictationBase = useRef("");
  const { cancel, listening, start, stop, transcript } = useSpeechInput((heard) => {
    const base = dictationBase.current;
    onChangeText(base ? `${base} ${heard}` : heard);
  });
  const onMic = () => {
    if (listening) {
      stop();
      return;
    }
    dictationBase.current = value.trim();
    void start();
  };
  /** Throw away what was dictated and put the draft back as it was. The
   *  cancel half of the listening bar — without it, the only way out of
   *  dictation was to accept whatever it had heard and delete it by hand. */
  const cancelDictation = () => {
    // cancel(), not stop(): stop() asks the engine for one last transcript, and
    // that late result used to land after the draft had been restored — the
    // abandoned sentence reappeared a beat later and Cancel did the same thing
    // as Done. See useSpeechInput's cancelledRef.
    cancel();
    onChangeText(dictationBase.current);
  };

  // Record mode's own control bar: start/stop on the left, a quiet state label
  // in the middle, and the way out on the right. The live audio is visualized
  // once, at full size, by RecordSession above this composer.
  if (isRecordMode) {
    // modeLocked and recordingActive together name all three session states:
    // idle (neither), recording (both), reviewable (locked, not active). The
    // record button is live for the first two — start, then stop — and inert
    // in the third, where re-starting would clobber a transcript that hasn't
    // been saved yet. That decision belongs to RecordSession's Save/Discard.
    const recordDisabled = modeLocked && !recordingActive;
    return (
      <View style={[styles.card, styles.cardCompact]} onLayout={(e) => onCardLayout?.(e.nativeEvent.layout.height)}>
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
            <Text style={styles.recordStatus} numberOfLines={1}>
              {recordingActive ? "Recording" : modeLocked ? "Ready to save" : "Ready"}
            </Text>
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

  // DICTATION IS ITS OWN STATE (owner 2026-07-24: "dictation should show like
  // ChatGPT or whisper flow"). It used to be a mic button that turned accent
  // while words appeared in the text field — so there was no live answer that
  // the phone was hearing you, and no way to abandon a mis-heard sentence
  // except to accept it and delete it by hand. Both of those apps replace the
  // composer with a listening bar; this does the same, in the shape record mode
  // already established: cancel on the left, what it is hearing across the
  // middle, accept on the right.
  if (listening) {
    return (
      <View style={[styles.card, styles.cardCompact]} onLayout={(e) => onCardLayout?.(e.nativeEvent.layout.height)}>
        <View style={styles.recordRow}>
          <Bounce
            style={styles.round}
            onPress={cancelDictation}
            hitSlop={6}
            accessibilityLabel="Cancel dictation"
            testID="composer-dictate-cancel"
          >
            <CloseIcon size={18} color={c.text} strokeWidth={2.4} />
          </Bounce>
          <View style={styles.dictateMiddle}>
            {/* Real levels, from the speech engine's own volumechange events
                (see useSpeechInput) — the same waveform the recorder draws. */}
            <LiveWaveform state="live" height={20} testID="composer-dictate-waveform" />
            {/* The words so far, so a mis-hear is visible before you accept it.
                One line: this is a glance, not a transcript viewer. */}
            <Text style={styles.dictateText} numberOfLines={1}>
              {transcript || "Listening…"}
            </Text>
          </View>
          <Bounce
            style={[styles.round, styles.sendOn]}
            onPress={stop}
            hitSlop={6}
            accessibilityLabel="Done dictating"
            testID="composer-dictate-done"
          >
            <CheckGlyph color={c.onAccent} />
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
  // Mid-flight the button becomes STOP, and pressing it cancels the turn. That is
  // the whole affordance the phone was missing: once a turn was away the student
  // could only watch, even when they could already see it had misunderstood them.
  // Falls back to an inert spinner when no onStop is wired (every non-chat caller).
  const stopping = action === "sending" && Boolean(onStop);
  const sendOrRecordButton = hasDraft ? (
    <Bounce
      // 🔴 DIMMED WHENEVER IT IS GENUINELY DISABLED, not only mid-flight. This used to read
      // `action === "sending" && !stopping`, which is exactly `disabled` below with one case
      // missing: a chip staged over an empty box is `disabled` (see `chipBlocksSend`) but was
      // never dimmed, so the arrow looked pressable while doing nothing.
      style={[styles.round, styles.sendOn, !canSend && !stopping && styles.controlOff]}
      onPress={stopping ? onStop : canSend ? onSend : undefined}
      disabled={!canSend && !stopping}
      accessibilityLabel={stopping ? "Stop" : "Send"}
      accessibilityHint={stopping ? "Stops this answer. Anything already saved stays saved." : undefined}
      testID={stopping ? "composer-stop" : "composer-send"}
    >
      {/* Waiting shows HERE, on the button that was pressed — never as an overlay
          on the photo tile. A spinner on the picture reads as "this is already
          being analysed", which is precisely what the owner objected to
          (2026-07-30): nothing is read out of a photograph until they send it. */}
      {stopping ? (
        <StopGlyph size={16} color={c.onAccent} />
      ) : action === "sending" ? (
        <ActivityIndicator color={c.onAccent} size="small" />
      ) : (
        <ArrowUpIcon size={18} color={c.onAccent} />
      )}
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
  // The staged capability, at the START of the text row — inside the card, unlike
  // `attachment`'s own slot above the field (see the prop's own doc comment for why: a
  // capability is a fact about the WORDS, not a thing riding alongside them). Removed with
  // its own ✕ rather than Backspace-at-caret-zero (the web's gesture): the phone's field has
  // no reliable "caret is at position 0" signal without wiring selection tracking for a
  // control this small, and a visible × costs one tap.
  const chipPill = chip ? (
    <View style={styles.chipPill} testID="composer-chip">
      <Text style={styles.chipLabel} numberOfLines={1}>
        {chip.label}
      </Text>
      <Pressable onPress={chip.onRemove} hitSlop={8} accessibilityLabel={`Remove ${chip.label}`} testID="composer-chip-remove">
        <CloseIcon size={11} color={c.onAccent} />
      </Pressable>
    </View>
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

  // ONE TREE FOR BOTH LAYOUTS, and the field always sits at the same position
  // in it. This looks like a roundabout way to write two layouts, and the
  // reason is a real bug it caused (owner 2026-07-23: "the chat page doesnt
  // allow keyboard to go up"): `compact` follows the KEYBOARD now, so the
  // layout flips at the exact moment focus arrives. When these were two
  // separate return trees, React unmounted the focused TextInput and mounted a
  // fresh one — focus was lost, and the keyboard dropped as fast as it rose.
  //
  // The null slots below are load-bearing: React reconciles unkeyed children by
  // INDEX, so a null still holds its place and `field` stays child 2 either
  // way (chip added a slot ahead of it — still a fixed index, still null when
  // idle), which is what keeps the field mounted (and focused) across the
  // switch. The buttons remounting is harmless, so the tall layout renders its
  // own copies rather than contorting the tree to move them.
  return (
    <View
      style={[styles.card, compact && styles.cardCompact]}
      onLayout={(e) => onCardLayout?.(e.nativeEvent.layout.height)}
    >
      {/* ALWAYS rendered, null when there is nothing attached. React reconciles
          unkeyed children by index, and a slot that appeared and disappeared
          would shift the row below it — the same index bookkeeping the comment
          above describes, one level up. */}
      {attachment ? <View style={styles.attachmentSlot}>{attachment}</View> : null}
      {/* `styles.textRow` in the tall layout is new alongside the chip: the row used to be
          `undefined` (a bare column with one child, `field`, filled by default stretch) because
          nothing ever sat beside it. A chip needs a row to sit beside `field` IN, in both
          layouts, so the tall form gets an explicit row now too — see `input`'s own flex:1. */}
      <View style={compact ? styles.compactRow : styles.textRow}>
        {compact ? plusButton : null}
        {chipPill}
        {field}
        {/* Siblings, not wrapped in `trailing` — the compact row's own gap is
            what the shipped spacing was verified at, and `trailing` carries a
            wider one meant for the tall layout. */}
        {compact ? micButton : null}
        {compact ? sendOrRecordButton : null}
      </View>
      {compact ? null : (
        <View style={styles.controls}>
          {plusButton}
          <View style={styles.trailing}>
            {micButton}
            {sendOrRecordButton}
          </View>
        </View>
      )}
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
    // The attachment sits INSIDE the card, above the field. Its own bottom
    // margin rather than the card's `gap`, which is zero in the compact layout
    // and would leave the tile flush against the text.
    attachmentSlot: { marginBottom: space(1.5), paddingHorizontal: space(1), paddingTop: space(0.5) },
    input: {
      // flex:1/minWidth:0 so the field is what gives way in a ROW — both layouts wrap it in
      // one now (see `textRow`/`compactRow`), where it used to rely on plain column stretch
      // in the tall form. Harmless in the tall form even with no chip: a lone flex:1 child
      // fills the row exactly as stretch filled the column.
      flex: 1,
      minWidth: 0,
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
    round: { width: control.md, height: control.md, borderRadius: control.md / 2, alignItems: "center", justifyContent: "center" },
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
    // The tall layout's own row — see the JSX comment above `textRow`'s use. Top-aligned
    // (not "flex-end" like the compact row) so a staged chip sits level with the first line
    // of the field rather than sinking to match a multi-line draft's LAST line.
    textRow: { flexDirection: "row", alignItems: "flex-start" },
    // minWidth:0 lets the field be the thing that gives way as the row fills —
    // without it a long draft pushes the row wider than the card and the
    // trailing buttons drift off the edge.
    inputCompact: { flex: 1, minWidth: 0, paddingBottom: space(1.5), paddingHorizontal: space(1) },
    // The staged-capability chip — a small tinted pill at the head of the text row (§38: a
    // one-shot declaration, same visual family as an accent-filled control). `accentDim`
    // rather than `accent` itself: full accent here would compete with the send button for
    // "the one thing that's really the primary action" on a card that already has one.
    //
    // No `alignSelf` here on purpose — it takes whichever `alignItems` the row it lands in
    // sets (`textRow`'s flex-start or `compactRow`'s flex-end). The chip is TALLER than the
    // field's single-line height (its own vertical padding plus a 17.5pt line beats the
    // field's bare 21pt line), so `alignSelf:"center"` here would centre the chip inside a row
    // whose cross-size the chip itself set — a no-op that leaves the field's own flex-start
    // text sitting visibly above the chip's middle. Sharing the row's own alignment keeps both
    // starting from the same edge instead.
    chipPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1),
      marginRight: space(1.5),
      paddingVertical: space(0.75),
      paddingHorizontal: space(2.5),
      borderRadius: radius.pill,
      backgroundColor: c.accentDim,
    },
    chipLabel: { ...type.micro, color: c.onAccent, fontWeight: "600" },
    recordRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: space(1) },
    // The waveform takes the field's slot — it is what you watch while
    // recording, so it gets all the room the two buttons don't.
    recordWave: { flex: 1, alignItems: "center" },
    recordStatus: { ...type.small, color: c.text3, fontWeight: "500" },
    // The dictation bar's middle: waveform over the words it has heard.
    dictateMiddle: { flex: 1, justifyContent: "center", gap: 2 },
    dictateText: { ...type.micro, color: c.text3 },
  });
