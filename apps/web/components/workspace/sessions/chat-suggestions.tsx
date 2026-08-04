"use client";

// Suggestion chips under the empty-chat composer (owner 2026-08-03, pointing
// at ChatGPT's landing: "the landing page for chat should have suggestions...
// related to what nemesis does"). Each chip SENDS its prompt — no prefill step
// — because the composer is a contenteditable with no controlled value, and a
// suggestion you still have to press Enter on is a form, not a shortcut.
//
// The prompts are FIELD-AGNOSTIC on purpose (works for a law student and a
// mech-eng student alike) and each one exercises a real capability the chat
// already has: calendar lookup, flashcard/test creation, library search.

import { Codicon } from "@/components/desktop-ui/codicon";

interface ChatSuggestion {
  icon: string;
  label: string;
  prompt: string;
}

const CHAT_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    icon: "calendar",
    label: "What's due this week?",
    prompt: "What's coming up on my calendar this week? Anything I should start early?",
  },
  {
    icon: "layers",
    label: "Make flashcards",
    prompt: "Make flashcards from my most recent notes.",
  },
  {
    icon: "checklist",
    label: "Quiz me",
    prompt: "Quiz me: build a short practice test from my most recent course material.",
  },
  {
    icon: "book",
    label: "Summarize a document",
    prompt: "Summarize the newest document in my library and pull out what I need to remember.",
  },
];

export function ChatSuggestions({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2 px-2 duration-300 animate-in fade-in-0 motion-reduce:animate-none" data-slot="chat-suggestions">
      {CHAT_SUGGESTIONS.map((suggestion) => (
        <button
          className="flex items-center gap-1.5 rounded-full border border-(--ui-stroke-tertiary) bg-transparent px-3 py-1.5 text-[0.8125rem] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
          key={suggestion.label}
          onClick={() => onPick(suggestion.prompt)}
          type="button"
        >
          <Codicon className="text-(--ui-text-tertiary)" name={suggestion.icon} size="0.8rem" />
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}
