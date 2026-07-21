// Batch D (owner 2026-07-21): text half of Anki interop. Anki notes store
// fields as HTML joined by the \x1f unit separator; decks nest with "::" in
// legacy exports and \x1f in the newest schema. Import converts HTML to the
// plain markdown-ish text our cards render; export writes the tab-separated
// file Anki's own importer reads (with #notetype/#tags column headers).
// Pure and dependency-light so everything here is unit-testable.

import { hasCloze } from "./study-cloze";

const FIELD_SEPARATOR = "\u001f";
const MAX_FIELD_CHARS = 20_000;

/** Split one note's raw `flds` blob into its individual fields. */
export function splitAnkiFields(flds: string): string[] {
  return flds.split(FIELD_SEPARATOR);
}

/** How many embedded images a raw field mentions (imported cards drop them). */
export function countImageTags(html: string): number {
  return html.match(/<img\b/gi)?.length ?? 0;
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (/^#x/i.test(body)) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return named[body.toLowerCase()] ?? whole;
  });
}

/** Convert one Anki HTML field to plain text, keeping cloze markers and
 *  translating bold/italic to markdown. Media references are dropped. */
export function ankiFieldToText(html: string): string {
  let text = html.slice(0, MAX_FIELD_CHARS * 2);
  text = text.replace(/\[sound:[^\]]*\]/gi, " ");
  text = text.replace(/<img\b[^>]*>/gi, " ");
  // Anchors become markdown links so study resources (Khan Academy, YouTube)
  // stay clickable instead of decaying into the words "YouTube Link".
  text = text.replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (whole, href: string, label: string) => {
    const url = href.trim();
    if (!/^https?:\/\//i.test(url)) return label;
    const clean = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    return clean ? `[${clean.replace(/[[\]]/g, "")}](${url})` : url;
  });
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(?:div|p|li|tr|h[1-6]|ul|ol|table|blockquote)>/gi, "\n");
  text = text.replace(/<li\b[^>]*>/gi, "- ");
  text = text.replace(/<\/?(?:b|strong)(?:\s[^>]*)?>/gi, "**");
  text = text.replace(/<\/?(?:i|em)(?:\s[^>]*)?>/gi, "*");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_FIELD_CHARS);
}

/** Deck names arrive with "::" (legacy) or \x1f (new schema) separators. */
export function normalizeAnkiDeckName(name: string): string {
  return name
    .split(/\u001f|::/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("::");
}

export interface AnkiImportCard {
  front: string;
  back: string;
  cardType: "basic" | "reversed" | "cloze";
  tags: string[];
  /** True when the card's ANSWER was a picture we can't carry over, so the
   *  card arrives flagged instead of silently blank. */
  needsImage: boolean;
}

/** Tag applied to picture-answer cards so students can find them in one
 *  filter and fix or delete them together. */
export const NEEDS_IMAGE_TAG = "needs-image";
const NEEDS_IMAGE_NOTE = "(This card's answer was a picture in Anki. Pictures don't come across yet — open the original deck to see it.)";

/** A cloze whose blank is empty ({{c1:: }}) had its answer inside an image. */
function hasEmptyCloze(text: string): boolean {
  return /\{\{c\d+::\s*(?:::[^}]*)?\}\}/.test(text);
}

/** Turn one note's fields into an importable card. First field = front, the
 *  rest join into the back. Returns null when the front is empty. */
export function ankiNoteToCard(fields: string[], rawTags: string, reversed: boolean): AnkiImportCard | null {
  const [rawFront, ...rest] = fields;
  const front = ankiFieldToText(rawFront ?? "");
  if (!front) return null;
  const back = rest.map(ankiFieldToText).filter(Boolean).join("\n\n");
  const tags = rawTags.trim().split(/\s+/).filter(Boolean);
  const cardType: AnkiImportCard["cardType"] = hasCloze(front) ? "cloze" : reversed ? "reversed" : "basic";
  // Answer lost to a picture: an empty back where the raw fields had an
  // image, or a cloze blank that held nothing but an image.
  const lostToImage = (!back && rest.some((field) => countImageTags(field) > 0)) || hasEmptyCloze(front);
  return {
    back: lostToImage && !back ? NEEDS_IMAGE_NOTE : back,
    cardType,
    front,
    needsImage: lostToImage,
    tags: lostToImage ? [...tags, NEEDS_IMAGE_TAG] : tags,
  };
}

export interface ExportableCard {
  front: string;
  back: string;
  cardType: string;
  tags: string[];
}

/** Quote a field the way Anki's text importer expects (CSV-style quoting). */
export function escapeAnkiField(value: string): string {
  const flat = value.replace(/\r\n?/g, "\n");
  return /[\t\n"]/.test(flat) ? `"${flat.replaceAll('"', '""')}"` : flat;
}

function exportNotetype(card: ExportableCard): string {
  if (card.cardType === "cloze" || hasCloze(card.front)) return "Cloze";
  if (card.cardType === "reversed") return "Basic (and reversed card)";
  return "Basic";
}

export interface AnkiExportFile {
  text: string;
  exported: number;
  /** Image-occlusion cards can't travel as text, so they stay behind. */
  skipped: number;
}

/** Build the Anki-importable text file for one deck's cards. Columns:
 *  front, back, notetype, tags — declared via file headers so Anki maps
 *  them without any manual setup. */
export function buildAnkiExportFile(cards: ExportableCard[]): AnkiExportFile {
  const lines = ["#separator:tab", "#html:false", "#notetype column:3", "#tags column:4"];
  let exported = 0;
  let skipped = 0;
  for (const card of cards) {
    if (card.cardType === "image_occlusion") {
      skipped += 1;
      continue;
    }
    lines.push([escapeAnkiField(card.front), escapeAnkiField(card.back), exportNotetype(card), card.tags.join(" ")].join("\t"));
    exported += 1;
  }
  return { exported, skipped, text: `${lines.join("\n")}\n` };
}
