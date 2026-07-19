"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { type StudyCard, type StudyDeck, isCardDue, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import type { StudyGrade } from "@/lib/workspace/study-scheduler";

const GRADES: { grade: StudyGrade; label: string; hint: string; variant: "destructive" | "secondary" | "default" }[] = [
  { grade: "again", label: "Again", hint: "1d", variant: "destructive" },
  { grade: "hard", label: "Hard", hint: "slower", variant: "secondary" },
  { grade: "good", label: "Good", hint: "normal", variant: "default" },
  { grade: "easy", label: "Easy", hint: "longer", variant: "secondary" },
];

interface ReviewSessionProps {
  cards: StudyCard[];
  deck: StudyDeck | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewSession({ cards, deck, open, onOpenChange }: ReviewSessionProps) {
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{deck?.name ?? "Review"}</DialogTitle>
          <DialogDescription>
            {current ? `${completedIds.length} reviewed · ${queue.length} remaining` : `${completedIds.length} cards reviewed`}
          </DialogDescription>
        </DialogHeader>
        {current ? (
          <div className="grid gap-4">
            <section className="grid min-h-56 place-items-center rounded-2xl border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-8 py-10 text-center">
              <div className="max-w-xl">
                <p className="whitespace-pre-wrap text-base font-medium leading-7">{current.front}</p>
                {revealed && (
                  <div className="mt-7 border-t border-(--ui-stroke-tertiary) pt-7">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-(--ui-text-secondary)">{current.back}</p>
                  </div>
                )}
              </div>
            </section>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
            {!revealed ? (
              <Button className="justify-self-center" onClick={() => setRevealed(true)} size="lg">Show answer</Button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADES.map(({ grade: value, hint, label, variant }) => (
                  <Button className="h-auto flex-col gap-0.5 py-2" disabled={saving} key={value} onClick={() => void grade(value)} variant={variant}>
                    <span>{label}</span>
                    <span className="text-[0.625rem] font-normal opacity-70">{hint}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-56 place-items-center rounded-2xl border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-8 text-center">
            <div>
              <p className="text-sm font-semibold">You’re caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">The next review will appear when a card is due.</p>
              <Button className="mt-5" onClick={() => onOpenChange(false)} variant="secondary">Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
