import { StyleSheet } from "react-native";
import { radius, space, type } from "./tokens";
import type { ThemeColors } from "./palette";
import { useThemedStyles } from "./ThemeProvider";

// Shared screen styles, themed: screens call `useCommon()` (and
// `placeholderColor(c)` for TextInput placeholders, which RN can't put in a
// StyleSheet). The factory shape is the app-wide conversion pattern — see
// ThemeProvider.useThemedStyles.
export const createCommonStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, padding: space(6), gap: space(3), backgroundColor: c.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(3), backgroundColor: c.bg },
    h1: { ...type.h1, color: c.text },
    sub: { ...type.small, color: c.text2 },
    body: { fontSize: 15, lineHeight: 22, color: c.text2 },
    input: {
      width: "100%",
      maxWidth: 360,
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: radius.sm,
      paddingHorizontal: space(3),
      paddingVertical: space(2.75),
      fontSize: 16,
      color: c.text,
      backgroundColor: c.surface,
    },
    btn: {
      backgroundColor: c.accent,
      paddingHorizontal: space(5),
      paddingVertical: space(3),
      borderRadius: radius.sm,
      alignSelf: "flex-start",
    },
    btnText: { color: c.onAccent, fontWeight: "600", fontSize: 16 },
    link: { color: c.accentDim, fontSize: 15 },
    linkBtn: { paddingVertical: space(2) },
    err: { color: c.danger },
  });

export function useCommon() {
  return useThemedStyles(createCommonStyles);
}

/** Placeholder color for TextInputs styled with `common.input`. */
export function placeholderColor(c: ThemeColors): string {
  return c.text3;
}
