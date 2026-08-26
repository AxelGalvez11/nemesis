"use client";

// "Library" in the composer's "+" menu (owner 2026-07-23). With the Notebooks
// page retired, the Library is where lecture slides and school documents live,
// so the chat has to be able to reach into it without leaving the thread.
//
// The reverse direction already existed — the Library sidebar's "Attach to AI
// chat" seeds files into a composer that is about to mount. This pulls instead
// of pushing, so it hands its files straight back to the OPEN composer; it must
// not go through composer-seed, whose one-shot seed is only read on mount.
//
// Chosen notes become the same virtual .md Files the sidebar builds, which is
// what lets them ride the ordinary prepareChatAttachments path with no special
// casing on the wire.

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/desktop-ui/dialog";
import { DisclosureCaret } from "@/components/desktop-ui/disclosure-caret";
import { SearchField } from "@/components/desktop-ui/search-field";
import { Skeleton } from "@/components/desktop-ui/skeleton";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { buildLibraryTree } from "@/lib/workspace/library-tree";
import {
  attachmentFileName,
  flattenPickerRows,
  folderCheckState,
  folderKey,
  orderedSelection,
  searchPickerRows,
  toggleFolderSelection,
  type FolderCheckState,
  type PickerRow,
} from "@/lib/workspace/library-picker";
import { cn } from "@/lib/utils";

const INDENT_REM_PER_DEPTH = 0.875;

// Roughly the point where prepareChatAttachments' 22k-character budget starts
// clipping notes rather than sending them whole. A warning, never a block: the
// student may well mean to attach a whole unit and let the model see the top of
// each note.
const ATTACHMENT_CHAR_BUDGET = 22_000;

interface LibraryPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach: (files: File[]) => void;
}

export function LibraryPickerDialog({ open, onOpenChange, onAttach }: LibraryPickerDialogProps) {
  const { status, notes, folders } = useCloudLibrary();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");

  // Every opening starts clean: an attachment set left over from a previous
  // turn would silently re-attach notes the student already sent.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery("");
  }, [open]);

  const tree = useMemo(() => buildLibraryTree(notes, folders), [folders, notes]);
  const trimmedQuery = query.trim();
  const rows: PickerRow[] = useMemo(
    () => (trimmedQuery ? searchPickerRows(tree, trimmedQuery) : flattenPickerRows(tree, expanded)),
    [expanded, tree, trimmedQuery],
  );

  const chosen = useMemo(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    return orderedSelection(tree, selected)
      .map((id) => byId.get(id))
      .filter((note): note is NonNullable<typeof note> => Boolean(note));
  }, [notes, selected, tree]);

  const chosenChars = chosen.reduce((sum, note) => sum + note.content.length, 0);
  const loading = status === "idle" || status === "loading";

  const toggleNote = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFolder = (noteIds: readonly string[]) => {
    setSelected((current) => toggleFolderSelection(current, noteIds));
  };

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const attach = () => {
    onAttach(
      chosen.map((note) => new File([note.content], attachmentFileName(note.title), { type: "text/markdown" })),
    );
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach from Library</DialogTitle>
          <DialogDescription>
            Pick any notes to send with your message. Choosing a folder takes everything inside it.
          </DialogDescription>
        </DialogHeader>

        <SearchField
          aria-label="Search your Library"
          containerClassName="w-full"
          onChange={setQuery}
          onClear={() => setQuery("")}
          placeholder="Search notes"
          value={query}
        />

        {/* A plain block, not a flex child: a flex item with overflow set has an
            automatic minimum size of zero, which is how a scroller ends up with
            nothing to scroll. */}
        <div className="max-h-[22rem] min-h-[8rem] overflow-y-auto rounded-lg border border-(--ui-stroke-tertiary) p-1">
          {loading ? (
            <div className="grid gap-1 p-1">
              {[0, 1, 2, 3].map((index) => <Skeleton className="h-7 w-full" key={index} />)}
            </div>
          ) : status === "error" ? (
            // A Library that FAILED to load must never read as an empty one —
            // that would tell a student their notes are gone.
            <p className="px-2 py-6 text-center text-xs text-destructive" role="alert">
              Couldn’t load your Library. Check your connection and try again.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-(--ui-text-tertiary)">
              {trimmedQuery ? `Nothing in your Library matches “${trimmedQuery}”.` : "Your Library is empty."}
            </p>
          ) : (
            rows.map((row) =>
              row.kind === "folder" ? (
                <FolderRow
                  checkState={folderCheckState(row.noteIds, selected)}
                  count={row.noteIds.length}
                  depth={row.depth}
                  expanded={expanded.has(folderKey(row.path))}
                  key={row.key}
                  name={row.name}
                  onToggleExpanded={() => toggleExpanded(folderKey(row.path))}
                  onToggleSelected={() => toggleFolder(row.noteIds)}
                />
              ) : (
                <NoteRow
                  checked={selected.has(row.id)}
                  depth={row.depth}
                  key={row.key}
                  onToggle={() => toggleNote(row.id)}
                  subtitle={trimmedQuery ? row.path : null}
                  title={row.title}
                />
              ),
            )
          )}
        </div>

        {chosenChars > ATTACHMENT_CHAR_BUDGET && (
          <p className="text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)" role="status">
            That is a lot of text to send at once — the longest notes will be trimmed so the whole
            selection fits in one message.
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-(--ui-text-tertiary)">
            {chosen.length === 0 ? "Nothing selected" : `${chosen.length} note${chosen.length === 1 ? "" : "s"} selected`}
          </span>
          <span className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">Cancel</Button>
            <Button disabled={chosen.length === 0} onClick={attach} type="button">
              Attach{chosen.length > 0 ? ` ${chosen.length}` : ""}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckBox({ state }: { state: FolderCheckState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] border transition-colors",
        state === "none"
          ? "border-(--ui-stroke-secondary) text-transparent"
          : "border-(--theme-primary) bg-(--theme-primary) text-white",
      )}
    >
      {state === "some" ? <span className="h-0.5 w-2 rounded-full bg-current" /> : <Codicon name="check" size="0.625rem" />}
    </span>
  );
}

function FolderRow({
  checkState,
  count,
  depth,
  expanded,
  name,
  onToggleExpanded,
  onToggleSelected,
}: {
  checkState: FolderCheckState;
  count: number;
  depth: number;
  expanded: boolean;
  name: string;
  onToggleExpanded: () => void;
  onToggleSelected: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md pr-2 hover:bg-(--ui-control-hover-background)" style={{ paddingLeft: `${depth * INDENT_REM_PER_DEPTH}rem` }}>
      {/* Opening a folder and choosing a folder are separate targets: a student
          browsing into "Contract law" should not silently attach all 40 notes. */}
      <button
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
        className="flex size-5 shrink-0 items-center justify-center rounded text-(--ui-text-tertiary) hover:text-foreground"
        onClick={onToggleExpanded}
        type="button"
      >
        <DisclosureCaret open={expanded} />
      </button>
      <button
        aria-checked={checkState === "all" ? true : checkState === "some" ? "mixed" : false}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left disabled:opacity-45"
        disabled={count === 0}
        onClick={onToggleSelected}
        role="checkbox"
        type="button"
      >
        <CheckBox state={checkState} />
        <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="folder" size="0.8125rem" />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{name}</span>
        <span className="shrink-0 text-[0.6875rem] text-(--ui-text-tertiary)">{count}</span>
      </button>
    </div>
  );
}

function NoteRow({
  checked,
  depth,
  onToggle,
  subtitle,
  title,
}: {
  checked: boolean;
  depth: number;
  onToggle: () => void;
  subtitle: string | null;
  title: string;
}) {
  return (
    <button
      aria-checked={checked}
      className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left hover:bg-(--ui-control-hover-background)"
      onClick={onToggle}
      role="checkbox"
      style={{ paddingLeft: `${depth * INDENT_REM_PER_DEPTH + 1.5}rem` }}
      type="button"
    >
      <CheckBox state={checked ? "all" : "none"} />
      <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="file" size="0.8125rem" />
      <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
        {title}
        {subtitle && <span className="ml-2 text-[0.6875rem] text-(--ui-text-tertiary)">{subtitle}</span>}
      </span>
    </button>
  );
}
