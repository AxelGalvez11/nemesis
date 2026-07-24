import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { EmptyBlock } from "@/components/mission-ui";
import { GlassSurface } from "@/components/GlassSurface";
import { Skeleton } from "@/components/Skeleton";
import { ChevronIcon } from "@/components/icons";
import { loadRecordingArtifact } from "@/api/chat";
import { spokenDuration } from "@/lib/recording";
import type { ChatOutput } from "@/lib/chat-thread";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, space, type } from "@/theme/tokens";

// Fullscreen recording view (owner item 3): the recording chip in a chat opens
// HERE, not the bottom sheet — title + date + duration, then the AI notes and
// the full transcript, both scrollable and selectable. There is deliberately NO
// audio playback and no play button: the enhance pass deletes the audio once the
// sharper transcript lands, and nothing keeps a copy, so a play control would be
// dead (owner decision).
//
// The body is re-fetched from chat_recording_artifacts by id (api/chat.ts
// loadRecordingArtifact) rather than read off the in-memory chip, because web
// strips an oversized transcript out of the meta mirror — the artifact row is
// the only reliable source, and it also carries the freshest post-enhance
// transcript/notes/title.
//
// LANDMINE (owner batch 10): the iOS edge-swipe-back is not something to rely on
// as this screen's only exit. The back control below sits in NORMAL FLOW at the
// very top and is rendered in EVERY branch — loading, unavailable, and loaded —
// so there is no state this screen can reach without a visible way out. (This is
// the review.tsx "Deck unavailable" dead-end trap; keep the button outside the
// state switch.)

// Loading skeleton line widths — varied so the placeholder doesn't read as a row
// of identical bars (same idea as note.tsx).
const SKELETON_LINE_WIDTHS = ["92%", "84%", "70%", "88%", "62%"] as const;

/** Fuller than the card's day-only line — the fullscreen has room for the year. */
function formatFullDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function RecordingScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  // undefined = still loading; null = not found / unavailable.
  const [rec, setRec] = useState<ChatOutput | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setRec(undefined);
    if (!userId || !id) {
      setRec(null);
      return;
    }
    void (async () => {
      const loaded = await loadRecordingArtifact(userId, id);
      if (alive) setRec(loaded);
    })();
    return () => {
      alive = false;
    };
  }, [userId, id]);

  // The header's meta line: "23 July 2026 · Recorded 25 minutes" — same spoken
  // duration the chip card uses, so the two never disagree.
  const meta = useMemo(() => {
    if (!rec) return "";
    return [formatFullDate(rec.createdAt), typeof rec.durationSeconds === "number" ? `Recorded ${spokenDuration(rec.durationSeconds)}` : ""]
      .filter(Boolean)
      .join(" · ");
  }, [rec]);

  // Notes are stored newline-joined without a bullet prefix (liveNotesText) — add
  // one here for reading. Selectable so the student can copy a bullet out.
  const noteLines = useMemo(
    () => (rec?.notes ? rec.notes.split("\n").map((line) => line.trim()).filter(Boolean) : []),
    [rec?.notes],
  );

  return (
    <View style={styles.flex} testID="recording-screen">
      <Stack.Screen options={{ headerShown: false }} />
      {/* Back control — ALWAYS rendered, in normal flow, so every branch below
          has a visible exit (see the landmine note above). */}
      <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          testID="recording-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <GlassSurface style={styles.backBtn} fallbackColor={c.glassPanel} shadow>
            <View style={styles.backChevron}>
              <ChevronIcon size={18} color={c.text} strokeWidth={2.2} />
            </View>
          </GlassSurface>
        </Pressable>
      </View>

      {rec === undefined ? (
        <View style={styles.body} testID="recording-skeleton">
          <Skeleton width="70%" height={30} style={styles.skeletonTitle} />
          <Skeleton width="45%" height={14} style={styles.skeletonMeta} />
          {SKELETON_LINE_WIDTHS.map((w, i) => (
            <Skeleton key={i} width={w} height={16} style={styles.skeletonLine} />
          ))}
        </View>
      ) : rec === null ? (
        <View style={styles.emptyWrap}>
          <EmptyBlock
            title="Recording unavailable"
            body="It may have been deleted, or hasn't reached this phone yet — reopen it from the chat, or pull to refresh there."
          />
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title} selectable testID="recording-title">
            {rec.title || "Recording"}
          </Text>
          {meta ? (
            <Text style={styles.meta} testID="recording-meta">
              {meta}
            </Text>
          ) : null}

          {noteLines.length ? (
            <View testID="recording-notes">
              <Text style={styles.sectionHead}>Notes</Text>
              {noteLines.map((line, i) => (
                <View key={i} style={styles.noteRow}>
                  <Text style={styles.noteBullet}>•</Text>
                  <Text style={styles.noteText} selectable>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.sectionHead}>Transcript</Text>
          {rec.transcript ? (
            <Text style={styles.transcript} selectable testID="recording-transcript">
              {rec.transcript}
            </Text>
          ) : (
            <Text style={styles.mutedText}>No transcript was saved for this recording.</Text>
          )}
          <View style={{ height: insets.bottom + space(8) }} />
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    header: { paddingHorizontal: space(3), paddingBottom: space(2) },
    // Round liquid-glass back button, matching note.tsx's floating back control.
    backBtn: {
      width: control.lg,
      height: control.lg,
      borderRadius: control.lg / 2,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    // ChevronIcon points right by default; a back arrow points the other way.
    backChevron: { transform: [{ rotate: "180deg" }] },
    body: { paddingHorizontal: space(5), paddingTop: space(1) },
    title: { ...type.h1, color: c.text, marginBottom: space(2) },
    meta: { ...type.small, color: c.text3, marginBottom: space(5) },
    sectionHead: { ...type.micro, color: c.text2, letterSpacing: 1.1, textTransform: "uppercase", marginTop: space(4), marginBottom: space(2) },
    noteRow: { flexDirection: "row", marginBottom: space(1.5) },
    noteBullet: { ...type.body, color: c.text3, width: space(4) },
    noteText: { ...type.body, color: c.text, flex: 1 },
    transcript: { ...type.body, color: c.text2 },
    mutedText: { ...type.small, color: c.text3 },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },
    skeletonTitle: { marginBottom: space(3) },
    skeletonMeta: { marginBottom: space(5) },
    skeletonLine: { marginBottom: space(3) },
  });
