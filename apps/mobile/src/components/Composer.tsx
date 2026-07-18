import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { Pressable, StyleSheet, TextInput } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { GlassSurface } from "./GlassSurface";
import { ArrowUpIcon, MicIcon, PlusIcon } from "./icons";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

// The one composer — a single glass pill holding, inline (ChatGPT-style): a "+" on
// the left, the text field, and on the right EITHER a mic (when the field is empty
// — tap to dictate) OR the upward-arrow send circle (once there's text). The
// buttons spring on press (owner: smoother micro-animations for sending).

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
    <GlassSurface style={styles.pill} variant="clear">
      <Bounce style={styles.round} onPress={onPlus} disabled={!onPlus} hitSlop={6} accessibilityLabel="New" testID="composer-plus">
        <PlusIcon size={20} color={c.text2} />
      </Bounce>
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
      {canSend ? (
        <Bounce style={[styles.round, styles.sendOn]} onPress={onSend} accessibilityLabel="Send" testID="composer-send">
          <ArrowUpIcon size={18} color={c.onAccent} />
        </Bounce>
      ) : (
        <Bounce
          style={[styles.round, listening ? styles.micOn : styles.micOff]}
          onPress={onMic}
          accessibilityLabel={listening ? "Stop dictation" : "Dictate"}
          testID="composer-mic"
        >
          <MicIcon size={18} color={listening ? c.onAccent : c.text2} />
        </Bounce>
      )}
    </GlassSurface>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Center so the '+' / text / mic-or-send share one baseline on a single line.
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(1),
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: radius.xl,
      paddingHorizontal: space(1),
      paddingVertical: space(1),
    },
    round: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    input: {
      flex: 1,
      maxHeight: 120,
      paddingHorizontal: space(1.5),
      paddingVertical: 0,
      lineHeight: 21,
      color: c.text,
      fontSize: 16,
    },
    sendOn: { backgroundColor: c.accent },
    micOff: { backgroundColor: c.surface2 },
    micOn: { backgroundColor: c.accent },
  });
