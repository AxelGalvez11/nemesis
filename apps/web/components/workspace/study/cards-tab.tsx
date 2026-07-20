"use client";

import { IconChevronDown, IconChevronRight, IconFolderPlus, IconPlus } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { Input } from "@/components/desktop-ui/input";
import { isCardDue, type StudyCard, type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { cn } from "@/lib/utils";

import { ReviewSession } from "./review-session";
import { StudyBrowser } from "./study-browser";
import { StudyCreateDialog, type StudyCreateKind } from "./study-create-dialog";
import type { StudyReviewSettings } from "./study-chrome";

const DECK_GROUPS_KEY = "nemesis.web.study-deck-groups";

interface CardsTabProps {
  sourcePath?: string | null;
  reviewSettings: StudyReviewSettings;
}

interface DeckTreeNode {
  id: string;
  label: string;
  groupPath: string;
  deck: StudyDeck | null;
  children: DeckTreeNode[];
}

interface DeckCounts {
  newCount: number;
  learnCount: number;
  dueCount: number;
}

type DeckDragItem = { kind: "deck"; id: string } | { kind: "group"; path: string };

function normalizeGroup(value: string): string {
  return value.split("::").map((part) => part.trim()).filter(Boolean).join("::");
}

function buildDeckTree(decks: StudyDeck[], extraGroups: string[]): DeckTreeNode[] {
  const roots: DeckTreeNode[] = [];

  function ensureGroup(path: string): DeckTreeNode | null {
    const parts = normalizeGroup(path).split("::").filter(Boolean);
    if (parts.length === 0) return null;
    let siblings = roots;
    let currentPath = "";
    let current: DeckTreeNode | null = null;
    for (const label of parts) {
      currentPath = currentPath ? `${currentPath}::${label}` : label;
      current = siblings.find((item) => item.id === `group:${currentPath}`) ?? null;
      if (!current) {
        current = { id: `group:${currentPath}`, label, groupPath: currentPath, deck: null, children: [] };
        siblings.push(current);
      }
      siblings = current.children;
    }
    return current;
  }

  extraGroups.forEach(ensureGroup);
  for (const deck of decks) {
    const parts = deck.name.split("::").map((part) => part.trim()).filter(Boolean);
    const label = parts.pop() || deck.name;
    const groupPath = parts.join("::");
    const siblings = ensureGroup(groupPath)?.children ?? roots;
    siblings.push({ id: `deck:${deck.id}`, label, groupPath, deck, children: [] });
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

function loadGroups(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DECK_GROUPS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").map(normalizeGroup).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function CardsTab({ sourcePath, reviewSettings }: CardsTabProps) {
  const { cards, decks, deleteDeck, error, moveDeck, moveDeckGroup, reload, selectDeck, selectedDeckId, status } = useCloudStudy();
  const [createKind, setCreateKind] = useState<StudyCreateKind | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragItem, setDragItem] = useState<DeckDragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const tree = useMemo(() => buildDeckTree(decks, extraGroups), [decks, extraGroups]);

  useEffect(() => setExtraGroups(loadGroups()), []);

  function persistGroups(next: string[]) {
    const unique = Array.from(new Set(next.map(normalizeGroup).filter(Boolean)));
    setExtraGroups(unique);
    try { window.localStorage.setItem(DECK_GROUPS_KEY, JSON.stringify(unique)); } catch { /* best effort */ }
  }

  async function removeDeck(deckId: string) {
    const deck = decks.find((item) => item.id === deckId);
    if (!deck || !window.confirm(`Are you sure you want to delete “${deck.name}” and all of its cards? This can't be undone.`)) return;
    try {
      await deleteDeck(deckId);
      setBrowseOpen(false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete the deck.");
    }
  }

  function openDeck(deckId: string) {
    selectDeck(deckId);
    setReviewOpen(true);
  }

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finishDrop(targetGroup: string) {
    if (!dragItem) return;
    setActionError(null);
    try {
      if (dragItem.kind === "deck") await moveDeck(dragItem.id, targetGroup);
      else {
        const source = dragItem.path;
        await moveDeckGroup(source, targetGroup);
        const leaf = source.split("::").pop() ?? source;
        const destination = targetGroup ? `${targetGroup}::${leaf}` : leaf;
        persistGroups(extraGroups.map((group) => group === source ? destination : group.startsWith(`${source}::`) ? `${destination}${group.slice(source.length)}` : group));
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't move that deck.");
    } finally {
      setDragItem(null);
      setDropTarget(null);
    }
  }

  function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = normalizeGroup(groupName);
    if (!next) return;
    persistGroups([...extraGroups, next]);
    setGroupName("");
    setGroupDialogOpen(false);
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
      <nav className="mx-auto mb-7 flex shrink-0 items-center rounded-b-2xl border border-t-0 border-(--ui-stroke-tertiary) bg-background p-1 shadow-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button className="rounded-xl" size="sm" variant="ghost">Deck</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setCreateKind("deck")}><IconPlus /> New deck</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setGroupDialogOpen(true)}><IconFolderPlus /> New group</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button disabled={decks.length === 0} onClick={() => setCreateKind("card")} size="sm" variant="ghost">Add</Button>
        <Button disabled={decks.length === 0} onClick={() => setBrowseOpen(true)} size="sm" variant="ghost">Browse</Button>
      </nav>

      {decks.length === 0 && extraGroups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState action={<Button onClick={() => setCreateKind("deck")} variant="secondary">Create your first deck</Button>} description={sourcePath ? "Turn this Library note into a linked cloud deck." : "Create a deck to start building a durable review habit."} title="No decks yet" />
        </div>
      ) : (
        <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] items-center border-b border-(--ui-stroke-tertiary) px-5 py-3 text-xs font-semibold">
            <span>Deck</span><span className="text-center">New</span><span className="text-center">Learn</span><span className="text-center">Due</span>
          </div>
          <div className="py-1.5">
            {dragItem && (
              <button
                className={cn("mx-3 mb-1 grid min-h-8 w-[calc(100%-1.5rem)] place-items-center rounded-lg border border-dashed text-[0.6875rem] font-medium", dropTarget === "" ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_9%,transparent)]" : "border-(--ui-stroke-secondary) text-(--ui-text-tertiary)")}
                onDragEnter={(event) => { event.preventDefault(); setDropTarget(""); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                onDrop={(event) => { event.preventDefault(); void finishDrop(""); }}
                type="button"
              >
                Move to deck root
              </button>
            )}
            {tree.map((node) => (
              <DeckRow cards={cards} collapsed={collapsed} depth={0} dragItem={dragItem} dropTarget={dropTarget} key={node.id} node={node} onDragEnd={() => { setDragItem(null); setDropTarget(null); }} onDragStart={setDragItem} onDrop={(group) => void finishDrop(group)} onOpenDeck={openDeck} onTargetChange={setDropTarget} onToggle={toggleGroup} />
            ))}
          </div>
        </section>
      )}

      <StudyCreateDialog deck={selectedDeck} kind={createKind ?? "deck"} onOpenChange={(open) => !open && setCreateKind(null)} open={createKind !== null} sourcePath={sourcePath} />
      <Dialog onOpenChange={setGroupDialogOpen} open={groupDialogOpen}>
        <DialogContent className="max-w-sm">
          <form className="grid gap-4" onSubmit={createGroup}>
            <DialogHeader><DialogTitle>New deck group</DialogTitle><DialogDescription>Groups can contain decks or other groups.</DialogDescription></DialogHeader>
            <Input autoFocus onChange={(event) => setGroupName(event.target.value)} placeholder="Pharmacy School::Exam 7" value={groupName} />
            <DialogFooter><Button onClick={() => setGroupDialogOpen(false)} type="button" variant="ghost">Cancel</Button><Button disabled={!normalizeGroup(groupName)} type="submit" variant="secondary">Create group</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {actionError && <p className="mx-auto mt-3 rounded-lg bg-(--ui-bg-quaternary) px-3 py-2 text-xs text-(--ui-text-secondary)">{actionError}</p>}
      <StudyBrowser cards={cards} decks={decks} initialDeckId={selectedDeckId} onAddCard={(deckId) => { selectDeck(deckId); setBrowseOpen(false); setCreateKind("card"); }} onDeleteDeck={(deckId) => void removeDeck(deckId)} onOpenChange={setBrowseOpen} open={browseOpen} />
      <ReviewSession cards={cards} deck={selectedDeck} onOpenChange={setReviewOpen} open={reviewOpen} settings={reviewSettings} />
    </div>
  );
}

interface DeckRowProps {
  node: DeckTreeNode;
  depth: number;
  cards: StudyCard[];
  collapsed: Set<string>;
  dragItem: DeckDragItem | null;
  dropTarget: string | null;
  onOpenDeck: (id: string) => void;
  onToggle: (id: string) => void;
  onDragStart: (item: DeckDragItem) => void;
  onDragEnd: () => void;
  onTargetChange: (target: string | null) => void;
  onDrop: (target: string) => void;
}

function DeckRow({ node, depth, cards, collapsed, dragItem, dropTarget, onOpenDeck, onToggle, onDragStart, onDragEnd, onTargetChange, onDrop }: DeckRowProps) {
  const counts = countsForNode(node, cards);
  const group = !node.deck;
  const isCollapsed = collapsed.has(node.id);
  const invalidTarget = group && dragItem?.kind === "group" && (dragItem.path === node.groupPath || node.groupPath.startsWith(`${dragItem.path}::`));
  const highlighted = group && !invalidTarget && dropTarget === node.groupPath;
  const item: DeckDragItem = node.deck ? { kind: "deck", id: node.deck.id } : { kind: "group", path: node.groupPath };

  return (
    <>
      <button
        className={cn(
          "grid w-full cursor-grab grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] items-center px-5 py-2 text-left text-xs transition-colors hover:bg-black/[0.04] active:cursor-grabbing dark:hover:bg-white/[0.06]",
          highlighted && "outline outline-2 -outline-offset-2 outline-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)]",
          ((dragItem?.kind === "deck" && node.deck?.id === dragItem.id) || (dragItem?.kind === "group" && node.groupPath === dragItem.path)) && "opacity-50",
        )}
        draggable
        onClick={() => group ? onToggle(node.id) : node.deck && onOpenDeck(node.deck.id)}
        onDragEnd={onDragEnd}
        onDragEnter={(event) => {
          if (!group || invalidTarget) return;
          event.preventDefault();
          event.stopPropagation();
          onTargetChange(node.groupPath);
        }}
        onDragOver={(event) => {
          if (!group || invalidTarget) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-nemesis-study-deck", JSON.stringify(item));
          onDragStart(item);
        }}
        onDrop={(event) => {
          if (!group || invalidTarget) return;
          event.preventDefault();
          event.stopPropagation();
          onDrop(node.groupPath);
        }}
        type="button"
      >
        <span className={cn("flex min-w-0 items-center gap-1.5", group && "font-semibold")} style={{ paddingLeft: `${depth * 1.1}rem` }}>
          {group ? (isCollapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />) : <span className="w-[13px]" />}
          <span className="truncate">{node.label}</span>
        </span>
        <span className="text-center font-medium tabular-nums text-sky-500">{counts.newCount || 0}</span>
        <span className="text-center font-medium tabular-nums text-amber-500">{counts.learnCount || 0}</span>
        <span className="text-center font-medium tabular-nums text-emerald-500">{counts.dueCount || 0}</span>
      </button>
      {!isCollapsed && node.children.map((child) => <DeckRow cards={cards} collapsed={collapsed} depth={depth + 1} dragItem={dragItem} dropTarget={dropTarget} key={child.id} node={child} onDragEnd={onDragEnd} onDragStart={onDragStart} onDrop={onDrop} onOpenDeck={onOpenDeck} onTargetChange={onTargetChange} onToggle={onToggle} />)}
    </>
  );
}
