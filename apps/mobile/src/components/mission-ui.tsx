import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Shared presentational primitives used across the app's screens (Chat, Study,
// Library, Graph, Calendar, Review): an empty-state block, a solid/outline
// button, and a bordered card shell. Colors come from the theme context
// (monochrome + the student's accent, Crimson by default); `space`/`type`/
// `radius` are the static numeric scales from tokens.ts, which carry no color or
// brand identity. (File keeps its mission-ui.tsx name from when missions were
// the app's only screen; the mission-specific StatusPill was retired with the
// missions feature — cloud-first phone, owner call 2026-07-20, see
// docs/design/nemesis-cloud-first-phone-2026-07.md §10.)

/** Card-like container — a bordered/tinted shell used as a list row, prompt
 * card, or result card across screens. */
export function Surface({ children, style, testID }: { children: ReactNode; style?: object; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.surface, style]} testID={testID}>
      {children}
    </View>
  );
}

type ButtonVariant = "primary" | "secondary";

export function MissionButton({
  label,
  onPress,
  variant = "secondary",
  busy = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isPrimary = variant === "primary";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnSecondary,
        (disabled || busy) && styles.btnDisabled,
        pressed && !disabled && !busy && styles.btnPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? c.onAccent : c.text2} size="small" />
      ) : (
        <Text style={[styles.btnText, isPrimary ? styles.btnTextPrimary : styles.btnTextSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function EmptyBlock({ title, body }: { title: string; body?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.empty} testID="missions-empty">
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    surface: {
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.glass,
      borderRadius: radius.sm,
      padding: space(4),
      gap: space(2),
    },

    btn: {
      borderRadius: radius.md,
      paddingVertical: space(3),
      paddingHorizontal: space(4.5),
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    btnPrimary: { backgroundColor: c.accent, borderColor: c.accent },
    btnSecondary: { backgroundColor: "transparent", borderColor: c.line },
    btnDisabled: { opacity: 0.45 },
    btnPressed: { opacity: 0.8 },
    btnText: { ...type.bodyStrong },
    btnTextPrimary: { color: c.onAccent },
    btnTextSecondary: { color: c.text },

    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(8), gap: space(2) },
    emptyTitle: { ...type.title, color: c.text, textAlign: "center" },
    emptyBody: { ...type.small, color: c.text2, textAlign: "center", maxWidth: 320 },
  });
