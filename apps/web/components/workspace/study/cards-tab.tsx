"use client";

import { IconCards, IconChevronDown, IconChevronRight, IconDots, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { Plus } from "@/lib/workspace/icons";
import { isCardDue, type StudyCard, type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { cn } from "@/lib/utils";

import { StudyCreateDialog, type StudyCreateKind } from "./study-create-dialog";

interface CardsTabProps {
  sourcePath?: string | null;
}

interface DeckTreeNode {
  id: string;
  label: string;
  deck: StudyDeck | null;
  children: DeckTreeNode[];
}

interface DeckCounts {
  newCount: number;
  learnCount: number;
  dueCount: number;
}

function buildDeckTree(decks: StudyDeck[]): DeckTreeNode[] {
  const roots: DeckTreeNode[] = [];
  for (const deck of decks) {
    const parts = deck.name.split("::").map((part) => part.trim()).filter(Boolean);
    const labels = parts.length > 0 ? parts : [deck.name];
    let siblings = roots;
    let path = "";
    labels.forEach((label, index) => {
      path = path ? `${path}::${label}` : label;
      const last = index === labels.length - 1;
      let node = siblings.find((item) => item.id === (last ? `deck:${deck.id}` : `group:${path}`));
      if (!node) {
        node = { id: last ? `deck:${deck.id}` : `group:${path}`, label, deck: last ? deck : null, children: [] };
        siblings.push(node);
      }
      siblings = node.children;
    });
  }
  const sort = (nodes: DeckTreeNode[]) => {
    nodes.sort((a, b) => Number(Boolean(a.deck)) - Number(Boolean(b.deck)) || a.label.localeCompare(b.label));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

function countsForCards(cards: StudyCard[]): DeckCounts {
  return {
    newCount: cards.filter((card) => card.repetitions === 0).length,
    learnCount: cards.filter((card) => card.repetitions > 0 && card.intervalDays < 21 && !isCardDue(card)).length,
    dueCount: cards.filter((card) => card.repetitions > 0 && isCardDue(card)).length,
  };
}

function addCounts(a: DeckCounts, b: DeckCounts): DeckCounts {
  return { newCount: a.newCount + b.newCount, learnCount: a.learnCount + b.learnCount, dueCount: a.dueCount + b.dueCount };
}

function countsForNode(node: DeckTreeNode, cards: StudyCard[]): DeckCounts {
  const own = node.deck ? countsForCards(cards.filter((card) => card.deckId === node.deck?.id)) : { newCount: 0, learnCount: 0, dueCount: 0 };
  return node.children.reduce((total, child) => addCounts(total, countsForNode(child, cards)), own);
}

export function CardsTab({ sourcePath }: CardsTabProps) {
  const { cards, decks, deleteDeck, error, reload, selectDeck, selectedDeckId, status } = useCloudStudy();
  const [createKind, setCreateKind] = useState<StudyCreateKind | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const selectedCards = useMemo(() => cards.filter((card) => card.deckId === selectedDeckId), [cards, selectedDeckId]);
  const tree = useMemo(() => buildDeckTree(decks), [decks]);

  async function removeSelectedDeck() {
    if (!selectedDeck || !window.confirm(`Delete “${selectedDeck.name}” and all of its cards?`)) return;
    setActionError(null);
    try {
      await deleteDeck(selectedDeck.id);
      setBrowseOpen(false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete the deck.");
    }
  }

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (status === "loading" || status === "idle") return <div className="grid flex-1 place-items-center text-xs text-muted-foreground">Loading study decks…</div>;
  if (status === "error") {
    return (
      <div className="grid flex-1 place-items-center px-6">
        <div className="max-w-sm rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center">
          <p className="text-sm font-semibold">Study couldn’t load</p><p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={reload} variant="secondary">Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
      <nav className="mx-auto mb-7 flex shrink-0 items-center rounded-b-2xl border border-t-0 border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-1 shadow-sm">
        <Button className="rounded-xl" size="sm" variant="secondary"><IconCards size={14} /> Decks</Button>
        <Button disabled={decks.length === 0} onClick={() => setCreateKind("card")} size="sm" variant="ghost">Add card</Button>
        <Button disabled={!selectedDeck} onClick={() => setBrowseOpen(true)} size="sm" variant="ghost">Browse</Button>
      </nav>

      {decks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState action={<Button onClick={() => setCreateKind("deck")}>Create your first deck</Button>} description={sourcePath ? "Turn this Library note into a linked cloud deck." : "Create a deck to start building a durable review habit."} title="No decks yet" />
        </div>
      ) : (
        <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)/60 shadow-[0_14px_34px_rgba(0,0,0,0.06)]">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] items-center border-b border-(--ui-stroke-tertiary) px-5 py-3 text-xs font-semibold">
            <span>Deck</span><span className="text-center">New</span><span className="text-center">Learn</span><span className="text-center">Due</span>
          </div>
          <div className="py-1.5">
            {tree.map((node) => (
              <DeckRow cards={cards} collapsed={collapsed} depth={0} key={node.id} node={node} onSelect={selectDeck} onToggle={toggleGroup} selectedDeckId={selectedDeckId} />
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-(--ui-stroke-tertiary) px-4 py-3">
            <Button onClick={() => setCreateKind("deck")} size="sm" variant="secondary"><Plus size={13} /> Create deck</Button>
          </div>
        </section>
      )}

      <StudyCreateDialog deck={selectedDeck} kind={createKind ?? "deck"} onOpenChange={(open) => !open && setCreateKind(null)} open={createKind !== null} sourcePath={sourcePath} />

      <Dialog onOpenChange={setBrowseOpen} open={browseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-7">
              <div><DialogTitle>Browse {selectedDeck?.name ?? "deck"}</DialogTitle><DialogDescription>{selectedCards.length} card{selectedCards.length === 1 ? "" : "s"} in this deck.</DialogDescription></div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button aria-label="Deck actions" size="icon-xs" variant="ghost"><IconDots /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void removeSelectedDeck()} variant="destructive"><IconTrash /> Delete deck</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogHeader>
          {actionError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{actionError}</p>}
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {selectedCards.length === 0 ? (
              <div className="grid min-h-48 place-items-center text-center"><div><p className="text-xs font-semibold">This deck is empty</p><Button className="mt-4" onClick={() => { setBrowseOpen(false); setCreateKind("card"); }} variant="secondary">Add card</Button></div></div>
            ) : selectedCards.map((card) => (
              <article className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) p-3" key={card.id}>
                <p className="text-xs font-medium leading-5">{card.front}</p><p className="mt-2 text-[0.75rem] leading-5 text-muted-foreground">{card.back}</p>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeckRow({ node, depth, cards, collapsed, selectedDeckId, onSelect, onToggle }: { node: DeckTreeNode; depth: number; cards: StudyCard[]; collapsed: Set<string>; selectedDeckId: string | null; onSelect: (id: string | null) => void; onToggle: (id: string) => void }) {
  const counts = countsForNode(node, cards);
  const group = !node.deck;
  const isCollapsed = collapsed.has(node.id);
  const active = node.deck?.id === selectedDeckId;
  return (
    <>
      <button className={cn("grid w-full grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] items-center px-5 py-2 text-left text-xs transition-colors hover:bg-(--ui-control-hover-background)", active && "bg-(--ui-control-active-background)")} onClick={() => group ? onToggle(node.id) : onSelect(node.deck?.id ?? null)} type="button">
        <span className={cn("flex min-w-0 items-center gap-1.5", group && "font-semibold")} style={{ paddingLeft: `${depth * 1.1}rem` }}>
          {group ? (isCollapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />) : <span className="w-[13px]" />}
          <span className="truncate">{node.label}</span>
        </span>
        <span className="text-center font-medium tabular-nums text-sky-500">{counts.newCount || 0}</span>
        <span className="text-center font-medium tabular-nums text-rose-500">{counts.learnCount || 0}</span>
        <span className="text-center font-medium tabular-nums text-emerald-500">{counts.dueCount || 0}</span>
      </button>
      {!isCollapsed && node.children.map((child) => <DeckRow cards={cards} collapsed={collapsed} depth={depth + 1} key={child.id} node={child} onSelect={onSelect} onToggle={onToggle} selectedDeckId={selectedDeckId} />)}
    </>
  );
}
