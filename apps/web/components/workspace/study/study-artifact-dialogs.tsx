"use client";

// Batch C dialogs (owner 2026-07-21): generate a test or mind map with AI
// from a deck or a library note, take a test with per-question feedback, and
// view a mind map rendered as a mermaid diagram. Missed test questions can be
// added to any deck as flashcards — the review loop closes here.

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
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

  return (
    <Dialog onOpenChange={(next) => { if (!next) onClose(); }} open>
      <DialogContent className="max-w-xl">
        {!finished && question ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm">{artifact.title}</DialogTitle>
              <DialogDescription>Question {index + 1} of {questions.length}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <p className="text-sm font-medium leading-relaxed">{question.q}</p>
              <div className="grid gap-2" data-testid="test-options">
                {question.options.map((option, optionIndex) => {
                  const isPicked = picked === optionIndex;
                  const isCorrect = optionIndex === question.answer;
                  return (
                    <button
                      className={cn(
                        "rounded-xl border border-(--ui-stroke-secondary) px-3 py-2 text-left text-sm transition-colors",
                        picked === null && "hover:bg-(--ui-control-hover-background)",
                        picked !== null && isCorrect && "border-emerald-600/60 bg-emerald-600/10",
                        picked !== null && isPicked && !isCorrect && "border-(--theme-primary) bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)]",
                      )}
                      disabled={picked !== null}
                      key={optionIndex}
                      onClick={() => choose(optionIndex)}
                      type="button"
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {picked !== null && (
                <p className="rounded-xl bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)] px-3 py-2 text-xs leading-relaxed text-(--ui-text-secondary)" data-testid="test-why">
                  {picked === question.answer ? "Correct. " : `Not quite — the answer is "${question.options[question.answer]}". `}
                  {question.why}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={onClose} type="button" variant="ghost">Exit</Button>
              <Button disabled={picked === null} onClick={next} type="button" variant="secondary">
                {picks.length + 1 === questions.length ? "Finish" : "Next"}
              </Button>
            </DialogFooter>
          </>
        ) : attempt ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm">{artifact.title}</DialogTitle>
              <DialogDescription data-testid="test-score">
                Score: {attempt.score}/{attempt.total} ({Math.round((attempt.score / attempt.total) * 100)}%)
              </DialogDescription>
            </DialogHeader>
            {attempt.missed.length > 0 ? (
              <div className="grid gap-3">
                <p className="text-xs font-medium">Missed questions</p>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {attempt.missed.map((miss) => {
                    const missedQuestion = questions[miss.questionIndex];
                    if (!missedQuestion) return null;
                    return (
                      <div className="rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2 text-xs" key={miss.questionIndex}>
                        <p className="font-medium">{missedQuestion.q}</p>
                        <p className="mt-1 text-(--ui-text-secondary)">{missedQuestion.options[missedQuestion.answer]} — {missedQuestion.why}</p>
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
              <p className="text-sm">Perfect run — nothing missed.</p>
            )}
            <DialogFooter><Button onClick={onClose} type="button" variant="secondary">Done</Button></DialogFooter>
          </>
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
