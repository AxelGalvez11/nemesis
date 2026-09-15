import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SkelFlashcard } from "@/components/nx/Skeleton";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cardQuiz, deckCards, markCard, reviewQueue, type Card } from "@/api/study";
import { NxFlashcard, NxMarkButtons, NxStudyHeader } from "@/components/nx/study";
import { ExplainSheet } from "@/components/nx/study/ExplainSheet";
import { StudyDone } from "@/components/nx/study/StudyDone";
import { useDecks, useSpacePages } from "@/hooks/useSpace";
import { iconOf } from "@/lib/fresh";
import { useNx } from "@/theme/nx";

// Flashcards mode (canvas Review, ReviewAnswer, ExplainSheet, CardsDone, DarkReview). Spaced repetition is
// always on. The header is only close and the set name. X and check appear only after turning.
export default function FlashcardsReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useNx();
  const router = useRouter();
  const qc = useQueryClient();
  const decks = useDecks();
  const space = useSpacePages();
  const cards = useQuery({ queryKey: ["study-cards", id], queryFn: () => deckCards(id), enabled: !!id });
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [explain, setExplain] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [tally, setTally] = useState({ got: 0, missed: 0 });
  const firstMark = useRef(new Set<string>());
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (cards.data && queue === null) setQueue(reviewQueue(cards.data));
  }, [cards.data, queue]);

  const current = queue?.[0];
  const deck = decks.data?.find((d) => d.id === id);
  const name = deck?.name.split("::").pop() ?? "";
  const page = deck?.page_id ? space.byId.get(deck.page_id) : undefined;
  const done = queue !== null && queue.length === 0;

  // When the sitting ends, re-read the cards so "due tomorrow" reflects the marks just saved.
  useEffect(() => {
    if (done) void cards.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const mark = async (got: boolean) => {
    if (!current || !queue) return;
    const rest = queue.slice(1);
    // A missed card comes back at the end of this sitting as well as being rescheduled.
    setQueue(got ? rest : [...rest, current]);
    setFlipped(false);
    if (!firstMark.current.has(current.id)) {
      firstMark.current.add(current.id);
      setTally((t) => (got ? { ...t, got: t.got + 1 } : { ...t, missed: t.missed + 1 }));
    }
    const took = Date.now() - shownAt.current;
    shownAt.current = Date.now();
    try {
      await markCard(current.id, got, took);
      setFailed(null);
    } catch {
      setFailed("That mark did not save. Check your connection.");
    }
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["study-decks"] });
    void qc.invalidateQueries({ queryKey: ["study-cards", id] });
  };
  const close = () => {
    refresh();
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false, presentation: "fullScreenModal" }} />
      {/* The header names the page the set came from, with its emoji (canvas Review: "📚 Contract law"). */}
      <NxStudyHeader title={page ? `${iconOf(page.props.icon)} ${page.props.title || "Untitled"}` : name} onClose={close} />

      {cards.isLoading || queue === null ? (
        cards.error ? (
          <Text style={[styles.note, { color: c.t2 }]}>These cards could not be loaded. Close and try again.</Text>
        ) : (
          <SkelFlashcard />
        )
      ) : done ? (
        <StudyDone
          title="Done for today"
          sub={nextDue(name, cards.data ?? [])}
          got={tally.got}
          missed={tally.missed}
          primary="Back to Study"
          onPrimary={() => {
            refresh();
            router.dismissTo("/study");
          }}
          secondary="Keep studying anyway"
          onSecondary={() => {
            firstMark.current = new Set();
            setTally({ got: 0, missed: 0 });
            shownAt.current = Date.now();
            setQueue(reviewQueue(cards.data ?? []));
          }}
        />
      ) : current ? (
        <>
          <NxFlashcard front={current.front} back={current.back} flipped={flipped} onFlip={() => setFlipped((f) => !f)} onExplain={() => setExplain(true)} />
          {failed ? <Text style={[styles.failed, { color: c.danger }]}>{failed}</Text> : null}
          <NxMarkButtons visible={flipped} onMiss={() => void mark(false)} onGot={() => void mark(true)} />
          <ExplainSheet
            visible={explain}
            onClose={() => setExplain(false)}
            front={current.front}
            back={current.back}
            initial={cardQuiz(current)?.explain}
            source={
              page
                ? {
                    emoji: iconOf(page.props.icon),
                    title: page.props.title || "Untitled",
                    onPress: () => {
                      setExplain(false);
                      router.push({ pathname: "/page/[id]", params: { id: page.id } });
                    },
                  }
                : null
            }
          />
        </>
      ) : null}
    </View>
  );
}

/** "The next cards in X are due tomorrow." from the soonest due date still ahead. */
function nextDue(name: string, cards: Card[], now = Date.now()): string {
  const ahead = cards
    .filter((card) => !card.suspended)
    .map((card) => new Date(card.due_at).getTime())
    .filter((t) => Number.isFinite(t) && t > now)
    .sort((a, b) => a - b)[0];
  if (!ahead) return "Nemesis will bring these cards back when they are due.";
  const day = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((day(ahead) - day(now)) / 86_400_000);
  const when =
    days <= 0
      ? "later today"
      : days === 1
        ? "tomorrow"
        : days < 7
          ? `in ${days} days`
          : `on ${new Date(ahead).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
  return `The next cards in ${name || "this set"} are due ${when}.`;
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: 20, paddingTop: 40, fontSize: 15, lineHeight: 22, textAlign: "center" },
  failed: { fontSize: 13, textAlign: "center", paddingTop: 10 },
});
