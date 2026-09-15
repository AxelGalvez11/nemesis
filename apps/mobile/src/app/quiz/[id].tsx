import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { buildRound, choiceFor, type ChoiceQuestion, type MatchRound, type QuizItem } from "@/api/quiz";
import { deckCards, markCard } from "@/api/study";
import { useAuth } from "@/auth/AuthProvider";
import { NxButton, NxIconButton } from "@/components/nx/primitives";
import { NxMatchTile, NxQuizOption, type OptState, type PairState } from "@/components/nx/study";
import { useDecks } from "@/hooks/useSpace";
import { useNx } from "@/theme/nx";

// Active recall quiz (canvas: QuizRecall, QuizChoice, QuizMatch; memory: gizmo-quiz-teardown).
// Think first, then 4 options. Right: green, moves on by itself. Wrong: red, the right answer and Continue.
// Missed cards come back at the end of the round. A progress bar, no "3 of 10". No hearts, XP or streaks.
// Every first answer also grades the card for spaced repetition (right = good, wrong = again).
export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useNx();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const decks = useDecks();
  const deck = decks.data?.find((d) => d.id === id);
  const cards = useQuery({ queryKey: ["study-cards", id], queryFn: () => deckCards(id), enabled: !!id });

  const [roundNo, setRoundNo] = useState(0);
  const round = useQuery({
    queryKey: ["quiz-round", id, roundNo],
    queryFn: () => buildRound(uid as string, cards.data ?? []),
    enabled: !!uid && !!cards.data,
    staleTime: Infinity,
    gcTime: 0,
  });

  const [queue, setQueue] = useState<QuizItem[]>([]);
  const [total, setTotal] = useState(0);
  const [index, setIndex] = useState(0);
  const graded = useRef(new Set<string>());
  const [firstTry, setFirstTry] = useState({ right: 0, wrong: 0 });

  useEffect(() => {
    if (!round.data) return;
    setQueue(round.data.items);
    setTotal(round.data.items.length);
    setIndex(0);
    graded.current = new Set();
    setFirstTry({ right: 0, wrong: 0 });
  }, [round.data]);

  const item = queue[index];
  const finished = round.data !== undefined && queue.length > 0 && index >= queue.length;

  const answer = (q: ChoiceQuestion, ok: boolean) => {
    void Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    if (!graded.current.has(q.card.id)) {
      graded.current.add(q.card.id);
      setFirstTry((t) => (ok ? { ...t, right: t.right + 1 } : { ...t, wrong: t.wrong + 1 }));
      void markCard(q.card.id, ok).catch(() => undefined);
    }
    if (!ok) {
      // Back at the end of the round, with the options shuffled again.
      const again = choiceFor(q.card, round.data?.options.get(q.card.id), cards.data ?? [], true);
      if (again) {
        setQueue((list) => [...list, again]);
        setTotal((n) => n + 1);
      }
    }
  };

  const close = () => {
    void qc.invalidateQueries({ queryKey: ["study-decks"] });
    void qc.invalidateQueries({ queryKey: ["study-cards", id] });
    router.back();
  };

  const progress = total ? Math.min(1, index / total) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <NxIconButton icon="x" size={22} label="Close" onPress={close} />
        <View style={[styles.track, { backgroundColor: c.sel }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: c.acc }]} />
        </View>
        <View style={{ width: 44 }} />
      </View>

      {!uid ? (
        <Centered title="Sign in to take a quiz" text="Quizzes are written from your own flashcards." />
      ) : cards.isLoading || round.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.t3} />
          <Text style={{ color: c.t2, fontSize: 15, marginTop: 12 }}>Writing your quiz</Text>
        </View>
      ) : round.data && round.data.items.length === 0 ? (
        <Centered title="Nothing to quiz yet" text="Add a few cards to this set, then try again." />
      ) : finished ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 26, fontWeight: "600", color: c.t1 }}>Round complete</Text>
          <Text style={{ fontSize: 15, color: c.t2, marginTop: 4 }}>{deck?.name.split("::").pop() ?? ""}</Text>
          <View style={styles.summary}>
            <Stat label="Right first time" value={firstTry.right} color={c.ok} />
            <Stat label="To review" value={firstTry.wrong} color={c.danger} />
          </View>
          <View style={{ alignSelf: "stretch", marginTop: 24, gap: 10, paddingHorizontal: 24 }}>
            <NxButton label="Next round" onPress={() => setRoundNo((n) => n + 1)} />
            <Pressable onPress={close} style={styles.textBtn}>
              <Text style={{ color: c.t2, fontSize: 15 }}>Finish</Text>
            </Pressable>
          </View>
        </View>
      ) : item ? (
        item.kind === "choice" ? (
          <Choice key={`q-${roundNo}-${index}`} q={item} onAnswered={(ok) => answer(item, ok)} onNext={() => setIndex((i) => i + 1)} />
        ) : (
          <Match key={`m-${roundNo}-${index}`} round={item} onNext={() => setIndex((i) => i + 1)} />
        )
      ) : null}
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const c = useNx();
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 30, fontWeight: "700", color }}>{value}</Text>
      <Text style={{ fontSize: 13, color: c.t2 }}>{label}</Text>
    </View>
  );
}

function Centered({ title, text }: { title: string; text: string }) {
  const c = useNx();
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 20, fontWeight: "600", color: c.t1 }}>{title}</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: c.t2, textAlign: "center", marginTop: 6 }}>{text}</Text>
    </View>
  );
}

function Choice({ q, onAnswered, onNext }: { q: ChoiceQuestion; onAnswered: (ok: boolean) => void; onNext: () => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const [showing, setShowing] = useState(q.retry === true);
  const [picked, setPicked] = useState<number | null>(null);
  const [explain, setExplain] = useState(false);
  const right = picked !== null && picked === q.answer;

  // A right answer moves on by itself, like Gizmo.
  useEffect(() => {
    if (!right) return;
    const t = setTimeout(onNext, 700);
    return () => clearTimeout(t);
  }, [right, onNext]);

  const stateFor = (i: number): OptState => {
    if (picked === null) return "idle";
    if (i === q.answer) return "right";
    if (i === picked) return "wrong";
    return "muted";
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120, gap: 12 }}>
        <Text style={[styles.label, { color: q.retry ? c.danger : c.t3 }]}>
          {q.retry ? "Previous mistake" : showing ? "Choose the answer" : "Think of the answer first"}
        </Text>
        <Text style={{ fontSize: 22, lineHeight: 30, fontWeight: "600", color: c.t1 }}>{q.prompt}</Text>
        {showing
          ? q.options.map((opt, i) => (
              <NxQuizOption
                key={i}
                text={opt}
                state={stateFor(i)}
                onPress={() => {
                  setPicked(i);
                  onAnswered(i === q.answer);
                }}
              />
            ))
          : null}
        {picked !== null && !right && explain ? (
          <View style={[styles.explain, { backgroundColor: c.sunk }]}>
            <Text style={{ fontSize: 15, lineHeight: 22, color: c.t1 }}>{q.explain}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>
        {!showing ? (
          <NxButton label="Show options" onPress={() => setShowing(true)} />
        ) : picked === null || right ? null : (
          <View style={{ flexDirection: "row", gap: 10 }}>
            {!explain ? (
              <Pressable onPress={() => setExplain(true)} style={[styles.secondary, { borderColor: c.ring }]}>
                <Text style={{ color: c.t1, fontSize: 16, fontWeight: "500" }}>Explain</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <NxButton label="Continue" onPress={onNext} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function Match({ round, onNext }: { round: MatchRound; onNext: () => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const rights = useMemo(() => {
    const ids = round.pairs.map((p) => p.cardId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    return ids;
  }, [round]);
  const [picked, setPicked] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [missed, setMissed] = useState(false);
  const byId = new Map(round.pairs.map((p) => [p.cardId, p]));
  const done = matched.length === round.pairs.length;

  useEffect(() => {
    if (!missed) return;
    const t = setTimeout(() => setMissed(false), 700);
    return () => clearTimeout(t);
  }, [missed]);

  const leftState = (cid: string): PairState => (matched.includes(cid) ? "matched" : picked === cid ? "picked" : "idle");

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120, gap: 12 }}>
        <Text style={[styles.label, { color: c.t3 }]}>Match each one to its answer</Text>
        {missed ? <Text style={{ color: c.danger, fontSize: 14 }}>Not that one. Try again.</Text> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 10 }}>
            {round.pairs.map((p) => (
              <NxMatchTile key={`l-${p.cardId}`} text={p.left} state={leftState(p.cardId)} onPress={() => setPicked(p.cardId)} />
            ))}
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            {rights.map((rid) => (
              <NxMatchTile
                key={`r-${rid}`}
                text={byId.get(rid)?.right ?? ""}
                state={matched.includes(rid) ? "matched" : "idle"}
                onPress={() => {
                  if (!picked) return;
                  if (picked === rid) {
                    void Haptics.selectionAsync();
                    setMatched((m) => [...m, rid]);
                    setPicked(null);
                  } else {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    setMissed(true);
                  }
                }}
              />
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>{done ? <NxButton label="Continue" onPress={onNext} /> : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  summary: { flexDirection: "row", alignSelf: "stretch", marginTop: 24, paddingHorizontal: 24 },
  label: { fontSize: 13, fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.6 },
  explain: { borderRadius: 14, padding: 14 },
  foot: { position: "absolute", left: 16, right: 16, bottom: 0 },
  secondary: { height: 50, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  textBtn: { height: 44, alignItems: "center", justifyContent: "center" },
});
