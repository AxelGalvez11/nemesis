"use client";

// Notebooks landing — the full-width list of notebooks (ChatGPT "Projects" shape): a title, search,
// "New", and a row per notebook (name + last-modified + hover delete). Clicking a row opens its
// detail. This replaces the old second-sidebar list; the workspace's left nav is the only rail here.

import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SearchField } from "@/components/desktop-ui/search-field";

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

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (trimmed ? notebooks.filter((n) => n.name.toLowerCase().includes(trimmed)) : notebooks),
    [notebooks, trimmed],
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
    if (typeof window !== "undefined" && !window.confirm(`Delete “${name}”? Its sources and chat are removed. This can't be undone.`)) return;
    void remove(id);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden px-6 pt-[calc(var(--titlebar-height)+2.5rem)]">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notebooks</h1>
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
                    className="flex w-full items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)/40 px-4 py-3.5 pr-12 text-left transition-colors hover:border-(--ui-stroke-secondary) hover:bg-(--ui-control-hover-background)"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--ui-bg-elevated) text-(--ui-text-secondary)">
                      <Codicon name="notebook" size="1rem" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-foreground">{n.name}</span>
                    {modified && <span className="shrink-0 text-xs tabular-nums text-(--ui-text-quaternary)">{modified}</span>}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${n.name}`}
                    onClick={() => confirmDelete(n.id, n.name)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-active-background) hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Codicon name="trash" size="0.8rem" />
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
