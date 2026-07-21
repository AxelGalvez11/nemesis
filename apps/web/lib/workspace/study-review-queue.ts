// Session queue for flashcard review. Due cards come first; cards graded
// "Again" re-enter at the back of the same session (Anki relearning) even
// though their stored due date already moved out; an undone card jumps to the
// front so the reviewer can re-grade it immediately.

export interface ReviewQueueCard {
  id: string;
  deckId: string;
  dueAt: string;
  suspended: boolean;
}

export interface ReviewQueueInput<T extends ReviewQueueCard> {
  cards: T[];
  deckId: string | null;
  passedIds: readonly string[];
  retryIds: readonly string[];
  priorityId?: string | null;
  now?: Date;
}

export function buildReviewQueue<T extends ReviewQueueCard>({ cards, deckId, passedIds, retryIds, priorityId = null, now }: ReviewQueueInput<T>): T[] {
  if (!deckId) return [];
  const at = (now ?? new Date()).getTime();
  const inDeck = (card: T) => card.deckId === deckId && !card.suspended;
  const due = cards.filter(
    (card) =>
      inDeck(card) &&
      new Date(card.dueAt).getTime() <= at &&
      card.id !== priorityId &&
      !passedIds.includes(card.id) &&
      !retryIds.includes(card.id),
  );
  const retries = retryIds
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is T => Boolean(card && inDeck(card) && card.id !== priorityId));
  const priority = priorityId ? cards.find((card) => card.id === priorityId && inDeck(card)) : undefined;
  return [...(priority ? [priority] : []), ...due, ...retries];
}
