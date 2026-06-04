import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

// Small presentational primitives shared across the drug page + source viewer. The
// full doc-13 design system (tokens, dark mode, type scale) is fleshed out in 6b-5;
// these keep 6b-2 cohesive without scattering inline styles.

export function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

/** Full-screen centered container for the load/auth/not-found states (shared by the
 * id-keyed screens so the doc-06 state shells aren't duplicated). */
export function Centered({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <View style={styles.centered} testID={testID}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, testID }: { title: string; testID?: string }) {
  return (
    <Text style={styles.sectionHeader} testID={testID}>
      {title}
    </Text>
  );
}

export function Chip({ label, testID }: { label: string; testID?: string }) {
  return (
    <View style={styles.chip} testID={testID}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

type BadgeTone = "neutral" | "strong" | "moderate" | "weak";

export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: BadgeTone; testID?: string }) {
  return (
    <View style={[styles.badge, TONE[tone]]} testID={testID}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const TONE: Record<BadgeTone, { backgroundColor: string }> = {
  neutral: { backgroundColor: "#5b6470" },
  strong: { backgroundColor: "#1f8b4c" },
  moderate: { backgroundColor: "#b8860b" },
  weak: { backgroundColor: "#b04632" },
};

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    borderWidth: 1,
    borderColor: "#dfe3e8",
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: "#fbfcfd",
  },
  sectionHeader: { fontSize: 20, fontWeight: "700", marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#c7d0da",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "#eef2f6",
  },
  chipText: { fontSize: 13, color: "#33404f" },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  badgeText: { color: "#fff", fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
});
