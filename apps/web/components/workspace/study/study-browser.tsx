"use client";

import { IconCards, IconChevronDown, IconChevronRight, IconDots, IconFlag, IconFolder, IconPlayerPause, IconTags, IconTrash } from "@tabler/icons-react";
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
import { Input } from "@/components/desktop-ui/input";
import { Textarea } from "@/components/desktop-ui/textarea";
import { type StudyCard, type StudyCardType, type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { cn } from "@/lib/utils";

import { OcclusionCardView } from "./occlusion-card";

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

// The rail mirrors the Cards page: decks nested under their :: groups, each
// group collapsible and selectable (a group scope shows every card beneath it).
interface RailEntry {
  kind: "group" | "deck";
  path: string;
  label: string;
  depth: number;
  deck?: StudyDeck;
}

function buildRailEntries(decks: StudyDeck[], collapsed: ReadonlySet<string>): RailEntry[] {
  const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name));
  const seen = new Set<string>();
  const entries: RailEntry[] = [];
  for (const deck of sorted) {
    const parts = deck.name.split("::").map((part) => part.trim()).filter(Boolean);
    const leaf = parts.pop() ?? deck.name;
    let path = "";
    let hidden = false;
    let depth = 0;
    for (const part of parts) {
      path = path ? `${path}::${part}` : part;
      if (!seen.has(path)) {
        seen.add(path);
        if (!hidden) entries.push({ kind: "group", path, label: part, depth });
      }
      if (collapsed.has(path)) hidden = true;
      depth += 1;
    }
    if (!hidden) entries.push({ kind: "deck", path: deck.name, label: leaf, depth, deck });
  }
  return entries;
}

export function StudyBrowser({ open, onOpenChange, decks, cards, initialDeckId, onAddCard, onDeleteDeck }: StudyBrowserProps) {
  const { updateCard, setCardSuspended } = useCloudStudy();
  const [scope, setScope] = useState(`deck:${initialDeckId ?? decks[0]?.id ?? ""}`);
  const [decksOpen, setDecksOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const deckId = scope.startsWith("deck:") ? scope.slice(5) || null : null;

  const cardsForScope = useMemo(() => {
    if (scope === "all") return cards;
    if (scope === "flagged") return cards.filter((card) => card.flagged);
    if (scope === "suspended") return cards.filter((card) => card.suspended);
    if (scope.startsWith("tag:")) {
      const tag = scope.slice(4);
      return cards.filter((card) => card.tags.includes(tag));
    }
    if (scope.startsWith("group:")) {
      const path = scope.slice(6);
      const ids = new Set(decks.filter((deck) => deck.name === path || deck.name.startsWith(`${path}::`)).map((deck) => deck.id));
      return cards.filter((card) => ids.has(card.deckId));
    }
    return cards.filter((card) => card.deckId === deckId);
  }, [cards, deckId, decks, scope]);
  const visibleCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cardsForScope;
    return cardsForScope.filter(
      (card) => card.front.toLowerCase().includes(needle) || card.back.toLowerCase().includes(needle) || card.tags.some((tag) => tag.includes(needle)),
    );
  }, [cardsForScope, query]);

  const allTags = useMemo(() => Array.from(new Set(cards.flatMap((card) => card.tags))).sort((a, b) => a.localeCompare(b)), [cards]);
  const railEntries = useMemo(() => buildRailEntries(decks, collapsedGroups), [collapsedGroups, decks]);
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
    setQuery("");
  }, [cards, decks, initialDeckId, open]);

  useEffect(() => {
    setFront(activeCard?.front ?? "");
    setBack(activeCard?.back ?? "");
    setCardType(activeCard?.cardType ?? "basic");
    setFlagged(activeCard?.flagged ?? false);
    setTags(activeCard?.tags.map((tag) => `#${tag}`).join(" ") ?? "");
    setMessage(null);
  }, [activeCard?.id, activeCard?.front, activeCard?.back, activeCard?.cardType, activeCard?.flagged, activeCard?.tags]);

  const selectScope = (nextScope: string) => {
    setScope(nextScope);
    setCardId(null);
  };

  const toggleGroup = (path: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const groupCardCount = (path: string) => {
    const ids = new Set(decks.filter((deck) => deck.name === path || deck.name.startsWith(`${path}::`)).map((deck) => deck.id));
    return cards.filter((card) => ids.has(card.deckId)).length;
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

  async function toggleSuspended() {
    if (!activeCard) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await setCardSuspended(activeCard.id, !activeCard.suspended);
      setMessage(next.suspended ? "Suspended" : "Back in rotation");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Couldn't update the card.");
    } finally {
      setSaving(false);
    }
  }

  const sectionToggleClass = "flex w-full items-center gap-1.5 rounded-md px-2 pb-2 pt-1 text-left text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary) hover:text-foreground";
  const rowClass = (active: boolean) =>
    cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-black/[0.04] dark:hover:bg-white/[0.06]", active && "bg-background font-medium text-foreground shadow-sm");

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
            <button className={cn(rowClass(scope === "all"), "mb-1 w-full")} onClick={() => selectScope("all")} type="button">
              <IconCards className="shrink-0 text-(--ui-text-tertiary)" size={14} />
              <span className="min-w-0 flex-1 truncate">All cards</span>
              <span className="text-(--ui-text-quaternary)">{cards.length}</span>
            </button>

            <button className={sectionToggleClass} onClick={() => setDecksOpen((value) => !value)} type="button">
              {decksOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />} Decks
            </button>
            {decksOpen && <div className="grid gap-0.5">
              {railEntries.map((entry) =>
                entry.kind === "group" ? (
                  <div
                    className={cn("flex items-center rounded-lg pr-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]", scope === `group:${entry.path}` && "bg-background shadow-sm")}
                    key={`group:${entry.path}`}
                    style={{ paddingLeft: `${entry.depth * 0.65}rem` }}
                  >
                    <button aria-expanded={!collapsedGroups.has(entry.path)} aria-label={collapsedGroups.has(entry.path) ? `Expand ${entry.label}` : `Collapse ${entry.label}`} className="grid size-5 shrink-0 place-items-center rounded text-(--ui-text-tertiary) hover:text-foreground" onClick={() => toggleGroup(entry.path)} type="button">
                      {collapsedGroups.has(entry.path) ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
                    </button>
                    <button className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-xs font-medium" onClick={() => selectScope(`group:${entry.path}`)} type="button">
                      <IconFolder className="shrink-0 text-(--ui-text-tertiary)" size={14} />
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      <span className="font-normal text-(--ui-text-quaternary)">{groupCardCount(entry.path)}</span>
                    </button>
                  </div>
                ) : (
                  <button className={rowClass(scope === `deck:${entry.deck?.id}`)} key={entry.deck?.id} onClick={() => entry.deck && selectScope(`deck:${entry.deck.id}`)} style={{ paddingLeft: `${0.625 + entry.depth * 0.65}rem` }} type="button">
                    <IconCards className="shrink-0 text-(--ui-text-tertiary)" size={14} />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    <span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.deckId === entry.deck?.id).length}</span>
                  </button>
                ),
              )}
              {railEntries.length === 0 && <p className="px-2.5 py-2 text-[0.6875rem] text-(--ui-text-quaternary)">No decks yet</p>}
            </div>}

            <div className="my-2 border-t border-(--ui-stroke-tertiary)" />
            <button className={sectionToggleClass} onClick={() => setFiltersOpen((value) => !value)} type="button">
              {filtersOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />} Filters
            </button>
            {filtersOpen && <div className="grid gap-0.5">
              <button className={rowClass(scope === "flagged")} onClick={() => selectScope("flagged")} type="button">
                <IconFlag className="shrink-0 text-(--ui-text-tertiary)" size={14} /><span className="flex-1">Flagged</span><span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.flagged).length}</span>
              </button>
              <button className={rowClass(scope === "suspended")} onClick={() => selectScope("suspended")} type="button">
                <IconPlayerPause className="shrink-0 text-(--ui-text-tertiary)" size={14} /><span className="flex-1">Suspended</span><span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.suspended).length}</span>
              </button>
            </div>}

            <button className={cn(sectionToggleClass, "pt-3")} onClick={() => setTagsOpen((value) => !value)} type="button">
              {tagsOpen ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />} <IconTags size={13} /> Tags
            </button>
            {tagsOpen && <div className="grid gap-0.5">
              {allTags.map((tag) => (
                <button className={rowClass(scope === `tag:${tag}`)} key={tag} onClick={() => selectScope(`tag:${tag}`)} type="button">
                  <span className="min-w-0 flex-1 truncate">#{tag}</span><span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.tags.includes(tag)).length}</span>
                </button>
              ))}
              {allTags.length === 0 && <p className="px-2.5 py-2 text-[0.6875rem] text-(--ui-text-quaternary)">No tags yet</p>}
            </div>}
          </aside>

          <section className="min-h-0 overflow-y-auto border-r border-(--ui-stroke-tertiary) bg-background">
            <div className="sticky top-0 z-10 border-b border-(--ui-stroke-tertiary) bg-background">
              <div className="p-2">
                <Input className="h-8 rounded-lg text-xs" onChange={(event) => setQuery(event.target.value)} placeholder="Search cards…" type="search" value={query} />
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] px-3 pb-2 text-[0.68rem] font-semibold text-(--ui-text-tertiary)"><span>Card</span><span>Due</span></div>
            </div>
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
                  <div><h2 className="text-sm font-semibold">Edit card</h2><p className="mt-0.5 text-xs text-(--ui-text-tertiary)">{decks.find((deck) => deck.id === activeCard.deckId)?.name ?? activeDeck?.name} · {cardTypeLabel(cardType)}</p></div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button aria-label="Card actions" size="icon-xs" variant="ghost"><IconDots /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <DropdownMenuRadioGroup onValueChange={(value) => setCardType(value as StudyCardType)} value={cardType}>
                        {CARD_TYPES.map((type) => <DropdownMenuRadioItem key={type.id} value={type.id}>{type.label}</DropdownMenuRadioItem>)}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setFlagged((value) => !value)}><IconFlag /> {flagged ? "Remove flag" : "Flag card"}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void toggleSuspended()}><IconPlayerPause /> {activeCard.suspended ? "Unsuspend card" : "Suspend card"}</DropdownMenuItem>
                      {deckId && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onDeleteDeck(deckId)} variant="destructive"><IconTrash /> Delete deck</DropdownMenuItem></>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {activeCard.payload && <OcclusionCardView className="max-h-60" payload={activeCard.payload} revealed />}
                <CardField label={cardType === "cloze" ? "Cloze text" : cardType === "image_occlusion" ? "Label" : "Front"} onChange={setFront} value={front} />
                <CardField label={cardType === "cloze" ? "Extra explanation" : cardType === "image_occlusion" ? "Notes" : "Back"} onChange={setBack} value={back} />
                <label className="grid gap-1.5 text-xs font-semibold">Tags<input className="h-9 rounded-lg border border-(--ui-stroke-secondary) bg-background px-3 font-normal outline-none focus:border-(--ui-text-tertiary)" onChange={(event) => setTags(event.target.value)} placeholder="#concept #exam-1" value={tags} /></label>
                <div className="flex items-center justify-between gap-3">
                  <span aria-live="polite" className="text-[0.6875rem] text-(--ui-text-tertiary)">{message}</span>
                  <Button disabled={saving || !front.trim() || (!back.trim() && cardType !== "cloze" && cardType !== "image_occlusion")} onClick={() => void saveActiveCard()} size="sm" variant="secondary">{saving ? "Saving…" : "Save changes"}</Button>
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
