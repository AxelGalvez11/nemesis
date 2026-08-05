"use client";

import { IconAlertTriangle, IconCards, IconChevronDown, IconChevronRight, IconDots, IconDownload, IconFlag, IconFlagFilled, IconFolder, IconPlayerPause, IconSparkles, IconTags, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { Input } from "@/components/desktop-ui/input";
import { Textarea } from "@/components/desktop-ui/textarea";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { buildAnkiExportFile } from "@/lib/workspace/anki-text";
import { postChatCompletion } from "@/lib/workspace/chat-api";
import { autoTagTargets, buildAutoTagMessages, isLeechCard, parseAutoTags, previewAutoTags } from "@/lib/workspace/study-ai-extras";
import { cardListPreview } from "@/lib/workspace/study-card-preview";
import { type StudyCard, type StudyCardType, type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { STUDY_FLAG_COLORS, studyFlagColor } from "@/lib/workspace/study-flags";
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
  /** Throw away the card being edited. The menu could only delete the whole
   *  DECK before, which is not a substitute for getting rid of one bad card. */
  onDeleteCard: (cardId: string) => void;
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

export function StudyBrowser({ open, onOpenChange, decks, cards, initialDeckId, onAddCard, onDeleteCard, onDeleteDeck }: StudyBrowserProps) {
  const { updateCard, setCardSuspended, userId } = useCloudStudy();
  const previewMode = useWorkspacePreview();
  const [scope, setScope] = useState(`deck:${initialDeckId ?? decks[0]?.id ?? ""}`);
  const [decksOpen, setDecksOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const deckId = scope.startsWith("deck:") ? scope.slice(5) || null : null;

  // 🔴 initialDeckId IS A useState SEED, WHICH ONLY RUNS ONCE. The dialog stays
  // mounted between openings, so without this the second open still shows the
  // deck chosen on the first — right-clicking a deck and picking "Browse cards"
  // would open the browser on someone else's deck and look like the menu had
  // acted on the wrong row. Re-scoping on the opening edge (never while it is
  // already open) keeps the student's own in-dialog scope changes intact.
  useEffect(() => {
    if (open) setScope(`deck:${initialDeckId ?? decks[0]?.id ?? ""}`);
    // decks is deliberately not a dependency: a deck list that changes under an
    // open dialog must not yank the student's chosen scope back to the default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDeckId]);

  const cardsForScope = useMemo(() => {
    if (scope === "all") return cards;
    if (scope === "flagged") return cards.filter((card) => card.flag > 0);
    if (scope.startsWith("flag:")) {
      const value = Number(scope.slice(5));
      return cards.filter((card) => card.flag === value);
    }
    if (scope === "suspended") return cards.filter((card) => card.suspended);
    if (scope === "leeches") return cards.filter(isLeechCard);
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
  const [flag, setFlag] = useState(0);
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [autoTagOpen, setAutoTagOpen] = useState(false);
  const [autoTagBusy, setAutoTagBusy] = useState(false);
  const [autoTagResult, setAutoTagResult] = useState<string | null>(null);

  // Reset the view only when the dialog OPENS — not on every card change,
  // or saving/tagging a card would snap the sidebar back to the initial deck.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    const nextDeck = initialDeckId ?? decks[0]?.id ?? null;
    setScope(`deck:${nextDeck ?? ""}`);
    setCardId(cards.find((card) => card.deckId === nextDeck)?.id ?? null);
    setQuery("");
  }, [cards, decks, initialDeckId, open]);

  useEffect(() => {
    setFront(activeCard?.front ?? "");
    setBack(activeCard?.back ?? "");
    setCardType(activeCard?.cardType ?? "basic");
    setFlag(activeCard?.flag ?? 0);
    setTags(activeCard?.tags.map((tag) => `#${tag}`).join(" ") ?? "");
    setMessage(null);
  }, [activeCard?.id, activeCard?.front, activeCard?.back, activeCard?.cardType, activeCard?.flag, activeCard?.tags]);

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
      await updateCard({ id: activeCard.id, front, back, cardType, flag, tags: tags.split(/[\s,]+/) });
      setMessage("Saved");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Couldn't update the card.");
    } finally {
      setSaving(false);
    }
  }

  // Download the active deck as an Anki-importable text file. Cloze and
  // reversed cards keep their note types via the #notetype column header.
  function exportDeck() {
    if (!activeDeck) return;
    const { exported, skipped, text } = buildAnkiExportFile(cards.filter((card) => card.deckId === activeDeck.id));
    if (exported === 0) {
      setMessage("This deck only has image cards — there's nothing to export as text.");
      return;
    }
    const leaf = activeDeck.name.split("::").pop()?.trim() || "deck";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${leaf}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    const exportedLabel = `${exported} card${exported === 1 ? "" : "s"}`;
    setMessage(skipped > 0 ? `Exported ${exportedLabel} (${skipped} image card${skipped === 1 ? "" : "s"} stay behind).` : `Exported ${exportedLabel}.`);
  }

  const untaggedInDeck = activeDeck ? autoTagTargets(cards.filter((card) => card.deckId === activeDeck.id)).length : 0;

  // One metered engine call tags every untagged card in the deck; existing
  // tags are never touched. Preview mode uses the deterministic local tagger.
  async function runAutoTag() {
    if (!activeDeck || autoTagBusy) return;
    const targets = autoTagTargets(cards.filter((card) => card.deckId === activeDeck.id));
    if (targets.length === 0) {
      setAutoTagResult("Every card in this deck already has tags.");
      return;
    }
    setAutoTagBusy(true);
    setAutoTagResult(null);
    try {
      let assigned: Map<string, string[]>;
      if (previewMode) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        assigned = previewAutoTags(targets);
      } else {
        if (!userId) throw new Error("Sign in to use AI tagging.");
        const reply = await postChatCompletion(userId, buildAutoTagMessages(targets), {
          decision: { model: "deepseek-chat", route: "conversation", searchWeb: false },
        });
        if (!reply.text) throw new Error(reply.errorText ?? "The engine couldn't tag these cards. Try again.");
        assigned = parseAutoTags(reply.text, targets.map((card) => card.id));
        if (assigned.size === 0) throw new Error("The engine's reply wasn't usable. Try again.");
      }
      let tagged = 0;
      for (const card of targets) {
        const tags = assigned.get(card.id);
        if (!tags) continue;
        await updateCard({ id: card.id, front: card.front, back: card.back, cardType: card.cardType, flag: card.flag, tags });
        tagged += 1;
      }
      setAutoTagResult(`Tagged ${tagged} card${tagged === 1 ? "" : "s"}.`);
    } catch (cause) {
      setAutoTagResult(cause instanceof Error ? cause.message : "Couldn't tag the cards.");
    } finally {
      setAutoTagBusy(false);
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
                <IconFlag className="shrink-0 text-(--ui-text-tertiary)" size={14} /><span className="flex-1">Flagged</span><span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.flag > 0).length}</span>
              </button>
              {STUDY_FLAG_COLORS.filter((color) => cards.some((card) => card.flag === color.value)).map((color) => (
                <button className={cn(rowClass(scope === `flag:${color.value}`), "pl-6")} key={color.value} onClick={() => selectScope(`flag:${color.value}`)} type="button">
                  <IconFlagFilled className={cn("shrink-0", color.className)} size={14} /><span className="flex-1">{color.name}</span><span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.flag === color.value).length}</span>
                </button>
              ))}
              <button className={rowClass(scope === "suspended")} onClick={() => selectScope("suspended")} type="button">
                <IconPlayerPause className="shrink-0 text-(--ui-text-tertiary)" size={14} /><span className="flex-1">Suspended</span><span className="text-(--ui-text-quaternary)">{cards.filter((card) => card.suspended).length}</span>
              </button>
              <button className={rowClass(scope === "leeches")} data-testid="filter-leeches" onClick={() => selectScope("leeches")} title="Cards you've failed 8+ times — rewrite, split, or suspend them" type="button">
                <IconAlertTriangle className="shrink-0 text-(--ui-text-tertiary)" size={14} /><span className="flex-1">Leeches</span><span className="text-(--ui-text-quaternary)">{cards.filter(isLeechCard).length}</span>
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
                <span className="flex min-w-0 items-center gap-1.5 pr-3">
                  {card.flag > 0 && <IconFlagFilled className={cn("shrink-0", studyFlagColor(card.flag)?.className)} size={12} />}
                  <span className="min-w-0 truncate">{cardListPreview(card.front)}</span>
                </span><span className="truncate text-[0.68rem] text-(--ui-text-tertiary)">{new Date(card.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
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
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          {flag > 0 ? <IconFlagFilled className={studyFlagColor(flag)?.className} /> : <IconFlag />} Flag
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="min-w-36">
                          {STUDY_FLAG_COLORS.map((color) => (
                            <DropdownMenuItem
                              className={cn(flag === color.value && "bg-black/[0.055] dark:bg-white/[0.08]")}
                              key={color.value}
                              onSelect={() => setFlag((value) => (value === color.value ? 0 : color.value))}
                            >
                              <IconFlagFilled className={color.className} /> {color.name}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled={flag === 0} onSelect={() => setFlag(0)}><IconFlag /> Remove flag</DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuItem onSelect={() => void toggleSuspended()}><IconPlayerPause /> {activeCard.suspended ? "Unsuspend card" : "Suspend card"}</DropdownMenuItem>
                      {/* Sits directly under Suspend, because they are the two
                          ways to stop seeing a card and a student choosing
                          between them should see both at once. */}
                      <DropdownMenuItem onSelect={() => onDeleteCard(activeCard.id)} variant="destructive"><IconTrash /> Delete card</DropdownMenuItem>
                      {deckId && <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem data-testid="auto-tag-open" onSelect={() => { setAutoTagResult(null); setAutoTagOpen(true); }}><IconSparkles /> Auto-tag deck</DropdownMenuItem>
                        <DropdownMenuItem data-testid="export-deck" onSelect={exportDeck}><IconDownload /> Export deck (Anki)</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onDeleteDeck(deckId)} variant="destructive"><IconTrash /> Delete deck</DropdownMenuItem>
                      </>}
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
                  <Stat label="Interval" value={`${activeCard.intervalDays} days`} /><Stat label="Repetitions" value={String(activeCard.repetitions)} /><Stat label="Lapses" value={String(activeCard.lapses)} /><Stat label="Status" value={activeCard.suspended ? "Suspended" : isLeechCard(activeCard) ? "Leech" : "Active"} />
                </dl>
                {activeCard.sourcePath && <p className="rounded-lg bg-[rgb(247_247_248)] px-3 py-2 text-xs text-(--ui-text-tertiary) dark:bg-[rgb(29_29_31)]">Source: {activeCard.sourcePath}</p>}
              </div>
            ) : <div className="grid h-full place-items-center text-xs text-(--ui-text-tertiary)">Select a card to inspect it.</div>}
          </section>
        </div>

        <Dialog onOpenChange={(next) => { if (!autoTagBusy) { setAutoTagOpen(next); if (!next) setAutoTagResult(null); } }} open={autoTagOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Auto-tag this deck</DialogTitle>
              <DialogDescription>
                Nemesis reads the untagged cards in “{activeDeck?.name.split("::").pop() ?? "this deck"}” and adds short topic tags. Cards that already have tags are never touched.
              </DialogDescription>
            </DialogHeader>
            <p className="text-xs text-(--ui-text-secondary)">
              {untaggedInDeck === 0 ? "Every card in this deck already has tags." : `${untaggedInDeck} untagged card${untaggedInDeck === 1 ? "" : "s"} will get tags.`}
            </p>
            {autoTagResult && <p className="rounded-lg bg-(--ui-bg-quaternary) px-3 py-2 text-xs text-(--ui-text-secondary)" data-testid="auto-tag-result" role="status">{autoTagResult}</p>}
            <DialogFooter>
              <Button disabled={autoTagBusy} onClick={() => { setAutoTagOpen(false); setAutoTagResult(null); }} type="button" variant="ghost">Close</Button>
              <Button data-testid="auto-tag-run" disabled={autoTagBusy || untaggedInDeck === 0} onClick={() => void runAutoTag()} type="button" variant="secondary">
                {autoTagBusy ? "Tagging…" : "Add tags"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
