import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";
import type { Mission } from "@/api/missions-helpers";

// Presentational primitives for the missions screens ONLY (mission list/composer,
// mission detail). Colors come from the theme context (monochrome + the student's
// accent, Crimson by default); `space`/`type`/`radius` are the static numeric
// scales from tokens.ts, which carry no color or brand identity.

type Tone = "accent" | "accentOutline" | "neutral" | "muted";

function toneForStatus(status: Mission["status"]): Tone {
  switch (status) {
    case "needs_review":
      return "accent";
    case "failed":
      return "accentOutline";
    case "done":
    case "cancelled":
      return "muted";
    default:
      return "neutral"; // queued, claimed, running
  }
}

/** Small status chip. The accent is reserved for the ONE state that needs the
 * student's attention (needs_review = filled, failed = outline); everything
 * else stays neutral/muted so the accent doesn't wash across the screen. */
export function StatusPill({ status, label }: { status: Mission["status"]; label: string }) {
  const styles = useThemedStyles(createStyles);
  const tone = toneForStatus(status);
  const toneStyles: Record<Tone, { box: object; text: object }> = {
    accent: { box: styles.pillAccentBox, text: styles.pillAccentText },
    accentOutline: { box: styles.pillAccentOutlineBox, text: styles.pillAccentOutlineText },
    neutral: { box: styles.pillNeutralBox, text: styles.pillNeutralText },
    muted: { box: styles.pillMutedBox, text: styles.pillMutedText },
  };
  return (
    <View style={[styles.pill, toneStyles[tone].box]}>
      <Text style={[styles.pillText, toneStyles[tone].text]}>{label}</Text>
    </View>
  );
}

/** Card-like container — the mission list row / event feed / result card shell. */
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
    pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
    pillText: { ...type.micro, fontWeight: "600" },
    pillAccentBox: { backgroundColor: c.accent, borderColor: c.accent },
    pillAccentText: { color: c.onAccent },
    pillAccentOutlineBox: { backgroundColor: c.accentFaint, borderColor: c.accentLine },
    pillAccentOutlineText: { color: c.accent },
    pillNeutralBox: { backgroundColor: c.glass, borderColor: c.line },
    pillNeutralText: { color: c.text },
    pillMutedBox: { backgroundColor: "transparent", borderColor: c.lineMuted },
    pillMutedText: { color: c.text2 },

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
