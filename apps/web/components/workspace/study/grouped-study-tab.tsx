"use client";

// Tests/Mindmaps are AI-engine deliverables (owner 2026-07-20, reaffirmed
// 2026-07-22 when the Generate pill was pulled): nothing is authored from this
// page — users only organize (folders), browse, and open. Generation happens
// in a notebook or a chat, so the toolbar stays clean.
// Groups come from real items + user folders only; deck names must NOT seed
// folders across tabs (that read as "decks showing up under Tests").
//
// Organizing means the same three gestures the Cards tab has (owner
// 2026-07-22): a "…" menu on every row, double-click to rename, and dragging an
// item onto a folder to file it there. Unlike a deck folder — which only exists
// as a prefix inside the deck's own name — a folder here is the artifact's
// group_name column, so filing an item is a one-field update.

import { IconFolder, IconFolderPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { type StudyArtifact, type StudyArtifactKind, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { normalizeGroupPath } from "@/lib/workspace/study-tree";
import { cn } from "@/lib/utils";

import { artifactScoreLabel, MindmapDialog, TakeTestDialog } from "./study-artifact-dialogs";
import { StudyRowMenu, StudyRowRename, useRowClick } from "./study-row-actions";

interface GroupedStudyTabProps {
  kind: "tests" | "mindmaps";
}

/** Display name for items with no folder. Stored as "" on the row itself. */
const UNGROUPED = "Ungrouped";

function storedGroup(display: string): string {
  return display === UNGROUPED ? "" : display;
}

const ROW_GRID = "grid-cols-[minmax(0,1fr)_6rem_6rem_2.25rem]";

export function GroupedStudyTab({ kind }: GroupedStudyTabProps) {
  const { artifacts, deleteArtifact, updateArtifact } = useCloudStudy();
  const isTests = kind === "tests";
  const artifactKind: StudyArtifactKind = isTests ? "test" : "mindmap";
  const label = isTests ? "Tests" : "Mindmaps";
  const items = useMemo(() => artifacts.filter((artifact) => artifact.kind === artifactKind), [artifactKind, artifacts]);
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const groups = useMemo(() => {
    const names = new Set([...extraGroups, ...items.map((item) => item.groupName || UNGROUPED)]);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [extraGroups, items]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  // Row key currently renaming: "item:<id>" or "group:<name>".
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
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

  // Pointer-based drag (not HTML5 dnd) so the drop target can be resolved from
  // whatever is under the cursor, matching the Cards tab.
  function beginDrag(event: React.PointerEvent, artifactId: string) {
    if (event.button !== 0) return;
    pointerCleanupRef.current?.();
    const origin = { x: event.clientX, y: event.clientY };
    let dragging = false;
    const move = (pointerEvent: PointerEvent) => {
      if (!dragging && Math.hypot(pointerEvent.clientX - origin.x, pointerEvent.clientY - origin.y) < 5) return;
      if (!dragging) {
        dragging = true;
        dragIdRef.current = artifactId;
        setDragId(artifactId);
        document.body.style.userSelect = "none";
      }
      const hit = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY) as HTMLElement | null;
      const target = hit?.closest<HTMLElement>("[data-artifact-drop-group]")?.dataset.artifactDropGroup ?? null;
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
        if (target !== null) void fileInto(artifactId, target);
        ignoreClickUntilRef.current = performance.now() + 250;
      }
      dragIdRef.current = null;
      setDragId(null);
      dropGroupRef.current = null;
      setDropGroup(null);
      cleanup();
    };
    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  }

  async function fileInto(artifactId: string, displayGroup: string) {
    const next = storedGroup(displayGroup);
    const item = items.find((entry) => entry.id === artifactId);
    if (!item || item.groupName === next) return;
    setActionError(null);
    try {
      await updateArtifact(artifactId, { groupName: next });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't move that item.");
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
    if (!window.confirm(`Are you sure you want to delete “${item.title}”? This can't be undone.`)) return;
    setActionError(null);
    try {
      await deleteArtifact(item.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete that item.");
    }
  }

  // A folder here is just a label, but it behaves like the Cards tab's folders:
  // renaming it relabels everything inside, deleting it takes them with it.
  async function renameGroup(group: string, next: string) {
    setRenamingId(null);
    const name = normalizeGroupPath(next);
    if (!name || name === group || group === UNGROUPED) return;
    setActionError(null);
    try {
      for (const item of items.filter((entry) => (entry.groupName || UNGROUPED) === group)) {
        await updateArtifact(item.id, { groupName: name });
      }
      persistGroups(extraGroups.map((entry) => (entry === group ? name : entry)));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't rename that folder.");
    }
  }

  async function removeGroup(group: string) {
    const inside = items.filter((entry) => (entry.groupName || UNGROUPED) === group);
    const tally = inside.length === 0
      ? "It's empty."
      : `The ${inside.length} ${inside.length === 1 ? label.toLowerCase().replace(/s$/, "") : label.toLowerCase()} inside are deleted too.`;
    if (!window.confirm(`Are you sure you want to delete the folder “${group}”? ${tally} This can't be undone.`)) return;
    setActionError(null);
    try {
      for (const item of inside) await deleteArtifact(item.id);
      persistGroups(extraGroups.filter((entry) => entry !== group));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete that folder.");
    }
  }

  return (
    <div className="scrollbar-study flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
      <nav className="mx-auto mb-4 mt-2 flex shrink-0 items-center rounded-2xl border border-(--ui-stroke-tertiary) bg-background p-1 shadow-sm">
        <Button className="rounded-xl" onClick={() => { setGroupName(""); setGroupOpen(true); }} size="sm" variant="ghost"><IconFolderPlus size={14} /> New folder</Button>
        <Button disabled={items.length === 0} onClick={() => setBrowseOpen(true)} size="sm" variant="ghost">Browse</Button>
      </nav>

      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)]">
        <div className={cn("grid items-center border-b border-(--ui-stroke-tertiary) px-5 py-3 text-xs font-semibold", ROW_GRID)}>
          <span>Folder</span><span className="text-center">Items</span><span className="text-center">{isTests ? "Score" : "Updated"}</span><span />
        </div>
        {groups.length > 0 ? (
          <div className="py-1.5">
            {groups.map((group) => {
              const grouped = items.filter((item) => (item.groupName || UNGROUPED) === group);
              const renamingGroup = renamingId === `group:${group}`;
              return (
                <div
                  className={cn(
                    "transition-colors",
                    dragId && dropGroup === group && "bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)] outline outline-2 -outline-offset-2 outline-[var(--theme-primary)]",
                  )}
                  data-artifact-drop-group={group}
                  key={group}
                >
                  <GroupRow
                    count={grouped.length}
                    grid={ROW_GRID}
                    label={group}
                    onCancelRename={() => setRenamingId(null)}
                    onCommitRename={(next) => void renameGroup(group, next)}
                    onDelete={() => void removeGroup(group)}
                    onStartRename={() => setRenamingId(`group:${group}`)}
                    renaming={renamingGroup}
                  />
                  {grouped.map((item) => (
                    <ItemRow
                      dragging={dragId === item.id}
                      grid={ROW_GRID}
                      item={item}
                      key={item.id}
                      meta={isTests ? artifactScoreLabel(item) : new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      onCancelRename={() => setRenamingId(null)}
                      onCommitRename={(next) => void renameItem(item, next)}
                      onDelete={() => void removeItem(item)}
                      onOpen={() => setOpenedId(item.id)}
                      onPointerDragStart={beginDrag}
                      onStartRename={() => setRenamingId(`item:${item.id}`)}
                      renaming={renamingId === `item:${item.id}`}
                      suppressClick={() => performance.now() < ignoreClickUntilRef.current}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-44 place-items-center px-6 text-center">
            <div><p className="text-xs font-semibold">No {label.toLowerCase()} yet</p><p className="mt-1 max-w-64 text-[0.75rem] text-muted-foreground">Nemesis builds {label.toLowerCase()} for you — generate them from a notebook or ask in a chat.</p></div>
          </div>
        )}
      </section>

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
            <DialogHeader><DialogTitle>New {label.toLowerCase()} folder</DialogTitle><DialogDescription>Group related {label.toLowerCase()} by course, unit, or topic.</DialogDescription></DialogHeader>
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
  grid: string;
  renaming: boolean;
  onStartRename: () => void;
  onCommitRename: (next: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
}

function GroupRow({ label, count, grid, renaming, onStartRename, onCommitRename, onCancelRename, onDelete }: GroupRowProps) {
  // "Ungrouped" is a placeholder for "no folder", not a folder anyone made —
  // renaming or deleting it would be renaming nothing.
  const real = label !== UNGROUPED;
  return (
    <div className={cn("grid items-center px-5 py-2 text-xs", grid)} onDoubleClick={() => real && !renaming && onStartRename()}>
      <span className="flex min-w-0 items-center gap-1.5 font-semibold">
        <IconFolder className="shrink-0 text-(--ui-text-tertiary)" size={13} />
        {renaming
          ? <StudyRowRename onCancel={onCancelRename} onCommit={onCommitRename} value={label} />
          : <span className="truncate">{label}</span>}
      </span>
      <span className="text-center tabular-nums text-(--ui-text-secondary)">{count}</span>
      <span className="text-center tabular-nums text-(--ui-text-quaternary)">—</span>
      {real ? <StudyRowMenu kindLabel="Folder" onDelete={onDelete} onRename={onStartRename} /> : <span />}
    </div>
  );
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
}

function ItemRow({ item, meta, grid, dragging, renaming, onOpen, onStartRename, onCommitRename, onCancelRename, onDelete, onPointerDragStart, suppressClick }: ItemRowProps) {
  const rowClick = useRowClick();
  return (
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
        rowClick.click(onOpen);
      }}
      onDoubleClick={() => {
        rowClick.cancel();
        if (!renaming && !suppressClick()) onStartRename();
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
      <span className="flex min-w-0 items-center pl-5">
        {renaming
          ? <StudyRowRename onCancel={onCancelRename} onCommit={onCommitRename} value={item.title} />
          : <span className="truncate">{item.title}</span>}
      </span>
      <span className="text-center text-[0.6875rem] capitalize text-(--ui-text-quaternary)">{item.status}</span>
      <span className="text-center tabular-nums text-(--ui-text-quaternary)">{meta}</span>
      <StudyRowMenu kindLabel={item.kind === "test" ? "Test" : "Mindmap"} onDelete={onDelete} onRename={onStartRename} />
    </div>
  );
}
