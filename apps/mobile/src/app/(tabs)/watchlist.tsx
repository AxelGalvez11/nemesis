import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchEntitlements, fetchWatches, relativeTime, type WatchSummary } from "@/api/monitor";
import { useAuth } from "@/auth/AuthProvider";
import { EmptyState, ErrorState, GuestState } from "@/components/states";
import { Badge, Card, SectionHeader } from "@/components/ui";
import { watchEntitlement, watchUsageLabel } from "@pharmabro/shared";
import { common } from "@/theme/common";
import { c, space } from "@/theme/tokens";

// Live Monitoring (WS-D) — the caller's evidence watches. Each row opens the watch's three-lane feed
// (Alerts / What's new / In the news). Reads evidence_watches + get_my_entitlements (for the usage line
// + the free-tier follow cap), all RLS-scoped to the signed-in user. Replaces the legacy watchlist_items
// view; mobile now monitors the SAME watches as web.
export default function MonitoringTab() {
  const { session } = useAuth();
  const watches = useQuery({ queryKey: ["watches"], queryFn: fetchWatches, enabled: !!session });
  const ent = useQuery({ queryKey: ["entitlements"], queryFn: fetchEntitlements, enabled: !!session });

  if (!session) {
    return (
      <View style={common.screen} testID="tab-watchlist">
        <Text style={common.h1}>Live Monitoring</Text>
        <GuestState body="Sign in to watch a drug or topic and get alerted when the evidence changes." />
      </View>
    );
  }

  const items = watches.data ?? [];
  const limits = watchEntitlement(ent.data ?? null);

  return (
    <ScrollView contentContainerStyle={styles.body} testID="tab-watchlist">
      <Text style={common.h1}>Live Monitoring</Text>

      {watches.isLoading ? (
        <ActivityIndicator testID="watches-loading" color={c.acid} />
      ) : watches.isError ? (
        <ErrorState testID="watches-error" body={(watches.error as Error).message} />
      ) : items.length === 0 ? (
        <EmptyState
          testID="watches-empty"
          title="Nothing watched yet"
          body="Tap “Watch this” on any answer or drug page. We re-check the evidence on a schedule and alert you when a new high-quality study, retraction, or label change lands."
        />
      ) : (
        <View style={styles.section}>
          <SectionHeader title={`Watching (${items.length})`} testID="watches-list" />
          {items.map((w, i) => (
            <WatchRow key={w.id} watch={w} index={i} />
          ))}
          <Text style={styles.usage} testID="watches-usage">
            {watchUsageLabel(items.length, limits.limit)}
            {!limits.dailyEnabled ? " · weekly checks (upgrade for daily)" : ""}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function WatchRow({ watch, index }: { watch: WatchSummary; index: number }) {
  const paused = watch.status === "paused";
  return (
    <Pressable testID={`watch-${index}`} onPress={() => router.push(`/monitor/${watch.id}`)}>
      <Card testID={`watch-card-${index}`}>
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.title} numberOfLines={2} testID={`watch-title-${index}`}>
              {watch.title}
            </Text>
            <Text style={styles.meta}>Last checked {relativeTime(watch.last_checked_at)}</Text>
          </View>
          <View style={styles.badges}>
            <Badge label={watch.cadence === "daily" ? "Daily" : "Weekly"} tone="neutral" />
            {paused ? <Badge label="Paused" tone="moderate" /> : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(5), gap: space(4), backgroundColor: c.bg, flexGrow: 1 },
  section: { gap: space(2) },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(3) },
  rowMain: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: "600", color: c.text, lineHeight: 21 },
  meta: { fontSize: 12, color: c.text3 },
  badges: { flexDirection: "row", gap: space(1.5), alignItems: "center" },
  usage: { fontSize: 13, color: c.text3, fontStyle: "italic", marginTop: space(1) },
});
