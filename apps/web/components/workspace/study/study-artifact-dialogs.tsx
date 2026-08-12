"use client";

// Batch C dialogs (owner 2026-07-21): generate a test or mind map with AI
// from a deck or a library note, take a test with per-question feedback, and
// view a mind map rendered as a mermaid diagram. Missed test questions can be
// added to any deck as flashcards — the review loop closes here.

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { ExplainChat, type ExplainRevise, type ExplainTurn } from "@/components/workspace/study/explain-chat";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import { explainQuestionContext, explainTranscript, parseRevisedQuestion, reviseQuestionMessages } from "@/lib/workspace/study-ai-extras";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { MessageResponse } from "@/components/ai-elements/message";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import {
  bestAttempt,
  deckMaterial,
  missedQuestionCards,
  noteMaterial,
  outlineToMermaidMindmap,
  parseMindmapContent,
  parseTestContent,
  scoreAttempt,
  scoreTone,
  type ScoreTone,
  type TestContent,
} from "@/lib/workspace/study-artifact-content";
import { generateStudyArtifact } from "@/lib/workspace/study-generate";
import { useCloudStudy, type StudyArtifact } from "@/lib/workspace/study-cloud-store";
import { cn } from "@/lib/utils";

export function artifactScoreLabel(artifact: StudyArtifact): string {
  const content = artifact.kind === "test" ? parseTestContent(artifact.content) : null;
  if (!content) return artifact.kind === "test" ? "—" : "";
  const best = bestAttempt(content.attempts);
  return best ? `${Math.round((best.score / best.total) * 100)}%` : "Not taken";
}

/** Colour band to pair with artifactScoreLabel in the tests table. */
export function artifactScoreTone(artifact: StudyArtifact): ScoreTone {
  const content = artifact.kind === "test" ? parseTestContent(artifact.content) : null;
  return scoreTone(content?.attempts ?? []);
}

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

export function GenerateArtifactDialog({ kind, open, onClose }: { kind: "test" | "mindmap"; open: boolean; onClose: () => void }) {
  const study = useCloudStudy();
  const { notes } = useCloudLibrary();
  const [sourceType, setSourceType] = useState<"deck" | "note">("deck");
  const [deckId, setDeckId] = useState("");
  const [notePath, setNotePath] = useState("");
  const [count, setCount] = useState(10);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decks = study.decks;
  const cardsByDeck = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of study.cards) map.set(card.deckId, (map.get(card.deckId) ?? 0) + 1);
    return map;
  }, [study.cards]);
  const label = kind === "test" ? "test" : "mind map";

  async function generate() {
    setError(null);
    if (!study.userId) {
      setError("Sign in to generate with AI.");
      return;
    }
    let material;
    let sourceTitle;
    if (sourceType === "deck") {
      const deck = decks.find((item) => item.id === deckId) ?? decks[0];
      if (!deck) {
        setError("Create a deck with cards first, or generate from a note.");
        return;
      }
      const cards = study.cards.filter((card) => card.deckId === deck.id && !card.suspended);
      if (cards.length === 0) {
        setError(`"${deck.name}" has no cards to work from.`);
        return;
      }
      material = deckMaterial(deck.name, cards);
      sourceTitle = deck.name;
    } else {
      const note = notes.find((item) => item.path === notePath) ?? notes[0];
      if (!note) {
        setError("No library notes yet — write one first, or generate from a deck.");
        return;
      }
      material = noteMaterial(note.title, note.content);
      sourceTitle = note.title;
    }
    setBusy(true);
    try {
      await generateStudyArtifact({
        createArtifact: study.createArtifact,
        deleteArtifact: study.deleteArtifact,
        groupName: groupName.trim() || undefined,
        kind,
        material,
        questionCount: count,
        title: `${sourceTitle} — ${kind === "test" ? "practice test" : "mind map"}`,
        uid: study.userId,
        updateArtifact: study.updateArtifact,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The engine couldn't generate that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={(next) => { if (!next && !busy) onClose(); }} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate a {label} with AI</DialogTitle>
          <DialogDescription>Built only from the source you pick — a deck's cards or a library note.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(["deck", "note"] as const).map((option) => (
              <Button
                className={cn(sourceType === option && "bg-(--ui-control-active-background) text-foreground")}
                key={option}
                onClick={() => setSourceType(option)}
                size="sm"
                type="button"
                variant="outline"
              >
                {option === "deck" ? "From a deck" : "From a note"}
              </Button>
            ))}
          </div>
          {sourceType === "deck" ? (
            <label className="grid gap-1.5 text-xs font-medium">
              Deck
              <select
                className="h-9 rounded-lg border border-(--ui-stroke-secondary) bg-background px-2 text-sm"
                data-testid="generate-deck"
                onChange={(event) => setDeckId(event.target.value)}
                value={deckId || decks[0]?.id || ""}
              >
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({cardsByDeck.get(deck.id) ?? 0} cards)
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="grid gap-1.5 text-xs font-medium">
              Note
              <select
                className="h-9 rounded-lg border border-(--ui-stroke-secondary) bg-background px-2 text-sm"
                data-testid="generate-note"
                onChange={(event) => setNotePath(event.target.value)}
                value={notePath || notes[0]?.path || ""}
              >
                {notes.map((note) => (
                  <option key={note.path} value={note.path}>{note.title}</option>
                ))}
              </select>
            </label>
          )}
          {kind === "test" && (
            <label className="grid gap-1.5 text-xs font-medium">
              Questions
              <select
                className="h-9 rounded-lg border border-(--ui-stroke-secondary) bg-background px-2 text-sm"
                onChange={(event) => setCount(Number(event.target.value))}
                value={count}
              >
                {[5, 10, 15, 20].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}
          <label className="grid gap-1.5 text-xs font-medium">
            Group (optional)
            <Input onChange={(event) => setGroupName(event.target.value)} placeholder="Pharmacy School::Exam 7" value={groupName} />
          </label>
          {error ? <p className="text-xs text-(--theme-primary)">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button disabled={busy} onClick={() => void generate()} type="button" variant="secondary">
            {busy ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Take a test                                                         */
/* ------------------------------------------------------------------ */

export function TakeTestDialog({ artifact, onClose }: { artifact: StudyArtifact; onClose: () => void }) {
  const study = useCloudStudy();
  const previewMode = useWorkspacePreview();
  // A revision from the Explain panel replaces a question mid-sitting; the
  // artifact prop is the parent's snapshot, so the override keeps this dialog
  // truthful until the store round-trips.
  const [contentOverride, setContentOverride] = useState<TestContent | null>(null);
  const content = useMemo(() => contentOverride ?? parseTestContent(artifact.content), [artifact.content, contentOverride]);
  const [picks, setPicks] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const [targetDeckId, setTargetDeckId] = useState("");
  const [busy, setBusy] = useState(false);
  // The Explain side chat, per question — the panel opens to the RIGHT of the
  // test (owner 2026-08-04); transcripts cache for the sitting.
  const explainCache = useRef(new Map<string, ExplainTurn[]>());
  const [explainFor, setExplainFor] = useState<number | null>(null);

  // Hooks first, early return after — content can be null for legacy shells.
  const questions = useMemo(() => content?.questions ?? [], [content]);
  const finished = questions.length > 0 && picks.length === questions.length;
  const question = questions[Math.min(index, Math.max(questions.length - 1, 0))];
  const attempt = useMemo(
    () => (finished ? scoreAttempt(questions, picks, new Date().toISOString()) : null),
    // picks fully determines the attempt; a fresh timestamp per finish is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finished, picks, questions],
  );

  // Persist the finished attempt exactly once — the tests table's Score
  // column reads it back through bestAttempt. A failed write is surfaced (a
  // silently lost attempt used to mean the test quietly restarted next open).
  useEffect(() => {
    if (!attempt || saved || !content) return;
    setSaved(true);
    const nextContent: TestContent = { attempts: [...content.attempts, attempt], questions };
    void study.updateArtifact(artifact.id, { content: nextContent }).catch(() => setSaveError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, saved]);

  if (!content) {
    return (
      <Dialog onOpenChange={(next) => { if (!next) onClose(); }} open>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{artifact.title}</DialogTitle>
            <DialogDescription>This test has no questions yet — generate it with AI from the Tests tab.</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={onClose} type="button" variant="secondary">Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function choose(optionIndex: number) {
    if (picked !== null) return;
    setPicked(optionIndex);
  }

  function next() {
    if (picked === null) return;
    const nextPicks = [...picks, picked];
    setPicks(nextPicks);
    setPicked(null);
    setExplainFor(null);
    if (nextPicks.length < questions.length) setIndex(index + 1);
  }

  // Owner 2026-08-01: "test should not be able to be retaken." One attempt,
  // kept. Owner 2026-08-04: "opening previously finished test should allow
  // user to look at the questions and their performance" — so a finished test
  // now opens as a full REVIEW (every question, their pick, the correct one),
  // both right after finishing and on every later open. reviewAttempt is the
  // just-scored attempt, or the recorded best when reopening.
  const alreadyTaken = content.attempts.length > 0 && !saved;
  const reviewAttempt = attempt ?? (alreadyTaken ? bestAttempt(content.attempts) : null);

  async function addMissed() {
    if (!reviewAttempt || reviewAttempt.missed.length === 0) return;
    const deck = study.decks.find((item) => item.id === targetDeckId) ?? study.decks[0];
    if (!deck) return;
    setBusy(true);
    try {
      for (const draft of missedQuestionCards(questions, reviewAttempt.missed)) {
        await study.createCard({ back: draft.back, deckId: deck.id, front: draft.front, tags: ["missed-question"] });
      }
      setAddedTo(deck.name);
    } finally {
      setBusy(false);
    }
  }

  // Reflowed 2026-08-04 (owner: "the tests are too centered, remove the 'exit
  // button', make it less centered"): the question column sits LEFT inside the
  // stage with a reserved right-hand rail where the Explain side chat opens,
  // and the whole flow is top-anchored like a document instead of floating in
  // the middle of the screen. The X in the corner is the one way out — the
  // Exit button is gone. CLICKING AN OPTION IS STILL THE ANSWER (it locks and
  // reveals), and Next stays a separate deliberate step.
  const answered = picks.length + (picked !== null ? 1 : 0);
  const explainQuestion = explainFor !== null ? questions[explainFor] : undefined;
  const explainPicked = explainFor === null
    ? null
    : reviewAttempt
      ? (reviewAttempt.missed.find((miss) => miss.questionIndex === explainFor)?.picked ?? explainQuestion?.answer ?? null)
      : picked;
  // Owner 2026-08-04: "the nemesis 'explain' should be able to remake, alter,
  // flashcards and test questions." The rewrite uses the side chat as its
  // brief: the student says what's wrong, presses Rewrite, and the revised
  // question replaces this one — in the store and on screen.
  const reviseTarget = explainFor;
  const reviseQuestionAction: ExplainRevise | undefined =
    reviseTarget !== null && explainQuestion && !previewMode && study.userId
      ? {
          apply: async (turns) => {
            if (!content) return "This test has no content to revise.";
            const reply = await postChatCompletion(
              study.userId!,
              reviseQuestionMessages({
                answer: explainQuestion.answer,
                options: explainQuestion.options,
                q: explainQuestion.q,
                transcript: explainTranscript(turns),
                why: explainQuestion.why,
              }),
              { decision: { route: "conversation", searchWeb: false } },
            );
            const revised = reply.text ? parseRevisedQuestion(reply.text) : null;
            if (!revised) return reply.errorText ?? "The engine couldn't produce a clean rewrite — tell it what to change and try again.";
            const nextContent: TestContent = {
              attempts: content.attempts,
              questions: questions.map((entry, entryIndex) => (entryIndex === reviseTarget ? revised : entry)),
            };
            setContentOverride(nextContent);
            try {
              await study.updateArtifact(artifact.id, { content: nextContent });
            } catch {
              return "Rewrote it here, but saving failed — the change may not survive a reload.";
            }
            return null;
          },
          noun: "question",
        }
      : undefined;
  const explainPanel = explainFor !== null && explainQuestion ? (
    <ExplainChat
      cache={explainCache.current}
      className="max-h-80 lg:sticky lg:top-2 lg:max-h-[85vh]"
      context={explainQuestionContext({
        answerIndex: explainQuestion.answer,
        options: explainQuestion.options,
        pickedIndex: explainPicked,
        q: explainQuestion.q,
      })}
      contextKey={`${artifact.id}:q${explainFor}`}
      onClose={() => setExplainFor(null)}
      previewMode={Boolean(previewMode)}
      revise={reviseQuestionAction}
      userId={study.userId}
    />
  ) : null;
  return (
    <Dialog onOpenChange={(next) => { if (!next) onClose(); }} open>
      {/* Fullscreen, matching flashcard review (review-session.tsx) — owner
          2026-08-01: "the tests should be fullscreen like the flashcards." */}
      <DialogContent className="review-stage left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[minmax(0,1fr)] overflow-y-auto rounded-none border-0 px-7 py-6" showCloseButton>
        {reviewAttempt ? (
          // Centered by default; the two-column grid exists only while the
          // Explain rail is open (owner 2026-08-04, screenshot: "the tests
          // are not centered" — an always-reserved empty rail read lopsided).
          <div className={cn("mx-auto grid w-full content-start grid-cols-1 gap-6 pt-[6vh]", explainPanel ? "max-w-6xl lg:grid-cols-[minmax(0,42rem)_minmax(0,19rem)]" : "max-w-2xl")}>
            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid gap-1">
                <DialogTitle className="text-sm font-medium text-(--ui-text-secondary)">{artifact.title}</DialogTitle>
                <div className="flex items-baseline gap-3">
                  <p
                    className={cn(
                      "text-4xl font-semibold tabular-nums tracking-tight",
                      Math.round((reviewAttempt.score / reviewAttempt.total) * 100) >= 80 && "text-emerald-600 dark:text-emerald-500",
                      Math.round((reviewAttempt.score / reviewAttempt.total) * 100) < 80 && Math.round((reviewAttempt.score / reviewAttempt.total) * 100) >= 60 && "text-amber-600 dark:text-amber-500",
                      Math.round((reviewAttempt.score / reviewAttempt.total) * 100) < 60 && "text-(--theme-primary)",
                    )}
                  >
                    {Math.round((reviewAttempt.score / reviewAttempt.total) * 100)}%
                  </p>
                  <DialogDescription className="tabular-nums" data-testid="test-score">
                    {reviewAttempt.score}/{reviewAttempt.total} correct
                  </DialogDescription>
                </div>
                <p className="text-xs text-(--ui-text-tertiary)" data-testid="test-already-taken">
                  Each test is answered once — this is your recorded attempt.
                </p>
                {saveError && (
                  <p className="text-xs text-destructive" role="alert">
                    This attempt could not be saved just now — the score above may not appear in your Tests table.
                  </p>
                )}
              </div>
              {reviewAttempt.missed.length > 0 && (
                addedTo ? (
                  <p className="text-xs text-(--ui-text-secondary)" data-testid="missed-added">Added to "{addedTo}" — they'll come up in review.</p>
                ) : (
                  // One control, not a panel (owner 2026-08-04: "redo the 'turn
                  // your 8 missing cards' to a more minimal button"). The
                  // bordered card carried a heading, a subtitle, a full-width
                  // deck select and a button to say one thing, directly above a
                  // question list it was competing with. The button now says the
                  // whole sentence itself, and the deck picker appears only when
                  // there is a choice to make — with one deck it was a dropdown
                  // that could not be changed to anything.
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Button data-testid="missed-add" disabled={busy || study.decks.length === 0} onClick={() => void addMissed()} size="sm" type="button" variant="secondary">
                      {busy
                        ? "Adding…"
                        : `Add ${reviewAttempt.missed.length} missed to flashcards`}
                    </Button>
                    {study.decks.length > 1 && (
                      <select
                        aria-label="Deck to add them to"
                        className="h-7 max-w-44 truncate rounded-md border-0 bg-transparent px-1 text-xs text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
                        data-testid="missed-deck"
                        onChange={(event) => setTargetDeckId(event.target.value)}
                        value={targetDeckId || study.decks[0]?.id || ""}
                      >
                        {study.decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
                      </select>
                    )}
                  </div>
                )
              )}
              {reviewAttempt.missed.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-(--ui-text-secondary)">
                  <Codicon className="text-emerald-600 dark:text-emerald-500" name="check" size="0.875rem" />
                  Perfect run — nothing missed.
                </p>
              )}
              <ol className="grid gap-4" data-testid="test-review">
                {questions.map((reviewQuestion, questionIndex) => {
                  const miss = reviewAttempt.missed.find((entry) => entry.questionIndex === questionIndex);
                  const pickedIndex = miss ? miss.picked : reviewQuestion.answer;
                  return (
                    <li className="rounded-2xl border border-(--ui-stroke-tertiary) px-4 py-3.5" key={questionIndex}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-[0.9375rem] font-medium leading-snug">
                          <span className="tabular-nums text-(--ui-text-tertiary)">{questionIndex + 1}.</span> {reviewQuestion.q}
                        </p>
                        <Button
                          aria-label="Have Nemesis explain this question"
                          aria-pressed={explainFor === questionIndex}
                          className="shrink-0"
                          data-testid="explain-question"
                          onClick={() => setExplainFor((current) => (current === questionIndex ? null : questionIndex))}
                          size="icon-xs"
                          title="Have Nemesis explain this question"
                          type="button"
                          variant="ghost"
                        >
                          <Codicon name="sparkle" size="0.8125rem" />
                        </Button>
                      </div>
                      <div className="mt-2.5 grid gap-1.5">
                        {reviewQuestion.options.map((option, optionIndex) => {
                          const isCorrect = optionIndex === reviewQuestion.answer;
                          const isPicked = optionIndex === pickedIndex;
                          return (
                            <div
                              className={cn(
                                "flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-1.5 text-sm leading-snug",
                                isCorrect && "border-emerald-600/50 bg-emerald-600/10",
                                isPicked && !isCorrect && "border-(--theme-primary) bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)]",
                                !isCorrect && !isPicked && "text-(--ui-text-secondary)",
                              )}
                              key={optionIndex}
                            >
                              <span
                                className={cn(
                                  "grid size-5 shrink-0 place-items-center rounded-md border border-(--ui-stroke-tertiary) text-[0.6875rem] font-semibold text-(--ui-text-tertiary)",
                                  isCorrect && "border-transparent bg-emerald-600 text-white",
                                  isPicked && !isCorrect && "border-transparent bg-(--theme-primary) text-white",
                                )}
                              >
                                {isCorrect
                                  ? <Codicon name="check" size="0.6875rem" />
                                  : isPicked
                                    ? <Codicon name="close" size="0.6875rem" />
                                    : String.fromCharCode(65 + optionIndex)}
                              </span>
                              <span className="min-w-0 flex-1">{option}</span>
                              {isPicked && !isCorrect && <span className="shrink-0 text-[0.6875rem] text-(--ui-text-tertiary)">your pick</span>}
                            </div>
                          );
                        })}
                      </div>
                      {reviewQuestion.why && (
                        <p className="mt-2.5 rounded-xl bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)] px-3 py-2 text-[0.8125rem] leading-relaxed text-(--ui-text-secondary)">{reviewQuestion.why}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
              <DialogFooter className="justify-start sm:justify-start">
                <Button onClick={onClose} type="button" variant="secondary">Done</Button>
              </DialogFooter>
            </div>
            {explainPanel}
          </div>
        ) : question ? (
          <div className={cn("mx-auto grid w-full content-start grid-cols-1 gap-6 pt-[8vh]", explainPanel ? "max-w-6xl lg:grid-cols-[minmax(0,42rem)_minmax(0,19rem)]" : "max-w-2xl")}>
            <div className="flex min-w-0 flex-col gap-6">
              <div className="grid gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <DialogTitle className="truncate text-sm font-medium text-(--ui-text-secondary)">{artifact.title}</DialogTitle>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <DialogDescription className="tabular-nums">Question {index + 1} of {questions.length}</DialogDescription>
                    {picked !== null && (
                      <Button
                        aria-label="Have Nemesis explain this question"
                        aria-pressed={explainFor === index}
                        data-testid="explain-question"
                        onClick={() => setExplainFor((current) => (current === index ? null : index))}
                        size="icon-xs"
                        title="Have Nemesis explain this question"
                        type="button"
                        variant="ghost"
                      >
                        <Codicon name="sparkle" size="0.8125rem" />
                      </Button>
                    )}
                  </div>
                </div>
                {/* The bar carries the "how far along am I" job the old text-only
                    counter did alone; it fills as answers LOCK, not as pages turn. */}
                <div aria-hidden className="h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)]">
                  <div className="h-full rounded-full bg-(--theme-primary) transition-[width] duration-300" style={{ width: `${Math.round((answered / Math.max(questions.length, 1)) * 100)}%` }} />
                </div>
              </div>
              <p className="text-base font-medium leading-relaxed text-balance">{question.q}</p>
              <div className="grid gap-2.5" data-testid="test-options">
                {question.options.map((option, optionIndex) => {
                  const isPicked = picked === optionIndex;
                  const isCorrect = optionIndex === question.answer;
                  const revealed = picked !== null;
                  return (
                    <button
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border border-(--ui-stroke-secondary) px-4 py-3 text-left text-sm leading-snug transition-colors",
                        !revealed && "hover:border-(--ui-stroke-primary) hover:bg-(--ui-control-hover-background)",
                        revealed && isCorrect && "border-emerald-600/60 bg-emerald-600/10",
                        revealed && isPicked && !isCorrect && "border-(--theme-primary) bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)]",
                        revealed && !isCorrect && !isPicked && "opacity-55",
                      )}
                      disabled={picked !== null}
                      key={optionIndex}
                      onClick={() => choose(optionIndex)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-md border border-(--ui-stroke-tertiary) text-[0.6875rem] font-semibold text-(--ui-text-tertiary)",
                          revealed && isCorrect && "border-transparent bg-emerald-600 text-white",
                          revealed && isPicked && !isCorrect && "border-transparent bg-(--theme-primary) text-white",
                        )}
                      >
                        {revealed && isCorrect
                          ? <Codicon name="check" size="0.75rem" />
                          : revealed && isPicked
                            ? <Codicon name="close" size="0.75rem" />
                            : String.fromCharCode(65 + optionIndex)}
                      </span>
                      <span className="min-w-0 flex-1">{option}</span>
                    </button>
                  );
                })}
              </div>
              {picked !== null && (
                <div className="rounded-2xl bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)] px-4 py-3 text-[0.8125rem] leading-relaxed text-(--ui-text-secondary)" data-testid="test-why">
                  <span className="font-semibold text-foreground">
                    {picked === question.answer ? "Correct. " : `Not quite — the answer is "${question.options[question.answer]}". `}
                  </span>
                  {question.why}
                </div>
              )}
              <div className="flex items-center justify-end">
                <Button disabled={picked === null} onClick={next} type="button" variant="secondary">
                  {picks.length + 1 === questions.length ? "Finish" : "Next"}
                </Button>
              </div>
            </div>
            {explainPanel}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Mindmap                                                             */
/* ------------------------------------------------------------------ */

export function MindmapDialog({ artifact, onClose }: { artifact: StudyArtifact; onClose: () => void }) {
  const content = useMemo(() => parseMindmapContent(artifact.content), [artifact.content]);
  const mermaid = useMemo(() => (content ? outlineToMermaidMindmap(content.outline) : null), [content]);
  return (
    <Dialog onOpenChange={(next) => { if (!next) onClose(); }} open>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{artifact.title}</DialogTitle>
          <DialogDescription>{content ? "Generated mind map — the outline is below the diagram." : "This mind map has no content yet — generate it with AI from the Mindmaps tab."}</DialogDescription>
        </DialogHeader>
        {content && mermaid ? (
          <div className="max-h-[65vh] overflow-y-auto" data-testid="mindmap-body">
            <MessageResponse>{`\`\`\`mermaid\n${mermaid}\n\`\`\``}</MessageResponse>
            <details className="mt-3 text-xs text-(--ui-text-secondary)">
              <summary className="cursor-pointer font-medium">Outline</summary>
              <MessageResponse className="mt-2">{content.outline}</MessageResponse>
            </details>
          </div>
        ) : null}
        <DialogFooter><Button onClick={onClose} type="button" variant="secondary">Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
