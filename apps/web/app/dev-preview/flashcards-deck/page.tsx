"use client";

// DEV-ONLY PREVIEW: a deck as the Flashcards tab opens it, in the column beside the sidebar.
//
// The real page sits under the signed-in workspace, so without this the frame around the cards could only be judged
// from its class names. It runs the shipped component on the study store's preview lane (WorkspacePreviewProvider) and
// inside the same column the app uses, with the same face, so the column's tokens (space/styles/host.css) apply here
// exactly as they do in the app.

import "@/space/styles/host.css";

import { Inter } from "next/font/google";
import { useState } from "react";

import { Button } from "@/components/design";
import { FlashcardDeck } from "@/components/space/flashcard-deck";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";

const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-app", display: "swap" });

const DECKS = [
  ["preview-constitutional", "A deck with cards"],
  ["no-such-deck", "A deck that is not here"],
] as const;

export default function FlashcardDeckPreview() {
  const [deckId, setDeckId] = useState<string>(DECKS[0][0]);
  return (
    <WorkspacePreviewProvider value={{ email: "student@preview.dev" }}>
      <div className={`nsp-app-column ${inter.variable}`} style={{ left: "var(--w-sidebar)" }}>
        <div className="h-full" data-workspace="">
          <FlashcardDeck deckId={deckId} key={deckId} onClose={() => setDeckId(DECKS[0][0])} />
        </div>
      </div>
      {/* 🔴 `data-workspace` ON THE PICKER TOO. The tokens resolve on that attribute, and outside it a secondary
          button's label had no ink to take and drew white on white. */}
      <nav className="fixed flex flex-col" data-workspace="" style={{ left: "var(--space-12)", top: "var(--space-12)", gap: "var(--space-8)", zIndex: 2 }}>
        {DECKS.map(([id, label]) => (
          <Button aria-pressed={deckId === id} key={id} onClick={() => setDeckId(id)} size="sm" variant={deckId === id ? "primary" : "secondary"}>
            {label}
          </Button>
        ))}
      </nav>
    </WorkspacePreviewProvider>
  );
}
