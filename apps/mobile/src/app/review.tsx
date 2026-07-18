import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@/components/GlassSurface";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { decryptLibrary, loadCachedRows, loadVaultKey } from "@/api/librarySync";
import { enqueueGrade, flushReviewQueue, loadAllGradedMarks, recordGradedMark } from "@/api/reviewEvents";
import {
  applyGradeToQueue,
  parseDeckSnapshot,
  sessionQueue,
  type DeckQueueCard,
  type DeckSnapshot,
  type ReviewGrade,
} from "@/lib/study-session";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Flashcard review (Phase 3): walks the Mac-precomputed queue for one deck.
// Grading is optimistic — the card advances instantly, the grade is queued
// locally and flushed to review_events when online, and the Mac applies it
// through the desktop's own FSRS path next time it's awake. "Again" re-shows
// the card later in this session; everything else completes it.

interface SessionState {
  queue: DeckQueueCard[];
  done: number;
  total: number;
}

export default function ReviewScreen() {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  // The prompt reads like a flashcard face: bigger, centered, roomy line height.
  // Alignment lives on `textgroup` (the Text node markdown-display wraps inline
  // content in) — `body` is only the outer View, so textAlign there wouldn't
  // cascade to the text.
  const promptStyles = {
    ...markdownStyles,
    body: { ...markdownStyles.body, color: c.text, fontSize: 20, lineHeight: 29 },
    textgroup: { textAlign: "center" as const },
  };
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ph?: string }>();
  const pathHash = Array.isArray(params.ph) ? params.ph[0] : params.ph;

  const [snapshot, setSnapshot] = useState<DeckSnapshot | null | undefined>(undefined);
  const [session, setSession] = useState<SessionState | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [key, cache, marks] = await Promise.all([loadVaultKey(), loadCachedRows(), loadAllGradedMarks()]);
      if (!alive) return;
      if (!key || !pathHash) {
        setSnapshot(null);
        return;
      }
      const { docs } = decryptLibrary(cache, key);
      const doc = docs.find((d) => d.pathHash === pathHash && d.kind === "deck");
      const parsed = doc ? parseDeckSnapshot(doc.content) : null;
      setSnapshot(parsed);
      if (parsed) {
        const queue = sessionQueue(parsed, marks[pathHash] ?? []);
        setSession({ done: 0, queue, total: queue.length });
      }
      // Older stranded grades get a flush attempt as the session starts.
      void flushReviewQueue().then(({ pending }) => {
        if (alive) setPendingSync(pending);
      });
    })();
    return () => {
      alive = false;
    };
  }, [pathHash]);

  const current = session?.queue[0];

  // Duplicate-touch latch: a doubled native press event calls grade() twice
  // against the same closure before React re-renders — the second call must
  // no-op or the Mac would apply FSRS twice for one tap. Cleared on every
  // session-state change (which every successful grade produces).
  const gradedLatchRef = useRef<null | string>(null);
  useEffect(() => {
    gradedLatchRef.current = null;
  }, [session]);

  const grade = useMemo(
    () =>
      (rating: ReviewGrade) => {
        if (!session || !current || !snapshot || !pathHash) return;
        if (gradedLatchRef.current === current.key) return;
        gradedLatchRef.current = current.key;
        const reviewedAt = new Date().toISOString();
        const advanced = applyGradeToQueue(session.queue, rating);
        setSession({
          done: session.done + (advanced.completed ? 1 : 0),
          queue: advanced.queue,
          total: session.total,
        });
        setRevealed(false);
        // Every grade goes up (the Mac's FSRS wants "again" too); only a
        // completed card is hidden from future sessions via a graded mark.
        void enqueueGrade({ deckPathHash: pathHash, grade: rating, reviewedAt, scheduleKey: current.key })
          .then(() => (advanced.completed ? recordGradedMark(pathHash, { at: reviewedAt, key: current.key }, snapshot.asOf) : undefined))
          .then(() => flushReviewQueue())
          .then(({ pending }) => setPendingSync(pending))
          .catch(() => {});
      },
    [current, pathHash, session, snapshot],
  );

  const gradeButtons: { rating: ReviewGrade; label: string; color: string }[] = [
    { color: c.danger, label: "Again", rating: "again" },
    { color: c.warn, label: "Hard", rating: "hard" },
    { color: c.accent, label: "Good", rating: "good" },
    { color: c.good, label: "Easy", rating: "easy" },
  ];

  return (
    <View style={[styles.flex, { paddingTop: insets.top + space(2) }]} testID="review-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="review-back" style={styles.backBtn}>
          <Text style={styles.backText}>‹ Study</Text>
        </Pressable>
        {snapshot && session ? (
          <Text style={styles.progress} testID="review-progress">
            {Math.min(session.done + 1, session.total)} / {session.total}
          </Text>
        ) : null}
      </View>

      {snapshot === undefined ? null : snapshot === null ? (
        <View style={styles.emptyWrap}>
          <EmptyBlock title="Deck unavailable" body="It may have been removed on your Mac, or this phone needs re-pairing." />
        </View>
      ) : !session || session.total === 0 ? (
        <View style={styles.emptyWrap} testID="review-none-due">
          <EmptyBlock
            title="Nothing due in this deck"
            body="Come back when cards fall due — your Mac keeps the schedule and republishes this deck as it changes."
          />
        </View>
      ) : !current ? (
        <View style={styles.emptyWrap} testID="review-complete">
          <EmptyBlock
            title={`Session complete — ${session.done} card${session.done === 1 ? "" : "s"}`}
            body={
              pendingSync > 0
                ? `${pendingSync} grade${pendingSync === 1 ? "" : "s"} will sync when you're back online; your Mac applies them and reschedules.`
                : "Grades are on their way to your Mac — it reschedules every card from here."
            }
          />
          <MissionButton label="Done" variant="primary" testID="review-done" onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={[styles.cardBody, !revealed && styles.cardBodyCentered]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.cardHead}>
              <Text style={styles.deckName} numberOfLines={1}>{snapshot.name}</Text>
              {current.isNew ? <Text style={styles.newTag}>NEW</Text> : null}
            </View>
            <GlassSurface style={styles.cardFace} variant="clear">
              <Markdown style={promptStyles}>{current.prompt}</Markdown>
              {revealed ? (
                <View style={styles.answerBlock} testID="review-answer">
                  <View style={styles.divider} />
                  <Markdown style={markdownStyles}>{current.answer}</Markdown>
                  {current.note ? <Text style={styles.note}>{current.note}</Text> : null}
                </View>
              ) : null}
            </GlassSurface>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>
            {revealed ? (
              <View style={styles.gradeRow} testID="review-grades">
                {gradeButtons.map((button) => (
                  <Pressable
                    key={button.rating}
                    testID={`grade-${button.rating}`}
                    onPress={() => grade(button.rating)}
                    style={({ pressed }) => [styles.gradeBtn, { borderColor: button.color }, pressed && styles.gradePressed]}
                  >
                    <Text style={[styles.gradeText, { color: button.color }]}>{button.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Pressable style={styles.revealBtn} testID="review-reveal" onPress={() => setRevealed(true)}>
                <Text style={styles.revealText}>Show answer</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: space(3),
      paddingBottom: space(2),
    },
    backBtn: { paddingVertical: space(1) },
    backText: { ...type.bodyStrong, color: c.text2 },
    progress: { ...type.small, color: c.text2, fontVariant: ["tabular-nums"] },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4) },
    cardScroll: { flex: 1 },
    cardBody: { paddingHorizontal: space(4), paddingTop: space(2), paddingBottom: space(6), flexGrow: 1 },
    // Only the un-revealed (short-prompt) state floats the card to the middle;
    // once the answer is showing the content top-aligns so it can scroll.
    cardBodyCentered: { justifyContent: "center" },
    cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), marginBottom: space(3) },
    deckName: { ...type.micro, color: c.text3, letterSpacing: 1.1, textTransform: "uppercase", flexShrink: 1 },
    newTag: {
      ...type.micro,
      color: c.accent,
      borderColor: c.accentLine,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: space(1.5),
      paddingVertical: 2,
      overflow: "hidden",
    },
    cardFace: {
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: radius.lg,
      paddingHorizontal: space(5),
      paddingVertical: space(7),
      minHeight: 150,
      justifyContent: "center",
    },
    answerBlock: { marginTop: space(2) },
    divider: { height: 1, backgroundColor: c.line2, marginVertical: space(4) },
    note: { ...type.small, color: c.text2, marginTop: space(3), fontStyle: "italic" },
    footer: { paddingHorizontal: space(4), paddingTop: space(2), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg },
    revealBtn: {
      backgroundColor: c.accent,
      borderRadius: radius.md,
      paddingVertical: space(3.5),
      alignItems: "center",
    },
    revealText: { ...type.bodyStrong, color: c.onAccent },
    gradeRow: { flexDirection: "row", gap: space(2) },
    gradeBtn: {
      flex: 1,
      borderWidth: 1.5,
      borderRadius: radius.md,
      paddingVertical: space(3),
      alignItems: "center",
      backgroundColor: c.glass,
    },
    gradePressed: { opacity: 0.7 },
    gradeText: { ...type.bodyStrong },
  });
