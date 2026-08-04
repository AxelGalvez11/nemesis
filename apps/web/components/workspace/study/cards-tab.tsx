"use client";

import { IconCards, IconChevronDown, IconChevronRight, IconFileUpload, IconFolderPlus, IconSquarePlus } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/desktop-ui/dropdown-menu";
import { Input } from "@/components/desktop-ui/input";
import { isCardDue, type StudyCard, type StudyDeck, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { isWithinGroup, normalizeGroupPath, pathLeaf, pathParent, renamedGroupPath } from "@/lib/workspace/study-tree";
import { cn } from "@/lib/utils";

import { AnkiImportDialog } from "./anki-import-dialog";
import { ReviewSession } from "./review-session";
import { StudyBrowser } from "./study-browser";
import { StudyCreateDialog, type StudyCreateKind } from "./study-create-dialog";
import type { StudyReviewSettings } from "./study-chrome";
import { TextStudyImportDialog } from "./text-import-dialog";
import { AgentEmptyState } from "./agent-empty-state";
import { REMOVE_FOLDER, StudyRowContextMenu, StudyRowMenu, StudyRowRename } from "./study-row-actions";
import { StudyTableSkeleton } from "./study-skeleton";

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
  const confirm = useConfirm();
  const { cards, decks, deleteCard, deleteDeck, deleteDeckGroup, dissolveDeckGroup, error, moveDeck, moveDeckGroup, reload, renameDeck, renameDeckGroup, selectDeck, selectedDeckId, status } = useCloudStudy();
  const [createKind, setCreateKind] = useState<StudyCreateKind | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [textImportSource, setTextImportSource] = useState<"anki" | "quizlet" | null>(null);
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
    if (!deck) return;
    if (!(await confirm({
      body: `“${deck.name}” and all of its cards are deleted. This can't be undone.`,
      title: "Delete this deck?",
    }))) return;
    try {
      await deleteDeck(deckId);
      setBrowseOpen(false);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete the deck.");
    }
  }

  // One card. Until now the browser could only delete the whole DECK, so a
  // student with one bad generated card had to suspend it and live with it.
  // Asks first, like every other delete here, and quotes the card back so it is
  // obvious which one is about to go.
  async function removeCard(cardId: string) {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const front = card.front.trim();
    const shown = front.length > 60 ? `${front.slice(0, 60)}…` : front;
    if (!(await confirm({
      body: shown ? `“${shown}” is deleted. This can't be undone.` : "This card is deleted. This can't be undone.",
      title: "Delete this card?",
    }))) return;
    try {
      await deleteCard(cardId);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete the card.");
    }
  }

  // Removing a folder keeps everything in it (owner 2026-07-23) — the decks move
  // up one level instead of being deleted. Nothing is destroyed, so this asks
  // only where the decks are about to land, and only when there are any.
  async function removeGroup(path: string) {
    const inside = decks.filter((deck) => isWithinGroup(deck.name, path));
    const leaf = pathLeaf(path);
    const parent = pathParent(path);
    const destination = parent ? `“${pathLeaf(parent)}”` : "the top level";
    if (inside.length > 0) {
      const tally = `${inside.length} deck${inside.length === 1 ? "" : "s"}`;
      if (!(await confirm({
        body: `Its ${tally} move to ${destination}. Nothing is deleted.`,
        confirmLabel: "Remove folder",
        title: `Remove the folder “${leaf}”?`,
      }))) return;
    }
    setActionError(null);
    try {
      await dissolveDeckGroup(path);
      persistGroups(extraGroups.filter((group) => !isWithinGroup(group, path)));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't remove the folder.");
    }
  }

  // The other folder verb (owner 2026-08-03: "card deck folders still cannot
  // be deleted" — remove-but-keep was not what they were reaching for). This
  // one deletes the folder AND every deck inside it, so the confirmation
  // quotes the full cost before anything happens.
  async function destroyGroup(path: string) {
    const inside = decks.filter((deck) => isWithinGroup(deck.name, path));
    const leaf = pathLeaf(path);
    const body = inside.length === 0
      ? "The folder is empty — nothing else is deleted."
      : `Its ${inside.length} deck${inside.length === 1 ? "" : "s"} and all of their cards are deleted with it. This can't be undone.`;
    if (!(await confirm({
      body,
      title: `Delete the folder “${leaf}” and everything in it?`,
    }))) return;
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

  if (status === "loading" || status === "idle") return <StudyTableSkeleton />;
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
          {/* Owner 2026-07-28: "merge import options in study page", "remove
              starter decks", "remove 'add new deck'", "rename 'group' to
              folder". The three import rows are now one submenu — same three
              destinations, one row in the menu — and the deck-creation control
              lives only in the empty state below, which is the one place a
              student with nothing yet actually needs it. */}
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setGroupDialogOpen(true)}><IconFolderPlus /> New folder</DropdownMenuItem>
            <DropdownMenuItem disabled={decks.length === 0} onSelect={() => setCreateKind("card")}><IconSquarePlus /> New card</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><IconFileUpload /> Import cards</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem data-testid="import-anki" onSelect={() => setImportOpen(true)}>Anki package</DropdownMenuItem>
                <DropdownMenuItem data-testid="import-anki-text" onSelect={() => setTextImportSource("anki")}>Anki text</DropdownMenuItem>
                <DropdownMenuItem data-testid="import-quizlet" onSelect={() => setTextImportSource("quizlet")}>Quizlet</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button disabled={decks.length === 0} onClick={() => setBrowseOpen(true)} size="sm" variant="ghost">Browse</Button>
      </nav>

      {decks.length === 0 && extraGroups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <AgentEmptyState
            // "Create a deck" survives ONLY here, and deliberately. The owner
            // removed it from the Add menu; leaving no manual path at all would
            // strand a student who has no Anki file and no slides yet, since
            // "New card" needs a deck to put the card in.
            action={
              <>
                <Button onClick={() => setCreateKind("deck")} variant="secondary">Create a deck</Button>
                <Button className="bg-background" onClick={() => setImportOpen(true)} variant="outline"><IconFileUpload size={14} /> Import cards</Button>
              </>
            }
            description={sourcePath ? "Make a deck for this Library note, then add cards yourself or ask Nemesis to build them." : "Decks keep flashcards together. Create one, import from Anki or Quizlet, or ask Nemesis in chat to build a deck from your slides."}
            icon={<IconCards size={20} />}
            title={sourcePath ? "Turn this note into cards" : "Start your first deck"}
          />
        </div>
      ) : (
        <section
          className={cn(
            // shrink-0 is load-bearing, not cosmetic. This is a flex item in a
            // flex-col scroller, and `overflow-hidden` (which the rounded corners
            // need, to clip the rows) sets its automatic minimum size to zero —
            // min-height:auto only protects items whose overflow is visible. So
            // it shrank to the viewport and silently ate every row past the fold:
            // measured 5073px of decks squeezed into 582px, and because nothing
            // ever overflowed the scroller, the page had genuinely nothing to
            // scroll. Owner: "i cannot scroll in this page".
            "mx-auto w-full max-w-3xl shrink-0 overflow-hidden rounded-2xl bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)] transition-[outline-color,background-color]",
            dragItem && dropTarget === "" && "bg-[color-mix(in_srgb,var(--theme-primary)_6%,var(--background))] outline outline-2 outline-[var(--theme-primary)]",
          )}
          data-study-drop-group=""
        >
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_2.25rem] items-center border-b border-(--ui-stroke-tertiary) px-5 py-2.5 text-[0.6875rem] font-semibold">
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
                onDeleteFolder={(target) => void destroyGroup(target.groupPath)}
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
      {textImportSource && (
        <TextStudyImportDialog
          onOpenChange={(open) => { if (!open) setTextImportSource(null); }}
          open
          source={textImportSource}
        />
      )}
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
            <DialogHeader><DialogTitle>New folder</DialogTitle><DialogDescription>Folders can contain decks or other folders.</DialogDescription></DialogHeader>
            <Input autoFocus onChange={(event) => setGroupName(event.target.value)} placeholder="Pharmacy School::Exam 7" value={groupName} />
            <DialogFooter><Button onClick={() => setGroupDialogOpen(false)} type="button" variant="ghost">Cancel</Button><Button disabled={!normalizeGroupPath(groupName)} type="submit" variant="secondary">Create group</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {actionError && <p className="mx-auto mt-3 rounded-lg bg-(--ui-bg-quaternary) px-3 py-2 text-xs text-(--ui-text-secondary)">{actionError}</p>}
      <StudyBrowser cards={cards} decks={decks} initialDeckId={selectedDeckId} onAddCard={(deckId) => { selectDeck(deckId); setBrowseOpen(false); setCreateKind("card"); }} onDeleteCard={(cardId) => void removeCard(cardId)} onDeleteDeck={(deckId) => void removeDeck(deckId)} onOpenChange={setBrowseOpen} open={browseOpen} />
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
  /** Folder rows only: delete the folder AND the decks inside it. */
  onDeleteFolder: (node: DeckTreeNode) => void;
}

function DeckRow(props: DeckRowProps) {
  const { node, depth, cards, collapsed, dragItem, dropTarget, dropDeckId, renamingId, onOpenDeck, onToggle, onPointerDragStart, onPointerClick, onStartRename, onCommitRename, onCancelRename, onDelete, onDeleteFolder } = props;
  const counts = countsForNode(node, cards);
  const group = !node.deck;
  const isCollapsed = collapsed.has(node.id);
  const renaming = renamingId === node.id;
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
          button inside a button is invalid HTML that browsers silently unnest.
          Clicking opens immediately — there is no double-click gesture to
          disambiguate against, so no grace delay is needed. */}
      <StudyRowContextMenu onDelete={() => onDelete(node)} onDeleteForever={group ? () => onDeleteFolder(node) : undefined} onRename={() => onStartRename(node.id)} removal={group ? REMOVE_FOLDER : undefined}>
        <div
          aria-label={node.label}
          className={cn(
            "grid w-full cursor-grab grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_2.25rem] items-center px-5 py-2 text-left text-[0.6875rem] transition-colors hover:bg-black/[0.04] active:cursor-grabbing dark:hover:bg-white/[0.06]",
            highlighted && "outline outline-2 -outline-offset-2 outline-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)]",
            ((dragItem?.kind === "deck" && node.deck?.id === dragItem.id) || (dragItem?.kind === "group" && node.groupPath === dragItem.path)) && "opacity-50",
          )}
          data-study-drop-deck={node.deck ? node.deck.id : undefined}
          data-study-drop-group={group ? node.groupPath : undefined}
          onClick={() => {
            if (renaming || onPointerClick()) return;
            activate();
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
          <StudyRowMenu kindLabel={group ? "Folder" : "Deck"} onDelete={() => onDelete(node)} onDeleteForever={group ? () => onDeleteFolder(node) : undefined} onRename={() => onStartRename(node.id)} removal={group ? REMOVE_FOLDER : undefined} />
        </div>
      </StudyRowContextMenu>
      {!isCollapsed && node.children.map((child) => <DeckRow {...props} depth={depth + 1} key={child.id} node={child} />)}
    </>
  );
}
