import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { EmptyBlock, MissionButton } from "@/components/mission-ui";
import { MessageBody } from "@/components/MessageBody";
import {
  fetchCloudStudy,
  gradeStudyCard,
  isCardDue,
  MATURE_INTERVAL_DAYS,
  type CloudStudyCard,
  type CloudStudyDeck,
  type StudyGrade,
} from "@/api/cloudStudy";
import { normalizeCardText } from "@/lib/card-text";
import { clozeParts } from "@/lib/study-session";
import { activeClozeNumber, hasCloze, renderCloze } from "@/lib/study-cloze";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// Flashcard review (cloud-first phone, build spec §8): walks the LIVE due
// queue for one cloud deck (study_decks/study_cards via api/cloudStudy.ts).
// Grading calls the shared grade_study_card RPC per grade — same server math
// the web workspace uses, online-required (the old Mac offline grade-queue is
// retired for cloud Study). A card that fails to grade (offline, or the RPC
// rejects it) stays exactly where it is — revealed, ungraded — so the student
// can retry once they're back online instead of silently losing the review.
//
// The reveal/grade INTERACTION is unchanged from the old Mac-paired screen:
// tap the card anywhere to reveal, then one of four grade buttons. What's
// gone is the old in-session "learning steps" simulation (a card cycling back
// within one sitting before its first grade reached the Mac) — that existed
// only to buffer the retired offline queue. Cloud grading reports every tap
// straight to the server, so a graded card simply leaves this session's queue
// (its new due_at naturally pushes it out of isCardDue); Anki-style
// within-session relearning is a v2 idea, not a cloud-parity requirement.

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
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);

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
        setCompletedIds([]);
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

  // The live due queue: new cards (due_at defaults to creation time) and due
  // reviews together, minus whatever this session has already graded. Grading
  // a card pushes its due_at into the future server-side, but completedIds is
  // the immediate, synchronous removal the UI relies on for THIS session.
  const queue = useMemo(
    () => cards.filter((card) => isCardDue(card) && !completedIds.includes(card.id)),
    [cards, completedIds],
  );
  const current = queue[0] ?? null;
  // Anki's three-number footer, counted over what's LEFT in this sitting.
  // Every card here is already due, so the split can't reuse the deck list's
  // Learn rule (which is defined as NOT due); it splits by how established the
  // card is instead — never studied, still young, or mature — while keeping
  // the same 21-day line so the two screens agree on what "young" means.
  // The three always sum to the cards remaining.
  const counts = useMemo(() => {
    let fresh = 0;
    let learn = 0;
    for (const card of queue) {
      if (card.repetitions === 0) fresh += 1;
      else if (card.intervalDays < MATURE_INTERVAL_DAYS) learn += 1;
    }
    return { due: queue.length - fresh - learn, fresh, learn };
  }, [queue]);

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

  async function grade(value: StudyGrade) {
    if (!current || gradingRef.current) return;
    gradingRef.current = true;
    setGrading(true);
    setGradeError(null);
    const result = await gradeStudyCard(current.id, value);
    gradingRef.current = false;
    setGrading(false);
    if (!result.ok) {
      // Stay put — revealed, ungraded — so the student can retry once online.
      setGradeError(result.message);
      return;
    }
    setCompletedIds((ids) => [...ids, current.id]);
    setRevealed(false);
  }

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
      {/* No back button (owner 2026-07-22) — the card is the whole screen.
          Leaving mid-session is the iOS edge-swipe; finishing one surfaces the
          Done button below. */}
      <Stack.Screen options={{ headerShown: false }} />

      {deck === undefined ? null : deck === null ? (
        <View style={styles.emptyWrap}>
          <EmptyBlock title="Deck unavailable" body="This deck may have been deleted, or you may need to sign in again." />
        </View>
      ) : !current ? (
        <View style={styles.emptyWrap} testID={completedIds.length > 0 ? "review-complete" : "review-none-due"}>
          <EmptyBlock
            title={
              completedIds.length > 0
                ? `Session complete — ${completedIds.length} card${completedIds.length === 1 ? "" : "s"}`
                : "Nothing due in this deck"
            }
            body={
              completedIds.length > 0
                ? "Nice work — come back when more cards fall due."
                : "Come back when cards fall due, or add more from the web app."
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
          </ScrollView>

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
