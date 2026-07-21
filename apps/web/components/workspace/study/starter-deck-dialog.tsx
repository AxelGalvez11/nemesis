"use client";

// Starter decks: curated decks made by Nemesis that any member can add with
// one click. The card text ships as a static JSON under public/ and images
// are hosted once in the public starter-deck-media bucket, so "adding" just
// copies card rows into the student's own decks — no file, no upload.

import { IconBooks, IconCheck } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/desktop-ui/dialog";
import { parseStarterDeckPayload, STARTER_DECKS, starterDeckOwned, type StarterDeckMeta } from "@/lib/workspace/starter-decks";
import { useCloudStudy } from "@/lib/workspace/study-cloud-store";

interface StarterDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "fetching"; id: string }
  | { kind: "importing"; id: string; done: number; total: number }
  | { kind: "done"; id: string; cardCount: number; deckCount: number };

export function StarterDeckDialog({ open, onOpenChange }: StarterDeckDialogProps) {
  const { decks, importAnkiDecks } = useCloudStudy();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const busy = phase.kind === "fetching" || phase.kind === "importing";
  const deckNames = decks.map((deck) => deck.name);

  function close(next: boolean) {
    if (!next && busy) return;
    onOpenChange(next);
    if (!next) {
      setPhase({ kind: "idle" });
      setError(null);
    }
  }

  async function add(meta: StarterDeckMeta) {
    setError(null);
    setPhase({ kind: "fetching", id: meta.id });
    try {
      const response = await fetch(meta.file);
      if (!response.ok) throw new Error("This starter deck couldn't be downloaded. Check your connection and try again.");
      const payload = parseStarterDeckPayload(await response.json());
      setPhase({ done: 0, id: meta.id, kind: "importing", total: meta.cardCount });
      const summary = await importAnkiDecks(payload, (done, total) => setPhase({ done, id: meta.id, kind: "importing", total }));
      setPhase({ cardCount: summary.cardCount, deckCount: summary.deckCount, id: meta.id, kind: "done" });
    } catch (cause) {
      setPhase({ kind: "idle" });
      setError(cause instanceof Error ? cause.message : "Something went wrong adding this deck.");
    }
  }

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="max-w-xl" data-testid="starter-deck-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><IconBooks size={18} /> Starter decks</DialogTitle>
          <DialogDescription>Ready-made decks by Nemesis. Adding one copies it into your own decks — edit or delete anything.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {STARTER_DECKS.map((meta) => {
            const owned = starterDeckOwned(meta, deckNames);
            const active = phase.kind !== "idle" && phase.id === meta.id;
            return (
              <div className="grid gap-2 rounded-xl border border-(--ui-stroke-tertiary) bg-background p-4" key={meta.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <span className="text-sm font-semibold">{meta.title}</span>
                    <span className="text-xs text-(--ui-text-tertiary)">{meta.author} · {meta.subject}</span>
                  </div>
                  {phase.kind === "done" && active ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-(--ui-text-secondary)" data-testid="starter-deck-done">
                      <IconCheck size={14} /> Added
                    </span>
                  ) : (
                    <Button
                      data-testid={`starter-add-${meta.id}`}
                      disabled={busy}
                      onClick={() => void add(meta)}
                      size="sm"
                      variant="secondary"
                    >
                      {active && phase.kind === "fetching" ? "Preparing…" : owned ? "Add again" : "Add to my decks"}
                    </Button>
                  )}
                </div>
                <p className="text-xs leading-5 text-(--ui-text-secondary)">{meta.description}</p>
                <span className="text-xs text-(--ui-text-tertiary)">
                  {meta.cardCount.toLocaleString()} cards · {meta.deckCount.toLocaleString()} decks · pictures included
                </span>
                {owned && phase.kind !== "done" && (
                  <span className="text-xs text-(--ui-text-tertiary)">Already in your decks — adding again makes a second copy.</span>
                )}
                {active && phase.kind === "importing" && (
                  <div className="grid gap-1" data-testid="starter-deck-progress">
                    <div className="h-1.5 overflow-hidden rounded-full bg-(--ui-bg-secondary)">
                      <div
                        className="h-full rounded-full bg-[var(--theme-primary)] transition-[width]"
                        style={{ width: `${phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-(--ui-text-tertiary)">
                      Adding {phase.done.toLocaleString()} of {phase.total.toLocaleString()} cards…
                    </span>
                  </div>
                )}
                {phase.kind === "done" && active && (
                  <span className="text-xs text-(--ui-text-secondary)">
                    Added {phase.cardCount.toLocaleString()} cards across {phase.deckCount.toLocaleString()} decks. They're in your deck list now.
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button disabled={busy} onClick={() => close(false)} type="button" variant="ghost">
            {phase.kind === "done" ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
