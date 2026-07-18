import type { RefObject } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { GlassSurface } from "./GlassSurface";
import { ArrowUpIcon, PlusIcon } from "./icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

// The one composer — a single glass pill holding, inline (ChatGPT-style, owner
// call 2026-07-17): a "+" on the left, the text field, and an upward-arrow send
// CIRCLE on the right. No separate "Send" box. The '+' clears/starts fresh when
// onPlus is given; the send circle lights up only when there's text to send.
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

  return (
    <GlassSurface style={styles.pill} variant="clear">
      <Pressable
        style={styles.plus}
        onPress={onPlus}
        disabled={!onPlus}
        hitSlop={6}
        accessibilityLabel="New"
        testID="composer-plus"
      >
        <PlusIcon size={20} color={c.text2} />
      </Pressable>
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
      <Pressable
        style={[styles.send, canSend ? styles.sendOn : styles.sendOff]}
        onPress={canSend ? onSend : undefined}
        disabled={!canSend}
        accessibilityLabel="Send"
        testID="composer-send"
      >
        <ArrowUpIcon size={18} color={canSend ? c.onAccent : c.text3} />
      </Pressable>
    </GlassSurface>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Center everything so the '+' / text / '↑' share one baseline on a single
    // line (owner: they were misaligned). The buttons keep a fixed 36px square;
    // the field's line height + padding are tuned to that height so nothing sits
    // high or low. On multi-line growth the row stays centered.
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
    plus: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    input: {
      flex: 1,
      maxHeight: 120,
      paddingHorizontal: space(1.5),
      paddingVertical: 0,
      lineHeight: 21,
      color: c.text,
      fontSize: 16,
    },
    send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    sendOn: { backgroundColor: c.accent },
    sendOff: { backgroundColor: c.surface2 },
  });
