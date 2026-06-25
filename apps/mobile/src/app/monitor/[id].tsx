import { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteWatch,
  fetchWatch,
  fetchWatchEvents,
  markWatchRead,
  relativeTime,
  setWatchStatus,
} from "@/api/monitor";
import { useAuth } from "@/auth/AuthProvider";
import { ErrorState } from "@/components/states";
import { Skeleton, SkeletonList } from "@/components/Skeleton";
import { Badge, Card, Centered, SectionHeader } from "@/components/ui";
import { UUID_RE } from "@/lib/validation";
import { partitionWatchEvents, type WatchEvent } from "@pharmabro/shared";
import { c, space } from "@/theme/tokens";

// A single watch's three-lane feed (Live Monitoring detail). ALERTS = loud, conclusion-moving evidence
// (a new high-tier study or a retraction). WHAT'S NEW = the quiet feed of other new evidence. IN THE NEWS
// = walled off and clearly labeled "not verified evidence" — never a medical conclusion (mirrors web's
// WatchDetail + the shared partitionWatchEvents split). Opening the watch marks its events read.
export default function WatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const watchId = String(id);
  const validId = UUID_RE.test(watchId);
  const { session, loading: authLoading } = useAuth();
  const enabled = validId && !!session;
  const qc = useQueryClient();

  const watch = useQuery({ queryKey: ["watch", watchId], queryFn: () => fetchWatch(watchId), enabled });
  const events = useQuery({
    queryKey: ["watch-events", watchId],
    queryFn: () => fetchWatchEvents(watchId),
    enabled,
  });

  // Mark this watch's events read on open so the unread-alert badge clears (best-effort).
  useEffect(() => {
    if (!enabled) return;
    markWatchRead(watchId)
      .then(() => qc.invalidateQueries({ queryKey: ["watches"] }))
      .catch(() => {});
  }, [enabled, watchId, qc]);

  const pause = useMutation({
    mutationFn: (status: "active" | "paused") => setWatchStatus(watchId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watch", watchId] }),
  });
  const remove = useMutation({
    mutationFn: () => deleteWatch(watchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watches"] });
      goBackToMonitoring();
    },
  });

  // Go back if there's history, else fall back to the list. A direct/deep-link open has no history,
  // where router.back() dead-ends with a "GO_BACK was not handled" error (caught in QA).
  const goBackToMonitoring = () => (router.canGoBack() ? router.back() : router.replace("/watchlist"));

  if (authLoading) {
    return <Centered testID="watch-auth-loading"><ActivityIndicator color={c.acid} /></Centered>;
  }
  if (!session) {
    return <Centered testID="watch-auth-required"><Text style={styles.gate}>Sign in to view this watch.</Text></Centered>;
  }
  if (!validId) {
    return <ErrorState testID="watch-not-found" body="That watch id is not valid." />;
  }

  const w = watch.data;
  const parts = partitionWatchEvents(events.data ?? []);
  const paused = w?.status === "paused";

  const confirmDelete = () =>
    Alert.alert("Stop watching?", "This removes the watch and its alerts. You can re-create it anytime.", [
      { text: "Cancel", style: "cancel" },
      { text: "Stop watching", style: "destructive", onPress: () => remove.mutate() },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.body} testID="watch-detail">
      <Pressable testID="watch-back" onPress={goBackToMonitoring} style={styles.back}>
        <Text style={styles.backText}>‹ Monitoring</Text>
      </Pressable>

      {watch.isLoading ? (
        <View style={{ gap: space(2) }} testID="watch-loading">
          <Skeleton width="65%" height={24} />
          <Skeleton width="40%" height={14} />
        </View>
      ) : watch.isError ? (
        <ErrorState testID="watch-error" body={(watch.error as Error).message} />
      ) : !w ? (
        <ErrorState testID="watch-missing" body="This watch no longer exists." />
      ) : (
        <>
          <Text style={styles.title} testID="watch-title">{w.title}</Text>
          <View style={styles.metaRow}>
            <Badge label={w.cadence === "daily" ? "Daily" : "Weekly"} tone="neutral" />
            {paused ? <Badge label="Paused" tone="moderate" /> : <Badge label="Active" tone="strong" />}
            <Text style={styles.meta}>Last checked {relativeTime(w.last_checked_at)}</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              testID="watch-pause"
              style={styles.actionBtn}
              disabled={pause.isPending}
              onPress={() => pause.mutate(paused ? "active" : "paused")}
            >
              <Text style={styles.actionText}>{paused ? "Resume" : "Pause"}</Text>
            </Pressable>
            <Pressable testID="watch-delete" style={styles.actionBtn} disabled={remove.isPending} onPress={confirmDelete}>
              <Text style={[styles.actionText, styles.danger]}>Stop watching</Text>
            </Pressable>
          </View>

          {events.isLoading ? (
            <SkeletonList count={3} testID="watch-events-loading" />
          ) : events.isError ? (
            <ErrorState testID="watch-events-error" body={(events.error as Error).message} />
          ) : (
            <>
              <Lane
                title="Alerts"
                testID="lane-alerts"
                emptyBody="No alerts yet. We'll flag a new high-quality study or a retraction the moment it appears."
                events={parts.alerts}
                alert
              />
              <Lane
                title="What's new"
                testID="lane-feed"
                emptyBody="No new evidence since this watch started."
                events={parts.feed}
              />
              {parts.news.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader title="In the news" testID="lane-news" />
                  <Text style={styles.newsWall} testID="news-disclaimer">
                    Not verified evidence — news coverage, shown for awareness only. Never used to answer a
                    medical question.
                  </Text>
                  {parts.news.map((e, i) => (
                    <EventCard key={e.id} event={e} index={i} muted />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Lane({
  title,
  testID,
  emptyBody,
  events,
  alert = false,
}: {
  title: string;
  testID: string;
  emptyBody: string;
  events: WatchEvent[];
  alert?: boolean;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title={`${title}${events.length ? ` (${events.length})` : ""}`} testID={testID} />
      {events.length === 0 ? (
        <Text style={styles.muted} testID={`${testID}-empty`}>{emptyBody}</Text>
      ) : (
        events.map((e, i) => <EventCard key={e.id} event={e} index={i} alert={alert} />)
      )}
    </View>
  );
}

function EventCard({
  event,
  index,
  alert = false,
  muted = false,
}: {
  event: WatchEvent;
  index: number;
  alert?: boolean;
  muted?: boolean;
}) {
  const reason =
    event.alert_reason === "new_high_tier_study"
      ? "New high-tier study"
      : event.alert_reason === "retraction"
      ? "Retraction"
      : null;
  const metaBits = [event.provider, event.study_type, event.published_date?.slice(0, 10)].filter(Boolean);
  return (
    <Card testID={`event-${index}`}>
      {alert && reason ? <Badge label={reason} tone={event.alert_reason === "retraction" ? "weak" : "strong"} /> : null}
      <Text style={[styles.eventTitle, muted && styles.mutedText]} numberOfLines={3} testID={`event-title-${index}`}>
        {event.title || "(untitled)"}
      </Text>
      {metaBits.length > 0 ? <Text style={styles.eventMeta}>{metaBits.join(" · ")}</Text> : null}
      {event.summary ? <Text style={styles.eventSummary}>{event.summary}</Text> : null}
      {event.url ? (
        <Pressable testID={`event-link-${index}`} onPress={() => Linking.openURL(event.url!)}>
          <Text style={styles.link}>View source ↗</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: space(5), gap: space(4), backgroundColor: c.bg, flexGrow: 1 },
  back: { alignSelf: "flex-start" },
  backText: { color: c.acidDim, fontSize: 15, fontWeight: "600" },
  gate: { color: c.text2, fontSize: 15 },
  title: { fontSize: 22, fontWeight: "700", color: c.text, lineHeight: 28 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space(2), flexWrap: "wrap" },
  meta: { fontSize: 12, color: c.text3 },
  actions: { flexDirection: "row", gap: space(3) },
  actionBtn: { paddingHorizontal: space(4), paddingVertical: space(2), borderRadius: 8, backgroundColor: c.bg2 },
  actionText: { color: c.text, fontSize: 14, fontWeight: "600" },
  danger: { color: c.danger },
  section: { gap: space(2) },
  muted: { fontSize: 14, color: c.text2 },
  mutedText: { color: c.text2 },
  newsWall: { fontSize: 12, color: c.text3, fontStyle: "italic", lineHeight: 17 },
  eventTitle: { fontSize: 15, fontWeight: "600", color: c.text, lineHeight: 20, marginTop: 4 },
  eventMeta: { fontSize: 12, color: c.text3, marginTop: 3 },
  eventSummary: { fontSize: 14, color: c.text2, lineHeight: 19, marginTop: 4 },
  link: { fontSize: 13, color: c.acidDim, fontWeight: "600", marginTop: 6 },
});
