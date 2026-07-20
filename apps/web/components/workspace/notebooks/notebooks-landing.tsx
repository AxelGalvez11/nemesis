"use client";

// Notebooks landing — the full-width list of notebooks (ChatGPT "Projects" shape): a title, search,
// "New", and a row per notebook (name + last-modified + hover delete). Clicking a row opens its
// detail. This replaces the old second-sidebar list; the workspace's left nav is the only rail here.

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SearchField } from "@/components/desktop-ui/search-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";

import { useNotebooks } from "./notebooks-store";

function formatModified(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function NotebooksLanding() {
  const { status, notebooks, error, select, create, remove, reload } = useNotebooks();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem("nemesis.web.pinned-notebooks") ?? "[]");
      if (Array.isArray(parsed)) setPinnedIds(new Set(parsed.filter((value): value is string => typeof value === "string")));
    } catch {
      // Keep the empty in-memory set.
    }
  }, []);

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(
    () => [...(trimmed ? notebooks.filter((n) => n.name.toLowerCase().includes(trimmed)) : notebooks)].sort((a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id))),
    [notebooks, pinnedIds, trimmed],
  );
  const loading = status === "idle" || status === "loading";

  const onNew = async () => {
    setCreating(true);
    try {
      await create("Untitled notebook");
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (id: string, name: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Are you sure you want to delete “${name}”? Its sources and chat are removed. This can't be undone.`)) return;
    void remove(id);
  };

  const togglePin = (id: string) => {
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { window.localStorage.setItem("nemesis.web.pinned-notebooks", JSON.stringify(Array.from(next))); } catch { /* best effort */ }
      return next;
    });
  };

  return (
    <div className="workspace-page-header mx-auto flex h-full w-full max-w-[52rem] flex-col overflow-hidden px-6 pt-[calc(var(--titlebar-height)+clamp(2.25rem,6vh,4.5rem))] max-sm:px-4 max-sm:pt-[calc(var(--titlebar-height)+1.5rem)]">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="workspace-page-title">Notebooks</h1>
          <p className="mt-1 text-sm text-(--ui-text-tertiary)">Gather sources, set an instruction, and chat about them.</p>
        </div>
        <Button disabled={creating} onClick={onNew} size="sm" variant="secondary">
          <Codicon name="add" size="0.8rem" /> New
        </Button>
      </div>

      {notebooks.length > 0 && (
        <div className="mb-3">
          <SearchField
            aria-label="Search notebooks"
            containerClassName="w-full rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-3 opacity-100"
            onChange={setQuery}
            placeholder="Search notebooks…"
            value={query}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        {loading ? (
          <p className="py-10 text-center text-sm text-(--ui-text-tertiary)">Loading…</p>
        ) : status === "error" ? (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <Codicon className="text-(--ui-text-quaternary)" name="warning" size="1.5rem" />
            <p className="text-sm text-(--ui-text-tertiary)">Couldn&rsquo;t load your notebooks</p>
            {error && <p className="max-w-sm text-xs text-(--ui-text-quaternary)">{error}</p>}
            <Button className="mt-1" onClick={reload} size="sm" variant="ghost">
              <Codicon name="refresh" size="0.75rem" /> Retry
            </Button>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="grid place-items-center gap-3 py-20 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-(--ui-bg-elevated) text-(--ui-text-tertiary)">
              <Codicon name="notebook" size="1.75rem" />
            </span>
            <div>
              <p className="text-base font-medium text-foreground">No notebooks yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-(--ui-text-tertiary)">
                A notebook keeps a set of sources, a custom instruction, and its own chat together.
              </p>
            </div>
            <Button className="mt-1" disabled={creating} onClick={onNew} size="sm" variant="secondary">
              <Codicon name="add" size="0.8rem" /> New notebook
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-(--ui-text-tertiary)">{`No notebooks match “${query.trim()}”.`}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {filtered.map((n) => {
              const modified = formatModified(n.updatedAt);
              return (
                <li key={n.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => select(n.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-background px-4 py-3.5 pr-12 text-left shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-colors hover:border-(--ui-stroke-secondary) hover:bg-(--ui-control-hover-background)"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--ui-bg-elevated) text-(--ui-text-secondary)">
                      <Codicon name="notebook" size="1rem" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-foreground">{n.name}</span>
                    {pinnedIds.has(n.id) && <Codicon className="shrink-0 text-(--theme-primary)" name="pin" size="0.75rem" />}
                    {modified && <span className="shrink-0 text-xs tabular-nums text-(--ui-text-quaternary)">{modified}</span>}
                  </button>
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button aria-label={`${n.name} project actions`} className="rounded-lg p-1.5 text-(--ui-text-tertiary) hover:bg-(--ui-control-active-background) hover:text-foreground" type="button"><Codicon name="ellipsis" size="0.95rem" /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => select(n.id)}><Codicon name="settings-gear" size="0.85rem" /> Project settings</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => togglePin(n.id)}><Codicon name="pin" size="0.85rem" /> {pinnedIds.has(n.id) ? "Unpin" : "Pin"}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => confirmDelete(n.id, n.name)} variant="destructive"><Codicon name="trash" size="0.85rem" /> Delete project</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
