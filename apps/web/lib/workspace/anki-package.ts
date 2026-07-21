// Batch D: .apkg container parsing. An Anki export is a zip holding a SQLite
// database (collection.anki2 legacy, collection.anki21, or zstd-compressed
// collection.anki21b) plus numbered media files. The SQLite engine (sql.js
// WASM) is injected so the browser loads it lazily from /sql-wasm.js and tests
// use the node build directly. Media never imports — we count it and say so.

import { unzipSync } from "fflate";
import { decompress } from "fzstd";

import { ankiNoteToCard, countImageTags, normalizeAnkiDeckName, splitAnkiFields, type AnkiImportCard } from "./anki-text";

export interface AnkiImportDeck {
  name: string;
  cards: AnkiImportCard[];
}

export interface AnkiImportResult {
  decks: AnkiImportDeck[];
  /** Cards ready to import, across all decks. */
  cardCount: number;
  /** Notes dropped for having an empty front or no deck. */
  skippedNotes: number;
  /** Media files (audio/images) present in the package but not imported. */
  mediaCount: number;
}

// The slice of sql.js we depend on — kept minimal so the loader can vend the
// browser build and tests can vend the node build behind the same shape.
export interface SqlRows {
  columns: string[];
  values: unknown[][];
}
export interface SqlDatabase {
  exec(sql: string): SqlRows[];
  close(): void;
}
export interface SqlEngine {
  Database: new (data?: Uint8Array) => SqlDatabase;
}

const BAD_FILE = "That file doesn't look like an Anki deck export (.apkg).";
const NEW_FORMAT_FAILED =
  'This export uses Anki\'s newest format and couldn\'t be opened. In Anki, export again with "Support older Anki versions" checked.';

function openCollection(files: Record<string, Uint8Array>, sql: SqlEngine): SqlDatabase {
  const plain = files["collection.anki21"] ?? files["collection.anki2"];
  if (plain) {
    try {
      return new sql.Database(plain);
    } catch {
      throw new Error(BAD_FILE);
    }
  }
  const compressed = files["collection.anki21b"];
  if (!compressed) throw new Error(BAD_FILE);
  try {
    return new sql.Database(decompress(compressed));
  } catch {
    throw new Error(NEW_FORMAT_FAILED);
  }
}

function readDeckNames(db: SqlDatabase): Map<number, string> {
  const names = new Map<number, string>();
  try {
    const rows = db.exec("select id, name from decks")[0];
    for (const [id, name] of rows?.values ?? []) {
      if (typeof name === "string") names.set(Number(id), normalizeAnkiDeckName(name));
    }
  } catch {
    /* legacy schema keeps decks as JSON on the col table */
  }
  if (names.size > 0) return names;
  try {
    const rows = db.exec("select decks from col")[0];
    const raw = rows?.values?.[0]?.[0];
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw) as Record<string, { name?: unknown }>;
      for (const [id, deck] of Object.entries(parsed)) {
        if (deck && typeof deck.name === "string") names.set(Number(id), normalizeAnkiDeckName(deck.name));
      }
    }
  } catch {
    /* fall through to the shared error below */
  }
  if (names.size === 0) throw new Error(BAD_FILE);
  return names;
}

function mediaEntryCount(files: Record<string, Uint8Array>): number {
  const media = files["media"];
  if (media) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(media)) as unknown;
      if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
    } catch {
      /* new format stores media as compressed protobuf — fall back to counting entries */
    }
  }
  return Object.keys(files).filter((name) => /^\d+$/.test(name)).length;
}

/** Parse a .apkg/.colpkg byte buffer into importable decks of cards. */
export function parseAnkiPackage(bytes: Uint8Array, sql: SqlEngine): AnkiImportResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error(BAD_FILE);
  }
  const db = openCollection(files, sql);
  try {
    const deckNames = readDeckNames(db);

    // A note renders as one card here even when Anki fans it out (cloze
    // blanks, reversed pairs) — our review flow cycles blanks itself. The
    // lowest-ordinal card decides the deck; extra ordinals mark "reversed".
    const noteHome = new Map<number, { did: number; ord: number }>();
    const noteOrdinals = new Map<number, number>();
    const cardRows = db.exec("select nid, did, ord from cards")[0];
    for (const [rawNid, rawDid, rawOrd] of cardRows?.values ?? []) {
      const nid = Number(rawNid);
      const ord = Number(rawOrd);
      const existing = noteHome.get(nid);
      if (!existing || ord < existing.ord) noteHome.set(nid, { did: Number(rawDid), ord });
      noteOrdinals.set(nid, (noteOrdinals.get(nid) ?? 0) + 1);
    }

    const decks = new Map<string, AnkiImportCard[]>();
    let cardCount = 0;
    let skippedNotes = 0;
    let imageFields = 0;
    const noteRows = db.exec("select id, flds, tags from notes")[0];
    for (const [rawId, rawFlds, rawTags] of noteRows?.values ?? []) {
      const nid = Number(rawId);
      const home = noteHome.get(nid);
      const flds = typeof rawFlds === "string" ? rawFlds : "";
      const deckName = home ? deckNames.get(home.did) : undefined;
      if (!home || !deckName) {
        skippedNotes += 1;
        continue;
      }
      imageFields += countImageTags(flds);
      const card = ankiNoteToCard(splitAnkiFields(flds), typeof rawTags === "string" ? rawTags : "", (noteOrdinals.get(nid) ?? 1) > 1);
      if (!card) {
        skippedNotes += 1;
        continue;
      }
      const bucket = decks.get(deckName);
      if (bucket) bucket.push(card);
      else decks.set(deckName, [card]);
      cardCount += 1;
    }
    if (cardCount === 0) throw new Error("That export has no text cards Nemesis can import.");

    return {
      cardCount,
      decks: Array.from(decks.entries())
        .map(([name, cards]) => ({ cards, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      mediaCount: Math.max(mediaEntryCount(files), imageFields > 0 ? 1 : 0),
      skippedNotes,
    };
  } finally {
    db.close();
  }
}
