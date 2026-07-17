import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Small presentational primitives shared across the chat answer, drug page + source viewer.
// Dark theme (PharmaOrb tokens) — ported to match the web app.

export function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

/** Full-screen centered container for the load/auth/not-found states. */
export function Centered({ children, testID }: { children: ReactNode; testID: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.centered} testID={testID}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, testID }: { title: string; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Text style={styles.sectionHeader} testID={testID}>
      {title}
    </Text>
  );
}

export function Chip({ label, testID }: { label: string; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.chip} testID={testID}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

type BadgeTone = "neutral" | "strong" | "moderate" | "weak";

export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: BadgeTone; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  const toneStyles = useThemedStyles(createTone);
  return (
    <View style={[styles.badge, toneStyles[tone].box]} testID={testID}>
      <Text style={[styles.badgeText, toneStyles[tone].text]}>{label}</Text>
    </View>
  );
}

// Tinted, low-saturation chips that read on near-black (vs the old solid fills).
const createTone = (c: ThemeColors): Record<BadgeTone, { box: object; text: object }> => ({
  neutral: { box: { backgroundColor: c.surface2, borderColor: c.line2 }, text: { color: c.text2 } },
  strong: { box: { backgroundColor: "rgba(126,224,129,0.12)", borderColor: "rgba(126,224,129,0.4)" }, text: { color: c.good } },
  moderate: { box: { backgroundColor: c.warnFaint, borderColor: c.warnLine }, text: { color: c.warn } },
  weak: { box: { backgroundColor: c.dangerFaint, borderColor: c.dangerLine }, text: { color: c.danger } },
});

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), backgroundColor: c.bg },
    card: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.md,
      padding: space(4),
      gap: space(2),
      backgroundColor: c.surface,
    },
    sectionHeader: { ...type.title, color: c.text, marginTop: space(2) },
    chip: {
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: radius.pill,
      paddingHorizontal: space(3),
      paddingVertical: space(1.25),
      backgroundColor: c.surface2,
    },
    chipText: { ...type.small, color: c.text2 },
    badge: { borderRadius: 7, borderWidth: 1, paddingHorizontal: space(2.5), paddingVertical: space(1), alignSelf: "flex-start" },
    badgeText: { fontSize: 12.5, fontWeight: "700", textTransform: "capitalize" },
  });
