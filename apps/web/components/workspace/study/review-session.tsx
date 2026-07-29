"use client";

import { IconChevronRight, IconDots, IconFlag, IconFlagFilled, IconPencil, IconPlayerPause, IconSparkles } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/desktop-ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import { Input } from "@/components/desktop-ui/input";
import { Textarea } from "@/components/desktop-ui/textarea";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import { buildExplainMessages, stripClozeMarkers } from "@/lib/workspace/study-ai-extras";
import { activeClozeNumber, hasCloze, renderCloze } from "@/lib/workspace/study-cloze";
import { type StudyCard, type StudyDeck, type StudyScheduleSnapshot, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { STUDY_FLAG_COLORS, studyFlagColor } from "@/lib/workspace/study-flags";
import { buildReviewQueue } from "@/lib/workspace/study-review-queue";
import type { StudyGrade } from "@/lib/workspace/study-scheduler";
import { decideSessionGrade } from "@/lib/workspace/study-session-steps";
import { cn } from "@/lib/utils";

import { OcclusionCardView } from "./occlusion-card";
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
  const { gradeCard, undoGrade, updateCard, setCardSuspended, setCardFlag, logStudyPress, userId } = useCloudStudy();
  const previewMode = useWorkspacePreview();
  const [passedIds, setPassedIds] = useState<string[]>([]);
  const [retryIds, setRetryIds] = useState<string[]>([]);
  // Successful learning passes per card this sitting (study-session-steps):
  // new cards graduate after two, so they never vanish after one look.
  const [progressById, setProgressById] = useState<Record<string, number>>({});
  const [priorityId, setPriorityId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGrade, setLastGrade] = useState<{ cardId: string; snapshot: StudyScheduleSnapshot | null; progress: number; wasRetry: boolean } | null>(null);
  // Editing swaps the card area for an inline form — no nested dialog, which
  // Radix would dismiss during the dropdown-menu close sequence.
  const [editOpen, setEditOpen] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editTags, setEditTags] = useState("");
  // Explain-this-card: one metered call per card, cached for the session so
  // re-opening the panel (or retrying the card) never bills twice.
  const explainCacheRef = useRef(new Map<string, string>());
  const [explainFor, setExplainFor] = useState<string | null>(null);
  const [explainText, setExplainText] = useState("");
  const [explainBusy, setExplainBusy] = useState(false);
  // Open on request — asking for an explanation is asking to read it. The
  // header can fold it away again without discarding it.
  const [explainOpen, setExplainOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPassedIds([]);
    setRetryIds([]);
    setProgressById({});
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
  const currentId = current?.id ?? null;

  // Anki-style remaining counts for the footer: cards failed this sitting
  // count as learning, untouched cards as new, the rest as due reviews.
  const remaining = useMemo(() => {
    let newCount = 0;
    let learnCount = 0;
    let dueCount = 0;
    for (const card of queue) {
      if (retryIds.includes(card.id) || (progressById[card.id] ?? 0) > 0) learnCount += 1;
      else if (card.repetitions === 0) newCount += 1;
      else dueCount += 1;
    }
    return { dueCount, learnCount, newCount };
  }, [progressById, queue, retryIds]);
  const currentBucket = current
    ? retryIds.includes(current.id) || (progressById[current.id] ?? 0) > 0 ? "learn" : current.repetitions === 0 ? "new" : "due"
    : null;

  // A new card on deck closes the previous card's explanation.
  useEffect(() => {
    setExplainFor(null);
  }, [currentId]);

  // Occlusion cards render their image with masks; the payload is only ever
  // non-null when it validated, so anything malformed falls back to text.
  const occlusionPayload = current?.cardType === "image_occlusion" ? current.payload : null;
  // Cloze cards transform in place: the active blank is masked until revealed.
  // Auto-detect covers cards typed as basic that still contain {{cN::…}}.
  const clozeCard = current ? current.cardType === "cloze" || hasCloze(current.front) : false;
  const frontText = current && clozeCard
    ? renderCloze(current.front, activeClozeNumber(current.front, current.repetitions), revealed)
    : current?.front ?? "";
  const showBack = Boolean(current) && revealed && ((!clozeCard && !occlusionPayload) || Boolean(current?.back.trim()));

  async function grade(value: StudyGrade) {
    if (!current || saving) return;
    const graded = current;
    setSaving(true);
    setError(null);
    try {
      const progress = progressById[graded.id] ?? 0;
      const wasRetry = retryIds.includes(graded.id);
      const decision = decideSessionGrade({ inRetry: wasRetry, progress, repetitions: graded.repetitions }, value);
      let snapshot: StudyScheduleSnapshot | null = null;
      if (decision.write) {
        snapshot = { dueAt: graded.dueAt, intervalDays: graded.intervalDays, repetitions: graded.repetitions, lapses: graded.lapses };
        await gradeCard(graded.id, value);
      } else {
        // Session-only learning step: nothing schedules, but the press still
        // counts in stats — Anki logs every answer.
        logStudyPress(graded.id, value);
      }
      setLastGrade({ cardId: graded.id, snapshot, progress, wasRetry });
      setPriorityId((id) => (id === graded.id ? null : id));
      setProgressById((map) => ((map[graded.id] ?? 0) === decision.progress ? map : { ...map, [graded.id]: decision.progress }));
      if (decision.requeue) {
        // The card hasn't finished this sitting — it re-enters at the back.
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
    const { cardId, snapshot, progress, wasRetry } = lastGrade;
    setSaving(true);
    setError(null);
    try {
      // Session-only presses (null snapshot) never wrote — only unwind state.
      if (snapshot) await undoGrade(cardId, snapshot);
      setPassedIds((ids) => ids.filter((id) => id !== cardId));
      setRetryIds((ids) => (wasRetry ? (ids.includes(cardId) ? ids : [...ids, cardId]) : ids.filter((id) => id !== cardId)));
      setProgressById((map) => ({ ...map, [cardId]: progress }));
      setPriorityId(cardId);
      setLastGrade(null);
      setRevealed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't undo the review.");
    } finally {
      setSaving(false);
    }
  }

  async function setFlag(value: number) {
    if (!current || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setCardFlag(current.id, value);
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

  async function explainCurrent() {
    if (!current || explainBusy) return;
    if (explainFor === current.id) {
      setExplainFor(null);
      return;
    }
    // Every fresh request opens the window: a student who folded it away on the
    // last card is asking to READ this one, not to be handed a closed box.
    setExplainOpen(true);
    const cached = explainCacheRef.current.get(current.id);
    if (cached) {
      setExplainText(cached);
      setExplainFor(current.id);
      return;
    }
    setExplainFor(current.id);
    setExplainText("");
    setExplainBusy(true);
    setError(null);
    try {
      let text: string;
      if (previewMode) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const front = stripClozeMarkers(current.front);
        text = `**The idea:** ${front}\n\n**Why it works:** ${stripClozeMarkers(current.back) || "The answer sits inside the highlighted part of the card."}\n\n**Hook:** tie it to a patient story you remember.`;
      } else {
        if (!userId) throw new Error("Sign in to use AI explanations.");
        const reply = await postChatCompletion(userId, buildExplainMessages(current), {
          decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
        });
        if (!reply.text) throw new Error(reply.errorText ?? "The engine couldn't explain this card. Try again.");
        text = reply.text;
      }
      explainCacheRef.current.set(current.id, text);
      setExplainText(text);
    } catch (cause) {
      setExplainFor(null);
      setError(cause instanceof Error ? cause.message : "Couldn't explain this card.");
    } finally {
      setExplainBusy(false);
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
      await updateCard({ id: current.id, front: editFront, back: editBack, cardType: current.cardType, flag: current.flag, tags: editTags.split(/[\s,]+/) });
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
        void setFlag(current.flag > 0 ? 0 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="review-stage left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-none border-0 px-7 py-6" showCloseButton>
        <DialogTitle className="sr-only">{deck?.name ?? "Flashcard review"}</DialogTitle>
        <DialogDescription className="sr-only">Review the front of the card, reveal its answer, then grade your recall.</DialogDescription>
        {current && editOpen ? (
          <div className="mx-auto grid min-h-0 w-full max-w-xl content-start gap-4 overflow-y-auto pt-6">
            <div>
              <h2 className="text-sm font-semibold">Edit card</h2>
              <p className="mt-0.5 text-xs text-(--ui-text-tertiary)">Changes save to the card and show immediately in this review.</p>
            </div>
            <form className="grid gap-4" onSubmit={saveEdit}>
              <label className="grid gap-1.5 text-xs font-medium">
                {current.cardType === "image_occlusion" ? "Label" : "Front"}
                <Textarea autoFocus className="min-h-24 text-sm font-normal leading-relaxed" onChange={(event) => setEditFront(event.target.value)} value={editFront} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                {current.cardType === "image_occlusion" ? "Notes" : "Back"}
                <Textarea className="min-h-20 text-sm font-normal leading-relaxed" onChange={(event) => setEditBack(event.target.value)} value={editBack} />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Tags
                <Input onChange={(event) => setEditTags(event.target.value)} placeholder="#concept #exam-1" value={editTags} />
              </label>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setEditOpen(false)} type="button" variant="ghost">Cancel</Button>
                <Button
                  disabled={saving || !editFront.trim() || (!editBack.trim() && current.cardType !== "cloze" && current.cardType !== "image_occlusion" && !hasCloze(editFront))}
                  type="submit"
                  variant="secondary"
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>
        ) : current ? (
          <div className="mx-auto grid min-h-0 w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] gap-4 pt-1">
            <div className="flex items-center justify-between pr-10">
              <span className="min-w-0 truncate text-xs text-(--ui-text-tertiary)">{deck ? deck.name.split("::").at(-1) : "All decks"}</span>
              <div className="flex items-center gap-1">
                {lastGrade && (
                  <Button className="text-xs" disabled={saving} onClick={() => void undo()} size="sm" title="Undo last grade (Z)" variant="ghost">
                    Undo
                  </Button>
                )}
                <Button
                  aria-pressed={explainFor === current.id}
                  className="text-xs"
                  data-testid="explain-card"
                  disabled={explainBusy}
                  onClick={() => void explainCurrent()}
                  size="sm"
                  title="Have Nemesis explain this card"
                  variant="ghost"
                >
                  <IconSparkles size={13} /> Explain
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={current.flag > 0 ? `Flagged ${studyFlagColor(current.flag)?.name ?? ""}` : "Flag card"}
                      aria-pressed={current.flag > 0}
                      disabled={saving}
                      size="icon-xs"
                      title={current.flag > 0 ? `Flagged ${studyFlagColor(current.flag)?.name ?? ""} (F clears)` : "Flag card (F)"}
                      variant="ghost"
                    >
                      {current.flag > 0 ? <IconFlagFilled className={studyFlagColor(current.flag)?.className} /> : <IconFlag />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    {STUDY_FLAG_COLORS.map((color) => (
                      <DropdownMenuItem
                        className={cn(current.flag === color.value && "bg-black/[0.055] dark:bg-white/[0.08]")}
                        key={color.value}
                        onSelect={() => void setFlag(current.flag === color.value ? 0 : color.value)}
                      >
                        <IconFlagFilled className={color.className} /> {color.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={current.flag === 0} onSelect={() => void setFlag(0)}>
                      <IconFlag /> Remove flag
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                {occlusionPayload ? (
                  <OcclusionCardView payload={occlusionPayload} revealed={revealed} />
                ) : (
                  <AssistantMarkdown className="text-lg font-medium leading-8" htmlSubSup obsidianUnderline text={frontText} />
                )}
                {showBack && (
                  <div className={cn("mt-8 border-t border-(--ui-stroke-secondary) pt-8", settings.flipAnimation && "animate-in fade-in-0 slide-in-from-bottom-1 duration-300")}>
                    <AssistantMarkdown className="text-lg leading-8 text-foreground" htmlSubSup obsidianUnderline text={current.back} />
                  </div>
                )}
                {/* A small collapsible window rather than a block that shoves the
                    card up the page (owner 2026-07-28). It opens on request —
                    the student just asked for it — and the header collapses it
                    back to one line so the card is readable again without
                    throwing the explanation away. */}
                {explainFor === current.id && (
                  <div className="mx-auto mt-6 max-w-xl overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-[rgb(247_247_248)] text-left dark:bg-[rgb(29_29_31)]" data-testid="explain-panel">
                    <button
                      aria-expanded={explainOpen}
                      className="flex w-full items-center gap-1.5 px-3.5 py-2 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      onClick={() => setExplainOpen((open) => !open)}
                      // The window keydown handler below binds Space to "Show
                      // answer" and 1-4 to grading, and it only ignores inputs
                      // and textareas — not buttons. Once this header has focus,
                      // Space would toggle the panel AND reveal the card in the
                      // same press. Stopping the native event here keeps the
                      // button's own activation and hides it from that listener.
                      onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") event.stopPropagation(); }}
                      type="button"
                    >
                      <IconChevronRight
                        className={cn("shrink-0 text-(--ui-text-quaternary) transition-transform", explainOpen && "rotate-90")}
                        size={13}
                      />
                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">Nemesis explains</span>
                      {explainBusy && <span className="ml-auto text-[0.65rem] text-(--ui-text-quaternary)">thinking…</span>}
                    </button>
                    {explainOpen && (
                      <div className="max-h-64 overflow-y-auto px-3.5 pb-3">
                        {explainBusy
                          ? <p className="text-xs text-(--ui-text-tertiary)">Thinking through this card…</p>
                          : <AssistantMarkdown className="text-[0.8125rem] leading-relaxed" htmlSubSup obsidianUnderline text={explainText} />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
            <div className="grid justify-items-center gap-3">
              <div className="flex items-center justify-center gap-4 text-xs font-medium tabular-nums" data-testid="review-counts" title="New · Learning · Due left in this session">
                <span className={cn("text-sky-500", currentBucket === "new" && "underline underline-offset-4")}>{remaining.newCount}</span>
                <span className={cn("text-amber-500", currentBucket === "learn" && "underline underline-offset-4")}>{remaining.learnCount}</span>
                <span className={cn("text-emerald-500", currentBucket === "due" && "underline underline-offset-4")}>{remaining.dueCount}</span>
              </div>
              {!revealed ? (
                <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={() => setRevealed(true)} size="lg" title="Show answer (Space)" variant="ghost">Show answer</Button>
              ) : (
                <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRADES.map(({ grade: value, hint, label, variant }) => (
                    <Button className="h-auto flex-col gap-0.5 bg-background py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]" disabled={saving} key={value} onClick={() => void grade(value)} variant={variant}>
                      <span>{label}</span>
                      <span className="text-[0.625rem] font-normal opacity-70">{hint}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
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
