import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { ArrowUpIcon, MicIcon, PlusIcon } from "./icons";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// The one composer — a ChatGPT-style two-row card (owner 2026-07-21, "exactly
// like ChatGPT"): the text field spans the top row on its own; the controls sit
// on a row below it — "+" bottom-left, and bottom-right EITHER a mic (field
// empty — tap to dictate) OR the upward-arrow send circle (once there's text).
// Opaque surface card (not glass): ChatGPT's composer is a plain white card on
// a white page, hairline border and all; dark mode gets the same card in the
// dark surface color. The buttons spring on press (owner: smoother
// micro-animations for sending).

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

export function Composer({
  value,
  onChangeText,
  onSend,
  onPlus,
  sending = false,
  placeholder,
  inputRef,
  testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPlus?: () => void;
  sending?: boolean;
  placeholder: string;
  inputRef?: RefObject<TextInput | null>;
  testID?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const canSend = value.trim().length > 0 && !sending;

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
      <View style={styles.controls}>
        <Bounce style={styles.round} onPress={onPlus} disabled={!onPlus} hitSlop={6} accessibilityLabel="New" testID="composer-plus">
          <PlusIcon size={22} color={c.text} strokeWidth={1.9} />
        </Bounce>
        {canSend ? (
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
        )}
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
    // "+" pinned left, mic/send pinned right — nothing in between, like the
    // reference (the model chip and voice orb are ChatGPT features we don't have).
    controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    round: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    sendOn: { backgroundColor: c.accent },
    micOn: { backgroundColor: c.accent },
  });
