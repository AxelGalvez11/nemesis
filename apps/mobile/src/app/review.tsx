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
import { OcclusionCardView } from "@/components/OcclusionCardView";
import {
  fetchCloudStudy,
  gradeStudyCard,
  loadCachedStudy,
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
  shouldEmitGrade,
  type SessionProgress,
} from "@/lib/review-queue";
import { confirmHoldRemaining, gradeButtonState } from "@/lib/grade-confirm";
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
//
// Owner asks, 2026-07-23 (second pass) — three changes, and the third is what
// makes the first two possible:
//
//  - "swipe right to undo"                      (was swipe LEFT, shipped above)
//  - "tapping right side should leave 'good' on for a second while the rest
//     disappear" / "tapping left should be for 'again' (leave again box for a
//     second)"
//  - "remove the swipe right to escape flashcard"
//
// Undo moving to a RIGHTWARD swipe collides head-on with iOS's own edge-swipe
// back, which is also rightward — so the third ask isn't a separate cleanup,
// it's the prerequisite. gestureEnabled: false on this screen's Stack.Screen
// hands the whole rightward direction to undo. The way out of a live session
// is now solely the pull-down-for-a-back-button built above.

/** How long the pulled-for back button stays up (owner: "go away after 5 seconds"). */
const BACK_VISIBLE_MS = 5000;
/** How far the card has to be pulled past its top edge to summon that button. */
const BACK_PULL_DISTANCE = 56;
/** How far a rightward swipe has to travel to count as "undo that". */
const UNDO_SWIPE_DISTANCE = 60;
/**
 * How long the graded button stays lit alone before the next card (owner: "leave
 * 'good' on for a second while the rest disappear").
 *
 * This is a FLOOR on visible time, not a timer that advances the card — see
 * grade(). The tap zones are invisible by design, so this lit button is the only
 * confirmation of WHICH grade a blind half-screen tap actually registered.
 */
const CONFIRM_HOLD_MS = 350;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  // The grade currently being confirmed: the one button left lit while the other
  // three fade out (owner 2026-07-23). Null except during that hold.
  const [flashGrade, setFlashGrade] = useState<StudyGrade | null>(null);
  // The undo trail: one entry per grade, most recent last, each holding the
  // sitting as it stood before the grade plus the card's own fields before the
  // server rescheduled it. A ref rather than state because nothing renders from
  // it — and because the gesture that reads it must see the value synchronously.
  // What each card's `repetitions` was the first time this sitting showed it.
  // Written once per card, never updated — see activeCloze below for why.
  const sittingRepsRef = useRef(new Map<string, number>());
  const sittingReps = (row: { id: string; repetitions: number } | null | undefined): number => {
    if (!row) return 0;
    const seen = sittingRepsRef.current.get(row.id);
    if (seen !== undefined) return seen;
    sittingRepsRef.current.set(row.id, row.repetitions);
    return row.repetitions;
  };

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
      const cached = await loadCachedStudy(userId);
      if (!alive) return;
      const cachedDeck = cached.decks.find((item) => item.id === deckId) ?? null;
      if (cachedDeck) {
        setDeck(cachedDeck);
        setCards(cached.cards.filter((card) => card.deckId === cachedDeck.id));
        setProgress(EMPTY_PROGRESS);
        undoRef.current = [];
        sittingRepsRef.current.clear();
        setRevealed(false);
        setGradeError(null);
      }
      try {
        const { decks, cards: allCards } = await fetchCloudStudy(userId);
        if (!alive) return;
        // Once the cached deck is on screen, do not replace the live sitting
        // underneath a learner who may already have graded its first card. The
        // fetch still refreshes the disk cache for the next open.
        if (cachedDeck) return;
        const found = decks.find((item) => item.id === deckId) ?? null;
        setDeck(found);
        setCards(found ? allCards.filter((card) => card.deckId === found.id) : []);
        setProgress(EMPTY_PROGRESS);
        undoRef.current = [];
        // A new sitting: let the cloze rotation move on to the next deletion.
        sittingRepsRef.current.clear();
        setRevealed(false);
        setGradeError(null);
      } catch {
        if (alive && !cachedDeck) setDeck(null);
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
  // WHICH blank is hidden is pinned for the sitting, not read off the live row.
  //
  // A multi-deletion card rotates its blank by `repetitions`, and the grade RPC
  // bumps repetitions on every call — a value this screen deliberately writes
  // back so the footer stops tallying stale scheduling. Reading it here meant
  // that when the learning ladder brought a card round again in the SAME
  // sitting, it came back asking a different blank: you answered c1, pressed
  // Good, and were shown c2, a deletion you had never seen. On the Again path
  // it was worse — the whole point of that re-look is to re-ask what you just
  // failed. Day-to-day rotation is unaffected: the pin lasts one sitting.
  const activeCloze = ankiCloze ? activeClozeNumber(front, sittingReps(current)) : null;
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

  /**
   * Grade the current card, holding the pressed button lit for a beat first.
   *
   * The confirm hold is a FLOOR on elapsed time, not a timer of its own, and
   * advancing stays gated on the server's answer. A free-running
   * setTimeout(advance) would race the RPC three ways: a slow grade would write
   * its result back over the NEXT card, a failed grade would still skip the card
   * the server never recorded, and the gap would let a second tap through.
   * Waiting out the remainder keeps one code path: fast RPC waits for the eye,
   * slow RPC was already visible the whole time, failed RPC stays put.
   */
  async function grade(value: StudyGrade) {
    if (!current || gradingRef.current) return;
    gradingRef.current = true;
    setGrading(true);
    setGradeError(null);
    setFlashGrade(value);
    const before = current;
    const beforeProgress = progressRef.current;
    const startedAt = Date.now();

    // ONLY THE FIRST PRESS OF A CARD REACHES THE SERVER (owner 2026-07-24 — a
    // new card now takes two "Good"s to graduate and comes back in between).
    // grade_study_card applies every call as an independent review, so sending
    // each rung of the learning ladder would advance one card's real interval
    // two or three times for a single sitting and push it weeks out. The later
    // presses are a second LOOK, not a second review — they stay on the phone.
    // See review-queue.ts's SessionProgress.gradedIds.
    const emit = shouldEmitGrade(beforeProgress, before.id);
    const result = emit ? await gradeStudyCard(before.id, value) : null;
    const remaining = confirmHoldRemaining(Date.now() - startedAt, CONFIRM_HOLD_MS);
    if (remaining > 0) await wait(remaining);
    gradingRef.current = false;
    setGrading(false);
    setFlashGrade(null);
    if (result && !result.ok) {
      // Stay put — revealed, ungraded — so the student can retry once online.
      setGradeError(result.message);
      return;
    }
    // Write the server's answer back into the local card. It used to be
    // discarded, which meant the footer was tallying stale scheduling fields
    // for the rest of the sitting.
    if (result?.ok) {
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
    }
    undoRef.current = [...undoRef.current, { card: before, progress: beforeProgress }];
    setProgress(applyGrade(beforeProgress, before, value));
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
    // Back to the FRONT of the card, not the answer (owner 2026-07-24). This
    // shipped the other way round on the reasoning that you had just seen the
    // answer, so undo should feel like a correction rather than a fresh card.
    // The owner wants the question — which is the more useful of the two: the
    // reason to undo is usually that you graded before you had really answered,
    // and landing on the answer denies you the second attempt you took the card
    // back for.
    setRevealed(false);
    hapticHoldRegistered();
  }, []);

  // The back button appears when the card is pulled down and leaves on its own.
  useEffect(() => {
    if (!backShown) return;
    const timer = setTimeout(() => setBackShown(false), BACK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [backShown]);

  /**
   * Pull-to-reveal is the rule only while there is a CARD to pull. Every state
   * without one shows the button outright.
   *
   * This is load-bearing now that gestureEnabled is false. "Deck unavailable"
   * renders an EmptyBlock and nothing else — no Done button, and no ScrollView,
   * so there is no bounce to pull and backShown could never become true. Before
   * this batch iOS's edge swipe was the escape; without it that screen would be
   * a dead end reachable by exactly the two things its own copy names, a deleted
   * deck and an expired session. Same for `deck === undefined` if the fetch
   * hangs. `current` is null in all three, so one condition covers them.
   */
  // 🔴 ALWAYS VISIBLE. The reference's viewers (IMG_6540) keep their round close button on screen
  // for the whole session; a fading one left the learner on a card with no way out (seen on the
  // simulator 2026-09-01, the edge swipe being disabled here by design). `backShown` still drives
  // nothing else and stays for the tap-to-reveal path if the owner ever wants the fade back.
  const backVisible = true || backShown || !current;

  const backFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(backFade, {
      toValue: backVisible ? 1 : 0,
      duration: backVisible ? 160 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [backVisible, backFade]);

  // Swipe RIGHT anywhere on the card to undo (owner 2026-07-23 — it was leftward
  // when this shipped hours earlier). activeOffsetX means it only takes over once
  // the finger has genuinely committed sideways, and failOffsetY hands the
  // gesture back to the card's own scrolling the moment it drifts vertical —
  // otherwise reading a long answer would keep tripping the undo.
  //
  // Rightward is only free to mean "undo" because the screen's OS edge-swipe
  // back is switched off below; leaving both on would have made the same drag
  // either undo the card or abandon the session depending on where it started.
  const undoSwipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (event.translationX > UNDO_SWIPE_DISTANCE) undo();
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
          shade at the very top of the screen.

          gestureEnabled: false kills iOS's edge-swipe back for this screen only
          (owner 2026-07-23: "remove the swipe right to escape flashcard"). It
          has to go: undo is a rightward swipe now, and the two would otherwise
          fight over the same drag. Scoped to the review screen — every other
          screen keeps the OS gesture. */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <Animated.View
        style={[styles.backFloat, { opacity: backFade, top: insets.top + space(1) }]}
        pointerEvents={backVisible ? "auto" : "none"}
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
              <ChevronIcon size={20} color={c.text} strokeWidth={2.2} />
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
                {current.cardType === "image_occlusion" && current.occlusion ? (
                  // Image cloze now RENDERS on the phone (owner 2026-07-24).
                  // This used to be a text-only fallback saying "open on web",
                  // because the phone had no way to make or show these; it can
                  // do both now. The card's own prompt sits under the picture —
                  // it is the box's label, which is a hint, not the answer.
                  <View testID="review-occlusion-card">
                    <OcclusionCardView payload={current.occlusion} revealed={revealed} />
                    {front ? <Text style={styles.occlusionPrompt}>{front}</Text> : null}
                  </View>
                ) : current.cardType === "image_occlusion" ? (
                  // Reached only when the payload failed validation — a card
                  // written by an older client, or a corrupt row. Still gradable
                  // from memory rather than becoming a dead end mid-session.
                  <View testID="review-image-fallback">
                    <Text style={promptStyles.body as object}>{front || "Image card"}</Text>
                    <Text style={styles.imageFallbackNote}>This image card is missing its picture.</Text>
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
                  grade it out from under you.

                  A tap here has no visual of its own — the zones are invisible
                  and the halves are indistinguishable. The footer's confirm hold
                  (CONFIRM_HOLD_MS) is what tells you which grade you just hit,
                  which matters far more here than on the labelled buttons. */}
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
                {gradeButtons.map((button) => {
                  // The confirm hold (owner 2026-07-23): the graded button stays
                  // lit and the other three go to zero opacity. They keep their
                  // slots rather than unmounting — dropping them from the row
                  // would let the survivor stretch across the full width, so the
                  // thing you're meant to read would jump as it appeared.
                  const state = gradeButtonState(button.rating, flashGrade, grading);
                  return (
                    <Pressable
                      key={button.rating}
                      testID={`grade-${button.rating}`}
                      disabled={grading}
                      onPress={() => void grade(button.rating)}
                      accessibilityElementsHidden={state === "hidden"}
                      style={({ pressed }) => [
                        styles.gradeBtn,
                        { backgroundColor: button.fill },
                        pressed && styles.gradePressed,
                        state === "hidden" && styles.gradeMuted,
                        state === "dimmed" && styles.gradeBtnDisabled,
                      ]}
                    >
                      <Text style={styles.gradeText}>{button.label}</Text>
                    </Pressable>
                  );
                })}
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
    backBtn: { width: control.lg, height: control.lg, borderRadius: control.lg / 2, alignItems: "center", justifyContent: "center" },
    // ChevronIcon points right by default; a back arrow points the other way.
    backChevron: { transform: [{ rotate: "180deg" }] },
    answerBlock: { marginTop: space(2) },
    imageFallbackNote: { ...type.small, color: c.text2, textAlign: "center", marginTop: space(3) },
    // The box's own label, under the picture. Muted because it is a hint about
    // WHICH box is being asked about, not the answer.
    occlusionPrompt: { ...type.small, color: c.textHint, textAlign: "center", marginTop: space(3) },
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
    // The three grades you did NOT press, during the confirm hold. Invisible but
    // still occupying their slots — see the comment at the render site.
    gradeMuted: { opacity: 0 },
    gradeText: { ...type.bodyStrong, color: "#fff" },
  });
