"use client";

import { IconChecklist, IconSitemap, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { Input } from "@/components/desktop-ui/input";
import { type StudyArtifactKind, useCloudStudy } from "@/lib/workspace/study-cloud-store";

interface GroupedStudyTabProps {
  kind: "tests" | "mindmaps";
}

export function GroupedStudyTab({ kind }: GroupedStudyTabProps) {
  const { artifacts, createArtifact, decks, deleteArtifact } = useCloudStudy();
  const isTests = kind === "tests";
  const artifactKind: StudyArtifactKind = isTests ? "test" : "mindmap";
  const Icon = isTests ? IconChecklist : IconSitemap;
  const label = isTests ? "Tests" : "Mindmaps";
  const singular = isTests ? "test" : "mind map";
  const items = useMemo(() => artifacts.filter((artifact) => artifact.kind === artifactKind), [artifactKind, artifacts]);
  const suggestedGroups = useMemo(() => Array.from(new Set(decks.map((deck) => deck.name.split("::")[0]?.trim()).filter(Boolean))) as string[], [decks]);
  const groups = useMemo(() => {
    const names = new Set([...suggestedGroups, ...items.map((item) => item.groupName || "Ungrouped")]);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items, suggestedGroups]);
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createArtifact({ kind: artifactKind, title, groupName });
      setTitle("");
      setGroupName("");
      setCreateOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Couldn't create the ${singular}.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
      <nav className="mx-auto mb-7 flex shrink-0 items-center rounded-b-2xl border border-t-0 border-(--ui-stroke-tertiary) bg-background p-1 shadow-sm">
        <Button className="rounded-xl bg-black/[0.055] dark:bg-white/[0.08]" size="sm" variant="ghost"><Icon size={14} /> {label}</Button>
        <Button onClick={() => setCreateOpen(true)} size="sm" variant="ghost">Add</Button>
        <Button disabled={items.length === 0} onClick={() => setBrowseOpen(true)} size="sm" variant="ghost">Browse</Button>
      </nav>
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-(--ui-stroke-tertiary) bg-background shadow-[0_3px_12px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center border-b border-(--ui-stroke-tertiary) px-5 py-3 text-xs font-semibold">
          <span>Group</span><span className="text-center">Items</span><span className="text-center">Due</span>
        </div>
        {groups.length > 0 ? (
          <div className="py-1.5">
            {groups.map((group) => {
              const grouped = items.filter((item) => (item.groupName || "Ungrouped") === group);
              return (
                <div key={group}>
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center px-5 py-2 text-xs">
                    <span className="truncate font-semibold">{group}</span><span className="text-center tabular-nums text-(--ui-text-secondary)">{grouped.length}</span><span className="text-center tabular-nums text-(--ui-text-quaternary)">0</span>
                  </div>
                  {grouped.map((item) => (
                    <button className="grid w-full grid-cols-[minmax(0,1fr)_6rem_6rem] items-center px-5 py-2 text-left text-xs text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)" key={item.id} onClick={() => setBrowseOpen(true)} type="button">
                      <span className="truncate pl-5">{item.title}</span><span className="text-center text-[0.6875rem] capitalize text-(--ui-text-quaternary)">{item.status}</span><span />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-44 place-items-center px-6 text-center">
            <div><p className="text-xs font-semibold">No {label.toLowerCase()} yet</p><p className="mt-1 text-[0.75rem] text-muted-foreground">Add a {singular} and place it in a course or topic group.</p><Button className="mt-4" onClick={() => setCreateOpen(true)} size="sm" variant="secondary">Add {singular}</Button></div>
          </div>
        )}
      </section>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="max-w-md">
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader><DialogTitle>New {singular}</DialogTitle><DialogDescription>Create it in a group so cards, tests, and maps follow the same course structure.</DialogDescription></DialogHeader>
            <label className="grid gap-1.5 text-xs font-medium">Title<Input autoFocus onChange={(event) => setTitle(event.target.value)} placeholder={isTests ? "Cardiovascular practice test" : "RAAS pathway"} value={title} /></label>
            <label className="grid gap-1.5 text-xs font-medium">Group<Input list={`${artifactKind}-group-options`} onChange={(event) => setGroupName(event.target.value)} placeholder="Pharmacy School::Exam 7" value={groupName} /><datalist id={`${artifactKind}-group-options`}>{suggestedGroups.map((group) => <option key={group} value={group} />)}</datalist></label>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <DialogFooter><Button onClick={() => setCreateOpen(false)} type="button" variant="ghost">Cancel</Button><Button disabled={saving || !title.trim()} type="submit" variant="secondary">{saving ? "Saving…" : `Create ${singular}`}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setBrowseOpen} open={browseOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Browse {label.toLowerCase()}</DialogTitle><DialogDescription>{items.length} cloud item{items.length === 1 ? "" : "s"}, grouped with the rest of Study.</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {items.map((item) => (
              <article className="flex items-center gap-3 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-3 py-2.5" key={item.id}>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{item.title}</p><p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{item.groupName || "Ungrouped"}</p></div>
                <Button aria-label={`Delete ${item.title}`} onClick={() => void deleteArtifact(item.id)} size="icon-xs" variant="ghost"><IconTrash /></Button>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
