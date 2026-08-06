// Session queue for flashcard review. Due cards come first; cards graded
// "Again" re-enter the same session (Anki relearning) even though their stored
// due date already moved out; an undone card jumps to the front so the reviewer
// can re-grade it immediately.
//
// 🔴 `now` is a parameter, not a call to the clock inside the caller's memo.
// The queue must only be allowed to change at a card boundary. If it advanced
// on a timer, a card becoming due mid-card could land at the head of `due` —
// which is ordered by the `cards` array, not by date — and swap the card out
// from under the reviewer's hand mid-answer. The caller therefore holds `now`
// as state and moves it when it grades or undoes.

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
  const dueBy = (card: T) => new Date(card.dueAt).getTime();
  const due = cards.filter(
    (card) =>
      inDeck(card) &&
      dueBy(card) <= at &&
      card.id !== priorityId &&
      !passedIds.includes(card.id) &&
      !retryIds.includes(card.id),
  );

  // Retries keep the order they were failed in, but a card whose relearning
  // step has not arrived yet waits behind the work that is actually ready.
  // Before this, retries had no date check at all, so a card failed seconds ago
  // came straight back — which made "Again" scheduling a step (10 minutes)
  // meaningless inside the sitting.
  const retries = retryIds
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is T => Boolean(card && inDeck(card) && card.id !== priorityId));
  const readyRetries = retries.filter((card) => dueBy(card) <= at);
  // Soonest first, so when waiting retries are all that is left the reviewer
  // meets them in the order they come due.
  const waitingRetries = retries.filter((card) => dueBy(card) > at).sort((a, b) => dueBy(a) - dueBy(b));

  const priority = priorityId ? cards.find((card) => card.id === priorityId && inDeck(card)) : undefined;

  // Waiting retries stay in the queue rather than being dropped. While other
  // work exists they sit behind it and never reach the head; once it runs out
  // they surface early rather than the session claiming to be finished with
  // cards still owed. A session that falsely reports itself done is the worse
  // failure — the reviewer has no way to get those cards back.
  return [...(priority ? [priority] : []), ...due, ...readyRetries, ...waitingRetries];
}
