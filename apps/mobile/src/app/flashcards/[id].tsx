import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deckCards, markCard, reviewQueue, type Card } from "@/api/study";
import { NxButton, NxIconButton } from "@/components/nx/primitives";
import { NxFlashcard, NxMarkButtons } from "@/components/nx/study";
import { useDecks } from "@/hooks/useSpace";
import { useNx } from "@/theme/nx";

// Flashcards mode (canvas: Review, ReviewAnswer, CardsDone). Spaced repetition is always on.
// Header is only close and the set name: no progress bar, no "4 of 12". X and check appear only after turning.
export default function FlashcardsReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const decks = useDecks();
  const cards = useQuery({ queryKey: ["study-cards", id], queryFn: () => deckCards(id), enabled: !!id });
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (cards.data && queue === null) setQueue(reviewQueue(cards.data));
  }, [cards.data, queue]);

  const current = queue?.[0];
  useEffect(() => {
    shownAt.current = Date.now();
    setFlipped(false);
  }, [current?.id]);

  const mark = async (got: boolean) => {
    if (!current || !queue) return;
    const rest = queue.slice(1);
    // A missed card comes back at the end of this sitting as well as being rescheduled.
    setQueue(got ? rest : [...rest, current]);
    try {
      await markCard(current.id, got, Date.now() - shownAt.current);
      setFailed(null);
    } catch {
      setFailed("That mark did not save. Check your connection.");
    }
  };

  const deck = decks.data?.find((d) => d.id === id);
  const done = queue !== null && queue.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.sunk }}>
      <Stack.Screen options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <NxIconButton
          icon="x"
          size={22}
          label="Close"
          onPress={() => {
            void qc.invalidateQueries({ queryKey: ["study-decks"] });
            void qc.invalidateQueries({ queryKey: ["study-cards", id] });
            router.back();
          }}
        />
        <Text numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: c.t1 }}>
          {deck?.name.split("::").pop() ?? ""}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {cards.isLoading || queue === null ? (
        <ActivityIndicator style={{ marginTop: 80 }} color={c.t3} />
      ) : done ? (
        <View style={styles.done}>
          <Text style={{ fontSize: 44 }}>🎉</Text>
          <Text style={{ fontSize: 26, fontWeight: "600", color: c.t1 }}>Done for today</Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: c.t2, textAlign: "center" }}>Nemesis will bring these cards back when they are due.</Text>
          <View style={{ alignSelf: "stretch", marginTop: 16 }}>
            <NxButton label="Close" onPress={() => router.back()} />
          </View>
        </View>
      ) : current ? (
        <>
          <View style={{ flex: 1, paddingTop: 24 }}>
            <NxFlashcard front={current.front} back={current.back} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
          </View>
          <View style={[styles.foot, { bottom: insets.bottom + 24 }]}>
            {failed ? <Text style={{ color: c.danger, fontSize: 13, textAlign: "center", marginBottom: 10 }}>{failed}</Text> : null}
            {flipped ? (
              <NxMarkButtons onMiss={() => void mark(false)} onGot={() => void mark(true)} />
            ) : (
              <Pressable onPress={() => setFlipped(true)} style={styles.turn}>
                <Text style={{ fontSize: 15, color: c.t2 }}>Tap the card to turn it over</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  foot: { position: "absolute", left: 0, right: 0, minHeight: 64, justifyContent: "center" },
  turn: { height: 64, alignItems: "center", justifyContent: "center" },
  done: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 8 },
});
