"use client";

import { IconBooks, IconCards, IconChevronDown, IconChevronRight, IconFileUpload, IconFolderPlus, IconSquarePlus } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { Input } from "@/components/desktop-ui/input";
import { isCardDue, type StudyCard, type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { isWithinGroup, normalizeGroupPath, renamedGroupPath } from "@/lib/workspace/study-tree";
import { cn } from "@/lib/utils";

import { AnkiImportDialog } from "./anki-import-dialog";
import { StarterDeckDialog } from "./starter-deck-dialog";
import { ReviewSession } from "./review-session";
import { StudyBrowser } from "./study-browser";
import { StudyCreateDialog, type StudyCreateKind } from "./study-create-dialog";
import type { StudyReviewSettings } from "./study-chrome";
import { StudyRowMenu, StudyRowRename, useRowClick } from "./study-row-actions";

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

function buildDeckTree(decks: StudyDeck[], extraGroups: string[]): DeckTreeNode[] {
  const roots: DeckTreeNode[] = [];

  function ensureGroup(path: string): DeckTreeNode | null {
    const parts = normalizeGroupPath(path).split("::").filter(Boolean);
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
  // Suspended cards sit outside the review rotation, so they count nowhere.
  const active = cards.filter((card) => !card.suspended);
  return {
    newCount: active.filter((card) => card.repetitions === 0).length,
    learnCount: active.filter((card) => card.repetitions > 0 && card.intervalDays < 21 && !isCardDue(card)).length,
    dueCount: active.filter((card) => card.repetitions > 0 && isCardDue(card)).length,
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
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").map(normalizeGroupPath).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function CardsTab({ sourcePath, reviewSettings }: CardsTabProps) {
  const { cards, decks, deleteDeck, deleteDeckGroup, error, moveDeck, moveDeckGroup, reload, renameDeck, renameDeckGroup, selectDeck, selectedDeckId, status } = useCloudStudy();
  const [createKind, setCreateKind] = useState<StudyCreateKind | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [starterOpen, setStarterOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragItem, setDragItem] = useState<DeckDragItem | null>(null);
  const dragItemRef = useRef<DeckDragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  // Deck-onto-deck drop → "name the new group" prompt (owner 2026-07-20).
  const [dropDeckId, setDropDeckId] = useState<string | null>(null);
  const dropDeckRef = useRef<string | null>(null);
  const [merge, setMerge] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [mergeName, setMergeName] = useState("");
  const ignoreClickUntilRef = useRef(0);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Tree-node id ("deck:<id>" / "group:<path>") currently showing its rename field.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const tree = useMemo(() => buildDeckTree(decks, extraGroups), [decks, extraGroups]);

  useEffect(() => setExtraGroups(loadGroups()), []);
  useEffect(() => () => pointerCleanupRef.current?.(), []);

  function persistGroups(next: string[]) {
    const unique = Array.from(new Set(next.map(normalizeGroupPath).filter(Boolean)));
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

  // Deleting a folder takes its decks (and their cards) with it — there is no
  // folder row to delete on its own, so spell the cost out before confirming.
  async function removeGroup(path: string) {
    const doomed = decks.filter((deck) => isWithinGroup(deck.name, path));
    const leaf = path.split("::").pop() ?? path;
    const tally = doomed.length === 0
      ? "It has no decks in it."
      : `It holds ${doomed.length} deck${doomed.length === 1 ? "" : "s"} and ${cards.filter((card) => doomed.some((deck) => deck.id === card.deckId)).length} card${cards.filter((card) => doomed.some((deck) => deck.id === card.deckId)).length === 1 ? "" : "s"}, which are deleted too.`;
    if (!window.confirm(`Are you sure you want to delete the folder “${leaf}”? ${tally} This can't be undone.`)) return;
    setActionError(null);
    try {
      await deleteDeckGroup(path);
      persistGroups(extraGroups.filter((group) => !isWithinGroup(group, path)));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete the folder.");
    }
  }

  async function commitRename(node: DeckTreeNode, next: string) {
    setRenamingId(null);
    setActionError(null);
    try {
      if (node.deck) {
        await renameDeck(node.deck.id, next);
        return;
      }
      // Folders live only in deck names, so a rename that touches no deck still
      // has to move the remembered empty folder itself.
      await renameDeckGroup(node.groupPath, next);
      const destination = renamedGroupPath(node.groupPath, next);
      persistGroups(extraGroups.map((group) => isWithinGroup(group, node.groupPath) ? `${destination}${group.slice(node.groupPath.length)}` : group));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't rename that.");
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

  function changeDropTarget(target: string | null) {
    dropTargetRef.current = target;
    setDropTarget(target);
  }

  function changeDropDeck(deckId: string | null) {
    dropDeckRef.current = deckId;
    setDropDeckId(deckId);
  }

  function startDrag(item: DeckDragItem) {
    dragItemRef.current = item;
    setDragItem(item);
  }

  function endDrag() {
    dragItemRef.current = null;
    setDragItem(null);
    changeDropTarget(null);
    changeDropDeck(null);
  }

  function beginPointerDrag(event: React.PointerEvent, item: DeckDragItem) {
    if (event.button !== 0) return;
    pointerCleanupRef.current?.();
    const origin = { x: event.clientX, y: event.clientY };
    let dragging = false;
    const move = (pointerEvent: PointerEvent) => {
      if (!dragging && Math.hypot(pointerEvent.clientX - origin.x, pointerEvent.clientY - origin.y) < 5) return;
      if (!dragging) {
        dragging = true;
        startDrag(item);
        document.body.style.userSelect = "none";
      }
      const hit = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY) as HTMLElement | null;
      // A deck dragged over ANOTHER deck merges them into a new named group;
      // deck rows win over their surrounding group container.
      const dragDeckId = item.kind === "deck" ? item.id : null;
      const overDeck = dragDeckId !== null ? hit?.closest<HTMLElement>("[data-study-drop-deck]")?.dataset.studyDropDeck : undefined;
      if (overDeck !== undefined && overDeck !== dragDeckId) {
        changeDropDeck(overDeck);
        changeDropTarget(null);
        return;
      }
      changeDropDeck(null);
      const target = hit?.closest<HTMLElement>("[data-study-drop-group]")?.dataset.studyDropGroup;
      const invalid = item.kind === "group" && target !== undefined && (target === item.path || target.startsWith(`${item.path}::`));
      changeDropTarget(target === undefined || invalid ? null : target);
    };
    const cleanup = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = null;
    };
    const up = () => {
      if (dragging) {
        const deckTarget = dropDeckRef.current;
        const target = dropTargetRef.current;
        if (deckTarget !== null && item.kind === "deck") {
          setMergeName("");
          setMerge({ sourceId: item.id, targetId: deckTarget });
        } else if (target !== null) {
          void finishDrop(target, item);
        }
        ignoreClickUntilRef.current = performance.now() + 250;
      }
      endDrag();
      cleanup();
    };
    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  }

  async function finishDrop(targetGroup: string, dragged: DeckDragItem | null = dragItemRef.current) {
    if (!dragged) return;
    setActionError(null);
    try {
      if (dragged.kind === "deck") await moveDeck(dragged.id, targetGroup);
      else {
        const source = dragged.path;
        await moveDeckGroup(source, targetGroup);
        const leaf = source.split("::").pop() ?? source;
        const destination = targetGroup ? `${targetGroup}::${leaf}` : leaf;
        persistGroups(extraGroups.map((group) => group === source ? destination : group.startsWith(`${source}::`) ? `${destination}${group.slice(source.length)}` : group));
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't move that deck.");
    } finally {
      endDrag();
    }
  }

  function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = normalizeGroupPath(groupName);
    if (!next) return;
    persistGroups([...extraGroups, next]);
    setGroupName("");
    setGroupDialogOpen(false);
  }

  // Deck dropped onto another deck: both move into a brand-new group named by
  // the user. The group is created next to the TARGET deck (same parent path).
  async function mergeIntoGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!merge) return;
    const name = normalizeGroupPath(mergeName);
    const target = decks.find((deck) => deck.id === merge.targetId);
    if (!name || !target) return;
    const parent = target.name.split("::").map((part) => part.trim()).filter(Boolean).slice(0, -1).join("::");
    const group = parent ? `${parent}::${name}` : name;
    setActionError(null);
    try {
      await moveDeck(merge.targetId, group);
      await moveDeck(merge.sourceId, group);
      setMerge(null);
      setMergeName("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't group those decks.");
    }
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
    <div className="scrollbar-study flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
      <nav className="mx-auto mb-4 mt-2 flex shrink-0 items-center rounded-2xl border border-(--ui-stroke-tertiary) bg-background p-1 shadow-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button className="rounded-xl" size="sm" variant="ghost">Add <IconChevronDown size={13} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setCreateKind("deck")}><IconCards /> New deck</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setGroupDialogOpen(true)}><IconFolderPlus /> New group</DropdownMenuItem>
            <DropdownMenuItem disabled={decks.length === 0} onSelect={() => setCreateKind("card")}><IconSquarePlus /> New card</DropdownMenuItem>
            <DropdownMenuItem data-testid="import-anki" onSelect={() => setImportOpen(true)}><IconFileUpload /> Import from Anki</DropdownMenuItem>
            <DropdownMenuItem data-testid="starter-decks" onSelect={() => setStarterOpen(true)}><IconBooks /> Starter decks</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button disabled={decks.length === 0} onClick={() => setBrowseOpen(true)} size="sm" variant="ghost">Browse</Button>
      </nav>

      {decks.length === 0 && extraGroups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setCreateKind("deck")} variant="secondary">Create your first deck</Button>
                <Button className="bg-background" onClick={() => setImportOpen(true)} variant="outline"><IconFileUpload size={14} /> Import from Anki</Button>
                <Button className="bg-background" onClick={() => setStarterOpen(true)} variant="outline"><IconBooks size={14} /> Starter decks</Button>
              </div>
            }
            description={sourcePath ? "Turn this Library note into a linked cloud deck." : "Create a deck to start building a durable review habit."}
            title="No decks yet"
          />
        </div>
      ) : (
        <section
          className={cn(
            "mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)] transition-[outline-color,background-color]",
            dragItem && dropTarget === "" && "bg-[color-mix(in_srgb,var(--theme-primary)_6%,var(--background))] outline outline-2 outline-[var(--theme-primary)]",
          )}
          data-study-drop-group=""
        >
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_2.25rem] items-center border-b border-(--ui-stroke-tertiary) px-5 py-3 text-xs font-semibold">
            <span className="pl-[19px]">Deck</span><span className="text-center">New</span><span className="text-center">Learn</span><span className="text-center">Due</span><span />
          </div>
          <div className="py-1.5">
            {tree.map((node) => (
              <DeckRow
                cards={cards}
                collapsed={collapsed}
                depth={0}
                dragItem={dragItem}
                dropDeckId={dropDeckId}
                dropTarget={dropTarget}
                key={node.id}
                node={node}
                onCancelRename={() => setRenamingId(null)}
                onCommitRename={(target, next) => void commitRename(target, next)}
                onDelete={(target) => void (target.deck ? removeDeck(target.deck.id) : removeGroup(target.groupPath))}
                onOpenDeck={openDeck}
                onPointerClick={() => performance.now() < ignoreClickUntilRef.current}
                onPointerDragStart={beginPointerDrag}
                onStartRename={setRenamingId}
                onToggle={toggleGroup}
                renamingId={renamingId}
              />
            ))}
          </div>
        </section>
      )}

      <StudyCreateDialog deck={selectedDeck} kind={createKind ?? "deck"} onOpenChange={(open) => !open && setCreateKind(null)} open={createKind !== null} sourcePath={sourcePath} />
      <AnkiImportDialog onOpenChange={setImportOpen} open={importOpen} />
      <StarterDeckDialog onOpenChange={setStarterOpen} open={starterOpen} />
      <Dialog onOpenChange={(open) => !open && setMerge(null)} open={merge !== null}>
        <DialogContent className="max-w-sm">
          <form className="grid gap-4" onSubmit={mergeIntoGroup}>
            <DialogHeader>
              <DialogTitle>Group these decks</DialogTitle>
              <DialogDescription>
                {(() => {
                  const source = decks.find((deck) => deck.id === merge?.sourceId);
                  const target = decks.find((deck) => deck.id === merge?.targetId);
                  const leaf = (name?: string) => name?.split("::").pop()?.trim() ?? "deck";
                  return `“${leaf(source?.name)}” and “${leaf(target?.name)}” will move into the new group.`;
                })()}
              </DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-xs font-medium">Group name<Input autoFocus onChange={(event) => setMergeName(event.target.value)} placeholder="Cardio decks" value={mergeName} /></label>
            <DialogFooter><Button onClick={() => setMerge(null)} type="button" variant="ghost">Cancel</Button><Button disabled={!normalizeGroupPath(mergeName)} type="submit" variant="secondary">Create group</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={setGroupDialogOpen} open={groupDialogOpen}>
        <DialogContent className="max-w-sm">
          <form className="grid gap-4" onSubmit={createGroup}>
            <DialogHeader><DialogTitle>New deck group</DialogTitle><DialogDescription>Groups can contain decks or other groups.</DialogDescription></DialogHeader>
            <Input autoFocus onChange={(event) => setGroupName(event.target.value)} placeholder="Pharmacy School::Exam 7" value={groupName} />
            <DialogFooter><Button onClick={() => setGroupDialogOpen(false)} type="button" variant="ghost">Cancel</Button><Button disabled={!normalizeGroupPath(groupName)} type="submit" variant="secondary">Create group</Button></DialogFooter>
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
  dropDeckId: string | null;
  renamingId: string | null;
  onOpenDeck: (id: string) => void;
  onToggle: (id: string) => void;
  onPointerDragStart: (event: React.PointerEvent, item: DeckDragItem) => void;
  onPointerClick: () => boolean;
  onStartRename: (nodeId: string) => void;
  onCommitRename: (node: DeckTreeNode, next: string) => void;
  onCancelRename: () => void;
  onDelete: (node: DeckTreeNode) => void;
}

function DeckRow(props: DeckRowProps) {
  const { node, depth, cards, collapsed, dragItem, dropTarget, dropDeckId, renamingId, onOpenDeck, onToggle, onPointerDragStart, onPointerClick, onStartRename, onCommitRename, onCancelRename, onDelete } = props;
  const counts = countsForNode(node, cards);
  const group = !node.deck;
  const isCollapsed = collapsed.has(node.id);
  const renaming = renamingId === node.id;
  const rowClick = useRowClick();
  const invalidTarget = group && dragItem?.kind === "group" && (dragItem.path === node.groupPath || node.groupPath.startsWith(`${dragItem.path}::`));
  const highlighted = (group && !invalidTarget && dropTarget === node.groupPath)
    || (Boolean(node.deck) && node.deck?.id === dropDeckId && dragItem?.kind === "deck" && dragItem.id !== node.deck?.id);
  const item: DeckDragItem = node.deck ? { kind: "deck", id: node.deck.id } : { kind: "group", path: node.groupPath };

  function activate() {
    if (group) onToggle(node.id);
    else if (node.deck) onOpenDeck(node.deck.id);
  }

  return (
    <>
      {/* A div, not a button: the row has to contain the "…" trigger, and a
          button inside a button is invalid HTML that browsers silently unnest. */}
      <div
        aria-label={node.label}
        className={cn(
          "grid w-full cursor-grab grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_2.25rem] items-center px-5 py-2 text-left text-xs transition-colors hover:bg-black/[0.04] active:cursor-grabbing dark:hover:bg-white/[0.06]",
          highlighted && "outline outline-2 -outline-offset-2 outline-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)]",
          ((dragItem?.kind === "deck" && node.deck?.id === dragItem.id) || (dragItem?.kind === "group" && node.groupPath === dragItem.path)) && "opacity-50",
        )}
        data-study-drop-deck={node.deck ? node.deck.id : undefined}
        data-study-drop-group={group ? node.groupPath : undefined}
        onClick={() => {
          if (renaming || onPointerClick()) return;
          rowClick.click(activate);
        }}
        onDoubleClick={() => {
          rowClick.cancel();
          if (!renaming && !onPointerClick()) onStartRename(node.id);
        }}
        onKeyDown={(event) => {
          if (renaming) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          } else if (event.key === "F2") {
            event.preventDefault();
            onStartRename(node.id);
          }
        }}
        onPointerDown={(event) => { if (!renaming) onPointerDragStart(event, item); }}
        role="button"
        tabIndex={0}
      >
        <span className={cn("flex min-w-0 items-center gap-1.5", group && "font-semibold")} style={{ paddingLeft: `${depth * 1.1}rem` }}>
          {group ? (isCollapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />) : <span className="w-[13px] shrink-0" />}
          {renaming
            ? <StudyRowRename onCancel={onCancelRename} onCommit={(next) => onCommitRename(node, next)} value={node.label} />
            : <span className="truncate">{node.label}</span>}
        </span>
        <span className="text-center font-medium tabular-nums text-sky-500">{counts.newCount || 0}</span>
        <span className="text-center font-medium tabular-nums text-amber-500">{counts.learnCount || 0}</span>
        <span className="text-center font-medium tabular-nums text-emerald-500">{counts.dueCount || 0}</span>
        <StudyRowMenu kindLabel={group ? "Folder" : "Deck"} onDelete={() => onDelete(node)} onRename={() => onStartRename(node.id)} />
      </div>
      {!isCollapsed && node.children.map((child) => <DeckRow {...props} depth={depth + 1} key={child.id} node={child} />)}
    </>
  );
}
