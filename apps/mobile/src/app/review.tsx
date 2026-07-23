import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { MessageBody } from "@/components/MessageBody";
import { ChevronIcon } from "@/components/icons";
import { GlassSurface } from "@/components/GlassSurface";
import {
  fetchCloudStudy,
  gradeStudyCard,
  type CloudStudyCard,
  type CloudStudyDeck,
  type StudyGrade,
} from "@/api/cloudStudy";
import { hapticHoldRegistered } from "@/lib/haptics";
import {
  applyGrade,
  EMPTY_PROGRESS,
  sessionCounts,
  sessionQueue,
  type SessionProgress,
} from "@/lib/review-queue";
import { normalizeCardText } from "@/lib/card-text";
import { clozeParts } from "@/lib/study-session";
import { activeClozeNumber, hasCloze, renderCloze } from "@/lib/study-cloze";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { control, radius, space, type } from "@/theme/tokens";

// Flashcard review (cloud-first phone, build spec §8): walks the LIVE due
// queue for one cloud deck (study_decks/study_cards via api/cloudStudy.ts).
// Grading calls the shared grade_study_card RPC per grade — same server math
// the web workspace uses, online-required (the old Mac offline grade-queue is
// retired for cloud Study). A card that fails to grade (offline, or the RPC
// rejects it) stays exactly where it is — revealed, ungraded — so the student
// can retry once they're back online instead of silently losing the review.
//
// Owner asks, 2026-07-23 — four changes that turned out to be one design:
//
//  - "the 'new review, due' numbers in study review do not update at all"
//  - "allow users to tap on right side of screen for 'good' and left side for
//    'again'"
//  - "swiping left should undo the card"
//  - "the review page should hide a 'back' button but only show it if users
//    swipe down to reveal it, it should go away after 5 seconds"
//
// The counts were the root of it. Every graded card used to leave the sitting
// for good, so on a freshly imported deck (all cards new) New was the only
// number that could ever move and Learn and Due sat at zero forever. The fix is
// Anki's learning step, which this screen dropped when the old Mac offline
// queue was retired: pressing "Again" now returns the card at the END of this
// sitting instead of pushing it a day out and forgetting it. lib/review-queue.ts
// owns that ordering and the tally.
//
// That also makes the left-half "Again" tap zone safe. Before, a mis-tapped
// Again cost you the card for a day; now it costs you one more look. Undo is
// session-level for the same honest reason the replay is: study_review_logs is
// an append-only record of what the student pressed, and there is no ungrade
// RPC — so undo rewinds the QUEUE, and correcting the grade means grading again.

/** How long the pulled-for back button stays up (owner: "go away after 5 seconds"). */
const BACK_VISIBLE_MS = 5000;
/** How far the card has to be pulled past its top edge to summon that button. */
const BACK_PULL_DISTANCE = 56;
/** How far a leftward swipe has to travel to count as "undo that". */
const UNDO_SWIPE_DISTANCE = 60;

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
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const params = useLocalSearchParams<{ deckId?: string }>();
  const deckId = Array.isArray(params.deckId) ? params.deckId[0] : params.deckId;

  // undefined = still loading; null = deck not found / unavailable.
  const [deck, setDeck] = useState<CloudStudyDeck | null | undefined>(undefined);
  const [cards, setCards] = useState<CloudStudyCard[]>([]);
  const [progress, setProgress] = useState<SessionProgress>(EMPTY_PROGRESS);
  const [revealed, setRevealed] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  // The undo trail: one entry per grade, most recent last, each holding the
  // sitting as it stood before the grade plus the card's own fields before the
  // server rescheduled it. A ref rather than state because nothing renders from
  // it — and because the gesture that reads it must see the value synchronously.
  const undoRef = useRef<{ progress: SessionProgress; card: CloudStudyCard }[]>([]);
  // The back button is hidden until pulled for (owner 2026-07-23), then goes
  // away on its own — see BACK_VISIBLE_MS.
  const [backShown, setBackShown] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!userId || !deckId) {
      setDeck(null);
      return;
    }
    setDeck(undefined);
    void (async () => {
      try {
        const { decks, cards: allCards } = await fetchCloudStudy(userId);
        if (!alive) return;
        const found = decks.find((item) => item.id === deckId) ?? null;
        setDeck(found);
        setCards(found ? allCards.filter((card) => card.deckId === found.id) : []);
        setProgress(EMPTY_PROGRESS);
        undoRef.current = [];
        setRevealed(false);
        setGradeError(null);
      } catch {
        if (alive) setDeck(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [deckId, userId]);

  // The live queue and the three-number footer both come out of
  // lib/review-queue.ts, which is where the "the numbers never move" bug was
  // actually fixed (owner 2026-07-23) — a card you press Again on now comes
  // back at the end of this sitting instead of disappearing for a day, which is
  // what makes Learn a real number and what makes the new left-half Again tap
  // zone safe to mis-hit.
  const queue = useMemo(() => sessionQueue(cards, progress, new Date()), [cards, progress]);
  const current = queue[0] ?? null;
  const counts = useMemo(() => sessionCounts(queue, progress), [queue, progress]);

  // Anki-imported cards keep a few bare HTML tags the phone's markdown
  // renderer can't read (an <img> among them, which is why a card could show a
  // raw image URL as words). Normalizing first means every surface below —
  // markdown, math, and the plain-Text cloze line — sees the same clean text.
  const front = useMemo(() => normalizeCardText(current?.front ?? ""), [current?.front]);
  const back = useMemo(() => normalizeCardText(current?.back ?? ""), [current?.back]);

  // TWO different cloze formats reach this screen, and they need opposite
  // treatment — check the Anki one FIRST.
  //
  // 1. Anki syntax, `{{c1::answer}}`, sitting raw in the card's own text (every
  //    .apkg import, the Captain Hook starter deck included). study-cloze.ts
  //    rewrites it to markdown: a bold [...] until revealed, the answer after.
  //    Until 2026-07-22 nothing on the phone parsed this at all, so the braces
  //    reached the screen as literal text (owner screenshot).
  // 2. The historic Mac format: an author-written blanked front mirroring a
  //    full back, which clozeParts recovers by aligning the two strings.
  //
  // Format 1 must win, because clozeParts FALSE-FIRES on it: its guard only
  // asks whether the front contains "[", and every one of these cards opens
  // with a markdown image — `![](…)` — so it "aligned" two unrelated strings
  // and rendered the garbage through a plain <Text>, which is also why the
  // images and *emphasis* stayed literal. Anything with {{c}} skips it.
  const ankiCloze = hasCloze(front);
  const activeCloze = ankiCloze ? activeClozeNumber(front, current?.repetitions ?? 0) : null;
  // What the prompt actually renders — markdown either way, so images and
  // emphasis work. Never a bare <Text>: the answer to one of these blanks is
  // itself usually an image.
  const promptText = ankiCloze ? renderCloze(front, activeCloze, revealed) : front;
  const clozeSplit = current && current.cardType === "cloze" && !ankiCloze ? clozeParts(front, back) : null;

  // Duplicate-touch latch: a doubled native press event can call grade() twice
  // against the same closure before React re-renders. A ref is synchronous
  // (state wouldn't be visible in time), so it's the actual re-entrancy guard;
  // `grading` state below is only for the visual disabled look.
  const gradingRef = useRef(false);
  useEffect(() => {
    gradingRef.current = false;
  }, [current?.id]);

  // grade() awaits the server, so it can't read `progress` off its own render
  // closure and still be sure it's current. gradingRef makes grades one-at-a-
  // time, and this mirror is what the undo entry is built from.
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  async function grade(value: StudyGrade) {
    if (!current || gradingRef.current) return;
    gradingRef.current = true;
    setGrading(true);
    setGradeError(null);
    const before = current;
    const beforeProgress = progressRef.current;
    const result = await gradeStudyCard(current.id, value);
    gradingRef.current = false;
    setGrading(false);
    if (!result.ok) {
      // Stay put — revealed, ungraded — so the student can retry once online.
      setGradeError(result.message);
      return;
    }
    // Write the server's answer back into the local card. It used to be
    // discarded, which meant the footer was tallying stale scheduling fields
    // for the rest of the sitting.
    setCards((rows) =>
      rows.map((row) =>
        row.id === before.id
          ? {
              ...row,
              dueAt: result.dueAt,
              intervalDays: result.intervalDays,
              lapses: result.lapses,
              repetitions: result.repetitions,
            }
          : row,
      ),
    );
    undoRef.current = [...undoRef.current, { card: before, progress: beforeProgress }];
    setProgress(applyGrade(beforeProgress, before.id, value === "again"));
    setRevealed(false);
  }

  /**
   * Swipe left: take back the last grade (owner 2026-07-23).
   *
   * This rewinds THE SITTING — the card returns to the front of the queue with
   * its old scheduling fields, revealed, ready to be graded again. It does NOT
   * un-write the server's review: there is no ungrade RPC, and study_review_logs
   * is an append-only record of what the student actually pressed. Re-grading
   * the card calls the RPC again, which is the honest way to correct a mis-tap.
   */
  const undo = useCallback(() => {
    if (gradingRef.current) return;
    const last = undoRef.current[undoRef.current.length - 1];
    if (!last) return;
    undoRef.current = undoRef.current.slice(0, -1);
    setCards((rows) => rows.map((row) => (row.id === last.card.id ? last.card : row)));
    setProgress(last.progress);
    setGradeError(null);
    // Revealed, because you have just seen this card's answer — hiding it again
    // would make undo feel like a fresh card rather than a correction.
    setRevealed(true);
    hapticHoldRegistered();
  }, []);

  // The back button appears when the card is pulled down and leaves on its own.
  useEffect(() => {
    if (!backShown) return;
    const timer = setTimeout(() => setBackShown(false), BACK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [backShown]);

  const backFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(backFade, {
      toValue: backShown ? 1 : 0,
      duration: backShown ? 160 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [backShown, backFade]);

  // Swipe LEFT anywhere on the card to undo. activeOffsetX means it only takes
  // over once the finger has genuinely committed sideways, and failOffsetY hands
  // the gesture back to the card's own scrolling the moment it drifts vertical —
  // otherwise reading a long answer would keep tripping the undo.
  const undoSwipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (event.translationX < -UNDO_SWIPE_DISTANCE) undo();
        }),
    [undo],
  );

  // Muted, non-neon fills with white text — the hue reads clearly (more opaque) but stays
  // matte, not lightened. Again=red, Hard=yellow/amber, Good=green, Easy=blue.
  const gradeButtons: { rating: StudyGrade; label: string; fill: string }[] = [
    { fill: "#8a3b41", label: "Again", rating: "again" },
    { fill: "#7d6526", label: "Hard", rating: "hard" },
    { fill: "#3c6d4d", label: "Good", rating: "good" },
    { fill: "#3a5c84", label: "Easy", rating: "easy" },
  ];

  return (
    <View style={[styles.flex, { paddingTop: insets.top + space(2) }]} testID="review-screen">
      {/* Still no PERMANENT back button (owner 2026-07-22 — the card is the
          whole screen), but no longer none at all: owner 2026-07-23 asked for
          one you can pull down for, which then leaves on its own. Pulling the
          card down past its top reveals it for five seconds. It rides the
          ScrollView's own bounce rather than a downward swipe gesture, which
          keeps it clear of both the card's scrolling and the OS notification
          shade at the very top of the screen. */}
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View
        style={[styles.backFloat, { opacity: backFade, top: insets.top + space(1) }]}
        pointerEvents={backShown ? "auto" : "none"}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="review-back"
        >
          <GlassSurface style={styles.backBtn} fallbackColor={c.glassMenu} opaque shadow>
            <View style={styles.backChevron}>
              <ChevronIcon size={18} color={c.text} strokeWidth={2.2} />
            </View>
          </GlassSurface>
        </Pressable>
      </Animated.View>

      {deck === undefined ? null : deck === null ? (
        <View style={styles.emptyWrap}>
          <EmptyBlock title="Deck unavailable" body="This deck may have been deleted, or you may need to sign in again." />
        </View>
      ) : !current ? (
        <View style={styles.emptyWrap} testID={progress.doneIds.length > 0 ? "review-complete" : "review-none-due"}>
          <EmptyBlock
            title={
              progress.doneIds.length > 0
                ? `Session complete — ${progress.doneIds.length} card${progress.doneIds.length === 1 ? "" : "s"}`
                : "Nothing due in this deck"
            }
            body={
              progress.doneIds.length > 0
                ? "Nice work — come back when more cards fall due."
                : "Come back when cards fall due, or add more from the web app."
            }
          />
          <MissionButton label="Done" variant="primary" testID="review-done" onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <GestureDetector gesture={undoSwipe}>
            <ScrollView
              style={styles.cardScroll}
              contentContainerStyle={styles.cardBody}
              showsVerticalScrollIndicator={false}
              alwaysBounceVertical
              scrollEventThrottle={16}
              onScroll={(e) => {
                // Pulled down past the top edge — show the way out.
                if (e.nativeEvent.contentOffset.y < -BACK_PULL_DISTANCE) setBackShown(true);
              }}
            >
              {/* No card box and no deck title (owner call) — just the words. The
                  Pressable fills the whole content area, so a tap ANYWHERE on the
                  card (not just on the glyphs) reveals the answer; once revealed
                  the two halves become Again (left) and Good (right), the two
                  grades that carry almost every review. Hard and Easy stay in the
                  footer, which also keeps all four labelled and reachable. */}
              <Pressable
                onPress={() => setRevealed(true)}
                disabled={revealed}
                accessibilityLabel="Reveal answer"
                testID="review-card"
                style={styles.cardPressable}
              >
                {current.cardType === "image_occlusion" ? (
                  // Graceful fallback — image occlusion cards don't render on the
                  // phone in v1 (do NOT attempt image rendering). Still gradable:
                  // the student can recall-and-grade from memory, or skip to web.
                  <View testID="review-image-fallback">
                    <Text style={promptStyles.body as object}>{front || "Image card"}</Text>
                    <Text style={styles.imageFallbackNote}>Open on web for image cards.</Text>
                  </View>
                ) : clozeSplit ? (
                  <>
                    {/* True in-place cloze reveal (Anki-style): ONE sentence — the
                        blank marker swaps for the tested word where it sits. */}
                    <Text style={styles.clozeAnswer} testID={revealed ? "review-cloze-answer" : "review-cloze-blank"}>
                      {clozeSplit.before}
                      <Text style={styles.clozeHit}>{revealed ? clozeSplit.highlight : clozeSplit.blank}</Text>
                      {clozeSplit.after}
                    </Text>
                  </>
                ) : (
                  <>
                    {/* MessageBody, not a bare Markdown block: it splits LaTeX out
                        and draws it as SVG. Chat already rendered math this way;
                        flashcards were still showing the raw $…$ source. For an
                        Anki cloze card promptText is the blanked/revealed
                        rewrite — see the two-formats note above. */}
                    <MessageBody content={promptText} styles={promptStyles} />
                    {revealed ? (
                      <View style={styles.answerBlock} testID="review-answer">
                        <View style={styles.divider} />
                        <MessageBody content={back} styles={markdownStyles} />
                      </View>
                    ) : null}
                  </>
                )}
              </Pressable>

              {/* The two tap zones, laid over the card once the answer is up.
                  They live INSIDE the scroll content on purpose: the ScrollView is
                  then their ancestor, so a drag still scrolls a long answer and
                  only a genuine tap grades. Absent before the reveal — a
                  half-screen "Again" target on a card you haven't read yet would
                  grade it out from under you. */}
              {revealed ? (
                <View style={styles.tapZones} testID="review-tap-zones">
                  <Pressable
                    style={styles.tapZone}
                    disabled={grading}
                    onPress={() => void grade("again")}
                    accessibilityRole="button"
                    accessibilityLabel="Again"
                    testID="review-tap-again"
                  />
                  <Pressable
                    style={styles.tapZone}
                    disabled={grading}
                    onPress={() => void grade("good")}
                    accessibilityRole="button"
                    accessibilityLabel="Good"
                    testID="review-tap-good"
                  />
                </View>
              ) : null}
            </ScrollView>
          </GestureDetector>

          <View style={[styles.footer, { paddingBottom: insets.bottom + space(3) }]}>
            {gradeError ? <Text style={styles.gradeErrorText} accessibilityRole="alert">{gradeError}</Text> : null}
            <View style={styles.counts} testID="review-counts">
              {[
                { color: c.info, label: "New", value: counts.fresh },
                { color: c.warn, label: "Learn", value: counts.learn },
                { color: c.accent, label: "Due", value: counts.due },
              ].map((item) => (
                <View key={item.label} style={styles.countItem}>
                  <Text style={[styles.countNum, { color: item.color }]}>{item.value}</Text>
                  <Text style={styles.countLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
            {revealed ? (
              <View style={styles.gradeRow} testID="review-grades">
                {gradeButtons.map((button) => (
                  <Pressable
                    key={button.rating}
                    testID={`grade-${button.rating}`}
                    disabled={grading}
                    onPress={() => void grade(button.rating)}
                    style={({ pressed }) => [
                      styles.gradeBtn,
                      { backgroundColor: button.fill },
                      pressed && styles.gradePressed,
                      grading && styles.gradeBtnDisabled,
                    ]}
                  >
                    <Text style={styles.gradeText}>{button.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    // New / Learn / Due tallies for what's LEFT in this session's queue.
    counts: { flexDirection: "row", gap: space(4), justifyContent: "center", marginBottom: space(3) },
    countItem: { alignItems: "center" },
    countNum: { ...type.bodyStrong, fontVariant: ["tabular-nums"], lineHeight: 20 },
    countLabel: { ...type.micro, color: c.text3, marginTop: 1 },
    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6), gap: space(4) },
    cardScroll: { flex: 1 },
    cardBody: { paddingHorizontal: space(4), paddingTop: space(5), paddingBottom: space(6), flexGrow: 1 },
    // The reveal Pressable fills this whole (flexGrow: 1) content area, so a tap
    // anywhere in the blank space — not just on the text — flips the card. The
    // content is TOP-anchored in both states — the prompt keeps the same Y, the
    // answer just appends below it.
    cardPressable: { flexGrow: 1 },
    // Left half = Again, right half = Good, laid over the whole card area.
    // Invisible on purpose: the four labelled buttons in the footer are what
    // TEACH the grades, and a pair of tinted panels behind every flashcard would
    // fight the card's own text for attention all session long.
    tapZones: { bottom: 0, flexDirection: "row", left: 0, position: "absolute", right: 0, top: 0 },
    tapZone: { flex: 1 },
    // The pulled-for way out. Left edge, clear of the card's centered text.
    backFloat: { position: "absolute", left: space(4), zIndex: 10 },
    backBtn: { width: control.md, height: control.md, borderRadius: control.md / 2, alignItems: "center", justifyContent: "center" },
    // ChevronIcon points right by default; a back arrow points the other way.
    backChevron: { transform: [{ rotate: "180deg" }] },
    answerBlock: { marginTop: space(2) },
    imageFallbackNote: { ...type.small, color: c.text2, textAlign: "center", marginTop: space(3) },
    // Cloze sentence: same size/centering as the prompt markdown, one sentence
    // throughout. `clozeHit` does double duty — accent/bold on the blank
    // marker pre-reveal, then the same accent/bold treatment on the revealed
    // word (Anki's highlight look either way).
    clozeAnswer: { ...type.body, color: c.text, fontSize: 20, lineHeight: 29, textAlign: "center" },
    clozeHit: { color: c.accent, fontWeight: "700" },
    divider: { height: 1, backgroundColor: c.line2, marginVertical: space(4) },
    gradeErrorText: { ...type.small, color: c.accent, textAlign: "center", marginBottom: space(2) },
    // No top divider (owner call) — the footer floats over the card on the same background.
    footer: { paddingHorizontal: space(4), paddingTop: space(2), backgroundColor: c.bg },
    gradeRow: { flexDirection: "row", gap: space(2) },
    gradeBtn: {
      flex: 1,
      borderRadius: radius.md,
      paddingVertical: space(3),
      alignItems: "center",
    },
    gradePressed: { opacity: 0.7 },
    gradeBtnDisabled: { opacity: 0.5 },
    gradeText: { ...type.bodyStrong, color: "#fff" },
  });
