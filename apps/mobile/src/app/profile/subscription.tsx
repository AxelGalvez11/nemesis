import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PLAN_CATALOG, planByCode, type CatalogPlan } from "@nemesis/shared";
import { fetchEntitlements } from "@/api/billing";
import { MissionButton } from "@/components/mission-ui";
import { openPricingPage } from "@/lib/pricing";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Subscription — its own page (owner call), pushed from the Settings sheet.
//
// Owner 2026-07-28: "make sure all plans are visible". This page used to show
// exactly two cards, Free and "Nemesis Pro", so Plus and Max — half the ladder,
// including the cheapest paid step — did not exist as far as a phone user knew.
// Worse, every line was an adjective ("Higher daily usage limits") rather than
// the number the student is actually held to, so nothing on the page could be
// checked against what they get.
//
// It also used to end on "In-app upgrades are coming soon", which contradicted
// the out-of-credits sheet's working Upgrade button — the one screen CALLED
// "Subscription" was the only place saying you could not subscribe.
//
// The numbers come from @nemesis/shared's PLAN_CATALOG, the same table the web
// app prints, so a re-price cannot land on one surface and miss the other.
//
// The CURRENT plan is read from the server (get_my_entitlements, auth.uid()
// scoped) rather than assumed to be Free — a Pro subscriber opening this page
// and being told they are on Free is the kind of thing that generates a refund
// request. While it loads, no card claims to be current.

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchEntitlements()
      .then((result) => {
        if (alive) setCurrentCode(planByCode(result?.plan).code);
      })
      // A failed read leaves currentCode null, so NO card is marked current.
      // Silently defaulting to Free would tell a paying student they are on the
      // free plan, which is worse than showing no badge at all.
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.root} testID="subscription-screen">
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="subscription-back">
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}>
        <Text style={styles.title}>Plans</Text>
        <Text style={styles.subtitle}>
          Every plan keeps your Library, Study and Calendar in your account, on both phone and web.
        </Text>
        {loading ? <ActivityIndicator style={styles.loading} testID="subscription-loading" /> : null}

        {PLAN_CATALOG.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            isCurrent={plan.code === currentCode}
            styles={styles}
          />
        ))}

        <Text style={styles.footnote}>
          Upgrading opens your account on the web. Your plan applies everywhere you sign in.
        </Text>
      </ScrollView>
    </View>
  );
}

/** One plan. Paid plans get the accent treatment; the plan you are ON gets the
 *  badge and no button, because "Upgrade" on the plan you already hold is the
 *  clearest way to make someone think they have been charged twice. */
function PlanCard({
  plan,
  isCurrent,
  styles,
}: {
  plan: CatalogPlan;
  isCurrent: boolean;
  styles: Styles;
}) {
  const paid = plan.priceUsd > 0;
  return (
    <View
      style={[styles.planCard, paid && styles.paidCard, isCurrent && styles.currentCard]}
      testID={`plan-card-${plan.code}`}
    >
      <View style={styles.planTop}>
        <Text style={[styles.planName, paid && styles.paidName]}>{plan.name}</Text>
        {isCurrent ? (
          <View style={styles.currentPill}>
            <Text style={styles.currentPillText}>Current plan</Text>
          </View>
        ) : (
          // "Free" rather than "$0/mo" — a price of zero reads as an error.
          <Text style={styles.price}>{paid ? `$${plan.priceUsd}/mo` : "Free"}</Text>
        )}
      </View>

      <Feature styles={styles} accent={paid} text={`${plan.askDaily.toLocaleString()} questions a day`} />
      <Feature
        styles={styles}
        accent={paid}
        text={`${plan.recordingHours} ${plan.recordingHours === 1 ? "hour" : "hours"} of recorded lectures a month`}
      />
      <Feature styles={styles} accent={paid} text={`${plan.searchMonthly.toLocaleString()} web searches a month`} />
      {plan.premiumAnswers ? (
        <Feature styles={styles} accent={paid} text="Deeper answers on hard questions" />
      ) : null}

      {isCurrent || !paid ? null : (
        <View style={styles.buttonRow}>
          <MissionButton
            label={`Get ${plan.name}`}
            onPress={openPricingPage}
            variant="primary"
            testID={`plan-upgrade-${plan.code}`}
          />
        </View>
      )}
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
    title: { ...type.h1, color: c.text, marginTop: space(1) },
    subtitle: { fontSize: type.small.fontSize, lineHeight: 21, color: c.text2, marginTop: -space(2) },
    loading: { marginTop: space(2) },

    planCard: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: space(4),
      gap: space(2.5),
    },
    paidCard: { borderColor: c.accentLine, backgroundColor: c.accentFaint },
    // The plan you hold is outlined rather than tinted differently, so it reads
    // as "this one" without competing with the paid cards' accent.
    currentCard: { borderWidth: 2, borderColor: c.accent },
    planTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space(1) },
    planName: { ...type.title, fontWeight: "700", color: c.text },
    paidName: { color: c.accent },
    price: { ...type.body, fontWeight: "700", color: c.text2 },
    currentPill: { backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
    currentPillText: { ...type.micro, color: c.text2 },

    feature: { flexDirection: "row", alignItems: "flex-start", gap: space(2.5) },
    check: { fontSize: type.small.fontSize, color: c.good, fontWeight: "700", marginTop: 1 },
    checkAccent: { color: c.accent },
    featureText: { flex: 1, fontSize: type.small.fontSize, lineHeight: 21, color: c.text },

    buttonRow: { marginTop: space(2) },
    footnote: { fontSize: type.micro.fontSize, color: c.text2, textAlign: "center", marginTop: -space(1) },
  });

type Styles = ReturnType<typeof createStyles>;
