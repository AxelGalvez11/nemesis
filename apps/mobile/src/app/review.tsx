import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Markdown from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { decryptLibrary, loadCachedRows, loadVaultKey } from "@/api/librarySync";
import { enqueueGrade, flushReviewQueue, loadAllGradedMarks, recordGradedMark } from "@/api/reviewEvents";
import {
  clozeParts,
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
  // Cloze cards arrive pre-rendered (front blanked, back revealed); clozeParts
  // recovers the blank marker AND the tested span so the card reveals IN PLACE
  // — one sentence throughout, Anki-style — instead of a separate
  // blanked-front / full-answer pair. Null for a normal Q/A card.
  const clozeSplit = current ? clozeParts(current.prompt, current.answer) : null;

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
          <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardBody} showsVerticalScrollIndicator={false}>
            {/* No card box and no deck title (owner call) — just the words. The
                Pressable fills the whole content area, so a tap ANYWHERE on the
                card (not just on the glyphs) reveals the answer; the grade
                buttons then take over in the footer below. */}
            <Pressable
              onPress={() => setRevealed(true)}
              disabled={revealed}
              accessibilityLabel="Reveal answer"
              testID="review-card"
              style={[styles.cardPressable, !revealed && styles.cardPressableCentered]}
            >
              {current.isNew ? <Text style={styles.newTag}>NEW</Text> : null}
              {clozeSplit ? (
                <>
                  {/* True in-place cloze reveal (Anki-style): ONE sentence — the
                      blank marker swaps for the tested word where it sits. No
                      divider, no separate answer block. */}
                  <Text style={styles.clozeAnswer} testID={revealed ? "review-cloze-answer" : "review-cloze-blank"}>
                    {clozeSplit.before}
                    <Text style={styles.clozeHit}>{revealed ? clozeSplit.highlight : clozeSplit.blank}</Text>
                    {clozeSplit.after}
                  </Text>
                  {revealed && current.note ? <Text style={styles.note}>{current.note}</Text> : null}
                </>
              ) : (
                <>
                  <Markdown style={promptStyles}>{current.prompt}</Markdown>
                  {revealed ? (
                    <View style={styles.answerBlock} testID="review-answer">
                      <View style={styles.divider} />
                      <Markdown style={markdownStyles}>{current.answer}</Markdown>
                      {current.note ? <Text style={styles.note}>{current.note}</Text> : null}
                    </View>
                  ) : null}
                </>
              )}
              {!revealed ? <Text style={styles.hint}>Tap to reveal</Text> : null}
            </Pressable>
          </ScrollView>

          {revealed ? (
            <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>
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
            </View>
          ) : null}
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
    // The reveal Pressable fills this whole (flexGrow: 1) content area, so a
    // tap anywhere in the blank space — not just on the text — flips the card.
    // Only the un-revealed (short-prompt) state centers it; once the answer is
    // showing the content top-aligns so long answers can scroll.
    cardPressable: { flexGrow: 1 },
    cardPressableCentered: { justifyContent: "center" },
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
    // Cloze sentence: same size/centering as the prompt markdown, one sentence
    // throughout. `clozeHit` does double duty — accent/bold on the blank
    // marker pre-reveal, then the same accent/bold treatment on the revealed
    // word (Anki's highlight look either way).
    clozeAnswer: { ...type.body, color: c.text, fontSize: 20, lineHeight: 29, textAlign: "center" },
    clozeHit: { color: c.accent, fontWeight: "700" },
    divider: { height: 1, backgroundColor: c.line2, marginVertical: space(4) },
    note: { ...type.small, color: c.text2, marginTop: space(3), fontStyle: "italic" },
    // Subtle nudge shown only pre-reveal, under the prompt/cloze sentence —
    // replaces the old "Show answer" button now that the card itself is tappable.
    hint: { ...type.small, color: c.text3, textAlign: "center", marginTop: space(4) },
    footer: { paddingHorizontal: space(4), paddingTop: space(2), borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg },
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
