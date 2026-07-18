"use client";

// Notebooks sidebar — the notebook list + "New notebook", mirroring the Library aside. Reads the
// shared notebooks store (components/workspace/notebooks/notebooks-store); selecting a notebook
// drives the main pane. New notebooks are created with a placeholder name and renamed in the detail
// header (create-then-name, like opening a fresh doc).

import { useMemo, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SearchField } from "@/components/desktop-ui/search-field";
import { cn } from "@/lib/utils";

import { useNotebooks } from "./notebooks-store";

export function NotebooksSidebar() {
  const { status, notebooks, error, selectedId, select, create, reload } = useNotebooks();
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

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) pt-(--titlebar-height)">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Notebooks</h1>
          {!loading && status !== "error" && (
            <p className="mt-0.5 text-[0.65rem] font-medium tabular-nums text-(--ui-text-tertiary)">
              {notebooks.length} notebook{notebooks.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Button aria-label="New notebook" disabled={creating} onClick={onNew} size="icon-xs" type="button" variant="ghost">
          <Codicon name="add" size="0.85rem" />
        </Button>
      </div>

      {notebooks.length > 0 && (
        <div className="mx-3">
          <SearchField
            aria-label="Search notebooks"
            containerClassName="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2 opacity-100"
            onChange={setQuery}
            placeholder="Search notebooks…"
            value={query}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col px-2 pt-1.5">
        {loading ? (
          <p className="px-2 py-2 text-xs text-(--ui-text-tertiary)">Loading…</p>
        ) : status === "error" ? (
          <div className="grid flex-1 place-items-center px-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <Codicon className="text-(--ui-text-quaternary)" name="warning" size="1.25rem" />
              <p className="text-xs text-(--ui-text-tertiary)">Couldn&rsquo;t load your notebooks</p>
              {error && <p className="max-w-52 text-[0.6875rem] text-(--ui-text-quaternary)">{error}</p>}
              <Button className="mt-0.5 text-(--ui-text-secondary)" onClick={reload} size="sm" variant="ghost">
                <Codicon name="refresh" size="0.75rem" /> Retry
              </Button>
            </div>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="grid flex-1 place-items-center px-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <Codicon className="text-(--ui-text-quaternary)" name="notebook" size="1.5rem" />
              <p className="text-xs font-medium text-(--ui-text-secondary)">No notebooks yet</p>
              <p className="max-w-48 text-[0.6875rem] text-(--ui-text-quaternary)">
                A notebook holds sources + instructions + its own chats.
              </p>
              <Button className="mt-1" disabled={creating} onClick={onNew} size="sm" variant="secondary">
                <Codicon name="add" size="0.75rem" /> New notebook
              </Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-(--ui-text-tertiary)">{`No notebooks match “${query.trim()}”.`}</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pb-2">
            {filtered.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => select(n.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-[0.8125rem] transition-colors",
                    n.id === selectedId
                      ? "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground"
                      : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
                  )}
                >
                  <Codicon name="notebook" size="0.85rem" className="shrink-0 text-(--ui-text-tertiary)" />
                  <span className="min-w-0 flex-1 truncate font-medium">{n.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
