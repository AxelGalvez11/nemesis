import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { paywallOptions, purchasePaywallOption, purchasesAvailable, restorePurchases, type PaywallOption } from "@/lib/purchases";
import { useNx } from "@/theme/nx";
import { NxIcon } from "@/components/nx/NxIcon";
import { NxMark } from "@/components/nx/NxMark";
import { goBack, useAccent, usePlan } from "@/components/nx/settings/kit";

// Upgrade to Pro (canvas artboard "Upgrade"). Sold only through Apple's purchase sheet (RevenueCat,
// lib/purchases.ts): App Store 3.1.1(a) forbids any web checkout link, see no-external-purchase.test.ts.
// Prices mirror landing/lib/pricing.ts; when the store answers, its own price strings win.

const MAGENTA = require("../../assets/images/nx/magenta.jpg");

const MONTHLY = "$19.99";
const ANNUAL = "$199.99";
const ANNUAL_PER_MONTH = "$16.67";
const SAVE = "Save 17%";

const PERKS = [
  "Unlimited recording and notes",
  "Unlimited Nemesis AI, with web search",
  "Flashcards from every lecture",
  "Claude, ChatGPT and Anki connected",
];

type Interval = "annual" | "monthly";

export default function UpgradeScreen() {
  const c = useNx();
  const acc = useAccent();
  const insets = useSafeAreaInsets();
  const plan = usePlan();
  const available = purchasesAvailable();
  const [options, setOptions] = useState<PaywallOption[]>([]);
  const [loading, setLoading] = useState(available);
  const [pick, setPick] = useState<Interval>("annual");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;
    let alive = true;
    void paywallOptions().then((loaded) => {
      if (!alive) return;
      setOptions(loaded);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [available]);

  const annual = options.find((o) => o.identifier.endsWith("_annual")) ?? null;
  const monthly = options.find((o) => !o.identifier.endsWith("_annual")) ?? null;
  const chosen = pick === "annual" ? annual : monthly;

  const buy = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setNotice(null);
    const outcome = await purchasePaywallOption(chosen);
    setBusy(false);
    if (outcome.status === "purchased") {
      void plan.refetch();
      goBack();
    } else if (outcome.status === "failed") {
      setNotice(outcome.message);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    const result = await restorePurchases();
    setBusy(false);
    if (result) {
      void plan.refetch();
      Alert.alert("Purchases restored", "Nemesis Pro is active on this account.", [{ text: "OK", onPress: goBack }]);
    } else {
      Alert.alert("Nothing to restore", "We couldn't find a Nemesis subscription for this Apple ID.");
    }
  };

  const annualPrice = annual?.priceString ?? ANNUAL;
  const annualIsUsd = annualPrice === ANNUAL;
  const footer = !available
    ? "Purchases open in the App Store version of Nemesis."
    : !loading && !chosen
      ? "This plan isn't available from the App Store right now."
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="settings-upgrade">
      <View style={styles.art}>
        <Image source={MAGENTA} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </View>

      <View style={[styles.top, { paddingTop: insets.top + 2 }]}>
        <Pressable onPress={goBack} hitSlop={6} style={styles.ib} accessibilityLabel="Close">
          <NxIcon name="x" size={22} color="#ffffff" />
        </Pressable>
        <View style={{ flex: 1 }} />
        {available ? (
          <Pressable onPress={() => void restore()} hitSlop={6} style={styles.restore}>
            <Text style={{ color: "#ffffff", opacity: 0.9, fontSize: 15 }}>Restore</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.hero}>
        {/* Canvas Upgrade: the .logo mark, dots pop in then wave. */}
        <NxMark size={44} color="#ffffff" />
        <Text style={styles.heroTitle}>Nemesis Pro</Text>
        <Text style={styles.heroSub}>Record every class and ask as much as you want.</Text>
      </View>

      <View style={[styles.sheet, { top: insets.top + 222, backgroundColor: c.bg }]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 22, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 12) + 18 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 4 }}>
            {PERKS.map((p) => (
              <View key={p} style={styles.perk}>
                <View style={[styles.perkDot, { backgroundColor: `${acc}26` }]}>
                  <NxIcon name="check" size={14} color={acc} strokeWidth={2.4} />
                </View>
                <Text style={{ color: c.t1, fontSize: 16, lineHeight: 22, flex: 1 }}>{p}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 10, marginTop: 20 }}>
            <PlanCard
              title="Yearly"
              badge={SAVE}
              price={annualIsUsd ? ANNUAL_PER_MONTH : annualPrice}
              per={annualIsUsd ? "a month" : "a year"}
              note={`${annualPrice} billed yearly`}
              on={pick === "annual"}
              onPress={() => setPick("annual")}
            />
            <PlanCard
              title="Monthly"
              price={monthly?.priceString ?? MONTHLY}
              per="a month"
              note="Billed monthly"
              on={pick === "monthly"}
              onPress={() => setPick("monthly")}
            />
          </View>

          <View style={{ marginTop: "auto", paddingTop: 24, gap: 10 }}>
            {notice ? <Text style={{ color: c.danger, fontSize: 13, lineHeight: 18, textAlign: "center" }}>{notice}</Text> : null}
            <Pressable
              onPress={() => void buy()}
              disabled={!chosen || busy || plan.paid}
              style={({ pressed }) => [styles.btn, { backgroundColor: c.inv, opacity: !chosen || plan.paid ? 0.4 : pressed ? 0.85 : 1 }]}
            >
              {busy || loading ? (
                <ActivityIndicator color={c.onInv} />
              ) : (
                <Text style={{ color: c.onInv, fontSize: 16, fontWeight: "500" }}>{plan.paid ? "You're on Nemesis Pro" : "Start Nemesis Pro"}</Text>
              )}
            </Pressable>
            <Text style={{ fontSize: 12, lineHeight: 17, color: c.t2, textAlign: "center", paddingHorizontal: 8 }}>
              {footer ? `${footer} ` : "Cancel anytime in Settings. "}
              By continuing, you agree to the{" "}
              <Text style={{ textDecorationLine: "underline" }} onPress={() => router.push("/profile/legal?doc=terms" as never)}>
                Terms
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function PlanCard({ title, badge, price, per, note, on, onPress }: { title: string; badge?: string; price: string; per: string; note: string; on: boolean; onPress: () => void }) {
  const c = useNx();
  const acc = useAccent();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={[styles.card, on ? { borderWidth: 2, borderColor: acc, paddingHorizontal: 15, paddingVertical: 13 } : { borderWidth: 1, borderColor: c.ring }]}
    >
      {on ? (
        <View style={[styles.radio, { backgroundColor: acc, alignItems: "center", justifyContent: "center" }]}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffffff" }} />
        </View>
      ) : (
        <View style={[styles.radio, { borderWidth: 1.5, borderColor: c.ring }]} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: c.t1, fontSize: 16, lineHeight: 22, fontWeight: "600" }}>{title}</Text>
          {badge ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, backgroundColor: acc }}>
              <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "600" }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: c.t2, fontSize: 13, lineHeight: 18 }}>{note}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: c.t1, fontSize: 18, lineHeight: 22, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{price}</Text>
        <Text style={{ color: c.t2, fontSize: 13, lineHeight: 18 }}>{per}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  art: { position: "absolute", left: 0, right: 0, top: 0, height: 320, overflow: "hidden" },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  ib: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  restore: { height: 44, paddingHorizontal: 12, justifyContent: "center" },
  hero: { alignItems: "center", gap: 10, paddingTop: 18, paddingHorizontal: 32 },
  heroTitle: { color: "#ffffff", fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.6 },
  heroSub: { color: "#ffffff", opacity: 0.92, fontSize: 16, lineHeight: 23, textAlign: "center" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  perk: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 34 },
  perkDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  radio: { width: 22, height: 22, borderRadius: 11 },
  btn: { height: 50, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
