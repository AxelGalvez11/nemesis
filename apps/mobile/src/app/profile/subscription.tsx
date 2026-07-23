import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Subscription — its own page (owner call), pushed from the Settings sheet. Shows
// the current plan and what Nemesis Pro adds. No in-app purchase CTA yet: App
// Store rules require Apple IAP for digital subscriptions (external buy links get
// rejected), so this stays informational until IAP is wired.

const FREE_INCLUDES = [
  "Cloud chat with citations",
  "Library, Study & Calendar in your account — same on phone and web",
  "Flashcards, notes & the knowledge graph",
];

const PRO_ADDS = [
  "Higher daily usage limits",
  "Priority answers",
  "Private Vault (end-to-end encrypted library)",
];

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.root} testID="subscription-screen">
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="subscription-back">
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}>
        <Text style={styles.title}>Subscription</Text>

        <View style={styles.planCard}>
          <View style={styles.planTop}>
            <Text style={styles.planName}>Free</Text>
            <View style={styles.currentPill}>
              <Text style={styles.currentPillText}>Current plan</Text>
            </View>
          </View>
          {FREE_INCLUDES.map((line) => (
            <Feature key={line} styles={styles} text={line} />
          ))}
        </View>

        <View style={[styles.planCard, styles.proCard]}>
          <Text style={styles.proName}>Nemesis Pro</Text>
          <Text style={styles.proSub}>Everything in Free, plus:</Text>
          {PRO_ADDS.map((line) => (
            <Feature key={line} styles={styles} text={line} accent />
          ))}
          <View style={styles.soonRow}>
            <Text style={styles.soonText}>In-app upgrades are coming soon.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Feature({ styles, text, accent }: { styles: Styles; text: string; accent?: boolean }) {
  return (
    <View style={styles.feature}>
      <Text style={[styles.check, accent && styles.checkAccent]}>✓</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: space(3), paddingBottom: space(1) },
    back: { alignSelf: "flex-start", paddingVertical: space(1) },
    backText: { fontSize: type.small.fontSize + 1, color: c.accent, fontWeight: "500" },
    body: { paddingHorizontal: space(5), flexGrow: 1, gap: space(4) },
    title: { ...type.h1, color: c.text, marginBottom: space(1), marginTop: space(1) },

    planCard: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, padding: space(4), gap: space(2.5) },
    proCard: { borderColor: c.accentLine, backgroundColor: c.accentFaint },
    planTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space(1) },
    planName: { ...type.title, fontWeight: "700", color: c.text },
    currentPill: { backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
    currentPillText: { ...type.micro, color: c.text2 },
    proName: { ...type.title, fontWeight: "700", color: c.accent },
    proSub: { fontSize: type.micro.fontSize, color: c.text2, marginBottom: space(1) },

    feature: { flexDirection: "row", alignItems: "flex-start", gap: space(2.5) },
    check: { fontSize: type.small.fontSize, color: c.good, fontWeight: "700", marginTop: 1 },
    checkAccent: { color: c.accent },
    featureText: { flex: 1, fontSize: type.small.fontSize, lineHeight: 21, color: c.text },

    soonRow: { marginTop: space(2), paddingTop: space(3), borderTopWidth: 1, borderTopColor: c.accentLine },
    soonText: { fontSize: type.micro.fontSize, color: c.text2, textAlign: "center" },
  });

type Styles = ReturnType<typeof createStyles>;
