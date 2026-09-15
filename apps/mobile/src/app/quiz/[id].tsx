import { useEffect, useMemo, useRef, useState } from "react";
import { goBack } from "@/lib/goBack";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SkelFlashcard } from "@/components/nx/Skeleton";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { buildRound, choiceFor, type ChoiceQuestion, type MatchRound, type QuizItem } from "@/api/quiz";
import { deckCards, markCard } from "@/api/study";
import { useAuth } from "@/auth/AuthProvider";
import { NxIcon } from "@/components/nx/NxIcon";
import {
  NxFootButton,
  NxMatchTile,
  NxQLabel,
  NxQText,
  NxQuizBox,
  NxQuizOption,
  NxSparkChip,
  NxStudyHeader,
  type OptState,
  type PairState,
} from "@/components/nx/study";
import { ExplainSheet } from "@/components/nx/study/ExplainSheet";
import { StudyDone } from "@/components/nx/study/StudyDone";
import { useDecks, useSpacePages } from "@/hooks/useSpace";
import { useNx } from "@/theme/nx";

type Source = { title: string; onPress: () => void } | null;

// Active recall quiz (canvas QuizRecall, QuizChoice, QuizMatch; memory: gizmo-quiz-teardown).
// Straight into 4 options (owner 2026-09-15). Right: green. Wrong: red and the right answer. Either way Explain
// (why the right one is right and the wrong ones wrong) and Continue. Missed cards come back at the end of the
// round. No hearts, XP or streaks.
// Every first answer also grades the card for spaced repetition (right = good, wrong = again).
export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useNx();
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const decks = useDecks();
  const space = useSpacePages();
  const deck = decks.data?.find((d) => d.id === id);
  const name = deck?.name.split("::").pop() ?? "";
  const page = deck?.page_id ? space.byId.get(deck.page_id) : undefined;
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
  const [index, setIndex] = useState(0);
  const graded = useRef(new Set<string>());
  const [firstTry, setFirstTry] = useState({ right: 0, wrong: 0 });

  useEffect(() => {
    if (!round.data) return;
    setQueue(round.data.items);
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
      if (again) setQueue((list) => [...list, again]);
    }
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["study-decks"] });
    void qc.invalidateQueries({ queryKey: ["study-cards", id] });
  };
  const close = () => {
    refresh();
    goBack(router);
  };

  const source: Source = page
    ? {
        title: page.props.title || "Untitled",
        onPress: () => router.push({ pathname: "/page/[id]", params: { id: page.id } }),
      }
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Presentation is set in _layout: changing it from inside the screen loops when opened by link. */}
      <Stack.Screen options={{ headerShown: false }} />
      {/* The quiz header names the set. No emoji (owner 2026-09-15). */}
      <NxStudyHeader title={page ? page.props.title || "Untitled" : name} onClose={close} />

      {!uid ? (
        <Centered title="Sign in to take a quiz" text="Quizzes are written from your own flashcards." />
      ) : cards.isLoading || round.isLoading ? (
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.t2, fontSize: 15, fontWeight: "500", textAlign: "center", paddingTop: 14 }}>Writing your quiz</Text>
          <SkelFlashcard />
        </View>
      ) : cards.error || round.error ? (
        <Centered title="The quiz could not be made" text="Check your connection, then close and try again." />
      ) : round.data && round.data.items.length === 0 ? (
        <Centered title="Nothing to quiz yet" text="Add a few cards to this set, then try again." />
      ) : finished ? (
        <StudyDone
          title="Round done"
          sub={firstTry.wrong ? "The cards you missed will come back sooner." : "You got every card right the first time."}
          got={firstTry.right}
          missed={firstTry.wrong}
          primary="Next round"
          onPrimary={() => setRoundNo((n) => n + 1)}
          secondary="Back to Study"
          onSecondary={() => {
            refresh();
            router.dismissTo("/study");
          }}
        />
      ) : item ? (
        item.kind === "choice" ? (
          <Choice
            key={`q-${roundNo}-${index}`}
            q={item}
            initial={round.data?.options.get(item.card.id)?.explain}
            source={source}
            onAnswered={(ok) => answer(item, ok)}
            onNext={() => setIndex((i) => i + 1)}
          />
        ) : (
          <Match key={`m-${roundNo}-${index}`} round={item} onNext={() => setIndex((i) => i + 1)} />
        )
      ) : null}
    </View>
  );
}

function Centered({ title, text }: { title: string; text: string }) {
  const c = useNx();
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 20, fontWeight: "600", color: c.t1, textAlign: "center" }}>{title}</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: c.t2, textAlign: "center", marginTop: 6 }}>{text}</Text>
    </View>
  );
}

function Choice({
  q,
  initial,
  source,
  onAnswered,
  onNext,
}: {
  q: ChoiceQuestion;
  initial?: string;
  source: Source;
  onAnswered: (ok: boolean) => void;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<number | null>(null);
  const [explain, setExplain] = useState(false);
  const answered = picked !== null;
  const wrong = answered && picked !== q.answer;

  // Owner 2026-09-15: straight into the options (no "think first" step), and a right answer is explained
  // too, so it waits for Continue instead of moving on by itself.
  const stateFor = (i: number): OptState => {
    if (picked === null) return "idle";
    if (i === q.answer) return "ok";
    if (i === picked) return "bad";
    return "dim";
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={styles.qHead}>
          <NxQLabel>{q.retry ? "Try this one again" : "Multiple choice"}</NxQLabel>
          <NxQText>{q.prompt}</NxQText>
        </View>
        <NxQuizBox>
          {q.options.map((opt, i) => (
            <NxQuizOption
              key={i}
              first={i === 0}
              text={opt}
              state={stateFor(i)}
              onPress={() => {
                if (answered) return;
                setPicked(i);
                onAnswered(i === q.answer);
              }}
            />
          ))}
        </NxQuizBox>
        {answered ? (
          <View style={{ paddingTop: 16, paddingHorizontal: 16 }}>
            <NxSparkChip label="Explain" onPress={() => setExplain(true)} />
          </View>
        ) : null}
      </ScrollView>
      <NxFootButton label="Continue" disabled={!answered} onPress={onNext} />
      <ExplainSheet
        visible={explain}
        onClose={() => setExplain(false)}
        front={q.prompt}
        back={q.card.back}
        initial={initial}
        options={q.options}
        picked={wrong && picked !== null ? q.options[picked] : null}
        source={
          source
            ? {
                ...source,
                onPress: () => {
                  setExplain(false);
                  source.onPress();
                },
              }
            : null
        }
      />
    </View>
  );
}

function Match({ round, onNext }: { round: MatchRound; onNext: () => void }) {
  const c = useNx();
  const insets = useSafeAreaInsets();
  const shuffledRights = useMemo(() => {
    const ids = round.pairs.map((p) => p.cardId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    return ids;
  }, [round]);
  const byId = useMemo(() => new Map(round.pairs.map((p) => [p.cardId, p])), [round]);
  const [pickL, setPickL] = useState<string | null>(null);
  const [pickR, setPickR] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [bad, setBad] = useState<{ l: string; r: string } | null>(null);
  const done = matched.length === round.pairs.length;

  useEffect(() => {
    if (!bad) return;
    const t = setTimeout(() => setBad(null), 600);
    return () => clearTimeout(t);
  }, [bad]);

  const tryPair = (l: string, r: string) => {
    setPickL(null);
    setPickR(null);
    if (l === r) {
      void Haptics.selectionAsync();
      setMatched((m) => [...m, l]);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setBad({ l, r });
    }
  };

  // Matched pairs line up at the top, side by side; the rest keep their places below.
  const leftRest = round.pairs.map((p) => p.cardId).filter((cid) => !matched.includes(cid));
  const rightRest = shuffledRights.filter((cid) => !matched.includes(cid));
  const rows: [string, string][] = [...matched.map((cid): [string, string] => [cid, cid]), ...leftRest.map((cid, i): [string, string] => [cid, rightRest[i]!])];

  const leftState = (cid: string): PairState => (matched.includes(cid) ? "ok" : bad?.l === cid ? "bad" : pickL === cid ? "pick" : "idle");
  const rightState = (cid: string): PairState => (matched.includes(cid) ? "ok" : bad?.r === cid ? "bad" : pickR === cid ? "pick" : "idle");

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={styles.qHead}>
          <NxQLabel>Matching</NxQLabel>
          <NxQText>Match each one to its answer</NxQText>
        </View>
        <View style={styles.pairs}>
          {rows.map(([l, r]) => (
            <View key={`${l}-${r}`} style={styles.pairRow}>
              <NxMatchTile
                text={byId.get(l)?.left ?? ""}
                state={leftState(l)}
                onPress={() => (pickR ? tryPair(l, pickR) : setPickL((p) => (p === l ? null : l)))}
              />
              <View style={styles.pairIcon}>
                <NxIcon name="sync" size={14} color={c.t3} />
              </View>
              <NxMatchTile
                text={byId.get(r)?.right ?? ""}
                state={rightState(r)}
                onPress={() => (pickL ? tryPair(pickL, r) : setPickR((p) => (p === r ? null : r)))}
              />
            </View>
          ))}
        </View>
      </ScrollView>
      <NxFootButton label="Continue" disabled={!done} onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  qHead: { paddingTop: 26, paddingHorizontal: 20, gap: 10 },
  pairs: { paddingTop: 20, paddingHorizontal: 16, gap: 10 },
  pairRow: { flexDirection: "row", alignItems: "stretch", gap: 6 },
  pairIcon: { width: 20, alignItems: "center", justifyContent: "center" },
});
