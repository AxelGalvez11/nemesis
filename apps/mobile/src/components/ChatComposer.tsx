import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { AskMode } from "@nemesis/shared";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, shadow, space, type } from "@/theme/tokens";

// The bottom composer — the rounded input with the Fast/Thorough mode pill and the accent send button.
// Mirrors the web composer's dial; tapping the pill toggles Fast <-> Thorough.
export function ChatComposer({
  value, onChangeText, onSend, busy, mode, onToggleMode,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  busy: boolean;
  mode: AskMode;
  onToggleMode: () => void;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const canSend = value.trim().length >= 3 && !busy;
  return (
    <View style={styles.box}>
      <TextInput
        testID="ask-input"
        style={styles.input}
        placeholder="Ask about a drug, dose, or interaction…"
        placeholderTextColor={c.text3}
        multiline
        maxLength={500}
        value={value}
        onChangeText={onChangeText}
        editable={!busy}
      />
      <View style={styles.tools}>
        <View style={styles.plusBtn}>
          <View style={styles.plusH} />
          <View style={styles.plusV} />
        </View>
        <Pressable style={styles.pill} onPress={onToggleMode} hitSlop={6} accessibilityLabel={`Mode: ${mode}`}>
          <Text style={styles.pillIcon}>{mode === "fast" ? "⚡" : "✦"}</Text>
          <Text style={styles.pillText}>{mode === "fast" ? "Fast" : "Thorough"}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          testID="ask-submit"
          style={[styles.send, shadow.accent, { shadowColor: c.accent }, !canSend && styles.sendOff]}
          disabled={!canSend}
          onPress={onSend}
          accessibilityLabel="Send"
        >
          <Text style={styles.sendArrow}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    box: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line2, borderRadius: radius.xl, padding: space(3.25), paddingBottom: space(2.5), ...shadow.raise },
    input: { color: c.text, fontSize: type.small.fontSize, lineHeight: 22, minHeight: 24, maxHeight: 130, paddingTop: 2, paddingHorizontal: space(1) },
    tools: { flexDirection: "row", alignItems: "center", gap: space(2.25), marginTop: space(2.5) },
    plusBtn: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg2, alignItems: "center", justifyContent: "center" },
    plusH: { position: "absolute", width: 13, height: 1.8, borderRadius: 2, backgroundColor: c.text2 },
    plusV: { position: "absolute", width: 1.8, height: 13, borderRadius: 2, backgroundColor: c.text2 },
    pill: { flexDirection: "row", alignItems: "center", gap: space(1.5), borderWidth: 1, borderColor: c.line2, backgroundColor: c.bg2, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
    pillIcon: { color: c.accent, fontSize: type.micro.fontSize },
    pillText: { color: c.text, ...type.small, fontWeight: "600" },
    send: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
    sendOff: { opacity: 0.4 },
    sendArrow: { color: c.onAccent, fontSize: 20, fontWeight: "800", lineHeight: 22 },
  });
