"use client";

import { IconCards, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/desktop-ui/badge";
import { Button } from "@/components/desktop-ui/button";
import { EmptyState } from "@/components/desktop-ui/empty-state";
import { Plus } from "@/lib/workspace/icons";
import { isCardDue, useCloudStudy } from "@/lib/workspace/study-cloud-store";
import { cn } from "@/lib/utils";

import { ReviewSession } from "./review-session";
import { StudyCreateDialog, type StudyCreateKind } from "./study-create-dialog";

interface CardsTabProps {
  sourcePath?: string | null;
}

export function CardsTab({ sourcePath }: CardsTabProps) {
  const { cards, decks, deleteDeck, error, reload, selectDeck, selectedDeckId, status } = useCloudStudy();
  const [createKind, setCreateKind] = useState<StudyCreateKind | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const selectedCards = useMemo(() => cards.filter((card) => card.deckId === selectedDeckId), [cards, selectedDeckId]);
  const dueCards = selectedCards.filter((card) => isCardDue(card));

  async function removeSelectedDeck() {
    if (!selectedDeck || !window.confirm(`Delete “${selectedDeck.name}” and all of its cards?`)) return;
    setActionError(null);
    try {
      await deleteDeck(selectedDeck.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Couldn't delete the deck.");
    }
  }

  if (status === "loading" || status === "idle") {
    return <div className="grid flex-1 place-items-center text-xs text-muted-foreground">Loading study decks…</div>;
  }

  if (status === "error") {
    return (
      <div className="grid flex-1 place-items-center px-6">
        <div className="max-w-sm rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center">
          <p className="text-sm font-semibold">Study couldn’t load</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={reload} variant="secondary">Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-6 mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => setCreateKind("deck")} size="sm">
          <Plus size={13} />
          New deck
        </Button>
        <Button disabled={!selectedDeck} onClick={() => setCreateKind("card")} size="sm" variant="outline">
          <IconCards size={13} />
          Add card
        </Button>
        <Button disabled={!selectedDeck || dueCards.length === 0} onClick={() => setReviewOpen(true)} size="sm" variant="outline">
          <IconPlayerPlay size={13} />
          Review {dueCards.length > 0 ? dueCards.length : ""}
        </Button>
      </div>

      {decks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            action={<Button onClick={() => setCreateKind("deck")}>Create your first deck</Button>}
            description={sourcePath ? "Turn this Library note into a linked cloud deck." : "Create a deck to start building a durable review habit."}
            title="No decks yet"
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-5 lg:grid-cols-[minmax(15rem,0.72fr)_minmax(22rem,1.3fr)]">
          <section className="grid content-start gap-2">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Decks</h2>
              <span className="text-[0.6875rem] tabular-nums text-(--ui-text-quaternary)">{decks.length}</span>
            </div>
            {decks.map((deck) => {
              const deckCards = cards.filter((card) => card.deckId === deck.id);
              const due = deckCards.filter((card) => isCardDue(card)).length;
              const active = deck.id === selectedDeckId;
              return (
                <button
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-(--ui-stroke-primary) bg-[color-mix(in_srgb,var(--ui-base)_5%,transparent)]"
                      : "border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) hover:border-(--ui-stroke-secondary) hover:bg-(--chrome-action-hover)",
                  )}
                  key={deck.id}
                  onClick={() => selectDeck(deck.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{deck.name}</p>
                      <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-4 text-muted-foreground">
                        {deck.description || deck.sourcePath || "Cloud study deck"}
                      </p>
                    </div>
                    {due > 0 && <Badge>{due} due</Badge>}
                  </div>
                  <p className="mt-3 text-[0.625rem] tabular-nums text-(--ui-text-quaternary)">{deckCards.length} cards</p>
                </button>
              );
            })}
          </section>

          <section className="min-w-0 rounded-2xl border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-base)_3%,transparent)] p-4">
            {selectedDeck ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold">{selectedDeck.name}</h2>
                      {selectedDeck.sourcePath && <Badge variant="outline">Library linked</Badge>}
                    </div>
                    {selectedDeck.description && <p className="mt-1 text-xs text-muted-foreground">{selectedDeck.description}</p>}
                  </div>
                  <Button aria-label="Delete deck" onClick={() => void removeSelectedDeck()} size="icon-xs" variant="ghost">
                    <IconTrash />
                  </Button>
                </div>
                {actionError && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{actionError}</p>}
                {selectedCards.length === 0 ? (
                  <div className="grid min-h-64 place-items-center text-center">
                    <div>
                      <p className="text-xs font-semibold">This deck is empty</p>
                      <p className="mt-1 text-[0.6875rem] text-muted-foreground">Add the first prompt and answer.</p>
                      <Button className="mt-4" onClick={() => setCreateKind("card")} variant="secondary">Add card</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2">
                    {selectedCards.map((card) => (
                      <article className="rounded-xl border border-(--ui-stroke-tertiary) bg-background/55 p-3" key={card.id}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-xs font-medium leading-5">{card.front}</p>
                          <Badge variant={isCardDue(card) ? "default" : "muted"}>{isCardDue(card) ? "Due" : `${card.intervalDays}d`}</Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[0.6875rem] leading-4 text-muted-foreground">{card.back}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      )}

      <StudyCreateDialog
        deck={selectedDeck}
        kind={createKind ?? "deck"}
        onOpenChange={(open) => !open && setCreateKind(null)}
        open={createKind !== null}
        sourcePath={sourcePath}
      />
      <ReviewSession cards={cards} deck={selectedDeck} onOpenChange={setReviewOpen} open={reviewOpen} />
    </div>
  );
}
