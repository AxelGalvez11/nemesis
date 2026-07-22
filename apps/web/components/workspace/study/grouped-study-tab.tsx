"use client";

// Tests/Mindmaps are AI-engine deliverables (owner 2026-07-20, reaffirmed
// 2026-07-22 when the Generate pill was pulled): nothing is authored from this
// page — users only organize (folders), browse, and open. Generation happens
// in a notebook or a chat, so the toolbar stays clean.
// Groups come from real items + user folders only; deck names must NOT seed
// folders across tabs (that read as "decks showing up under Tests").

import { IconFolderPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { type StudyArtifactKind, useCloudStudy } from "@/lib/workspace/study-cloud-store";

import { artifactScoreLabel, MindmapDialog, TakeTestDialog } from "./study-artifact-dialogs";

interface GroupedStudyTabProps {
  kind: "tests" | "mindmaps";
}

export function GroupedStudyTab({ kind }: GroupedStudyTabProps) {
  const { artifacts, deleteArtifact } = useCloudStudy();
  const isTests = kind === "tests";
  const artifactKind: StudyArtifactKind = isTests ? "test" : "mindmap";
  const label = isTests ? "Tests" : "Mindmaps";
  const items = useMemo(() => artifacts.filter((artifact) => artifact.kind === artifactKind), [artifactKind, artifacts]);
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const groups = useMemo(() => {
    const names = new Set([...extraGroups, ...items.map((item) => item.groupName || "Ungrouped")]);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [extraGroups, items]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");

  const groupStorageKey = `nemesis.web.study-${kind}-groups`;
  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(groupStorageKey) ?? "[]");
      if (Array.isArray(parsed)) setExtraGroups(parsed.filter((group): group is string => typeof group === "string" && group.trim().length > 0));
    } catch { /* best effort */ }
  }, [groupStorageKey]);

  function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = groupName.trim();
    if (!next) return;
    const groups = Array.from(new Set([...extraGroups, next]));
    setExtraGroups(groups);
    try { window.localStorage.setItem(groupStorageKey, JSON.stringify(groups)); } catch { /* best effort */ }
    setGroupName("");
    setGroupOpen(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
      <nav className="mx-auto mb-4 mt-2 flex shrink-0 items-center rounded-2xl border border-(--ui-stroke-tertiary) bg-background p-1 shadow-sm">
        <Button className="rounded-xl" onClick={() => { setGroupName(""); setGroupOpen(true); }} size="sm" variant="ghost"><IconFolderPlus size={14} /> New folder</Button>
        <Button disabled={items.length === 0} onClick={() => setBrowseOpen(true)} size="sm" variant="ghost">Browse</Button>
      </nav>

      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center border-b border-(--ui-stroke-tertiary) px-5 py-3 text-xs font-semibold">
          <span>Group</span><span className="text-center">Items</span><span className="text-center">{isTests ? "Score" : "Updated"}</span>
        </div>
        {groups.length > 0 ? (
          <div className="py-1.5">
            {groups.map((group) => {
              const grouped = items.filter((item) => (item.groupName || "Ungrouped") === group);
              return (
                <div key={group}>
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center px-5 py-2 text-xs">
                    <span className="truncate font-semibold">{group}</span><span className="text-center tabular-nums text-(--ui-text-secondary)">{grouped.length}</span><span className="text-center tabular-nums text-(--ui-text-quaternary)">—</span>
                  </div>
                  {grouped.map((item) => (
                    <button className="grid w-full grid-cols-[minmax(0,1fr)_6rem_6rem] items-center px-5 py-2 text-left text-xs text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)" data-testid={`artifact-${item.id}`} key={item.id} onClick={() => setOpenedId(item.id)} type="button">
                      <span className="truncate pl-5">{item.title}</span><span className="text-center text-[0.6875rem] capitalize text-(--ui-text-quaternary)">{item.status}</span><span className="text-center tabular-nums text-(--ui-text-quaternary)">{isTests ? artifactScoreLabel(item) : new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    </button>
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
            <DialogHeader><DialogTitle>New {label.toLowerCase()} group</DialogTitle><DialogDescription>Group related {label.toLowerCase()} by course, unit, or topic.</DialogDescription></DialogHeader>
            <label className="grid gap-1.5 text-xs font-medium">Group name<Input autoFocus onChange={(event) => setGroupName(event.target.value)} placeholder="Pharmacy School::Exam 7" value={groupName} /></label>
            <DialogFooter><Button onClick={() => setGroupOpen(false)} type="button" variant="ghost">Cancel</Button><Button disabled={!groupName.trim()} type="submit" variant="secondary">Create group</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setBrowseOpen} open={browseOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Browse {label.toLowerCase()}</DialogTitle><DialogDescription>{items.length} cloud item{items.length === 1 ? "" : "s"}, grouped with the rest of Study.</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {items.map((item) => (
              <article className="flex items-center gap-3 rounded-xl border border-(--ui-stroke-tertiary) bg-background px-3 py-2.5" key={item.id}>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{item.title}</p><p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{item.groupName || "Ungrouped"}</p></div>
                <Button aria-label={`Delete ${item.title}`} onClick={() => {
                  if (window.confirm(`Are you sure you want to delete “${item.title}”? This can't be undone.`)) void deleteArtifact(item.id);
                }} size="icon-xs" variant="ghost"><IconTrash /></Button>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
