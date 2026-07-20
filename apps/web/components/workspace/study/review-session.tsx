"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/desktop-ui/dialog";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { type StudyCard, type StudyDeck, isCardDue, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import type { StudyGrade } from "@/lib/workspace/study-scheduler";
import { cn } from "@/lib/utils";

import type { StudyReviewSettings } from "./study-chrome";

const GRADES: { grade: StudyGrade; label: string; hint: string; variant: "outline" | "secondary" }[] = [
  { grade: "again", label: "Again", hint: "1d", variant: "outline" },
  { grade: "hard", label: "Hard", hint: "slower", variant: "secondary" },
  { grade: "good", label: "Good", hint: "normal", variant: "secondary" },
  { grade: "easy", label: "Easy", hint: "longer", variant: "secondary" },
];

interface ReviewSessionProps {
  cards: StudyCard[];
  deck: StudyDeck | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: StudyReviewSettings;
}

export function ReviewSession({ cards, deck, open, onOpenChange, settings }: ReviewSessionProps) {
  const { gradeCard } = useCloudStudy();
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCompletedIds([]);
    setRevealed(false);
    setError(null);
  }, [open, deck?.id]);

  const queue = useMemo(
    () => cards.filter((card) => card.deckId === deck?.id && isCardDue(card) && !completedIds.includes(card.id)),
    [cards, completedIds, deck?.id],
  );
  const current = queue[0] ?? null;

  async function grade(value: StudyGrade) {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      await gradeCard(current.id, value);
      setCompletedIds((ids) => [...ids, current.id]);
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the review.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-none border-0 bg-background px-7 py-6" showCloseButton>
        <DialogTitle className="sr-only">{deck?.name ?? "Flashcard review"}</DialogTitle>
        <DialogDescription className="sr-only">Review the front of the card, reveal its answer, then grade your recall.</DialogDescription>
        {current ? (
          <div className="mx-auto grid min-h-0 w-full max-w-6xl grid-rows-[minmax(0,1fr)_auto] gap-5 pt-8">
            <section className={cn("grid min-h-0 place-items-start overflow-y-auto bg-background px-4 py-12 text-center", settings.flashcardOutline && "rounded-3xl border border-(--ui-stroke-secondary) shadow-sm")}>
              <div className={cn("mx-auto w-full max-w-5xl", settings.flipAnimation && "animate-in fade-in-0 duration-300")}>
                <AssistantMarkdown className="text-lg font-medium leading-8" text={current.front} />
                {revealed && (
                  <div className={cn("mt-8 border-t border-(--ui-stroke-secondary) pt-8", settings.flipAnimation && "animate-in fade-in-0 slide-in-from-bottom-1 duration-300")}>
                    <AssistantMarkdown className="text-lg leading-8 text-foreground" text={current.back} />
                  </div>
                )}
              </div>
            </section>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
            {!revealed ? (
              <Button className="justify-self-center bg-foreground text-background hover:bg-foreground/90" onClick={() => setRevealed(true)} size="lg" variant="ghost">Show answer</Button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map(({ grade: value, hint, label, variant }) => (
                  <Button className="h-auto flex-col gap-0.5 bg-background py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" disabled={saving} key={value} onClick={() => void grade(value)} variant={variant}>
                    <span>{label}</span>
                    <span className="text-[0.625rem] font-normal opacity-70">{hint}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-56 place-items-center bg-background p-8 text-center">
            <div>
              <p className="text-sm font-semibold">You’re caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">The next review will appear when a card is due.</p>
              <Button className="mt-5 bg-background" onClick={() => onOpenChange(false)} variant="outline">Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
