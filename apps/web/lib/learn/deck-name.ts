// What a generated deck is called.
//
// 🔴 IT IS CALLED WHAT IT IS ABOUT. Owner 2026-08-25: *"in the flashcards, it had this title
// called nemesis flashcards, and I don't really need that there. And kinda just need the
// minimalist approach of Anki."*
//
// Two callers were each inventing a name, and both named the deck after the machinery instead of
// the subject: `canvas-deliverables.ts` produced `"<title> · flashcards"` falling back to
// `"Nemesis canvas"`, and `canvas-study-bridge.ts` fell back to `"Learning canvas"`. So an
// untitled canvas made a deck called **"Nemesis canvas · flashcards"**, and that name was then
// printed across the top of every card in it.
//
// 🔴 THE SUFFIX WAS THE WORSE HALF, NOT THE FALLBACK. A deck named "Krebs cycle · flashcards"
// sits on a shelf headed "Flashcard decks", under a filter pill reading "Flashcards", in a list
// of nothing but flashcard decks. The word is already said three times before the name is read.
// Anki names a deck "Pharmacology"; it does not name it "Pharmacology · flashcards".
//
// PURE. No I/O, no Supabase, no React — the rule is a test rather than a promise.

/** Longest deck name `study_decks.name` is given. */
const MAX_DECK_NAME = 120;

/**
 * 🔴 THE FALLBACK NAMES THE ABSENCE, NOT THE PRODUCT. "Untitled deck" tells a learner the deck
 * has no name yet, which is true and which they can fix by renaming it. "Nemesis canvas" told
 * them which tool built it, which they already knew, and which no two decks could be told apart
 * by — an account that made three decks from untitled canvases got three identical names.
 */
export const UNTITLED_DECK = "Untitled deck";

/**
 * Trailing decorations a caller may already have appended. Stripped so that passing an
 * ALREADY-decorated title through here cannot produce "Krebs cycle · flashcards · flashcards",
 * which is exactly what happens the first time somebody calls this with the old name.
 */
const DECORATION = /\s*[·|\-–—:]\s*(flash\s?cards?|cards?|deck)\s*$/i;

/**
 * The deck name for a canvas or document title.
 *
 * 🔴 STRIPPING RUNS TO A FIXED POINT, because "Anatomy · cards · flashcards" is one regex pass
 * away from still carrying a suffix. Bounded by the fact that each pass must shorten the string.
 */
export function deckName(title: string | null | undefined): string {
  let name = (title ?? "").trim();
  for (;;) {
    const stripped = name.replace(DECORATION, "").trim();
    if (stripped === name) break;
    name = stripped;
  }
  // 🔴 A TITLE THAT WAS *ONLY* DECORATION IS NOT A NAME. "Flashcards" strips to "", and an empty
  // name would be saved as an unlabelled row rather than caught here.
  if (!name) return UNTITLED_DECK;
  return name.length > MAX_DECK_NAME ? name.slice(0, MAX_DECK_NAME).trimEnd() : name;
}
