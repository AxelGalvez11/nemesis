// The Canvas composer — the ChatGPT iOS shape the owner attached, in the app's own colours.
//
// 🔴 TWO ROWS, AND THAT IS DELIBERATELY NOT WHAT THE WEB DOES. The owner asked for two things at
// once — "the canvas does not match the web" and "the composer should match the attached chatgpt
// ios app style, i need the font and sizing to be the same" — and for the composer those pull
// apart. `apps/web/components/workspace/learn/canvas-composer.tsx:677` is a SINGLE row: `+`,
// textarea, mic and send all on one line. The reference is two: the field alone on the first row,
// full width, and the controls beneath it. For the composer the reference wins. Anyone "fixing"
// this back to one row for web parity is undoing the instruction, not honouring it.
//
// 🔴 SHAPE, TYPOGRAPHY AND SIZE ONLY — NEVER COLOUR. Every fill, line and glyph tone below comes
// from `theme/palette.ts` through `useTheme()`. The reference contributes its 26pt corner, its
// two-row arrangement, its 17pt field and its 36/24 controls, and nothing else.
//
// 🔴 EVERY CONTROL ON THIS ROW DOES SOMETHING REAL, AND THAT IS A HARD LINE ON THIS SURFACE.
// `learn.tsx`'s header states it: "a control that renders, accepts a press and does nothing is the
// exact dead-lane shape web removed from this very surface." So —
//   * `+`    opens the system file picker and attaches the text of a real PDF/Word/PowerPoint,
//            which `sendChat` receives as `attachedDoc`.
//   * dial   cycles `lib/chat-effort.ts`'s Instant / Medium / High, which `sendChat` receives as
//            `effort` and genuinely routes on.
//   * mic    is on-device dictation through `hooks/useSpeechInput.ts` — the same hook the Chat
//            composer uses, so a phrase dictated here behaves exactly as one dictated there.
//   * send   is ALWAYS DRAWN, never unmounted. It dims to 0.4 when there is nothing to send. A
//            control that vanishes when it cannot act teaches the learner that the row's layout is
//            unstable; one that dims teaches them what it needs.
//
// 🔴 THE FIELD IS 17/22 AND MUST NOT DROP BELOW 16. `theme/tokens.ts` says no screen writes its
// own `fontSize`; this is a named exemption and `canvas-metrics.ts` carries the reasoning, the
// short version being that mobile Safari zooms the viewport on a focused input under 16px and this
// app has a web build.

import { useCallback, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ArrowUpIcon, CloseIcon, MicIcon, PlusIcon } from "@/components/icons";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { CHAT_EFFORTS, CHAT_EFFORT_LABEL, type ChatEffort } from "@/lib/chat-effort";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

import { COMPOSER } from "./canvas-metrics";
import { DialGlyph, DocumentGlyph } from "./canvas-glyphs";

export interface CanvasComposerProps {
  value: string;
  onChangeText: (next: string) => void;
  onSend: () => void;
  /** A turn is in flight. The field stays editable — the next question can be written while this
   *  one answers — but send is held until it lands. */
  busy: boolean;
  /** The dial's current position, and the cycle. Owned by the screen because it must survive the
   *  composer re-mounting between the landing and the canvas. */
  effort: ChatEffort;
  onEffortChange: (next: ChatEffort) => void;
  /** Opens the file picker. The screen owns the read, because it owns the error copy. */
  onAttach: () => void;
  /** What is currently staged, if anything — the chip above row 1. */
  attachmentTitle?: string | null;
  onClearAttachment?: () => void;
  placeholder?: string;
  /** Reported back so the screen can put the character into its listening state. */
  onListeningChange?: (listening: boolean) => void;
  /** Measured by the screen so the character can dock above the composer as it grows. */
  onLayoutHeight?: (height: number) => void;
  testID?: string;
}

export function CanvasComposer({
  value,
  onChangeText,
  onSend,
  busy,
  effort,
  onEffortChange,
  onAttach,
  attachmentTitle,
  onClearAttachment,
  placeholder = "Ask Nemesis…",
  onListeningChange,
  onLayoutHeight,
  testID = "canvas-composer",
}: CanvasComposerProps) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);

  // 🔴 DICTATION IS MERGED ONTO THE DRAFT, NOT DROPPED ON TOP OF IT. This used to be a bare
  // `onChangeText(transcript)` under a comment claiming it made "the same merge the Chat composer
  // makes" — it did the opposite. `Composer.tsx:273` captures whatever is already typed the moment
  // the mic is tapped and prepends it; without that, tapping the mic halfway through a typed
  // question silently deletes the typed half on the first interim result. Same ref, same rule.
  const dictationBase = useRef("");
  const heard = useCallback(
    (transcript: string) => {
      const base = dictationBase.current;
      onChangeText(base ? `${base} ${transcript}` : transcript);
    },
    [onChangeText],
  );
  const { cancel, listening, start, stop } = useSpeechInput(heard);

  const toggleMic = useCallback(() => {
    if (listening) {
      stop();
      onListeningChange?.(false);
      return;
    }
    dictationBase.current = value.trim();
    void start();
    onListeningChange?.(true);
  }, [listening, onListeningChange, start, stop, value]);

  const canSend = value.trim().length > 0 && !busy;

  const cycleEffort = useCallback(() => {
    const index = CHAT_EFFORTS.indexOf(effort);
    onEffortChange(CHAT_EFFORTS[(index + 1) % CHAT_EFFORTS.length]!);
  }, [effort, onEffortChange]);

  const send = useCallback(() => {
    // 🔴 `cancel()`, NOT `stop()`. This read `stop()` under a comment about not losing the words
    // being spoken as the learner reaches for send — but `useSpeechInput.stop()` deliberately
    // leaves recognition alive so iOS can deliver ONE LAST transcript after the fact (its own
    // doc says so). The screen clears the composer synchronously on send, that late result then
    // arrived and re-populated the field, and the question the learner had just sent reappeared
    // in the box a beat later. `Composer.tsx:291` records the identical bug and the identical
    // fix. Whatever has been heard is already in `value` and is what gets sent; only the trailing
    // fragment is dropped, which is the correct trade.
    if (listening) {
      cancel();
      onListeningChange?.(false);
    }
    dictationBase.current = "";
    onSend();
  }, [cancel, listening, onListeningChange, onSend]);

  const effortLabel = useMemo(() => CHAT_EFFORT_LABEL[effort], [effort]);

  return (
    <View
      style={styles.box}
      testID={testID}
      onLayout={(event) => onLayoutHeight?.(event.nativeEvent.layout.height)}
    >
      {attachmentTitle ? (
        // The staged-material chip. 🔴 A DIFFERENT OBJECT FROM A SOURCE PILL and deliberately a
        // different shell — `canvas-source-pills.tsx`'s own note makes the same point on the web.
        // A source pill is evidence for a claim the answer made; this is a file the learner has
        // handed over and can take back.
        <View style={styles.chip}>
          <DocumentGlyph size={13} color={c.text2} />
          <Text style={styles.chipText} numberOfLines={1}>
            {attachmentTitle}
          </Text>
          <Pressable
            onPress={onClearAttachment}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${attachmentTitle}`}
            testID="canvas-attachment-clear"
          >
            <CloseIcon size={13} color={c.text2} />
          </Pressable>
        </View>
      ) : null}

      {/* ── Row 1: the field, alone, full width. The box grows upward as it wraps. ── */}
      <TextInput
        testID="canvas-input"
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={c.textHint}
        value={value}
        onChangeText={onChangeText}
        multiline
        scrollEnabled
        accessibilityLabel={placeholder}
      />

      {/* ── Row 2: `+` · spacer · dial · mic · send ── */}
      <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [styles.control, pressed && styles.pressed]}
          onPress={onAttach}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
          testID="canvas-attach"
        >
          <PlusIcon size={COMPOSER.glyph} color={c.text2} />
        </Pressable>

        <View style={styles.spacer} />

        <Pressable
          style={({ pressed }) => [styles.control, pressed && styles.pressed]}
          onPress={cycleEffort}
          hitSlop={4}
          accessibilityRole="button"
          // The dial has three positions and no room for a label at 36pt, so the position is
          // spoken rather than drawn. Sighted learners get the same answer from the toast-free
          // route: pressing it changes how the next answer is thought about, and the next answer
          // is the feedback.
          accessibilityLabel={`Thinking: ${effortLabel}. Change.`}
          accessibilityHint="Cycles Instant, Medium and High"
          testID="canvas-effort"
        >
          <DialGlyph size={COMPOSER.glyph} color={effort === "medium" ? c.text2 : c.text} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.control,
            listening && { backgroundColor: c.accent },
            pressed && styles.pressed,
          ]}
          onPress={toggleMic}
          onLongPress={() => {
            if (!listening) return;
            cancel();
            onListeningChange?.(false);
          }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={listening ? "Stop dictating" : "Dictate"}
          testID="canvas-mic"
        >
          <MicIcon size={COMPOSER.glyph} color={listening ? c.onAccent : c.text2} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: canSend ? c.accent : c.surface2, opacity: canSend ? 1 : 0.4 },
            pressed && styles.pressed,
          ]}
          disabled={!canSend}
          onPress={send}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Send"
          testID="canvas-send"
        >
          <ArrowUpIcon size={COMPOSER.sendGlyph} color={canSend ? c.onAccent : c.text3} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    box: {
      marginHorizontal: COMPOSER.marginX,
      // 🔴 26, NOT `radius.pill`. See `canvas-metrics.ts`: a 999 radius tracks the height, so the
      // moment the field wraps the ends stop being round corners and become ovals.
      borderRadius: COMPOSER.radius,
      backgroundColor: c.raised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      paddingHorizontal: COMPOSER.padX,
      paddingTop: COMPOSER.padTop,
      paddingBottom: COMPOSER.padBottom,
    },
    input: {
      // The exemption. 17/22, floor of 16 — see this file's header and `canvas-metrics.ts`.
      fontSize: COMPOSER.fontSize,
      lineHeight: COMPOSER.lineHeight,
      fontWeight: "400",
      color: c.text,
      minHeight: COMPOSER.inputMinHeight,
      maxHeight: COMPOSER.inputMaxHeight,
      paddingHorizontal: COMPOSER.padX,
      paddingTop: 2,
      paddingBottom: 2,
      // 🔴 iOS gives a multiline TextInput its own vertical inset. Left in, the field sits a couple
      // of points low inside a box this shallow and the two rows stop being evenly spaced.
      textAlignVertical: "top",
    },
    controls: {
      flexDirection: "row",
      alignItems: "center",
      gap: COMPOSER.controlGap,
      marginTop: COMPOSER.rowGap,
    },
    spacer: { flex: 1 },
    control: {
      width: COMPOSER.control,
      height: COMPOSER.control,
      borderRadius: COMPOSER.control / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    send: {
      width: COMPOSER.control,
      height: COMPOSER.control,
      borderRadius: COMPOSER.control / 2,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: COMPOSER.sendGap,
    },
    pressed: { opacity: 0.6 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1.5),
      alignSelf: "flex-start",
      maxWidth: 280,
      marginBottom: space(2),
      marginHorizontal: COMPOSER.padX,
      paddingLeft: space(2),
      paddingRight: space(2.5),
      paddingVertical: space(1),
      borderRadius: radius.pill,
      backgroundColor: c.surface2,
    },
    chipText: { fontSize: 12, lineHeight: 16, color: c.text2, flexShrink: 1 },
  });
