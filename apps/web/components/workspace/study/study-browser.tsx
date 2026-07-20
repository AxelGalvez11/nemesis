"use client";

import { IconCards, IconChevronDown, IconChevronRight, IconDots, IconFlag, IconTags, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { Textarea } from "@/components/desktop-ui/textarea";
import { type StudyCard, type StudyCardType, type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { cn } from "@/lib/utils";

interface StudyBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: StudyDeck[];
  cards: StudyCard[];
  initialDeckId: string | null;
  onAddCard: (deckId: string) => void;
  onDeleteDeck: (deckId: string) => void;
}

const CARD_TYPES: { id: StudyCardType; label: string }[] = [
  { id: "basic", label: "Basic (front/back)" },
  { id: "reversed", label: "Basic reversed" },
  { id: "cloze", label: "Cloze" },
  { id: "image_occlusion", label: "Image occlusion" },
];

function cardTypeLabel(type: StudyCardType) {
  return CARD_TYPES.find((item) => item.id === type)?.label ?? "Basic (front/back)";
}

export function StudyBrowser({ open, onOpenChange, decks, cards, initialDeckId, onAddCard, onDeleteDeck }: StudyBrowserProps) {
  const { updateCard } = useCloudStudy();
  const [scope, setScope] = useState(`deck:${initialDeckId ?? decks[0]?.id ?? ""}`);
  const [decksOpen, setDecksOpen] = useState(true);
  const deckId = scope.startsWith("deck:") ? scope.slice(5) || null : null;
  const visibleCards = useMemo(() => {
    if (scope === "flagged") return cards.filter((card) => card.flagged);
    if (scope.startsWith("tag:")) return cards.filter((card) => card.tags.includes(scope.slice(4)));
    return cards.filter((card) => card.deckId === deckId);
  }, [cards, deckId, scope]);
  const allTags = useMemo(() => Array.from(new Set(cards.flatMap((card) => card.tags))).sort((a, b) => a.localeCompare(b)), [cards]);
  const [cardId, setCardId] = useState<string | null>(visibleCards[0]?.id ?? null);
  const activeDeck = decks.find((deck) => deck.id === deckId) ?? null;
  const activeCard = visibleCards.find((card) => card.id === cardId) ?? visibleCards[0] ?? null;
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [cardType, setCardType] = useState<StudyCardType>("basic");
  const [flagged, setFlagged] = useState(false);
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextDeck = initialDeckId ?? decks[0]?.id ?? null;
    setScope(`deck:${nextDeck ?? ""}`);
    setCardId(cards.find((card) => card.deckId === nextDeck)?.id ?? null);
  }, [cards, decks, initialDeckId, open]);

  useEffect(() => {
    setFront(activeCard?.front ?? "");
    setBack(activeCard?.back ?? "");
    setCardType(activeCard?.cardType ?? "basic");
    setFlagged(activeCard?.flagged ?? false);
    setTags(activeCard?.tags.map((tag) => `#${tag}`).join(" ") ?? "");
    setMessage(null);
  }, [activeCard?.id, activeCard?.front, activeCard?.back, activeCard?.cardType, activeCard?.flagged, activeCard?.tags]);

  const selectDeck = (id: string) => {
    setScope(`deck:${id}`);
    setCardId(cards.find((card) => card.deckId === id)?.id ?? null);
  };

  const selectScope = (nextScope: string) => {
    setScope(nextScope);
    const nextCards = nextScope === "flagged"
      ? cards.filter((card) => card.flagged)
      : nextScope.startsWith("tag:")
        ? cards.filter((card) => card.tags.includes(nextScope.slice(4)))
        : cards.filter((card) => card.deckId === nextScope.slice(5));
    setCardId(nextCards[0]?.id ?? null);
  };

  async function saveActiveCard() {
    if (!activeCard) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateCard({ id: activeCard.id, front, back, cardType, flagged, tags: tags.split(/[\s,]+/) });
      setMessage("Saved");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Couldn't update the card.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="grid h-[82vh] max-h-[82vh] w-[92vw] max-w-[92vw] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0" showCloseButton>
        <DialogHeader className="border-b border-(--ui-stroke-tertiary) px-5 py-3">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div><DialogTitle>Browse cards</DialogTitle><DialogDescription className="sr-only">Browse and edit cards in every deck.</DialogDescription></div>
            <Button className="bg-background" disabled={!deckId} onClick={() => deckId && onAddCard(deckId)} size="sm" variant="outline">Add card</Button>
          </div>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-[15rem_minmax(17rem,0.9fr)_minmax(22rem,1.35fr)] overflow-hidden max-lg:grid-cols-[12rem_minmax(15rem,0.8fr)_minmax(20rem,1.2fr)] max-md:grid-cols-[11rem_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-(--ui-stroke-tertiary) bg-[rgb(247_247_248)] p-2 dark:bg-[rgb(29_29_31)]">
            <button className="flex w-full items-center gap-1.5 rounded-md px-2 pb-2 pt-1 text-left text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary) hover:text-foreground" onClick={() => setDecksOpen((value) => !value)} type="button">
              {decksOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />} Decks
            </button>
            {decksOpen && <div className="grid gap-0.5">
              {decks.map((deck) => (
                <button className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.06]", scope === `deck:${deck.id}` && "bg-background font-medium text-foreground shadow-sm")} key={deck.id} onClick={() => selectDeck(deck.id)} type="button">
                  <IconCards className="shrink-0 text-(--ui-text-tertiary)" size={14} />
                  <span className="min-w-0 flex-1 truncate" style={{ paddingLeft: `${Math.max(0, deck.name.split("::").length - 1) * 0.65}rem` }}>{deck.name.split("::").pop()}</span>
                  <span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.deckId === deck.id).length}</span>
                </button>
              ))}
            </div>}
            <div className="my-2 border-t border-(--ui-stroke-tertiary)" />
            <button className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.06]", scope === "flagged" && "bg-background font-medium text-foreground shadow-sm")} onClick={() => selectScope("flagged")} type="button">
              <IconFlag className="text-(--ui-text-tertiary)" size={14} /><span className="flex-1">Flagged</span><span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.flagged).length}</span>
            </button>
            <p className="flex items-center gap-2 px-2.5 pb-1 pt-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)"><IconTags size={13} /> Tags</p>
            <div className="grid gap-0.5">
              {allTags.map((tag) => (
                <button className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.06]", scope === `tag:${tag}` && "bg-background font-medium text-foreground shadow-sm")} key={tag} onClick={() => selectScope(`tag:${tag}`)} type="button">
                  <span className="min-w-0 flex-1 truncate">#{tag}</span><span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.tags.includes(tag)).length}</span>
                </button>
              ))}
              {allTags.length === 0 && <p className="px-2.5 py-2 text-[0.6875rem] text-(--ui-text-quaternary)">No tags yet</p>}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto border-r border-(--ui-stroke-tertiary) bg-background">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_5rem] border-b border-(--ui-stroke-tertiary) bg-background px-3 py-2 text-[0.68rem] font-semibold text-(--ui-text-tertiary)"><span>Card</span><span>Due</span></div>
            {visibleCards.length === 0 ? <p className="p-6 text-center text-xs text-(--ui-text-tertiary)">No cards match this view.</p> : visibleCards.map((card) => (
              <button className={cn("grid w-full grid-cols-[minmax(0,1fr)_5rem] border-b border-(--ui-stroke-tertiary) px-3 py-2.5 text-left text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.06]", activeCard?.id === card.id && "bg-black/[0.055] dark:bg-white/[0.08]")} key={card.id} onClick={() => setCardId(card.id)} type="button">
                <span className="truncate pr-3">{card.front}</span><span className="truncate text-[0.68rem] text-(--ui-text-tertiary)">{new Date(card.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </button>
            ))}
          </section>

          <section className="min-h-0 overflow-y-auto bg-background p-5 max-md:col-span-2 max-md:border-t max-md:border-(--ui-stroke-tertiary)">
            {activeCard ? (
              <div className="grid gap-5">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="text-sm font-semibold">Edit card</h2><p className="mt-0.5 text-xs text-(--ui-text-tertiary)">{activeDeck?.name} · {cardTypeLabel(cardType)}</p></div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button aria-label="Card actions" size="icon-xs" variant="ghost"><IconDots /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <DropdownMenuRadioGroup onValueChange={(value) => setCardType(value as StudyCardType)} value={cardType}>
                        {CARD_TYPES.map((type) => <DropdownMenuRadioItem key={type.id} value={type.id}>{type.label}</DropdownMenuRadioItem>)}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setFlagged((value) => !value)}><IconFlag /> {flagged ? "Remove flag" : "Flag card"}</DropdownMenuItem>
                      {deckId && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onDeleteDeck(deckId)} variant="destructive"><IconTrash /> Delete deck</DropdownMenuItem></>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardField label={cardType === "cloze" ? "Cloze text" : cardType === "image_occlusion" ? "Image or occlusion prompt" : "Front"} onChange={setFront} value={front} />
                <CardField label={cardType === "cloze" ? "Extra explanation" : cardType === "image_occlusion" ? "Occluded answer" : "Back"} onChange={setBack} value={back} />
                <label className="grid gap-1.5 text-xs font-semibold">Tags<input className="h-9 rounded-lg border border-(--ui-stroke-secondary) bg-background px-3 font-normal outline-none focus:border-(--ui-text-tertiary)" onChange={(event) => setTags(event.target.value)} placeholder="#concept #exam-1" value={tags} /></label>
                <div className="flex items-center justify-between gap-3">
                  <span aria-live="polite" className="text-[0.6875rem] text-(--ui-text-tertiary)">{message}</span>
                  <Button disabled={saving || !front.trim() || !back.trim()} onClick={() => void saveActiveCard()} size="sm" variant="secondary">{saving ? "Saving…" : "Save changes"}</Button>
                </div>
                <dl className="grid grid-cols-2 gap-3 rounded-xl border border-(--ui-stroke-tertiary) bg-[rgb(247_247_248)] p-4 text-xs dark:bg-[rgb(29_29_31)]">
                  <Stat label="Interval" value={`${activeCard.intervalDays} days`} /><Stat label="Repetitions" value={String(activeCard.repetitions)} /><Stat label="Lapses" value={String(activeCard.lapses)} /><Stat label="Status" value={activeCard.suspended ? "Suspended" : "Active"} />
                </dl>
                {activeCard.sourcePath && <p className="rounded-lg bg-[rgb(247_247_248)] px-3 py-2 text-xs text-(--ui-text-tertiary) dark:bg-[rgb(29_29_31)]">Source: {activeCard.sourcePath}</p>}
              </div>
            ) : <div className="grid h-full place-items-center text-xs text-(--ui-text-tertiary)">Select a card to inspect it.</div>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CardField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1.5 text-xs font-semibold">{label}<Textarea className="min-h-28 bg-background text-sm font-normal leading-relaxed" onChange={(event) => onChange(event.target.value)} value={value} /></label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[0.68rem] text-(--ui-text-tertiary)">{label}</dt><dd className="mt-0.5 font-medium text-foreground">{value}</dd></div>;
}
