import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { space, type } from "@/theme/tokens";
import tokens from "@/theme/tokens.json";
import type { Mission } from "@/api/missions-helpers";

// Presentational primitives for the missions screens ONLY (mission list/composer,
// mission detail). Colors and radii come exclusively from theme/tokens.json — the
// Nemesis identity (monochrome + one crimson accent) — never from the older
// theme/tokens.ts palette, which is still lime-accented PharmaOrb branding used by
// the evidence screens this app no longer navigates to. `space`/`type` are pulled
// from tokens.ts only for their numeric spacing/font-size scale, which carries no
// color or brand identity.

const { colors, radius } = tokens;

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

/** Small status chip. Crimson is reserved for the ONE state that needs the
 * student's attention (needs_review = filled, failed = outline); everything
 * else stays neutral/muted so the accent doesn't wash across the screen. */
export function StatusPill({ status, label }: { status: Mission["status"]; label: string }) {
  const tone = toneForStatus(status);
  return (
    <View style={[styles.pill, PILL_TONE[tone].box]}>
      <Text style={[styles.pillText, PILL_TONE[tone].text]}>{label}</Text>
    </View>
  );
}

const PILL_TONE: Record<Tone, { box: object; text: object }> = {
  accent: { box: { backgroundColor: colors.accent, borderColor: colors.accent }, text: { color: colors.foreground } },
  accentOutline: { box: { backgroundColor: colors.accentFaint, borderColor: colors.accentBorder }, text: { color: colors.accent } },
  neutral: { box: { backgroundColor: colors.surface, borderColor: colors.border }, text: { color: colors.foreground } },
  muted: { box: { backgroundColor: "transparent", borderColor: colors.mutedBorder }, text: { color: colors.muted } },
};

/** Card-like container — the mission list row / event feed / result card shell. */
export function Surface({ children, style, testID }: { children: ReactNode; style?: object; testID?: string }) {
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
        <ActivityIndicator color={isPrimary ? colors.foreground : colors.muted} size="small" />
      ) : (
        <Text style={[styles.btnText, isPrimary ? styles.btnTextPrimary : styles.btnTextSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function EmptyBlock({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty} testID="missions-empty">
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  pillText: { ...type.micro, fontWeight: "600" },

  surface: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space(4),
    gap: space(2),
  },

  btn: {
    borderRadius: radius.input,
    paddingVertical: space(3),
    paddingHorizontal: space(4.5),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnSecondary: { backgroundColor: "transparent", borderColor: colors.border },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { opacity: 0.8 },
  btnText: { ...type.bodyStrong },
  btnTextPrimary: { color: colors.foreground },
  btnTextSecondary: { color: colors.foreground },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(8), gap: space(2) },
  emptyTitle: { ...type.title, color: colors.foreground, textAlign: "center" },
  emptyBody: { ...type.small, color: colors.muted, textAlign: "center", maxWidth: 320 },
});
