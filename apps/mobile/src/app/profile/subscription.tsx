import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Subscription — its own page (owner call), pushed from the Settings sheet. It
// says which plan you are on and what each plan includes. It does NOT sell
// anything, and that is deliberate.
//
// 🔴 DO NOT ADD AN UPGRADE BUTTON, A PRICING LINK, OR "subscribe at …" COPY.
// Apple guideline 3.1.1(a) bans "buttons, external links, or other calls to
// action that direct customers to purchasing mechanisms other than in-app
// purchase" in every storefront except the United States. This app previously
// shipped US-only precisely so one such button could exist; the owner chose
// worldwide availability instead (2026-07-29), so the button had to go. Putting
// one back makes the app rejectable in every country outside the US.
//
// The two lawful ways to sell from inside this app are (a) Apple in-app
// purchase, or (b) an External Purchase Link entitlement, applied for
// per-country. Until one of those is built there is no purchase surface here.
// `src/lib/no-external-purchase.test.ts` fails the build if a link reappears.

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

        {/* Informational only — what the paid tier contains, with no way to buy
            it from here. Read the rule at the top of this file before changing
            anything in this card. */}
        <View style={[styles.planCard, styles.proCard]} testID="subscription-pro-card">
          <Text style={styles.proName}>Nemesis Pro</Text>
          <Text style={styles.proSub}>Everything in Free, plus:</Text>
          {PRO_ADDS.map((line) => (
            <Feature key={line} styles={styles} text={line} accent />
          ))}
        </View>

        {/* Plans follow the account, not the device. Worth saying because a
            student who already pays needs to know that signing in is all it
            takes — a statement about how an existing plan behaves, not a prompt
            to go and buy one. */}
        <Text style={styles.footnote}>Your plan applies everywhere you sign in.</Text>
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

    footnote: { fontSize: type.micro.fontSize, color: c.text2, textAlign: "center" },
  });

type Styles = ReturnType<typeof createStyles>;
