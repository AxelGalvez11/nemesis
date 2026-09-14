"use client";

// A deck, opened from the Flashcards tab in the sidebar. The screen itself is components/space/flashcard-deck.tsx, so
// the preview page can draw exactly what this route draws.

import { useParams } from "next/navigation";

import { FlashcardDeck } from "@/components/space/flashcard-deck";

export default function FlashcardDeckPage() {
  const params = useParams<{ id: string }>();
  return <FlashcardDeck deckId={params.id} />;
}
