import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MissionButton } from "./mission-ui";
import { SlideUpSheet } from "./StudySheet";
import { nextDailyReset, type BudgetResetKind } from "@/lib/chat-thread";
import {
  paywallOptions,
  purchasePaywallOption,
  purchasesAvailable,
  restorePurchases,
  type PaywallOption,
} from "@/lib/purchases";
import { paywallPlanName, paywallPlanPitch } from "@/lib/purchases-logic";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { space, type } from "@/theme/tokens";

/** The freemium moment: credits ran dry. Since Build 27 this sheet sells the
 *  two plans through Apple's own purchase sheet (StoreKit via RevenueCat) —
 *  the lawful worldwide way to sell inside an iOS app. The reset line stays,
 *  because "wait" remains a real choice and it should say exactly how long.
 *
 *  🔴 STILL TRUE: no web link to pricing/checkout may appear in this app.
 *  Apple guideline 3.1.1(a) permits such links in the United States storefront
 *  and nowhere else, and we ship worldwide. In-app purchase has no URL, which
 *  is why no-external-purchase.test.ts passes unchanged. Do not "helpfully"
 *  add a see-plans-on-the-web link.
 *
 *  When the paywall cannot load (Expo Go, Android, offline, key missing) the
 *  sheet degrades to exactly what shipped in #352: message + reset + OK. */
export function UpgradeSheet({
  visible,
  message,
  reset,
  onClose,
}: {
  visible: boolean;
  /** The valve's student-readable line for which limit was hit, if any. */
  message: string | null;
  reset: BudgetResetKind | null;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [options, setOptions] = useState<PaywallOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !purchasesAvailable()) return;
    let cancelled = false;
    void paywallOptions().then((loaded) => {
      if (!cancelled) setOptions(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const resetLine =
    reset === "monthly"
      ? "Your monthly allowance resets on the 1st."
      : `Free credits reset at ${nextDailyReset(new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;

  const buy = async (option: PaywallOption) => {
    if (busy) return;
    setBusy(option.identifier);
    setNotice(null);
    const outcome = await purchasePaywallOption(option);
    setBusy(null);
    if (outcome.status === "purchased") {
      // The webhook flips the server-side plan within moments; closing here
      // lets the student go straight back to what they were doing.
      onClose();
    } else if (outcome.status === "failed") {
      setNotice(outcome.message);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy("restore");
    setNotice(null);
    const plan = await restorePurchases();
    setBusy(null);
    if (plan) onClose();
    else setNotice("No previous purchase found for this Apple ID.");
  };

  return (
    <SlideUpSheet visible={visible} onClose={onClose} title="Out of free credits" testID="upgrade-sheet">
      <Text style={styles.message}>{message ?? "Today's AI allowance on your plan is used up."}</Text>
      <Text style={styles.reset}>{resetLine} Your chats and notes stay put either way.</Text>
      {options.map((option) => (
        <Pressable
          key={option.identifier}
          style={styles.planCard}
          onPress={() => void buy(option)}
          disabled={busy != null}
          testID={`upgrade-${option.identifier}`}
        >
          <View style={styles.planText}>
            <Text style={styles.planName}>{paywallPlanName(option.identifier)}</Text>
            <Text style={styles.planPitch}>{paywallPlanPitch(option.identifier)}</Text>
            {option.trialAvailable ? <Text style={styles.planTrial}>7 days free, then {option.priceString}/month</Text> : null}
          </View>
          {busy === option.identifier
            ? <ActivityIndicator />
            : <Text style={styles.planPrice}>{option.trialAvailable ? "Try free" : `${option.priceString}/mo`}</Text>}
        </Pressable>
      ))}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <View style={styles.buttons}>
        {options.length > 0 ? (
          <Pressable onPress={() => void restore()} disabled={busy != null} testID="upgrade-restore">
            <Text style={styles.restore}>Restore Purchases</Text>
          </Pressable>
        ) : null}
        <MissionButton label={options.length > 0 ? "Not now" : "OK"} onPress={onClose} variant="primary" testID="upgrade-dismiss" />
      </View>
    </SlideUpSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    message: { ...type.body, color: c.text, marginBottom: space(2) },
    reset: { ...type.small, color: c.text2, marginBottom: space(4) },
    planCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      borderRadius: 16,
      padding: space(4),
      marginBottom: space(3),
      backgroundColor: c.glass,
    },
    planText: { flex: 1, marginRight: space(3) },
    planName: { ...type.body, fontWeight: "600", color: c.text },
    planPitch: { ...type.small, color: c.text2, marginTop: space(1) },
    planTrial: { ...type.small, color: c.text2, marginTop: space(1) },
    planPrice: { ...type.body, fontWeight: "600", color: c.text },
    notice: { ...type.small, color: c.text2, marginBottom: space(2) },
    buttons: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space(2) },
    restore: { ...type.small, color: c.text2, textDecorationLine: "underline" },
  });
