// Hiding an image's address while a card is being EDITED, and putting it back
// untouched when the card is saved.
//
// A picture on a flashcard is not an attachment — it is text inside the card's
// own front/back string, either markdown (`![](https://…/m307.png)`, what the
// starter decks ship) or a bare `<img src="…">` (what an Anki import carries;
// see card-text.ts). Those addresses run to ~130 characters. Every OTHER surface
// launders them before you see them — the collapsed row runs the text through
// previewOf, the expanded card renders through the markdown renderer, which
// draws an actual picture — but the edit fields bound the raw string straight
// into a TextInput, so tapping Edit on a card with two images showed a wall of
// storage URL with the student's sentence buried somewhere inside it (owner
// 2026-07-24: "users can see supabase url when editing cards").
//
// So: swap each image for `[image 1]`, `[image 2]`, … on the way in, and swap
// the numbers back for the ORIGINAL matched text on the way out. Reversible by
// construction, and the round trip has to be exact — this text is what gets
// written back to study_cards, so a lossy pass here would quietly destroy the
// pictures on 2,821 cards in one starter deck alone.
//
// Deliberately dependency-free (no react-native imports) so it Deno-tests
// alongside the other pure modules — same convention as lib/cloze-edit.ts.

/** Markdown image, then bare <img> tag. One alternation so a card mixing both
 *  forms is numbered in the order the two actually appear in the text, not
 *  grouped by kind. */
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>/gi;

/** `[image 3]` — the placeholder the student sees. Tolerant of extra spaces,
 *  because the field is editable and someone will retype one by hand. */
const TOKEN_RE = /\[\s*image\s+(\d+)\s*\]/gi;

export interface CardEditText {
  /** What goes in the TextInput. */
  text: string;
  /** The original image substrings, in the order they were found. Index 0 is
   *  `[image 1]` — the token is 1-based because it is read by a person. */
  images: string[];
}

/** Raw stored card text → what the edit field should show. */
export function toEditText(raw: string): CardEditText {
  const images: string[] = [];
  const text = raw.replace(IMAGE_RE, (match) => {
    images.push(match);
    return `[image ${images.length}]`;
  });
  return { images, text };
}

/** Edited field text → what gets written back to the database.
 *
 *  A token with no image behind it stays as literal text rather than becoming
 *  an empty string: that covers both a student who typed "[image 7]" into a
 *  card about image formats, and one who duplicated a token by hand. Losing
 *  their words to a numbering accident would be the worse failure. */
export function fromEditText(text: string, images: readonly string[]): string {
  return text.replace(TOKEN_RE, (match, digits: string) => {
    const index = Number(digits) - 1;
    const image = images[index];
    return image === undefined ? match : image;
  });
}

/** True when the text holds at least one image — lets a caller decide whether
 *  to show "the pictures stay attached" helper copy under the field. */
export function hasCardImage(raw: string): boolean {
  IMAGE_RE.lastIndex = 0;
  return IMAGE_RE.test(raw);
}
