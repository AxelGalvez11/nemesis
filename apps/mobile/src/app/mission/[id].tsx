import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { EmptyBlock, MissionButton, StatusPill, Surface } from "@/components/mission-ui";
import {
  cancelMission,
  getMission,
  isDesktopOnline,
  listMissionEvents,
  markReviewed,
  requestChanges,
  statusLabel,
  subscribeMission,
  type Mission,
  type MissionEvent,
} from "@/api/missions";
import { space, type } from "@/theme/tokens";
import tokens from "@/theme/tokens.json";

// Live mission detail (Task 8). Fetches the mission + its event history once, then
// subscribes for live updates (Task 7's subscribeMission) so a running mission's log
// lines and final result appear without a manual refresh. Pull-to-refresh is a manual
// escape hatch on top of that — Supabase Realtime on an RLS table needs the
// publication set up correctly (Task 1) to stream at all (see the plan's Risks
// section), so this screen doesn't assume it always will. Review actions are the two
// the plan's hard rule specifies — "Looks good" (done) and "Needs changes" (adds an
// event) — plus a non-submitting "Copy result" convenience. Nothing here reaches out
// to a school portal; the agent's own never-submit rule lives on the desktop side.

const { colors, radius } = tokens;

function eventText(e: MissionEvent): string {
  const p = e.payload;
  if (typeof p.line === "string") return p.line;
  if (typeof p.summary === "string") return p.summary;
  if (typeof p.note === "string") return p.note;
  if (typeof p.status === "string") return `Status: ${p.status}`;
  return e.type;
}

function eventLabel(e: MissionEvent): string {
  switch (e.type) {
    case "status":
      return "Status";
    case "log":
      return e.payload.source === "review" ? "You" : "Nemesis";
    case "result":
      return "Result";
    case "error":
      return "Error";
    default:
      return e.type;
  }
}

export default function MissionDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [mission, setMission] = useState<Mission | null>(null);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busyAction, setBusyAction] = useState<"reviewed" | "changes" | "cancel" | null>(null);
  const [copied, setCopied] = useState(false);
  const [desktopOnline, setDesktopOnline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [m, evs] = await Promise.all([getMission(id), listMissionEvents(id)]);
      setMission(m);
      setEvents(evs);
      setError(m ? null : "Mission not found.");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const unsubscribe = subscribeMission(
      id,
      (evt) => {
        setEvents((prev) => (prev.some((e) => e.id === evt.id) ? prev : [...prev, evt]));
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      },
      (m) => setMission(m),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [id]);

  // Same "Waiting for your Mac" vs "Queued" distinction the list screen makes — a
  // one-shot check (not a poll loop) is enough here since a queued mission's status
  // flips the moment the desktop claims it, which arrives via subscribeMission above.
  useEffect(() => {
    let cancelled = false;
    void isDesktopOnline().then((online) => {
      if (!cancelled) setDesktopOnline(online);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;

  const act = async (kind: "reviewed" | "changes" | "cancel") => {
    if (!mission || busyAction) return;
    setBusyAction(kind);
    setError(null);
    try {
      if (kind === "reviewed") {
        await markReviewed(mission.id);
        setMission({ ...mission, status: "done" });
      } else if (kind === "changes") {
        const created = await requestChanges(mission.id, note);
        // Optimistic: show it now rather than waiting on the realtime echo (which
        // subscribeMission dedupes by id, so this never double-adds if it does echo).
        setEvents((prev) => (prev.some((e) => e.id === created.id) ? prev : [...prev, created]));
        setNote("");
      } else {
        await cancelMission(mission.id);
        setMission({ ...mission, status: "cancelled" });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const copyResult = async () => {
    if (!mission?.result_summary) return;
    await Clipboard.setStringAsync(mission.result_summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: false }} />

      {loading ? (
        <View style={styles.centered} testID="mission-detail-loading">
          <ActivityIndicator color={colors.foreground} />
        </View>
      ) : !mission ? (
        <EmptyBlock title="Mission not found" body={error ?? "It may have been removed."} />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {mission.title}
            </Text>
            <StatusPill status={mission.status} label={statusLabel(mission, desktopOnline)} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.feed}
            testID="mission-event-feed"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await refresh();
                  setRefreshing(false);
                }}
                tintColor={colors.muted}
              />
            }
          >
            <Surface style={styles.promptCard}>
              <Text style={styles.promptLabel}>Prompt</Text>
              <Text style={styles.promptText}>{mission.prompt}</Text>
            </Surface>

            {events.length === 0 ? (
              <Text style={styles.noEvents}>No activity yet.</Text>
            ) : (
              events.map((e) => (
                <View key={e.id} style={styles.eventRow}>
                  <Text style={styles.eventLabel}>{eventLabel(e)}</Text>
                  <Text style={styles.eventText}>{eventText(e)}</Text>
                </View>
              ))
            )}

            {mission.status === "needs_review" ? (
              <Surface style={styles.reviewCard} testID="mission-review-card">
                <Text style={styles.promptLabel}>Ready for review</Text>
                <Text style={styles.reviewText}>{mission.result_summary ?? "No summary."}</Text>
                <TextInput
                  testID="mission-note-input"
                  style={styles.noteInput}
                  placeholder="Add a note (optional)"
                  placeholderTextColor={colors.muted}
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
                <View style={styles.actions}>
                  <MissionButton
                    testID="mission-looks-good"
                    label="Looks good"
                    variant="primary"
                    busy={busyAction === "reviewed"}
                    disabled={busyAction !== null}
                    onPress={() => void act("reviewed")}
                  />
                  <MissionButton
                    testID="mission-needs-changes"
                    label="Needs changes"
                    variant="secondary"
                    busy={busyAction === "changes"}
                    disabled={busyAction !== null}
                    onPress={() => void act("changes")}
                  />
                  <MissionButton
                    testID="mission-copy-result"
                    label={copied ? "Copied" : "Copy result"}
                    variant="secondary"
                    disabled={!mission.result_summary}
                    onPress={() => void copyResult()}
                  />
                </View>
              </Surface>
            ) : null}

            {mission.status === "queued" ? (
              <MissionButton
                testID="mission-cancel"
                label="Cancel"
                variant="secondary"
                busy={busyAction === "cancel"}
                disabled={busyAction !== null}
                onPress={() => void act("cancel")}
              />
            ) : null}

            {error ? <Text style={styles.err}>{error}</Text> : null}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space(3),
    padding: space(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, ...type.h2, color: colors.foreground },

  feed: { padding: space(4), gap: space(3.5), paddingBottom: space(8) },
  promptCard: { gap: space(1.5) },
  promptLabel: { ...type.micro, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  promptText: { ...type.body, color: colors.foreground },

  noEvents: { ...type.small, color: colors.muted, textAlign: "center", paddingVertical: space(3) },
  eventRow: { gap: space(0.5) },
  eventLabel: { ...type.micro, color: colors.muted, fontWeight: "600" },
  eventText: { ...type.body, color: colors.foreground },

  reviewCard: { borderColor: colors.accentBorder, backgroundColor: colors.accentFaint, gap: space(2.5) },
  reviewText: { ...type.body, color: colors.foreground },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    color: colors.foreground,
    fontSize: 14.5,
    minHeight: 44,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space(2.5) },

  err: { ...type.small, color: colors.accent },
});
