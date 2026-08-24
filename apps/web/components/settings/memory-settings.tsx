"use client";

// Everything Nemesis remembers about you, in your own words, with a × on every line.
//
// 🔴🔴 THIS SCREEN IS WHY THE FEATURE IS ALLOWED TO EXIST. Memory a learner can read and remove
// is a feature; memory they cannot is surveillance, and a study app quietly accumulating an
// unreadable file on a student is a different and worse product. So this is not a nice extra
// shipped after the remembering — it is the other half of it, and `learner-memory.ts` stores
// plain sentences rather than embeddings or scores precisely so that this page can be honest.
//
// 🔴 EVERY LINE IS PRINTED VERBATIM. Nothing here summarises, groups by similarity, or rewrites
// a sentence for display. If the learner cannot recognise a line as something they said, the
// bug is upstream in what was stored — and hiding it behind nicer wording here would make that
// bug invisible for exactly as long as it mattered.
//
// 🔴 IT NEVER PRETENDS TO BE EMPTY WHEN IT IS BROKEN. `loadMemory` returns [] both when there is
// nothing to remember and when the table has not been migrated yet. Those look identical from
// here, so this says "nothing yet" rather than "you have no memories", which would be a claim
// this component cannot actually make.

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import {
  forgetEverything,
  forgetLine,
  loadMemory,
  MEMORY_KINDS,
  MEMORY_KIND_COPY,
  type MemoryLine,
} from "@/lib/learn/learner-memory";

export function MemorySettings() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [lines, setLines] = useState<readonly MemoryLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await loadMemory(uid);
    setLines(rows);
    setLoaded(true);
  }, [uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const forget = useCallback(
    async (id: string) => {
      // 🔴 REMOVED FROM THE SCREEN FIRST, THEN FROM THE TABLE. A learner deleting something they
      // did not want stored should see it gone immediately; a failed delete is recovered by the
      // refresh below rather than by leaving the line sitting there while a request is in flight.
      setLines((was) => was.filter((line) => line.id !== id));
      await forgetLine(uid, id);
      void refresh();
    },
    [refresh, uid],
  );

  const clearAll = useCallback(async () => {
    setLines([]);
    setConfirmingClear(false);
    await forgetEverything(uid);
    void refresh();
  }, [refresh, uid]);

  const groups = MEMORY_KINDS.map((kind) => ({ kind, lines: lines.filter((line) => line.kind === kind) })).filter(
    (group) => group.lines.length > 0,
  );

  return (
    <section className="rounded-2xl border border-(--ui-stroke-secondary) bg-background p-4 shadow-sm">
      <header className="mb-3">
        <h3 className="text-xs font-semibold text-foreground">What Nemesis remembers about you</h3>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-(--ui-text-tertiary)">
          Picked up from things you have said while studying, so it does not have to be told twice. Delete any
          line and it is gone. Nemesis never records what you got right or wrong here.
        </p>
      </header>

      {!loaded ? (
        <p className="text-[0.7rem] text-(--ui-text-quaternary)">Loading…</p>
      ) : lines.length === 0 ? (
        <p className="text-[0.7rem] leading-relaxed text-(--ui-text-quaternary)">
          Nothing yet. As you mention what you are studying or when something is due, it will show up here.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.kind}>
              <p className="mb-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-(--ui-text-quaternary)">
                {MEMORY_KIND_COPY[group.kind]}
              </p>
              <ul className="flex list-none flex-col gap-1 p-0">
                {group.lines.map((line) => (
                  <li
                    className="flex items-start justify-between gap-3 rounded-lg border border-(--ui-stroke-tertiary) px-3 py-2"
                    key={line.id}
                  >
                    <span className="text-[0.7rem] leading-relaxed text-foreground">{line.statement}</span>
                    <button
                      aria-label={`Forget: ${line.statement}`}
                      className="shrink-0 rounded-md bg-transparent px-1.5 py-0.5 text-[0.7rem] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-foreground"
                      onClick={() => void forget(line.id)}
                      type="button"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* 🔴 A CONFIRM STEP, BECAUSE THIS ONE IS NOT RECOVERABLE. Deleting one line is cheap to
              redo by simply mentioning the thing again; wiping a term's worth is not. */}
          <div className="border-t border-(--ui-stroke-tertiary) pt-3">
            {confirmingClear ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.7rem] text-foreground">Forget all {lines.length} of these?</span>
                <button
                  className="rounded-md border border-(--ui-stroke-secondary) px-2 py-1 text-[0.7rem] text-foreground transition-colors hover:bg-(--ui-bg-tertiary)"
                  onClick={() => void clearAll()}
                  type="button"
                >
                  Forget everything
                </button>
                <button
                  className="rounded-md bg-transparent px-2 py-1 text-[0.7rem] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary)"
                  onClick={() => setConfirmingClear(false)}
                  type="button"
                >
                  Keep them
                </button>
              </div>
            ) : (
              <button
                className="rounded-md bg-transparent px-2 py-1 text-[0.7rem] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-foreground"
                onClick={() => setConfirmingClear(true)}
                type="button"
              >
                Forget everything
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
