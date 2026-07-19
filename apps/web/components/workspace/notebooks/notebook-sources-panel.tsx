"use client";

// Sources panel — lists a notebook's sources and adds new ones four ways: pull in a Library note,
// paste text, drop a web link (scraped to text via /api/notebooks/extract/url), or upload a PDF /
// Word / PowerPoint (parsed to text via /api/notebooks/extract/file). Everything becomes text stored
// on the notebook_sources row; the file bytes are never kept. Writes go through the notebooks store
// (RLS-scoped). YouTube is a fast-follow — not offered here yet.

import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SearchField } from "@/components/desktop-ui/search-field";
import { useCloudLibrary } from "@/lib/workspace/library-cloud-store";
import { deviceKey } from "@/lib/workspace/chat-api";
import type { NotebookSource, NotebookSourceKind } from "@/lib/notebooks/api";
import { cn } from "@/lib/utils";

import type { UseNotebooksApi } from "./notebooks-store";

const KIND_ICON: Record<NotebookSourceKind, string> = {
  library: "book",
  text: "note",
  url: "link",
  pdf: "file-pdf",
  docx: "file",
  pptx: "file-media",
  youtube: "play-circle",
};

type AddMode = "library" | "text" | "url" | "upload";

function bytesLabel(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SourcesPanelProps {
  notebookId: string;
  sources: NotebookSource[];
  sourcesStatus: UseNotebooksApi["sourcesStatus"];
  uid: string | null;
  api: Pick<UseNotebooksApi, "addLibrary" | "addText" | "addExtracted" | "removeSource">;
}

export function NotebookSourcesPanel({ notebookId, sources, sourcesStatus, uid, api }: SourcesPanelProps) {
  const [mode, setMode] = useState<AddMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeAdd = () => {
    setMode(null);
    setError(null);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">
          Sources {sources.length > 0 && <span className="ml-1 tabular-nums text-(--ui-text-quaternary)">{sources.length}</span>}
        </h2>
      </div>

      {/* Add bar */}
      <div className="flex flex-wrap gap-1.5">
        <AddButton icon="book" label="Library" active={mode === "library"} onClick={() => setMode(mode === "library" ? null : "library")} />
        <AddButton icon="note" label="Text" active={mode === "text"} onClick={() => setMode(mode === "text" ? null : "text")} />
        <AddButton icon="link" label="Link" active={mode === "url"} onClick={() => setMode(mode === "url" ? null : "url")} />
        <AddButton icon="cloud-upload" label="Upload" active={mode === "upload"} onClick={() => setMode(mode === "upload" ? null : "upload")} />
      </div>

      {error && <p className="text-[0.7rem] text-(--dt-destructive)">{error}</p>}

      {mode === "library" && (
        <LibraryPicker
          existingPaths={new Set(sources.filter((s) => s.libraryPath).map((s) => s.libraryPath as string))}
          onPick={async (note) => {
            setBusy(true);
            setError(null);
            try {
              await api.addLibrary(notebookId, { path: note.path, title: note.title, content: note.content });
              closeAdd();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't add that note.");
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}

      {mode === "text" && (
        <TextAdder
          busy={busy}
          onCancel={closeAdd}
          onAdd={async (name, content) => {
            setBusy(true);
            setError(null);
            try {
              await api.addText(notebookId, { name, content });
              closeAdd();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't add that text.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {mode === "url" && (
        <UrlAdder
          busy={busy}
          onCancel={closeAdd}
          onAdd={async (url) => {
            setBusy(true);
            setError(null);
            try {
              const key = uid ? await deviceKey(uid) : null;
              if (!key) throw new Error("Sign in to add a web link.");
              const res = await fetch("/api/notebooks/extract/url", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
              });
              const body = (await res.json().catch(() => null)) as { title?: string; text?: string; sourceUrl?: string; bytes?: number; error?: string } | null;
              if (!res.ok || !body?.text) throw new Error(body?.error ?? "Couldn't read that page.");
              await api.addExtracted(notebookId, { kind: "url", name: body.title ?? url, content: body.text, sourceUrl: body.sourceUrl ?? url, bytes: body.bytes ?? null });
              closeAdd();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't read that page.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {mode === "upload" && (
        <FileAdder
          busy={busy}
          onCancel={closeAdd}
          onFile={async (file) => {
            setBusy(true);
            setError(null);
            try {
              const key = uid ? await deviceKey(uid) : null;
              if (!key) throw new Error("Sign in to add a file.");
              const fd = new FormData();
              fd.append("file", file);
              const res = await fetch("/api/notebooks/extract/file", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
              const body = (await res.json().catch(() => null)) as { kind?: NotebookSourceKind; title?: string; text?: string; bytes?: number; error?: string } | null;
              if (!res.ok || !body?.text || !body.kind) throw new Error(body?.error ?? "Couldn't read that file.");
              await api.addExtracted(notebookId, { kind: body.kind as "pdf" | "docx" | "pptx", name: body.title ?? file.name, content: body.text, bytes: body.bytes ?? file.size });
              closeAdd();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't read that file.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {/* Sources list */}
      {sourcesStatus === "loading" ? (
        <p className="py-2 text-xs text-(--ui-text-tertiary)">Loading sources…</p>
      ) : sources.length === 0 ? (
        <p className="py-2 text-xs text-(--ui-text-tertiary)">No sources yet. Add notes, text, links, or files above.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sources.map((s) => (
            <li
              key={s.id}
              className="group flex items-center gap-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-1.5"
            >
              <Codicon name={KIND_ICON[s.kind]} size="0.85rem" className="shrink-0 text-(--ui-text-tertiary)" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8rem] font-medium text-foreground">{s.name}</div>
                <div className="truncate text-[0.65rem] text-(--ui-text-quaternary)">
                  {s.kind === "url" && s.sourceUrl ? s.sourceUrl : s.kind === "library" ? "Library note" : bytesLabel(s.bytes) ?? s.kind.toUpperCase()}
                </div>
              </div>
              <Button
                aria-label={`Remove ${s.name}`}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => void api.removeSource(s.id)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Codicon name="trash" size="0.75rem" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.75rem] font-medium transition-colors",
        active
          ? "border-(--ui-stroke-secondary) bg-(--ui-control-active-background) text-foreground"
          : "border-(--ui-stroke-tertiary) text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
      )}
    >
      <Codicon name={icon} size="0.8rem" />
      {label}
    </button>
  );
}

function LibraryPicker({
  existingPaths,
  onPick,
  busy,
}: {
  existingPaths: Set<string>;
  onPick: (note: { path: string; title: string; content: string }) => void;
  busy: boolean;
}) {
  const { notes, status } = useCloudLibrary();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes;
    return list.slice(0, 200);
  }, [notes, query]);

  return (
    <div className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-2">
      <SearchField aria-label="Search notes" onChange={setQuery} placeholder="Search your notes…" value={query} />
      <div className="mt-1.5 max-h-52 overflow-y-auto">
        {status === "loading" ? (
          <p className="px-1 py-2 text-xs text-(--ui-text-tertiary)">Loading your notes…</p>
        ) : filtered.length === 0 ? (
          <p className="px-1 py-2 text-xs text-(--ui-text-tertiary)">No notes found.</p>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((note) => {
              const added = existingPaths.has(note.path);
              return (
                <li key={note.path}>
                  <button
                    type="button"
                    disabled={added || busy}
                    onClick={() => onPick({ path: note.path, title: note.title, content: note.content })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.8rem] text-(--ui-text-secondary) enabled:hover:bg-(--ui-control-hover-background) enabled:hover:text-foreground disabled:opacity-45"
                  >
                    <Codicon name={added ? "check" : "book"} size="0.8rem" className="shrink-0 text-(--ui-text-tertiary)" />
                    <span className="min-w-0 flex-1 truncate">{note.title}</span>
                    {added && <span className="text-[0.65rem] text-(--ui-text-quaternary)">Added</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TextAdder({ busy, onAdd, onCancel }: { busy: boolean; onAdd: (name: string, content: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-2">
      <input
        className="rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-sm text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
        onChange={(e) => setName(e.target.value)}
        placeholder="Title (optional)"
        value={name}
      />
      <textarea
        className="min-h-24 resize-y rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-sm text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste text to add as a source…"
        value={content}
      />
      <div className="flex justify-end gap-1.5">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">Cancel</Button>
        <Button disabled={!content.trim() || busy} onClick={() => onAdd(name.trim() || "Pasted text", content)} size="sm" type="button" variant="secondary">
          {busy ? "Adding…" : "Add text"}
        </Button>
      </div>
    </div>
  );
}

function UrlAdder({ busy, onAdd, onCancel }: { busy: boolean; onAdd: (url: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-2">
      <input
        className="rounded-md border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-sm text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && url.trim() && !busy) onAdd(url.trim()); }}
        placeholder="https://example.com/article"
        value={url}
      />
      <p className="text-[0.65rem] text-(--ui-text-quaternary)">We grab the page&rsquo;s readable text. Pages behind a login can&rsquo;t be read.</p>
      <div className="flex justify-end gap-1.5">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">Cancel</Button>
        <Button disabled={!url.trim() || busy} onClick={() => onAdd(url.trim())} size="sm" type="button" variant="secondary">
          {busy ? "Reading…" : "Add link"}
        </Button>
      </div>
    </div>
  );
}

function FileAdder({ busy, onFile, onCancel }: { busy: boolean; onFile: (file: File) => void; onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) p-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-(--ui-stroke-secondary) px-3 py-4 text-center text-(--ui-text-secondary) transition-colors enabled:hover:bg-(--ui-control-hover-background) disabled:opacity-60"
      >
        <Codicon name="cloud-upload" size="1.1rem" />
        <span className="text-[0.8rem] font-medium">{busy ? "Reading…" : "Choose a PDF, Word, or PowerPoint"}</span>
        <span className="text-[0.65rem] text-(--ui-text-quaternary)">Up to 25 MB. We keep the text, not the file.</span>
      </button>
      <div className="flex justify-end">
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">Cancel</Button>
      </div>
    </div>
  );
}
