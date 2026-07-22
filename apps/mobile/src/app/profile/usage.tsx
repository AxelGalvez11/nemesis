import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { fetchUsageSummary, usagePercent, type UsageErrorKind, type UsageSummary } from "@/api/usage";
import { Skeleton } from "@/components/Skeleton";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Usage — phone half of the cloud-first settings port (build spec §11). Real
// data: GET {LLM_BASE}/usage with the device key (same metered gateway Chat
// uses), rendered as plan + credit/usage bars like web's Settings > Usage
// (apps/web/components/SettingsSurface.tsx's UsageSettings). A 200 with
// remaining: 0 is a normal "allowance spent" result, not an error — the
// endpoint returns 200 even when the budget is exhausted (see the edge
// function's own comment), so that path renders a full bar + honest copy,
// never the error state.

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; errorKind: UsageErrorKind }
  | { kind: "ready"; summary: UsageSummary };

function capitalize(value: string): string {
  return value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function errorCopy(kind: UsageErrorKind): string {
  switch (kind) {
    case "auth":
      return "Sign in again to see your usage.";
    case "unreachable":
      return "You're offline — usage needs a connection.";
    case "generic":
      return "Couldn't load your usage. Try again.";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export default function UsageScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(() => {
    if (!uid) return;
    setState({ kind: "loading" });
    void fetchUsageSummary(uid).then((result) => {
      setState(result.ok ? { kind: "ready", summary: result.summary } : { errorKind: result.errorKind, kind: "error" });
    });
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.root} testID="usage-screen">
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="usage-back">
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space(6) }]}>
        <Text style={styles.title}>Usage</Text>
        <Text style={styles.subtitle}>Your plan and how much of today's and this month's AI allowance you've used.</Text>

        {!uid ? (
          <Text style={styles.guest} testID="usage-guest">You're not signed in.</Text>
        ) : state.kind === "loading" ? (
          <View testID="usage-loading">
            <View testID="usage-skeleton">
              <View style={styles.planPill}>
                <Skeleton width={80} height={13} />
              </View>
              {["today", "month"].map((key) => (
                <View key={key} style={styles.usageCard}>
                  <View style={styles.usageTop}>
                    <Skeleton width={70} height={14} />
                    <Skeleton width={30} height={14} />
                  </View>
                  <Skeleton width="100%" height={8} radius={radius.pill} />
                  <Skeleton width={140} height={12} />
                </View>
              ))}
            </View>
          </View>
        ) : state.kind === "error" ? (
          <View style={styles.centerBox} testID="usage-error">
            <Text style={styles.errorText}>{errorCopy(state.errorKind)}</Text>
            <Pressable style={styles.retryBtn} onPress={load} testID="usage-retry">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.planPill}>
              <Text style={styles.planPillText}>{capitalize(state.summary.plan)} plan</Text>
            </View>
            <UsageBar
              styles={styles}
              label="Today"
              used={state.summary.used}
              limit={state.summary.dailyLimit}
              caption={
                state.summary.remaining <= 0
                  ? "You've used today's allowance. It resets at midnight (UTC)."
                  : "Resets at midnight (UTC)."
              }
              testID="usage-daily"
            />
            <UsageBar
              styles={styles}
              label="This month"
              used={state.summary.monthlyUsed}
              limit={state.summary.monthlyLimit}
              caption={
                state.summary.monthlyRemaining <= 0
                  ? "You've used this month's allowance. It resets on the 1st (UTC)."
                  : "Resets on the 1st of the month (UTC)."
              }
              testID="usage-monthly"
            />
            <Pressable onPress={load} style={styles.refreshBtn} testID="usage-refresh">
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function UsageBar({
  styles,
  label,
  used,
  limit,
  caption,
  testID,
}: {
  styles: Styles;
  label: string;
  used: number;
  limit: number;
  caption: string;
  testID: string;
}) {
  const pct = usagePercent(used, limit);
  return (
    <View style={styles.usageCard} testID={testID}>
      <View style={styles.usageTop}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={styles.usagePct}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.usageCaption}>{caption}</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: space(3), paddingBottom: space(1) },
    back: { alignSelf: "flex-start", paddingVertical: space(1) },
    backText: { fontSize: type.small.fontSize + 1, color: c.accent, fontWeight: "500" },
    body: { paddingHorizontal: space(5), flexGrow: 1 },
    title: { fontSize: 28, fontWeight: "700", color: c.text, marginBottom: space(1), marginTop: space(1) },
    subtitle: { fontSize: type.micro.fontSize, lineHeight: 19, color: c.text3, marginBottom: space(4) },
    guest: { fontSize: type.small.fontSize, color: c.text2, marginTop: space(4) },

    centerBox: { alignItems: "center", gap: space(3), paddingVertical: space(8) },
    errorText: { fontSize: type.small.fontSize, color: c.text2, textAlign: "center", maxWidth: 300 },
    retryBtn: { backgroundColor: c.surface2, borderRadius: radius.sm, paddingHorizontal: space(5), paddingVertical: space(2.5) },
    retryText: { fontSize: type.small.fontSize, fontWeight: "600", color: c.text },

    planPill: { alignSelf: "flex-start", backgroundColor: c.accentFaint, borderColor: c.accentLine, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(3.5), paddingVertical: space(1.5), marginBottom: space(4) },
    planPillText: { fontSize: type.micro.fontSize, fontWeight: "700", color: c.accent },

    usageCard: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, padding: space(4), marginBottom: space(3), gap: space(2) },
    usageTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    usageLabel: { fontSize: type.small.fontSize + 1, fontWeight: "600", color: c.text },
    usagePct: { fontSize: type.small.fontSize, fontWeight: "700", color: c.text, fontVariant: ["tabular-nums"] },
    track: { height: 8, borderRadius: radius.pill, backgroundColor: c.surface2, overflow: "hidden" },
    fill: { height: "100%", borderRadius: radius.pill, backgroundColor: c.accent },
    usageCaption: { fontSize: type.micro.fontSize, color: c.text3 },

    refreshBtn: { alignSelf: "flex-start", marginTop: space(1), paddingVertical: space(2) },
    refreshText: { fontSize: type.small.fontSize, fontWeight: "600", color: c.accent },
  });

type Styles = ReturnType<typeof createStyles>;
