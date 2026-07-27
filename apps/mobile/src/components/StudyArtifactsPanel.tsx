import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { EmptyBlock, MissionButton } from "./mission-ui";
import { MessageBody } from "./MessageBody";
import { SkeletonDeckList } from "./Skeleton";
import { SlideUpSheet } from "./StudySheet";
import {
  bestAttempt,
  deleteStudyArtifact,
  listStudyArtifacts,
  recordTestAttempt,
  scoreAttempt,
  type StudyArtifact,
  type StudyArtifactKind,
  type TestAttempt,
} from "@/api/studyArtifacts";
import { outlineNodes } from "@/lib/mindmap-outline";
import { createMarkdownStyles } from "@/theme/markdown";
import type { ThemeColors } from "@/theme/palette";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { radius, space, type } from "@/theme/tokens";

// The Study page's Tests and Mindmaps panels.
//
// These two segments have existed on the phone for weeks and both rendered
// "coming soon" — the phone had no artifact reader at all, so a practice test the
// student made on the web, or that the chat wrote for them, sat in their account
// and was invisible on the device they actually study on. That is what this
// replaces.
//
// A TEST IS TAKEN ONE QUESTION AT A TIME. Not a scrolling page of all ten with a
// submit button at the end. On a phone that page is a wall, and more importantly
// answering-then-seeing-why is the part that teaches: the explanation lands while
// the student still remembers what they were thinking. The score is recorded once
// at the end, as one attempt.
//
// A MIND MAP IS THE OUTLINE, INDENTED. The web draws it with mermaid, which the
// phone has no renderer for — and a diagram shrunk to a phone screen is unreadable
// anyway. The same tree as indented text is honest about what the data is (a
// markdown outline) and is genuinely more usable at this size.

export function StudyArtifactsPanel({
  kind,
  contentTop,
  contentBottom,
  onError,
}: {
  kind: StudyArtifactKind;
  contentTop: number;
  contentBottom: number;
  /** Surfaced through the Study screen's existing notice line. */
  onError: (message: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const [rows, setRows] = useState<StudyArtifact[] | null>(null);
  const [open, setOpen] = useState<StudyArtifact | null>(null);

  // `onError` is held in a ref rather than named as a dependency below, and that is
  // load-bearing: the Study screen passes an inline arrow, so its identity changes
  // on every render. A `load` that depended on it would be new every render, which
  // makes the focus effect below re-run every render, which calls load, which sets
  // state, which renders — an endless refetch loop. The ref keeps `load` stable and
  // still calls the current handler.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async () => {
    try {
      const all = await listStudyArtifacts();
      setRows(all.filter((artifact) => artifact.kind === kind));
    } catch (cause) {
      setRows([]);
      onErrorRef.current(cause instanceof Error ? cause.message : "Couldn't load these yet.");
    }
  }, [kind]);

  // ON FOCUS, not on mount. The chat lives in another tab and can now write tests
  // and mind maps (api/agentTools.ts), so the common path is: ask chat for a test,
  // switch to Study, expect it there. A mount-only load would have shown nothing
  // until the app was restarted, because this tab stays mounted once visited —
  // which is why the deck list above it already loads this way (study.tsx).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (rows === null) {
    return (
      <View style={[styles.flex, { paddingTop: contentTop }]} testID={`study-${kind}-loading`}>
        <SkeletonDeckList testID={`study-${kind}-loading-rows`} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <Animated.View
        entering={FadeIn.duration(160)}
        style={[styles.centerWrap, { paddingBottom: contentBottom, paddingTop: contentTop }]}
        testID={`study-${kind}-empty`}
      >
        <EmptyBlock
          title={kind === "test" ? "No practice tests yet" : "No mind maps yet"}
          body={
            kind === "test"
              ? "Ask in chat for a practice test on something you're studying, or make one from a deck on the web app. It shows up here."
              : "Ask in chat for a mind map of a topic, or make one from a note on the web app. It shows up here."
          }
        />
      </Animated.View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: contentBottom + space(4), paddingTop: contentTop + space(2) }]}
        showsVerticalScrollIndicator={false}
        testID={`study-${kind}-list`}
      >
        {rows.map((artifact) => (
          <ArtifactRow
            key={artifact.id}
            artifact={artifact}
            onOpen={() => setOpen(artifact)}
            onDelete={() => {
              // Every other row on the Study page deletes by long press, so the
              // absence of it here would read as a missing feature rather than a
              // decision. Study deletes are PERMANENT on this app (Library is the
              // surface with a soft delete), so it asks first.
              Alert.alert(`Delete "${artifact.title}"?`, "This can't be undone.", [
                { style: "cancel", text: "Cancel" },
                {
                  onPress: () => {
                    // Optimistic: the row goes at once, and a failed delete puts
                    // it back rather than leaving a row that is gone on screen
                    // and present in the account.
                    setRows((prev) => prev?.filter((row) => row.id !== artifact.id) ?? prev);
                    void deleteStudyArtifact(artifact.id).catch((cause) => {
                      setRows((prev) => (prev ? [artifact, ...prev] : prev));
                      onError(cause instanceof Error ? cause.message : "Couldn't delete that.");
                    });
                  },
                  style: "destructive",
                  text: "Delete",
                },
              ]);
            }}
          />
        ))}
      </ScrollView>
      <SlideUpSheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        title={open?.title ?? ""}
        fullScreen
        testID={`study-${kind}-viewer`}
      >
        {open?.kind === "test" ? (
          <TestRunner
            artifact={open}
            onFinished={(attempts) => {
              // Keep the list's copy in step so the row's best score updates
              // without a refetch.
              setRows((prev) => prev?.map((row) => (row.id === open.id ? { ...row, attempts } : row)) ?? prev);
            }}
            onError={onError}
          />
        ) : open ? (
          <MindmapView artifact={open} />
        ) : null}
      </SlideUpSheet>
    </>
  );
}

function ArtifactRow({
  artifact,
  onOpen,
  onDelete,
}: {
  artifact: StudyArtifact;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const best = artifact.attempts?.length ? bestAttempt(artifact.attempts) : null;
  const detail =
    artifact.kind === "test"
      ? `${artifact.questions?.length ?? 0} question${(artifact.questions?.length ?? 0) === 1 ? "" : "s"}`
      : `${outlineNodes(artifact.outline ?? "")} node${outlineNodes(artifact.outline ?? "") === 1 ? "" : "s"}`;
  const ready = artifact.status === "ready" && (artifact.kind === "test" ? (artifact.questions?.length ?? 0) > 0 : Boolean(artifact.outline));

  return (
    <Pressable
      onPress={ready ? onOpen : undefined}
      onLongPress={onDelete}
      delayLongPress={300}
      style={({ pressed }) => [styles.row, pressed && ready && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={artifact.title}
      accessibilityHint="Touch and hold to delete."
      testID={`study-artifact-${artifact.id}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {artifact.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {/* "Still being written" is the honest reading of a draft row: the web
              creates the row first and fills it in when the model replies, so a
              draft here is a generation still in flight, not a broken artifact. */}
          {ready ? [artifact.groupName || null, detail].filter(Boolean).join(" · ") : "Still being written"}
        </Text>
      </View>
      {best ? (
        <Text style={styles.rowScore}>
          {best.score}/{best.total}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** One question at a time: pick, see whether it was right and why, move on. */
function TestRunner({
  artifact,
  onFinished,
  onError,
}: {
  artifact: StudyArtifact;
  onFinished: (attempts: TestAttempt[]) => void;
  onError: (message: string) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const questions = useMemo(() => artifact.questions ?? [], [artifact.questions]);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState<TestAttempt | null>(null);
  const [saving, setSaving] = useState(false);

  const question = questions[index];

  const finish = useCallback(
    async (allPicks: number[]) => {
      const attempt = scoreAttempt(questions, allPicks, new Date().toISOString());
      setDone(attempt);
      setSaving(true);
      try {
        const attempts = await recordTestAttempt(artifact, attempt);
        onFinished(attempts);
      } catch (cause) {
        // The score still shows — losing the record is not a reason to hide the
        // result the student just earned.
        onError(cause instanceof Error ? cause.message : "Couldn't save that score.");
      } finally {
        setSaving(false);
      }
    },
    [artifact, questions, onFinished, onError],
  );

  if (done) {
    return (
      <View style={styles.viewerBody} testID="study-test-result">
        <Text style={styles.resultScore}>
          {done.score} / {done.total}
        </Text>
        <Text style={styles.resultNote}>
          {done.missed.length === 0
            ? "Every one right. Come back to this in a few days rather than again now — spacing it is what makes it stick."
            : `${done.missed.length} to go back over. The ones you missed are the ones worth turning into cards.`}
        </Text>
        {saving ? <Text style={styles.rowMeta}>Saving your score…</Text> : null}
      </View>
    );
  }

  if (!question) {
    return (
      <View style={styles.viewerBody}>
        <Text style={styles.rowMeta}>This test has no usable questions.</Text>
      </View>
    );
  }

  const correct = picked !== null && picked === question.answer;

  return (
    <ScrollView contentContainerStyle={styles.viewerBody} showsVerticalScrollIndicator={false} testID="study-test-runner">
      <Text style={styles.progress}>
        Question {index + 1} of {questions.length}
      </Text>
      <Text style={styles.questionText}>{question.q}</Text>
      {question.options.map((option, optionIndex) => {
        // After a pick, the right answer is always marked — including when they
        // got it wrong, which is the moment the correction is worth most.
        const isAnswer = optionIndex === question.answer;
        const isPicked = optionIndex === picked;
        const revealed = picked !== null;
        return (
          <Pressable
            key={`${optionIndex}-${option}`}
            onPress={() => {
              if (picked !== null) return;
              setPicked(optionIndex);
            }}
            disabled={revealed}
            style={({ pressed }) => [
              styles.option,
              pressed && picked === null && styles.optionPressed,
              revealed && isAnswer && styles.optionCorrect,
              revealed && isPicked && !isAnswer && styles.optionWrong,
            ]}
            testID={`study-test-option-${optionIndex}`}
          >
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        );
      })}
      {picked !== null ? (
        <Animated.View entering={FadeIn.duration(140)} style={styles.whyWrap}>
          <Text style={styles.whyLabel}>{correct ? "Right" : "Not quite"}</Text>
          {question.why ? <Text style={styles.whyText}>{question.why}</Text> : null}
          <MissionButton
            label={index + 1 === questions.length ? "See your score" : "Next question"
            }
            variant="primary"
            testID="study-test-next"
            onPress={() => {
              const allPicks = [...picks];
              allPicks[index] = picked;
              setPicks(allPicks);
              setPicked(null);
              if (index + 1 === questions.length) void finish(allPicks);
              else setIndex(index + 1);
            }}
          />
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

/** The outline as an indented tree. See the header note on why not a diagram. */
function MindmapView({ artifact }: { artifact: StudyArtifact }) {
  const styles = useThemedStyles(createStyles);
  const markdownStyles = useThemedStyles(createMarkdownStyles);
  return (
    <ScrollView contentContainerStyle={styles.viewerBody} showsVerticalScrollIndicator={false} testID="study-mindmap-view">
      <MessageBody content={artifact.outline ?? ""} styles={markdownStyles} />
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },
    list: { paddingHorizontal: space(3), gap: space(2) },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space(3),
      paddingVertical: space(3),
      paddingHorizontal: space(4),
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
    },
    rowPressed: { backgroundColor: c.surface },
    rowText: { flex: 1, gap: space(0.5) },
    rowTitle: { ...type.body, color: c.text },
    rowMeta: { ...type.micro, color: c.textHint },
    rowScore: { ...type.small, fontWeight: "700", color: c.accent, fontVariant: ["tabular-nums"] },

    viewerBody: { padding: space(4), gap: space(3) },
    progress: { ...type.micro, color: c.textHint },
    questionText: { ...type.body, color: c.text, lineHeight: type.body.lineHeight + 2 },
    option: {
      paddingVertical: space(3),
      paddingHorizontal: space(4),
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
    },
    optionPressed: { backgroundColor: c.surface },
    // The accent is this app's one highlight colour; a wrong pick is drawn with
    // the line tone rather than a second hue, so the screen never turns into a
    // traffic light.
    optionCorrect: { borderColor: c.accent, backgroundColor: c.accentFaint },
    optionWrong: { borderColor: c.textHint },
    optionText: { ...type.body, color: c.text },
    whyWrap: { gap: space(2), paddingTop: space(2) },
    whyLabel: { ...type.small, fontWeight: "700", color: c.text },
    whyText: { ...type.small, color: c.textHint, lineHeight: type.small.lineHeight + 3 },
    resultScore: { ...type.title, color: c.text, fontVariant: ["tabular-nums"] },
    resultNote: { ...type.small, color: c.textHint, lineHeight: type.small.lineHeight + 3 },
  });
