import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { decryptLibrary, loadCachedRows, loadVaultKey } from "@/api/librarySync";
import { enqueueGrade, flushReviewQueue, loadAllGradedMarks, recordGradedMark } from "@/api/reviewEvents";
import {
  clozeAnswerHighlight,
  gradeCurrent,
  initSession,
  parseDeckSnapshot,
  sessionCounts,
  sessionQueue,
  type DeckSnapshot,
  type ReviewGrade,
  type ReviewSession,
} from "@/lib/study-session";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Flashcard review (Phase 3): walks the Mac-precomputed queue for one deck as an
// Anki-style session (see study-session.ts). New and lapsed cards cycle back
// within the session until they graduate; a New / Learning / Review counter row
// tracks the buckets live. Grading is optimistic — the card advances instantly.
// Each card emits only its FIRST grade (the "did I recall it when due" signal);
// later learning-step grades stay on the phone so the Mac's FSRS, which applies
// every event as an independent review, isn't over-advanced. The Mac reschedules
// for real next time it's awake.

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
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  // Cards whose grade has already been sent up — each card emits its FIRST grade
  // only, so cycling it through learning steps never double-counts on the Mac.
  const emittedRef = useRef<Set<string>>(new Set());

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
        emittedRef.current = new Set();
        setSession(initSession(sessionQueue(parsed, marks[pathHash] ?? [])));
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

  const current = session?.cards[0];
  const counts = session ? sessionCounts(session) : { fresh: 0, learning: 0, review: 0 };
  // Cloze cards arrive pre-rendered (front blanked, back revealed); highlight the
  // tested span on the back the way Anki does. Null for a normal Q/A card.
  const clozeSplit = current ? clozeAnswerHighlight(current.prompt, current.answer) : null;

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
        setSession(gradeCurrent(session, rating).session);
        setRevealed(false);
        // First grade of this card only: it's the "did I recall it when due"
        // signal the Mac's FSRS models. Later learning-step grades stay local
        // (the Mac applies every event as an independent review — re-sending
        // would over-advance). The graded mark rides along so the card is hidden
        // from the next snapshot until the Mac has ingested this grade.
        if (emittedRef.current.has(current.key)) return;
        emittedRef.current.add(current.key);
        void enqueueGrade({ deckPathHash: pathHash, grade: rating, reviewedAt, scheduleKey: current.key })
          .then(() => recordGradedMark(pathHash, { at: reviewedAt, key: current.key }, snapshot.asOf))
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
        {current ? (
          <View style={styles.counts} testID="review-counts">
            {[
              { color: c.accent, label: "New", value: counts.fresh },
              { color: c.warn, label: "Learn", value: counts.learning },
              { color: c.good, label: "Review", value: counts.review },
            ].map((item) => (
              <View key={item.label} style={styles.countItem}>
                <Text style={[styles.countNum, { color: item.color }]}>{item.value}</Text>
                <Text style={styles.countLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {snapshot === undefined ? null : snapshot === null ? (
        <View style={styles.emptyWrap}>
          <EmptyBlock title="Deck unavailable" body="It may have been removed on your Mac, or this phone needs re-pairing." />
        </View>
      ) : !session || (session.cards.length === 0 && session.completed === 0) ? (
        <View style={styles.emptyWrap} testID="review-none-due">
          <EmptyBlock
            title="Nothing due in this deck"
            body="Come back when cards fall due — your Mac keeps the schedule and republishes this deck as it changes."
          />
        </View>
      ) : !current ? (
        <View style={styles.emptyWrap} testID="review-complete">
          <EmptyBlock
            title={`Session complete — ${session.completed} card${session.completed === 1 ? "" : "s"}`}
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
            {/* No card box and no deck title (owner call) — just the words, with the
                divider between prompt and answer. */}
            {current.isNew ? <Text style={styles.newTag}>NEW</Text> : null}
            <Markdown style={promptStyles}>{current.prompt}</Markdown>
            {revealed ? (
              <View style={styles.answerBlock} testID="review-answer">
                <View style={styles.divider} />
                {clozeSplit ? (
                  <Text style={styles.clozeAnswer} testID="review-cloze-answer">
                    {clozeSplit.before}
                    <Text style={styles.clozeHit}>{clozeSplit.highlight}</Text>
                    {clozeSplit.after}
                  </Text>
                ) : (
                  <Markdown style={markdownStyles}>{current.answer}</Markdown>
                )}
                {current.note ? <Text style={styles.note}>{current.note}</Text> : null}
              </View>
            ) : null}
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
    // Anki-style New / Learning / Review tallies — three coloured numbers with a
    // tiny label so it's legible without knowing Anki's colour code.
    counts: { flexDirection: "row", gap: space(3) },
    countItem: { alignItems: "center" },
    countNum: { ...type.bodyStrong, fontVariant: ["tabular-nums"], lineHeight: 20 },
    countLabel: { ...type.micro, color: c.text3, marginTop: 1 },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4) },
    cardScroll: { flex: 1 },
    cardBody: { paddingHorizontal: space(4), paddingTop: space(2), paddingBottom: space(6), flexGrow: 1 },
    // Only the un-revealed (short-prompt) state floats the card to the middle;
    // once the answer is showing the content top-aligns so it can scroll.
    cardBodyCentered: { justifyContent: "center" },
    newTag: {
      ...type.micro,
      color: c.accent,
      borderColor: c.accentLine,
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: space(1.5),
      paddingVertical: 2,
      overflow: "hidden",
      alignSelf: "center",
      marginBottom: space(3),
    },
    answerBlock: { marginTop: space(2) },
    // Cloze answer: the revealed sentence, echoing the prompt's size/centering,
    // with the tested word highlighted (Anki's blue-highlight behaviour).
    clozeAnswer: { ...type.body, color: c.text, fontSize: 20, lineHeight: 29, textAlign: "center" },
    clozeHit: { color: c.accent, fontWeight: "700" },
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
