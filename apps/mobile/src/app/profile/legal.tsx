import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Card } from "@/components/ui";
import { LEGAL_PRELAUNCH_NOTE, PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal";
import { useCommon } from "@/theme/common";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

// Privacy / Terms — one parameterized route (?doc=). Distinct + deep-linkable; content
// from lib/legal.ts so the sign-in attestation and these screens stay single-sourced.

type Doc = "privacy" | "terms";
const TITLES: Record<Doc, string> = { privacy: "Privacy Policy", terms: "Terms of Service" };

export default function LegalScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const common = useCommon();
  const styles = useThemedStyles(createStyles);
  const doc: Doc = params.doc === "terms" ? "terms" : "privacy";
  const sections = doc === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <ScrollView contentContainerStyle={styles.body} testID={`legal-${doc}`}>
      <Text style={common.h1}>{TITLES[doc]}</Text>

      <Card testID="legal-prelaunch">
        <Text style={styles.note}>{LEGAL_PRELAUNCH_NOTE}</Text>
      </Card>
      {sections.map((s) => (
        <View key={s.heading} style={styles.section}>
          <Text style={styles.heading}>{s.heading}</Text>
          <Text style={styles.para}>{s.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    body: { padding: space(5), gap: space(3), backgroundColor: c.bg, flexGrow: 1 },
    section: { gap: space(1) },
    heading: { fontSize: 15, fontWeight: "700", color: c.text },
    para: { fontSize: 14, lineHeight: 21, color: c.text2 },
    note: { fontSize: 13, lineHeight: 19, color: c.warn, fontStyle: "italic" },
  });
