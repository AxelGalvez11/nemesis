import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "@/components/ui";
import { LEGAL_PRELAUNCH_NOTE, PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal";
import { useCommon } from "@/theme/common";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

// Privacy / Terms — one parameterized route (?doc=). Distinct + deep-linkable; content
// from lib/legal.ts so the sign-in attestation and these screens stay single-sourced.

type Doc = "privacy" | "terms";
const TITLES: Record<Doc, string> = { privacy: "Privacy Policy", terms: "Terms of Service" };

export default function LegalScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const common = useCommon();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const doc: Doc = params.doc === "terms" ? "terms" : "privacy";
  const sections = doc === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <ScrollView
      contentContainerStyle={[styles.body, { paddingTop: insets.top + space(2), paddingBottom: insets.bottom + space(5) }]}
      testID={`legal-${doc}`}
    >
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
        hitSlop={10}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Back to Settings"
        testID="legal-back"
      >
        <Text style={styles.backText}>‹ Settings</Text>
      </Pressable>
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
    back: { alignSelf: "flex-start", paddingVertical: space(1) },
    backText: { ...type.small, color: c.accent, fontWeight: "600" },
    section: { gap: space(1) },
    heading: { fontSize: type.small.fontSize, fontWeight: "700", color: c.text },
    para: { fontSize: type.small.fontSize, lineHeight: 21, color: c.text2 },
    note: { fontSize: type.micro.fontSize, lineHeight: 19, color: c.warn, fontStyle: "italic" },
  });
