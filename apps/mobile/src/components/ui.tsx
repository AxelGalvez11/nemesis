import type { ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { evidenceGradeColor, onColor, radius, space, type, useTheme } from "@/theme";

// Shared presentational primitives, theme-aware (doc-13 design system). Geometry
// lives in the static StyleSheet; every COLOR comes from the active theme so these
// adapt to light/dark and a rebrand touches only the theme. Card/Centered/
// SectionHeader/Chip/Badge keep their original signatures — 10 screens import them.

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export function Card({
  children,
  testID,
  style,
}: {
  children: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: t.color.surface, borderColor: t.color.border },
        t.shadow.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Full-screen centered container for load/auth/not-found states. */
export function Centered({ children, testID }: { children: ReactNode; testID: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.centered, { backgroundColor: t.color.background }]}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function SectionHeader({ title, testID }: { title: string; testID?: string }) {
  const t = useTheme();
  return (
    <Text testID={testID} style={[type.h2, { color: t.color.text, marginTop: space[2] }]}>
      {title}
    </Text>
  );
}

export function Chip({ label, testID }: { label: string; testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.chip, { backgroundColor: t.color.surfaceAlt, borderColor: t.color.border }]}>
      <Text style={[type.bodySm, { color: t.color.textMuted }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Badges — `tone` kept for back-compat; `grade` opts into the evidence palette.
// ---------------------------------------------------------------------------

type BadgeTone = "neutral" | "strong" | "moderate" | "weak";

export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: BadgeTone; testID?: string }) {
  const t = useTheme();
  const bg = {
    neutral: t.color.textSubtle,
    strong: t.color.success,
    moderate: t.color.warning,
    weak: t.color.danger,
  }[tone];
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: onColor(bg) }]}>{label}</Text>
    </View>
  );
}

/** Evidence-grade badge — colored by the doc-09 grade via the theme grade map. */
export function EvidenceBadge({ grade, label, testID }: { grade: string; label?: string; testID?: string }) {
  const t = useTheme();
  const bg = evidenceGradeColor(t, grade);
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: onColor(bg) }]}>{label ?? grade.replace(/_/g, " ")}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  fullWidth = false,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<ButtonVariant, string> = {
    primary: t.color.primary,
    secondary: t.color.surfaceAlt,
    ghost: "transparent",
    danger: t.color.danger,
  };
  const fg: Record<ButtonVariant, string> = {
    primary: t.color.inverseText,
    secondary: t.color.text,
    ghost: t.color.primary,
    danger: "#FFFFFF",
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        fullWidth && styles.btnFull,
        variant === "secondary" && { borderWidth: 1, borderColor: t.color.border },
        { backgroundColor: bg[variant] },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <Text style={[type.bodyStrong, styles.btnText, { color: fg[variant] }]}>{title}</Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export function Input({
  value,
  onChangeText,
  label,
  error,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  testID,
  onSubmitEditing,
  returnKeyType,
}: {
  value: string;
  onChangeText: (v: string) => void;
  label?: string;
  error?: string | null;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences";
  autoComplete?: "email" | "password" | "new-password" | "off";
  testID?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: "next" | "done" | "go";
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.color.danger : focused ? t.color.focusRing : t.color.inputBorder;

  return (
    <View style={styles.field}>
      {label ? <Text style={[type.label, styles.fieldLabel, { color: t.color.textMuted }]}>{label}</Text> : null}
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
        style={[
          styles.input,
          type.body as TextStyle,
          { backgroundColor: t.color.inputBg, borderColor, color: t.color.text },
          focused && { borderWidth: 1.5 },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.color.placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
      />
      {error ? <Text style={[type.caption, { color: t.color.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: space[6] },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space[3],
    paddingVertical: space[1] + 1,
    alignSelf: "flex-start",
  },
  badge: { borderRadius: radius.sm, paddingHorizontal: space[2] + 2, paddingVertical: space[1], alignSelf: "flex-start" },
  badgeText: { color: "#FFFFFF", fontSize: 12, lineHeight: 16, fontWeight: "700", textTransform: "capitalize" },
  btn: {
    minHeight: 50,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnFull: { alignSelf: "stretch", width: "100%" },
  btnText: { textAlign: "center" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  field: { gap: space[1] + 2, alignSelf: "stretch" },
  fieldLabel: { textTransform: "uppercase" },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3] + 2, paddingVertical: space[3] },
});
