// Starter decks: curated decks every member can add to their Study page with
// one click. Card text ships as a static JSON file in public/ (versioned with
// the app, compressed by the CDN); images live once in the public
// starter-deck-media storage bucket, so adding a deck copies rows, not
// megabytes. Content here is owned by Nemesis — never third-party decks.

export interface StarterDeckMeta {
  id: string;
  title: string;
  description: string;
  author: string;
  subject: string;
  cardCount: number;
  deckCount: number;
  imageCount: number;
  /** Static payload path under public/. */
  file: string;
  /** The alphabetically-first deck name in the payload — used to badge decks
   *  the student already added (import keeps names, suffixing only on clash). */
  ownedMarker: string;
}

export const STARTER_DECKS: StarterDeckMeta[] = [
  {
    id: "captain-hook",
    title: "Captain Hook MCAT Deck",
    description:
      "A complete MCAT review: essential equations, chemistry and physics, biology and biochemistry, psychology and sociology, plus AAMC practice-exam error cards. Pictures included.",
    author: "Made by the Nemesis founder",
    subject: "MCAT",
    cardCount: 6487,
    deckCount: 90,
    imageCount: 2821,
    file: "/starter-decks/captain-hook.json",
    ownedMarker: "Captain Hook MCAT::0 - Essential Equations",
  },
];

export interface StarterDeckCard {
  front: string;
  back: string;
  cardType: "basic" | "reversed" | "cloze";
  tags: string[];
}

export interface StarterDeckPayloadDeck {
  name: string;
  cards: StarterDeckCard[];
}

const CARD_TYPES = new Set(["basic", "reversed", "cloze"]);

/** Validate a fetched starter-deck payload into importable decks. Throws in
 *  plain English on any malformed shape so the dialog can show it directly. */
export function parseStarterDeckPayload(raw: unknown): StarterDeckPayloadDeck[] {
  const badFile = "This starter deck couldn't be read. Refresh and try again.";
  if (!raw || typeof raw !== "object") throw new Error(badFile);
  const decks = (raw as { decks?: unknown }).decks;
  if (!Array.isArray(decks) || decks.length === 0) throw new Error(badFile);
  const parsed: StarterDeckPayloadDeck[] = [];
  for (const deck of decks) {
    if (!deck || typeof deck !== "object") throw new Error(badFile);
    const { name, cards } = deck as { name?: unknown; cards?: unknown };
    if (typeof name !== "string" || !name.trim() || !Array.isArray(cards)) throw new Error(badFile);
    const parsedCards: StarterDeckCard[] = [];
    for (const card of cards) {
      if (!card || typeof card !== "object") throw new Error(badFile);
      const { front, back, cardType, tags } = card as { front?: unknown; back?: unknown; cardType?: unknown; tags?: unknown };
      if (typeof front !== "string" || !front || typeof back !== "string") throw new Error(badFile);
      if (typeof cardType !== "string" || !CARD_TYPES.has(cardType)) throw new Error(badFile);
      parsedCards.push({
        back,
        cardType: cardType as StarterDeckCard["cardType"],
        front,
        tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [],
      });
    }
    if (parsedCards.length > 0) parsed.push({ cards: parsedCards, name: name.trim() });
  }
  if (parsed.length === 0) throw new Error(badFile);
  return parsed;
}

/** Whether the student's existing deck names suggest this starter deck was
 *  already added (exact match on the marker deck name). */
export function starterDeckOwned(meta: StarterDeckMeta, existingDeckNames: readonly string[]): boolean {
  const marker = meta.ownedMarker.toLowerCase();
  return existingDeckNames.some((name) => name.toLowerCase() === marker);
}
