"use client";

// The Library's front page — what a docs site shows before you pick an
// article. Recent notes to resume, then every top-level FOLDER as a section
// listing its notes. Folders are just folders (owner 2026-08-03): a course,
// a project, a semester, a topic — the home page never assumes which. All of
// it comes straight from the store; there is nothing to configure and
// nothing here the tree doesn't already know.

import { IconFileImport, IconFilePlus } from "@tabler/icons-react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import type { CloudLibraryNote } from "@/lib/workspace/library-cloud-store";
import { countLibraryNotes, titleFromPath, type LibraryTreeFolder } from "@/lib/workspace/library-tree";

interface DocsHomeProps {
  tree: LibraryTreeFolder;
  notes: readonly CloudLibraryNote[];
  onOpenPath: (path: string) => void;
  onCreateNote: () => void;
  onImport: () => void;
}

/** First readable line of a note body, stripped of markdown dressing. */
function snippetOf(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line) || /^(-{3,}|\*{3,}|_{3,}|```)/.test(line)) continue;
    return line
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\]\]/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]|==|^>\s?|^[-*+]\s+|\|/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
  }
  return "";
}

function editedLabel(updatedAt: string): string | null {
  const stamp = Date.parse(updatedAt);
  if (!Number.isFinite(stamp) || stamp <= 0) return null;
  return new Date(stamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function DocsHome({ tree, notes, onOpenPath, onCreateNote, onImport }: DocsHomeProps) {
  const recent = [...notes]
    .filter((note) => note.content.trim().length > 0 || note.title.trim().length > 0)
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
    .slice(0, 4);
  const sections = tree.folders;
  const loose = tree.notes;
  const empty = notes.length === 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl min-w-0 flex-col px-8 pb-16 pt-8 max-sm:px-4">
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">Your Library</h1>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-(--ui-text-secondary)">
          All of your notes, one connected wiki. Open anything from the left, link ideas with [[double brackets]], and Nemesis keeps the structure.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onCreateNote} size="sm" variant="secondary"><IconFilePlus /> New note</Button>
          <Button onClick={onImport} size="sm" variant="ghost"><IconFileImport /> Import documents</Button>
        </div>
      </header>

      {empty ? (
        <section className="mt-10 rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-5 py-6">
          <h2 className="text-sm font-semibold text-foreground">Start your Library</h2>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-(--ui-text-secondary)">
            Create your first note, or import a syllabus, slides or readings — every folder becomes a section here, and every note you add gets a page of its own.
          </p>
        </section>
      ) : (
        <>
          {recent.length > 0 && (
            <section className="mt-9" data-testid="home-recent">
              <h2 className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">Pick up where you left off</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {recent.map((note) => {
                  const edited = editedLabel(note.updatedAt);
                  const snippet = snippetOf(note.content);
                  return (
                    <button
                      className="group rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-4 py-3 text-left transition-colors hover:border-(--ui-stroke-secondary)"
                      key={note.id}
                      onClick={() => onOpenPath(note.path)}
                      type="button"
                    >
                      <p className="truncate text-[0.8125rem] font-semibold text-foreground">{note.title.trim() || titleFromPath(note.path)}</p>
                      {snippet && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-(--ui-text-tertiary)">{snippet}</p>}
                      <p className="mt-1.5 truncate text-[0.65rem] text-(--ui-text-quaternary)">
                        {note.path.split("/").slice(0, -1).join(" / ") || "Library"}
                        {edited ? ` · edited ${edited}` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {sections.length > 0 && (
            <section className="mt-9" data-testid="home-folders">
              <h2 className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">Folders</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {sections.map((folder) => {
                  const count = countLibraryNotes(folder);
                  const sample = [...folder.notes, ...folder.folders.flatMap((child) => child.notes)].slice(0, 3);
                  return (
                    <div className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-4 py-3" key={folder.path}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold text-foreground">
                          <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="folder" size="0.8125rem" />
                          <span className="truncate">{folder.name}</span>
                        </p>
                        <span className="shrink-0 text-[0.65rem] text-(--ui-text-quaternary)">{count === 1 ? "1 note" : `${count} notes`}</span>
                      </div>
                      {sample.length > 0 && (
                        <ul className="mt-2 grid gap-0.5">
                          {sample.map((entry) => (
                            <li key={entry.path}>
                              <button
                                className="w-full truncate rounded px-1 py-0.5 text-left text-xs text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground"
                                onClick={() => onOpenPath(entry.path)}
                                type="button"
                              >
                                {entry.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {loose.length > 0 && (
            <section className="mt-9">
              <h2 className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">Notes</h2>
              <div className="flex flex-wrap gap-1.5">
                {loose.map((note) => (
                  <button
                    className="rounded-full border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-1 text-xs font-medium text-(--ui-text-secondary) hover:border-(--ui-stroke-secondary) hover:text-foreground"
                    key={note.path}
                    onClick={() => onOpenPath(note.path)}
                    type="button"
                  >
                    {note.title}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
