import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchEntitlements, fetchUsage } from "@/api/billing";
import { useAuth } from "@/auth/AuthProvider";
import { ErrorState } from "@/components/states";
import { Badge, Card } from "@/components/ui";
import { common } from "@/theme/common";
import { c, space } from "@/theme/tokens";

// Plan display (mobile billing-view). Shows the caller's REAL plan + limits + today's usage, read from
// get_my_entitlements / get_my_usage. DISPLAY-ONLY by design: Apple/Google forbid embedding Stripe
// checkout for subscriptions, so upgrades happen on the web. No in-app purchase, no checkout link —
// just an honest plan + usage view (replaces the old "coming soon" stub).
const PLAN_NAME: Record<string, string> = { free: "Free", plus: "Plus", pro: "Pro" };

function num(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

export default function SubscriptionScreen() {
  const { session } = useAuth();
  const ent = useQuery({ queryKey: ["entitlements"], queryFn: fetchEntitlements, enabled: !!session });
  const usage = useQuery({ queryKey: ["usage"], queryFn: fetchUsage, enabled: !!session });

  if (!session) {
    return (
      <View style={common.screen} testID="subscription-screen">
        <Text style={common.h1}>Subscription</Text>
        <Text style={common.sub}>Sign in to see your plan.</Text>
      </View>
    );
  }

  if (ent.isLoading) {
    return (
      <View style={common.screen} testID="subscription-screen">
        <Text style={common.h1}>Subscription</Text>
        <ActivityIndicator color={c.acid} testID="subscription-loading" />
      </View>
    );
  }
  if (ent.isError) {
    return (
      <View style={common.screen} testID="subscription-screen">
        <Text style={common.h1}>Subscription</Text>
        <ErrorState testID="subscription-error" body={(ent.error as Error).message} />
      </View>
    );
  }

  const snap = ent.data ?? { plan: "free", entitlements: {} };
  const e = snap.entitlements;
  const planLabel = PLAN_NAME[snap.plan] ?? snap.plan;
  const isPaid = snap.plan === "plus" || snap.plan === "pro";
  const askLimit = num(e.ask_daily_limit, 10);
  const watchLimit = num(e.watch_limit, 1);
  const dailyChecks = e.watch_daily_enabled === true;
  const askUsed = usage.data?.counters?.ask_daily?.used ?? null;

  const included = [
    `${askLimit} questions per day`,
    `${watchLimit} live ${watchLimit === 1 ? "watch" : "watches"} (${dailyChecks ? "daily" : "weekly"} checks)`,
    "Search, drug pages, and comparisons",
    snap.plan === "pro" ? "Deep Research reports" : null,
  ].filter(Boolean) as string[];

  return (
    <ScrollView contentContainerStyle={styles.body} testID="subscription-screen">
      <Text style={common.h1}>Subscription</Text>

      <Card testID="current-plan">
        <View style={styles.planRow}>
          <Text style={styles.plan}>Your plan</Text>
          <Badge label={planLabel} tone={isPaid ? "strong" : "neutral"} testID="plan-badge" />
        </View>
        {askUsed !== null ? (
          <Text style={common.sub} testID="usage-line">
            Today: {askUsed} of {askLimit} questions used
          </Text>
        ) : null}
      </Card>

      <Text style={styles.heading}>What's included</Text>
      {included.map((f) => (
        <View key={f} style={styles.row}>
          <Text style={styles.bullet}>•</Text>
          <Text style={common.body}>{f}</Text>
        </View>
      ))}

      {!isPaid ? (
        <Card testID="upgrade-info">
          <Text style={styles.upgradeTitle}>Plus & Pro add more</Text>
          <Text style={common.sub}>
            More questions per day, more live watches with daily checks, and (Pro) Deep Research reports.
          </Text>
          <Text style={[common.sub, styles.manage]} testID="manage-on-web">
            Plans are managed on the web at pharmaorb.app — open it in your browser to upgrade.
          </Text>
        </Card>
      ) : (
        <Text style={[common.sub, styles.manage]} testID="manage-on-web">
          Manage or change your plan on the web at pharmaorb.app.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(5), gap: space(3), backgroundColor: c.bg, flexGrow: 1 },
  planRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  plan: { fontSize: 16, fontWeight: "700", color: c.text },
  heading: { fontSize: 15, fontWeight: "700", color: c.text, marginTop: space(2) },
  row: { flexDirection: "row", gap: space(2) },
  bullet: { fontSize: 15, color: c.acidDim },
  upgradeTitle: { fontSize: 15, fontWeight: "700", color: c.text, marginBottom: 4 },
  manage: { marginTop: space(2), fontStyle: "italic" },
});
