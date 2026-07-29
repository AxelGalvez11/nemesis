"use client";

// Tests/Mindmaps are AI-engine deliverables (owner 2026-07-20, reaffirmed
// 2026-07-22 when the Generate pill was pulled): nothing is authored from this
// page — users only organize (folders), browse, and open. Generation happens
// in a notebook or a chat, so the toolbar stays clean.
// Groups come from real items + user folders only; deck names must NOT seed
// folders across tabs (that read as "decks showing up under Tests").
//
// Organizing means the same gestures the Cards tab has (owner 2026-07-22): a
// "…" menu on every row, right-click to rename, dragging an item onto a folder
// to file it there, and — since 2026-07-29 — dragging a folder into another to
// nest it. A folder here is the artifact's group_name column, so filing an item
// is still a one-field update; nesting rewrites the paths beneath it.
//
// Verified end-to-end on the owner's real data 2026-07-23: dragging a test onto
// a folder writes group_name and survives a reload. It only LOOKS broken when
// the tab has no folder yet, because then there is nothing to drop onto.

import { IconArrowRight, IconChecklist, IconFolder, IconFolderPlus, IconSitemap, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { useConfirm } from "@/components/desktop-ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { type StudyArtifact, type StudyArtifactKind, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import {
  buildArtifactTree,
  folderDropAccepts,
  isWithinGroup,
  movedFolderPath,
  normalizeGroupPath,
  pathLeaf,
  pathParent,
  renamedGroupPath,
  rewriteGroupPrefix,
  UNGROUPED_LABEL,
  type ArtifactDrag,
  type ArtifactTreeNode,
} from "@/lib/workspace/study-tree";
import { cn } from "@/lib/utils";

import { artifactScoreLabel, MindmapDialog, TakeTestDialog } from "./study-artifact-dialogs";
import { AgentEmptyState } from "./agent-empty-state";
import { REMOVE_FOLDER, StudyRowContextMenu, StudyRowMenu, StudyRowRename } from "./study-row-actions";

interface GroupedStudyTabProps {
  kind: "tests" | "mindmaps";
}

/** Display name for items with no folder. Stored as "" on the row itself. */
const UNGROUPED = UNGROUPED_LABEL;

/** Indent per folder level. Matches the Cards tab so a student moving between
 *  the two tabs reads the same shape. */
const INDENT_PX = 14;

const ROW_GRID = "grid-cols-[minmax(0,1fr)_6rem_6rem_2.25rem]";

// FOLDERS NEST HERE, exactly as they do on the Cards tab (owner 2026-07-29:
// the Tests page "doesnt have same functionality as cards page").
//
// This used to be flat. A folder was a single label in the artifact's
// `group_name` column, so a folder dropped on a folder could only MERGE — there
// was no "inside" to drop into. `group_name` is the same string with the same
// "::" separator a deck name uses, so the tree the Cards tab draws applies here
// unchanged, and an existing flat name is simply a path one segment deep. No
// migration: "Pharmacology" was already a valid path.
//
// The tree and every drop rule are pure, in lib/workspace/study-tree.ts, so they
// are covered by tests that need no pointer and no DOM.

export function GroupedStudyTab({ kind }: GroupedStudyTabProps) {
  const confirm = useConfirm();
  const { artifacts, deleteArtifact, updateArtifact } = useCloudStudy();
  const isTests = kind === "tests";
  const artifactKind: StudyArtifactKind = isTests ? "test" : "mindmap";
  const label = isTests ? "Tests" : "Mindmaps";
  const items = useMemo(() => artifacts.filter((artifact) => artifact.kind === artifactKind), [artifactKind, artifacts]);
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  // The same tree the Cards tab draws. buildArtifactTree and its drop rules had
  // been written and tested since 2026-07-28 but were imported by nothing except
  // their own test file, so this tab kept rendering the old flat list — which is
  // why folders here could not nest and a folder-on-folder drop merged instead.
  const tree = useMemo(() => buildArtifactTree(items, extraGroups), [extraGroups, items]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  // Row key currently renaming: "item:<id>" or "group:<name>".
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const [drag, setDrag] = useState<ArtifactDrag | null>(null);
  const dragRef = useRef<ArtifactDrag | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const dropGroupRef = useRef<string | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const pointerCleanupRef = useRef<(() => void) | null>(null);

  const groupStorageKey = `nemesis.web.study-${kind}-groups`;
  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(groupStorageKey) ?? "[]");
      if (Array.isArray(parsed)) setExtraGroups(parsed.filter((group): group is string => typeof group === "string" && group.trim().length > 0));
    } catch { /* best effort */ }
  }, [groupStorageKey]);
  useEffect(() => () => pointerCleanupRef.current?.(), []);

  function persistGroups(next: string[]) {
    const unique = Array.from(new Set(next.map((group) => group.trim()).filter(Boolean)));
    setExtraGroups(unique);
    try { window.localStorage.setItem(groupStorageKey, JSON.stringify(unique)); } catch { /* best effort */ }
  }

  function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = normalizeGroupPath(groupName);
    if (!next) return;
    persistGroups([...extraGroups, next]);
    setGroupName("");
    setGroupOpen(false);
  }

  /**
   * May `payload` land in the folder at `path`? ("" is the top level.)
   *
   * Resolved during the drag rather than at drop time, so a row never lights up
   * as if it would accept something it will refuse. Folder drops defer to
   * folderDropAccepts, which is what stops a folder being dropped inside its own
   * descendant — the move that would otherwise detach the whole subtree.
   */
  function dropAccepts(payload: ArtifactDrag, path: string): boolean {
    if (payload.kind === "item") {
      const item = items.find((entry) => entry.id === payload.id);
      return !item || normalizeGroupPath(item.groupName ?? "") !== normalizeGroupPath(path);
    }
    return folderDropAccepts(payload.name, path);
  }

  // Pointer-based drag (not HTML5 dnd) so the drop target can be resolved from
  // whatever is under the cursor, matching the Cards tab.
  function beginDrag(event: React.PointerEvent, payload: ArtifactDrag) {
    if (event.button !== 0) return;
    pointerCleanupRef.current?.();
    const origin = { x: event.clientX, y: event.clientY };
    let dragging = false;
    const move = (pointerEvent: PointerEvent) => {
      if (!dragging && Math.hypot(pointerEvent.clientX - origin.x, pointerEvent.clientY - origin.y) < 5) return;
      if (!dragging) {
        dragging = true;
        dragRef.current = payload;
        setDrag(payload);
        document.body.style.userSelect = "none";
      }
      const hit = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY) as HTMLElement | null;
      const over = hit?.closest<HTMLElement>("[data-artifact-drop-group]")?.dataset.artifactDropGroup ?? null;
      // A folder is not a drop target for itself. Resolving that here rather
      // than at drop time means the row never lights up as if it would accept
      // the thing being dragged.
      const target = over !== null && dropAccepts(payload, over) ? over : null;
      dropGroupRef.current = target;
      setDropGroup(target);
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
        const target = dropGroupRef.current;
        if (target !== null) {
          if (payload.kind === "item") void fileInto(payload.id, target);
          else void moveGroup(payload.name, target);
        }
        ignoreClickUntilRef.current = performance.now() + 250;
      }
      dragRef.current = null;
      setDrag(null);
      dropGroupRef.current = null;
      setDropGroup(null);
      cleanup();
    };
    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  }

  async function fileInto(artifactId: string, path: string) {
    // A path now, not a display label: "" is the top level, so there is no
    // "Ungrouped" pseudo-folder to translate back out of.
    const next = normalizeGroupPath(path);
    const item = items.find((entry) => entry.id === artifactId);
    if (!item || normalizeGroupPath(item.groupName ?? "") === next) return;
    setActionError(null);
    try {
      await updateArtifact(artifactId, { groupName: next });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't move that item.");
    }
  }

  /**
   * Move a folder INTO another by dragging it there — the Cards tab's
   * behaviour, and the whole reason this tab needed the tree.
   *
   * This used to MERGE. Everything inside took the target's label and the source
   * label stopped existing, because a flat label left no other meaning for a
   * folder-on-folder drop. That was destructive — nothing recorded which items
   * came from where, so dragging back could not undo it — which is why it asked
   * first. Nesting is reversible: drag it back out. So it now just happens, with
   * no dialog, exactly as it does on Cards.
   *
   * Every DESCENDANT is rewritten, not only direct children, and
   * rewriteGroupPrefix is segment-aware, so moving "Exam 1" leaves "Exam 10"
   * alone.
   */
  async function moveGroup(source: string, target: string) {
    if (!folderDropAccepts(source, target)) return;
    const next = movedFolderPath(source, target);
    setActionError(null);
    try {
      for (const item of items) {
        const moved = rewriteGroupPrefix(item.groupName ?? "", source, next);
        if (moved !== null) await updateArtifact(item.id, { groupName: moved });
      }
      persistGroups(extraGroups.map((entry) => rewriteGroupPrefix(entry, source, next) ?? entry));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't move that folder.");
    }
  }

  async function renameItem(item: StudyArtifact, next: string) {
    setRenamingId(null);
    setActionError(null);
    try {
      await updateArtifact(item.id, { title: next });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't rename that item.");
    }
  }

  async function removeItem(item: StudyArtifact) {
    if (!(await confirm({ body: `“${item.title}” is deleted. This can't be undone.`, title: "Delete this item?" }))) return;
    setActionError(null);
    try {
      await deleteArtifact(item.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete that item.");
    }
  }

  // Renaming a folder relabels everything inside it, at any depth. The typed
  // name replaces the LAST segment only (renamedGroupPath) — a folder sitting in
  // "Pharm" stays in "Pharm" when it is renamed, rather than jumping to the top
  // level because the student typed a bare word.
  async function renameGroup(group: string, next: string) {
    setRenamingId(null);
    const renamed = renamedGroupPath(group, next);
    if (!renamed || renamed === normalizeGroupPath(group)) return;
    setActionError(null);
    try {
      for (const item of items) {
        const moved = rewriteGroupPrefix(item.groupName ?? "", group, renamed);
        if (moved !== null) await updateArtifact(item.id, { groupName: moved });
      }
      persistGroups(extraGroups.map((entry) => rewriteGroupPrefix(entry, group, renamed) ?? entry));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't rename that folder.");
    }
  }

  // Removing a folder keeps its contents (owner 2026-07-23) — it used to delete
  // every test inside, which for generated work was unrecoverable.
  //
  // Now that folders nest, "one level up" is the PARENT rather than the top
  // level: removing "Pharm::Exam 1" leaves its tests in "Pharm", where the
  // student was looking, instead of tipping them out to the root alongside
  // everything else.
  async function removeGroup(group: string) {
    const parent = pathParent(group);
    const inside = items.filter((entry) => isWithinGroup(normalizeGroupPath(entry.groupName ?? ""), group));
    if (inside.length > 0) {
      const noun = inside.length === 1 ? label.toLowerCase().replace(/s$/, "") : label.toLowerCase();
      if (!(await confirm({
        body: `Its ${inside.length} ${noun} move to ${parent ? `“${pathLeaf(parent)}”` : "the top level"}. Nothing is deleted.`,
        confirmLabel: "Remove folder",
        title: `Remove the folder “${pathLeaf(group)}”?`,
      }))) return;
    }
    setActionError(null);
    try {
      // rewriteGroupPrefix maps the folder onto its parent, so a nested folder
      // inside it rises one level too rather than being orphaned at a path whose
      // middle segment no longer exists.
      for (const item of inside) {
        const moved = rewriteGroupPrefix(item.groupName ?? "", group, parent);
        if (moved !== null) await updateArtifact(item.id, { groupName: moved });
      }
      persistGroups(extraGroups.flatMap((entry) => {
        if (normalizeGroupPath(entry) === normalizeGroupPath(group)) return [];
        return [rewriteGroupPrefix(entry, group, parent) ?? entry];
      }));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't remove that folder.");
    }
  }

  /** Items anywhere beneath a folder, so a parent's count includes what is
   *  nested inside it rather than only its direct children. */
  function countInside(node: ArtifactTreeNode<StudyArtifact>): number {
    return node.children.reduce((total, child) => total + (child.item ? 1 : countInside(child)), 0);
  }

  /**
   * One row, and everything under it.
   *
   * A folder's wrapper carries data-artifact-drop-group, and because children
   * render INSIDE that wrapper, dropping onto a nested row resolves to the
   * innermost folder under the cursor — elementFromPoint finds the deepest
   * element and `closest` walks outwards from there. That is what makes a drop
   * into a sub-folder land there rather than in its parent.
   */
  function renderNode(node: ArtifactTreeNode<StudyArtifact>, depth: number): React.ReactNode {
    const item = node.item;
    if (item) {
      return (
        <ItemRow
          depth={depth}
          dragging={drag?.kind === "item" && drag.id === item.id}
          grid={ROW_GRID}
          item={item}
          key={node.id}
          meta={isTests ? artifactScoreLabel(item) : new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          onCancelRename={() => setRenamingId(null)}
          onCommitRename={(next) => void renameItem(item, next)}
          onDelete={() => void removeItem(item)}
          onOpen={() => setOpenedId(item.id)}
          onPointerDragStart={(event, id) => beginDrag(event, { id, kind: "item" })}
          onStartRename={() => setRenamingId(node.id)}
          renaming={renamingId === node.id}
          suppressClick={() => performance.now() < ignoreClickUntilRef.current}
        />
      );
    }
    const beingDragged = drag?.kind === "group" && drag.name === node.path;
    return (
      <div
        className={cn(
          "transition-colors",
          drag && dropGroup === node.path && "bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)] outline outline-2 -outline-offset-2 outline-[var(--theme-primary)]",
          // The folder being dragged dims, the same tell an item gives.
          beingDragged && "opacity-50",
        )}
        data-artifact-drop-group={node.path}
        key={node.id}
      >
        <GroupRow
          count={countInside(node)}
          depth={depth}
          dragging={beingDragged}
          grid={ROW_GRID}
          label={node.label}
          onCancelRename={() => setRenamingId(null)}
          onCommitRename={(next) => void renameGroup(node.path, next)}
          onDelete={() => void removeGroup(node.path)}
          onPointerDragStart={(event) => beginDrag(event, { kind: "group", name: node.path })}
          onStartRename={() => setRenamingId(node.id)}
          renaming={renamingId === node.id}
        />
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="scrollbar-study flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
      {tree.length > 0 && (
        <nav className="mx-auto mb-4 mt-2 flex shrink-0 items-center rounded-2xl border border-(--ui-stroke-tertiary) bg-background p-1 shadow-sm">
          <Button className="rounded-xl" onClick={() => { setGroupName(""); setGroupOpen(true); }} size="sm" variant="ghost"><IconFolderPlus size={14} /> New folder</Button>
          <Button disabled={items.length === 0} onClick={() => setBrowseOpen(true)} size="sm" variant="ghost">Browse</Button>
        </nav>
      )}

      {tree.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <AgentEmptyState
            action={
              <Button asChild className="bg-(--theme-primary) text-white hover:opacity-90">
                <Link href="/sessions">Open a chat <IconArrowRight /></Link>
              </Button>
            }
            description={isTests
              ? "Practice tests are generated in chat from the notes or files you attach. Completed attempts and scores return here automatically."
              : "Mindmaps are generated in chat from the notes or files you attach. Save one and it will appear here for browsing and organization."}
            icon={isTests ? <IconChecklist size={20} /> : <IconSitemap size={20} />}
            prompt={isTests
              ? "Create a 20-question practice test from these notes and focus on the concepts I am most likely to miss."
              : "Turn these notes into a mindmap that connects the major ideas, mechanisms, and exceptions."}
            title={isTests ? "Build your first practice test" : "Map your first topic"}
          />
        </div>
      ) : (
        /* shrink-0: same flex trap as the Cards tab — see cards-tab.tsx.
           Without it a long list is clipped instead of scrolling its parent.

           THE WHOLE CARD is the top-level drop target (data-…-group=""), which
           is what replaces the old "Ungrouped" heading — the only place you
           could previously drop something to take it OUT of a folder.
           Deliberately on the section, not on the rows container, and copied
           from the Cards tab: dropping "at the top level" means aiming at the
           blank space under the last row, and that space belongs to the section.
           Anchoring it to the inner list would leave the gesture working only
           where a row already happens to be — i.e. not when every item is filed,
           which is exactly when someone needs it. */
        <section
          className={cn(
            "mx-auto w-full max-w-3xl shrink-0 overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)] transition-[outline-color,background-color]",
            drag && dropGroup === "" && "bg-[color-mix(in_srgb,var(--theme-primary)_6%,var(--background))] outline outline-2 outline-[var(--theme-primary)]",
          )}
          data-artifact-drop-group=""
        >
          <div className={cn("grid items-center border-b border-(--ui-stroke-tertiary) px-5 py-3 text-xs font-semibold", ROW_GRID)}>
            <span>Folder</span><span className="text-center">Items</span><span className="text-center">{isTests ? "Score" : "Updated"}</span><span />
          </div>
          {/* min-h so there is somewhere to aim once every row is inside a
              folder — without it the card shrink-wraps its rows and the "drop
              below the list" gesture has no pixels to land on. */}
          <div className="min-h-16 py-1.5">
            {tree.map((node) => renderNode(node, 0))}
          </div>
        </section>
      )}

      {actionError && <p className="mx-auto mt-3 rounded-lg bg-(--ui-bg-quaternary) px-3 py-2 text-xs text-(--ui-text-secondary)">{actionError}</p>}

      {(() => {
        const opened = items.find((item) => item.id === openedId);
        if (!opened) return null;
        return opened.kind === "test"
          ? <TakeTestDialog artifact={opened} key={opened.id} onClose={() => setOpenedId(null)} />
          : <MindmapDialog artifact={opened} key={opened.id} onClose={() => setOpenedId(null)} />;
      })()}

      <Dialog onOpenChange={setGroupOpen} open={groupOpen}>
        <DialogContent className="max-w-sm">
          <form className="grid gap-4" onSubmit={createGroup}>
            <DialogHeader><DialogTitle>New {label.toLowerCase()} folder</DialogTitle><DialogDescription>Keep related {label.toLowerCase()} together by course, unit, or topic.</DialogDescription></DialogHeader>
            <label className="grid gap-1.5 text-xs font-medium">Folder name<Input autoFocus onChange={(event) => setGroupName(event.target.value)} placeholder="Exam 7" value={groupName} /></label>
            <DialogFooter><Button onClick={() => setGroupOpen(false)} type="button" variant="ghost">Cancel</Button><Button disabled={!normalizeGroupPath(groupName)} type="submit" variant="secondary">Create folder</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setBrowseOpen} open={browseOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Browse {label.toLowerCase()}</DialogTitle><DialogDescription>{items.length} cloud item{items.length === 1 ? "" : "s"}, grouped with the rest of Study.</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {items.map((item) => (
              <article className="flex items-center gap-3 rounded-xl border border-(--ui-stroke-tertiary) bg-background px-3 py-2.5" key={item.id}>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{item.title}</p><p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{item.groupName || UNGROUPED}</p></div>
                <Button aria-label={`Delete ${item.title}`} onClick={() => void removeItem(item)} size="icon-xs" variant="ghost"><IconTrash /></Button>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface GroupRowProps {
  label: string;
  count: number;
  /** How deep in the folder tree, for the row's indent. 0 is the top level. */
  depth: number;
  grid: string;
  dragging: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onCommitRename: (next: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onPointerDragStart: (event: React.PointerEvent) => void;
}

function GroupRow({ label, count, depth, grid, dragging, renaming, onStartRename, onCommitRename, onCancelRename, onDelete, onPointerDragStart }: GroupRowProps) {
  // Every folder row is now a real folder someone made. The old exception —
  // "Ungrouped", a placeholder for "no folder" that could not be renamed,
  // deleted or dragged — is gone with the flat list: loose items sit at the top
  // level of the tree instead of under a heading that stood for nothing.
  const row = (
    <div
      className={cn("grid items-center px-5 py-2 text-xs cursor-grab active:cursor-grabbing", grid, dragging && "opacity-50")}
      // The 5px threshold in beginDrag is what keeps this from stealing clicks
      // on the row's own "…" menu — a press that never travels is not a drag.
      onPointerDown={(event) => { if (!renaming) onPointerDragStart(event); }}
    >
      <span className="flex min-w-0 items-center gap-1.5 font-semibold" style={{ paddingLeft: depth * INDENT_PX }}>
        <IconFolder className="shrink-0 text-(--ui-text-tertiary)" size={13} />
        {renaming
          ? <StudyRowRename onCancel={onCancelRename} onCommit={onCommitRename} value={label} />
          : <span className="truncate">{label}</span>}
      </span>
      <span className="text-center tabular-nums text-(--ui-text-secondary)">{count}</span>
      <span className="text-center tabular-nums text-(--ui-text-quaternary)">—</span>
      <StudyRowMenu kindLabel="Folder" onDelete={onDelete} onRename={onStartRename} removal={REMOVE_FOLDER} />
    </div>
  );
  return <StudyRowContextMenu onDelete={onDelete} onRename={onStartRename} removal={REMOVE_FOLDER}>{row}</StudyRowContextMenu>;
}

interface ItemRowProps {
  item: StudyArtifact;
  meta: string;
  grid: string;
  dragging: boolean;
  renaming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onCommitRename: (next: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onPointerDragStart: (event: React.PointerEvent, artifactId: string) => void;
  suppressClick: () => boolean;
  /** How deep in the folder tree, for the row's indent. 0 is the top level. */
  depth: number;
}

function ItemRow({ item, meta, depth, grid, dragging, renaming, onOpen, onStartRename, onCommitRename, onCancelRename, onDelete, onPointerDragStart, suppressClick }: ItemRowProps) {
  return (
    <StudyRowContextMenu onDelete={onDelete} onRename={onStartRename}>
      <div
        aria-label={item.title}
        className={cn(
          "grid w-full cursor-grab items-center px-5 py-2 text-left text-xs text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) active:cursor-grabbing",
          grid,
          dragging && "opacity-50",
        )}
        data-testid={`artifact-${item.id}`}
        onClick={() => {
          if (renaming || suppressClick()) return;
          onOpen();
        }}
        onKeyDown={(event) => {
          if (renaming) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          } else if (event.key === "F2") {
            event.preventDefault();
            onStartRename();
          }
        }}
        onPointerDown={(event) => { if (!renaming) onPointerDragStart(event, item.id); }}
        role="button"
        tabIndex={0}
      >
        <span className="flex min-w-0 items-center pl-5" style={{ paddingLeft: 20 + depth * INDENT_PX }}>
          {renaming
            ? <StudyRowRename onCancel={onCancelRename} onCommit={onCommitRename} value={item.title} />
            : <span className="truncate">{item.title}</span>}
        </span>
        <span className="text-center text-[0.6875rem] capitalize text-(--ui-text-quaternary)">{item.status}</span>
        <span className="text-center tabular-nums text-(--ui-text-quaternary)">{meta}</span>
        <StudyRowMenu kindLabel={item.kind === "test" ? "Test" : "Mindmap"} onDelete={onDelete} onRename={onStartRename} />
      </div>
    </StudyRowContextMenu>
  );
}
