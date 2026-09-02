import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { CloseIcon, SearchIcon } from "@/components/icons";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The "…" menu's "Find in chat" row (item 6): a search field appears under the header;
// canvas.tsx filters `rows` by it and shows the × to clear/close. No result count or
// next/previous stepper yet — the reference has one, but turn-level filtering (this slice's
// whole result — hide non-matching turns rather than scroll to a match inside one) doesn't
// need it to be useful.
export function CanvasFindBar({
  value,
  onChangeText,
  onClose,
  top,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
  top: number;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.wrap, { top }]} testID="canvas-find-bar">
      <SearchIcon size={16} color={c.text2} strokeWidth={1.8} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Find in chat"
        placeholderTextColor={c.textHint}
        autoFocus
        returnKeyType="search"
        testID="canvas-find-input"
      />
      <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close find" testID="canvas-find-close">
        <CloseIcon size={14} color={c.text2} />
      </Pressable>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: "absolute",
      left: space(3),
      right: space(3),
      flexDirection: "row",
      alignItems: "center",
      gap: space(2),
      height: 40,
      paddingHorizontal: space(3),
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
      zIndex: 11,
    },
    input: { ...type.small, color: c.text, flex: 1, padding: 0 },
  });
