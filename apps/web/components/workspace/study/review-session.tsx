"use client";

import { IconDots, IconFlag, IconFlagFilled, IconPencil, IconPlayerPause } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import { Input } from "@/components/desktop-ui/input";
import { Textarea } from "@/components/desktop-ui/textarea";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { activeClozeNumber, hasCloze, renderCloze } from "@/lib/workspace/study-cloze";
import { type StudyCard, type StudyDeck, type StudyScheduleSnapshot, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { buildReviewQueue } from "@/lib/workspace/study-review-queue";
import type { StudyGrade } from "@/lib/workspace/study-scheduler";
import { cn } from "@/lib/utils";

import type { StudyReviewSettings } from "./study-chrome";

const GRADES: { grade: StudyGrade; label: string; hint: string; variant: "outline" | "secondary" }[] = [
  { grade: "again", label: "Again", hint: "1 · soon", variant: "outline" },
  { grade: "hard", label: "Hard", hint: "2 · slower", variant: "secondary" },
  { grade: "good", label: "Good", hint: "3 · normal", variant: "secondary" },
  { grade: "easy", label: "Easy", hint: "4 · longer", variant: "secondary" },
];

const GRADE_KEYS: Record<string, StudyGrade> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };

interface ReviewSessionProps {
  cards: StudyCard[];
  deck: StudyDeck | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: StudyReviewSettings;
}

export function ReviewSession({ cards, deck, open, onOpenChange, settings }: ReviewSessionProps) {
  const { gradeCard, undoGrade, updateCard, setCardSuspended } = useCloudStudy();
  const [passedIds, setPassedIds] = useState<string[]>([]);
  const [retryIds, setRetryIds] = useState<string[]>([]);
  const [priorityId, setPriorityId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGrade, setLastGrade] = useState<{ cardId: string; snapshot: StudyScheduleSnapshot } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editTags, setEditTags] = useState("");

  useEffect(() => {
    if (!open) return;
    setPassedIds([]);
    setRetryIds([]);
    setPriorityId(null);
    setRevealed(false);
    setError(null);
    setLastGrade(null);
    setEditOpen(false);
  }, [open, deck?.id]);

  const queue = useMemo(
    () => buildReviewQueue({ cards, deckId: deck?.id ?? null, passedIds, retryIds, priorityId }),
    [cards, deck?.id, passedIds, retryIds, priorityId],
  );
  const current = queue[0] ?? null;

  // Cloze cards transform in place: the active blank is masked until revealed.
  // Auto-detect covers cards typed as basic that still contain {{cN::…}}.
  const clozeCard = current ? current.cardType === "cloze" || hasCloze(current.front) : false;
  const frontText = current && clozeCard
    ? renderCloze(current.front, activeClozeNumber(current.front, current.repetitions), revealed)
    : current?.front ?? "";
  const showBack = Boolean(current) && revealed && (!clozeCard || Boolean(current?.back.trim()));

  async function grade(value: StudyGrade) {
    if (!current || saving) return;
    const graded = current;
    setSaving(true);
    setError(null);
    try {
      const snapshot: StudyScheduleSnapshot = { dueAt: graded.dueAt, intervalDays: graded.intervalDays, repetitions: graded.repetitions, lapses: graded.lapses };
      await gradeCard(graded.id, value);
      setLastGrade({ cardId: graded.id, snapshot });
      setPriorityId((id) => (id === graded.id ? null : id));
      if (value === "again") {
        // Failed cards come back later in this same sitting, Anki-style.
        setRetryIds((ids) => [...ids.filter((id) => id !== graded.id), graded.id]);
        setPassedIds((ids) => ids.filter((id) => id !== graded.id));
      } else {
        setRetryIds((ids) => ids.filter((id) => id !== graded.id));
        setPassedIds((ids) => (ids.includes(graded.id) ? ids : [...ids, graded.id]));
      }
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the review.");
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!lastGrade || saving) return;
    const { cardId, snapshot } = lastGrade;
    setSaving(true);
    setError(null);
    try {
      await undoGrade(cardId, snapshot);
      setPassedIds((ids) => ids.filter((id) => id !== cardId));
      setRetryIds((ids) => ids.filter((id) => id !== cardId));
      setPriorityId(cardId);
      setLastGrade(null);
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't undo the review.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFlag() {
    if (!current || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateCard({ id: current.id, front: current.front, back: current.back, cardType: current.cardType, flagged: !current.flagged, tags: current.tags });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't update the card.");
    } finally {
      setSaving(false);
    }
  }

  async function suspendCurrent() {
    if (!current || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setCardSuspended(current.id, true);
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't suspend the card.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit() {
    if (!current) return;
    setEditFront(current.front);
    setEditBack(current.back);
    setEditTags(current.tags.map((tag) => `#${tag}`).join(" "));
    setEditOpen(true);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateCard({ id: current.id, front: editFront, back: editBack, cardType: current.cardType, flagged: current.flagged, tags: editTags.split(/[\s,]+/) });
      setEditOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't update the card.");
    } finally {
      setSaving(false);
    }
  }

  // Keyboard review: Space/Enter reveals then grades Good, 1-4 grade, Z undoes,
  // F flags. Re-subscribed every render so the closures stay fresh.
  useEffect(() => {
    if (!open || editOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!current) return;
      if (event.key === " " || event.key === "Enter" || event.code === "Space") {
        event.preventDefault();
        if (revealed) void grade("good");
        else setRevealed(true);
        return;
      }
      const byDigit = GRADE_KEYS[event.key] ?? (event.code.startsWith("Digit") ? GRADE_KEYS[event.code.slice(5)] : undefined);
      if (byDigit && revealed) {
        event.preventDefault();
        void grade(byDigit);
        return;
      }
      if (event.key === "z" || event.key === "Z" || event.code === "KeyZ") {
        event.preventDefault();
        void undo();
        return;
      }
      if (event.key === "f" || event.key === "F" || event.code === "KeyF") {
        event.preventDefault();
        void toggleFlag();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-none border-0 bg-background px-7 py-6" showCloseButton>
        <DialogTitle className="sr-only">{deck?.name ?? "Flashcard review"}</DialogTitle>
        <DialogDescription className="sr-only">Review the front of the card, reveal its answer, then grade your recall.</DialogDescription>
        {current ? (
          <div className="mx-auto grid min-h-0 w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] gap-4 pt-1">
            <div className="flex items-center justify-between pr-10">
              <span className="text-xs tabular-nums text-(--ui-text-tertiary)">{queue.length} left</span>
              <div className="flex items-center gap-1">
                {lastGrade && (
                  <Button className="text-xs" disabled={saving} onClick={() => void undo()} size="sm" title="Undo last grade (Z)" variant="ghost">
                    Undo
                  </Button>
                )}
                <Button
                  aria-label={current.flagged ? "Remove flag" : "Flag card"}
                  aria-pressed={current.flagged}
                  disabled={saving}
                  onClick={() => void toggleFlag()}
                  size="icon-xs"
                  title={current.flagged ? "Remove flag (F)" : "Flag card (F)"}
                  variant="ghost"
                >
                  {current.flagged ? <IconFlagFilled /> : <IconFlag />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-label="Card actions" size="icon-xs" variant="ghost"><IconDots /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuItem onSelect={openEdit}><IconPencil /> Edit card</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void suspendCurrent()}><IconPlayerPause /> Suspend card</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <section className={cn("grid min-h-0 place-items-start overflow-y-auto bg-background px-4 py-12 text-center", settings.flashcardOutline && "rounded-3xl border border-(--ui-stroke-secondary) shadow-sm")}>
              <div className={cn("mx-auto w-full max-w-5xl", settings.flipAnimation && "animate-in fade-in-0 duration-300")}>
                <AssistantMarkdown className="text-lg font-medium leading-8" text={frontText} />
                {showBack && (
                  <div className={cn("mt-8 border-t border-(--ui-stroke-secondary) pt-8", settings.flipAnimation && "animate-in fade-in-0 slide-in-from-bottom-1 duration-300")}>
                    <AssistantMarkdown className="text-lg leading-8 text-foreground" text={current.back} />
                  </div>
                )}
              </div>
            </section>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
            {!revealed ? (
              <Button className="justify-self-center bg-foreground text-background hover:bg-foreground/90" onClick={() => setRevealed(true)} size="lg" title="Show answer (Space)" variant="ghost">Show answer</Button>
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

    {/* Sibling of the review dialog, not a child: a dialog nested inside the
        review DialogContent gets dismissed by the closing dropdown menu. */}
    <Dialog onOpenChange={setEditOpen} open={editOpen}>
          <DialogContent className="max-w-xl">
            <form className="grid gap-4" onSubmit={saveEdit}>
              <DialogHeader>
                <DialogTitle>Edit card</DialogTitle>
                <DialogDescription>Changes save to the card and show immediately in this review.</DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5 text-xs font-medium">
                Front
                <Textarea autoFocus className="min-h-24 text-sm font-normal leading-relaxed" onChange={(event) => setEditFront(event.target.value)} value={editFront} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Back
                <Textarea className="min-h-20 text-sm font-normal leading-relaxed" onChange={(event) => setEditBack(event.target.value)} value={editBack} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Tags
                <Input onChange={(event) => setEditTags(event.target.value)} placeholder="#concept #exam-1" value={editTags} />
              </label>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
              <DialogFooter>
                <Button onClick={() => setEditOpen(false)} type="button" variant="ghost">Cancel</Button>
                <Button
                  disabled={saving || !editFront.trim() || (!editBack.trim() && current?.cardType !== "cloze" && !hasCloze(editFront))}
                  type="submit"
                  variant="secondary"
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
    </Dialog>
    </>
  );
}
