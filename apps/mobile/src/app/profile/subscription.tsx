import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui";
import { FREE_WATCHLIST_LIMIT } from "@/lib/limits";
import { common } from "@/theme/common";

// Subscription (doc-06 Profile). A stub: real entitlements (RevenueCat) are Phase 8.
// Shows the current free plan + what Pro unlocks, so the paywall affordance (6b-4) has
// a destination. No purchase flow is wired.
const PRO_FEATURES = [
  `Follow more than ${FREE_WATCHLIST_LIMIT} items`,
  "Keyword & clinical-trial watches",
  "Saved reports and comparisons",
];

export default function SubscriptionScreen() {
  return (
    <ScrollView contentContainerStyle={styles.body} testID="subscription-screen">
      <Text style={common.h1}>Subscription</Text>
      <Card testID="current-plan">
        <Text style={styles.plan}>Current plan: Free</Text>
        <Text style={common.sub}>Free includes search, ask, drug pages, and up to {FREE_WATCHLIST_LIMIT} follows.</Text>
      </Card>

      <Text style={styles.heading}>PharmaBro Pro</Text>
      {PRO_FEATURES.map((f) => (
        <View key={f} style={styles.row}>
          <Text style={styles.bullet}>•</Text>
          <Text style={common.body}>{f}</Text>
        </View>
      ))}

      <Text style={common.sub} testID="subscription-soon">Pro is coming soon. Purchases will be available at launch.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  plan: { fontSize: 16, fontWeight: "700", color: "#1f2933" },
  heading: { fontSize: 15, fontWeight: "700", color: "#1f2933", marginTop: 8 },
  row: { flexDirection: "row", gap: 8 },
  bullet: { fontSize: 15, color: "#208AEF" },
});
