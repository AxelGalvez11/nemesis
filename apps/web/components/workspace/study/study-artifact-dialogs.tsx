"use client";

// Batch C dialogs (owner 2026-07-21): generate a test or mind map with AI
// from a deck or a library note, take a test with per-question feedback, and
// view a mind map rendered as a mermaid diagram. Missed test questions can be
// added to any deck as flashcards — the review loop closes here.

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
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
  const content = useMemo(() => parseTestContent(artifact.content), [artifact.content]);
  const [picks, setPicks] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const [targetDeckId, setTargetDeckId] = useState("");
  const [busy, setBusy] = useState(false);

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
  // column reads it back through bestAttempt.
  useEffect(() => {
    if (!attempt || saved || !content) return;
    setSaved(true);
    const nextContent: TestContent = { attempts: [...content.attempts, attempt], questions };
    void study.updateArtifact(artifact.id, { content: nextContent }).catch(() => undefined);
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
    if (nextPicks.length < questions.length) setIndex(index + 1);
  }

  async function addMissed() {
    if (!attempt || attempt.missed.length === 0) return;
    const deck = study.decks.find((item) => item.id === targetDeckId) ?? study.decks[0];
    if (!deck) return;
    setBusy(true);
    try {
      for (const draft of missedQuestionCards(questions, attempt.missed)) {
        await study.createCard({ back: draft.back, deckId: deck.id, front: draft.front, tags: ["missed-question"] });
      }
      setAddedTo(deck.name);
    } finally {
      setBusy(false);
    }
  }

  // Owner 2026-08-01: "test should not be able to be retaken." A test whose
  // answers you have already seen measures memory of the review screen, not of
  // the material — and the score the Tests table shows would drift upward for
  // a reason that has nothing to do with learning. One attempt, kept.
  const alreadyTaken = content.attempts.length > 0 && !saved;

  // Beautified 2026-08-03 (owner: "the tests look ugly, beautify them") —
  // same three states, same one-attempt rule, same testids; what changed is
  // purely how it reads: a real progress bar, lettered options with verdict
  // icons, a score that looks like a score. Behavior of note that survives
  // untouched: CLICKING AN OPTION IS THE ANSWER (it locks and reveals), and
  // Next is a separate deliberate step.
  const answered = picks.length + (picked !== null ? 1 : 0);
  return (
    <Dialog onOpenChange={(next) => { if (!next) onClose(); }} open>
      {/* Fullscreen, matching flashcard review (review-session.tsx) — owner
          2026-08-01: "the tests should be fullscreen like the flashcards." */}
      <DialogContent className="review-stage left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[minmax(0,1fr)] overflow-y-auto rounded-none border-0 px-7 py-6" showCloseButton>
        {alreadyTaken ? (
          <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-4 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--ui-base)_8%,transparent)] text-(--ui-text-secondary)">
              <Codicon name="checklist" size="1.25rem" />
            </span>
            <DialogHeader className="items-center">
              <DialogTitle className="text-base">{artifact.title}</DialogTitle>
              <DialogDescription className="text-center leading-relaxed" data-testid="test-already-taken">
                You have already taken this test — {artifactScoreLabel(artifact)}. Each test is
                answered once, so the score stays a real measure of what you knew.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={onClose} type="button" variant="secondary">Close</Button>
          </div>
        ) : !finished && question ? (
          <div className="mx-auto flex w-full max-w-2xl flex-col justify-center gap-6">
            <div className="grid gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <DialogTitle className="truncate text-sm font-medium text-(--ui-text-secondary)">{artifact.title}</DialogTitle>
                <DialogDescription className="shrink-0 tabular-nums">Question {index + 1} of {questions.length}</DialogDescription>
              </div>
              {/* The bar carries the "how far along am I" job the old text-only
                  counter did alone; it fills as answers LOCK, not as pages turn. */}
              <div aria-hidden className="h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ui-base)_10%,transparent)]">
                <div className="h-full rounded-full bg-(--theme-primary) transition-[width] duration-300" style={{ width: `${Math.round((answered / Math.max(questions.length, 1)) * 100)}%` }} />
              </div>
            </div>
            <p className="text-lg font-medium leading-relaxed text-balance">{question.q}</p>
            <div className="grid gap-2.5" data-testid="test-options">
              {question.options.map((option, optionIndex) => {
                const isPicked = picked === optionIndex;
                const isCorrect = optionIndex === question.answer;
                const revealed = picked !== null;
                return (
                  <button
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border border-(--ui-stroke-secondary) px-4 py-3 text-left text-[0.9375rem] leading-snug transition-colors",
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
            <div className="flex items-center justify-between">
              <Button onClick={onClose} type="button" variant="ghost">Exit</Button>
              <Button disabled={picked === null} onClick={next} type="button" variant="secondary">
                {picks.length + 1 === questions.length ? "Finish" : "Next"}
              </Button>
            </div>
          </div>
        ) : attempt ? (
          <div className="mx-auto flex w-full max-w-2xl flex-col justify-center gap-6">
            <div className="grid justify-items-center gap-1.5 text-center">
              <DialogTitle className="text-sm font-medium text-(--ui-text-secondary)">{artifact.title}</DialogTitle>
              <p className="text-5xl font-semibold tabular-nums tracking-tight">
                {Math.round((attempt.score / attempt.total) * 100)}%
              </p>
              <DialogDescription className="tabular-nums" data-testid="test-score">
                Score: {attempt.score}/{attempt.total} ({Math.round((attempt.score / attempt.total) * 100)}%)
              </DialogDescription>
            </div>
            {attempt.missed.length > 0 ? (
              <div className="grid gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-(--ui-text-tertiary)">Review what you missed</p>
                <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                  {attempt.missed.map((miss) => {
                    const missedQuestion = questions[miss.questionIndex];
                    if (!missedQuestion) return null;
                    return (
                      <div className="rounded-2xl border border-(--ui-stroke-tertiary) px-4 py-3" key={miss.questionIndex}>
                        <p className="text-[0.8125rem] font-medium leading-snug">{missedQuestion.q}</p>
                        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-(--ui-text-secondary)">
                          <span className="font-medium text-emerald-600 dark:text-emerald-500">{missedQuestion.options[missedQuestion.answer]}</span>
                          {" — "}{missedQuestion.why}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {addedTo ? (
                  <p className="text-xs text-(--ui-text-secondary)" data-testid="missed-added">Added to "{addedTo}" — they'll come up in review.</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 min-w-0 flex-1 rounded-lg border border-(--ui-stroke-secondary) bg-background px-2 text-sm"
                      data-testid="missed-deck"
                      onChange={(event) => setTargetDeckId(event.target.value)}
                      value={targetDeckId || study.decks[0]?.id || ""}
                    >
                      {study.decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
                    </select>
                    <Button disabled={busy || study.decks.length === 0} onClick={() => void addMissed()} size="sm" type="button" variant="secondary">
                      {busy ? "Adding…" : `Add ${attempt.missed.length} as flashcards`}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="flex items-center justify-center gap-2 text-sm text-(--ui-text-secondary)">
                <Codicon className="text-emerald-600 dark:text-emerald-500" name="check" size="0.875rem" />
                Perfect run — nothing missed.
              </p>
            )}
            <DialogFooter className="justify-center sm:justify-center"><Button onClick={onClose} type="button" variant="secondary">Done</Button></DialogFooter>
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
