// Batch D: .apkg container parsing. An Anki export is a zip holding a SQLite
// database (collection.anki2 legacy, collection.anki21, or zstd-compressed
// collection.anki21b) plus numbered media files. The SQLite engine (sql.js
// WASM) is injected so the browser loads it lazily from /sql-wasm.js and tests
// use the node build directly. Media never imports — we count it and say so.

import { unzipSync } from "fflate";
import { decompress } from "fzstd";

import { ankiNoteToCard, countImageTags, normalizeAnkiDeckName, splitAnkiFields, type AnkiImportCard, type ResolveImage } from "./anki-text";

export interface ParseAnkiOptions {
  /** When set, `<img>` references resolve to hosted URLs and survive as
   *  markdown images instead of being dropped. */
  resolveImage?: ResolveImage;
}

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
  /** Cards whose ANSWER was a picture — imported, but tagged needs-image. */
  needsImageCount: number;
  /** Cards arriving suspended, exactly as Anki had them. */
  suspendedCount: number;
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

// Modern Anki exports carry TWO databases: collection.anki21b (zstd, the real
// data) plus a legacy collection.anki2 that is often just a one-card stub
// telling old Anki versions to upgrade. The compressed one must win; the
// legacy file is only trusted when it's all we have.
function openCollection(files: Record<string, Uint8Array>, sql: SqlEngine): SqlDatabase {
  const modern = files["collection.anki21b"];
  const plain = files["collection.anki21"] ?? files["collection.anki2"];
  if (modern) {
    try {
      return new sql.Database(decompress(modern));
    } catch {
      if (!plain) throw new Error(NEW_FORMAT_FAILED);
    }
  }
  if (!plain) throw new Error(BAD_FILE);
  try {
    return new sql.Database(plain);
  } catch {
    throw new Error(BAD_FILE);
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

function mediaEntryCount(files: Record<string, Uint8Array>, zipEntryCount: number): number {
  if (zipEntryCount > 0) return zipEntryCount;
  const media = files["media"];
  if (media) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(media)) as unknown;
      if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
    } catch {
      /* new format stores media as compressed protobuf — the zip count covers it */
    }
  }
  return 0;
}

/** Parse a .apkg/.colpkg byte buffer into importable decks of cards. */
export function parseAnkiPackage(bytes: Uint8Array, sql: SqlEngine, options?: ParseAnkiOptions): AnkiImportResult {
  // Real decks ship thousands of media files (the Captain Hook deck: 2,828
  // images in 284 MB). Only the SQLite collection and the media manifest ever
  // get inflated — media entries are counted from the zip directory and
  // skipped, keeping memory flat no matter how image-heavy the deck is.
  let files: Record<string, Uint8Array>;
  let skippedMediaEntries = 0;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (/^\d+$/.test(file.name)) {
          skippedMediaEntries += 1;
          return false;
        }
        return file.name.startsWith("collection") || file.name === "media";
      },
    });
  } catch {
    throw new Error(BAD_FILE);
  }
  const db = openCollection(files, sql);
  try {
    const deckNames = readDeckNames(db);

    // A note renders as one card here even when Anki fans it out (cloze
    // blanks, reversed pairs) — our review flow cycles blanks itself. The
    // lowest-ordinal card decides the deck; extra ordinals mark "reversed".
    // `queue` and `flags` join the projection so a shared deck arrives in the
    // state its owner left it in. Anki: queue -1 is suspended (-2/-3 are buried,
    // a temporary state not worth carrying); the flag colour is the low 3 bits
    // of `flags`. A note fans out to several cards, so it counts as suspended
    // only when EVERY card of it is — one unsuspended cloze means the student
    // is studying that note.
    const noteHome = new Map<number, { did: number; ord: number }>();
    const noteOrdinals = new Map<number, number>();
    const noteSuspended = new Map<number, boolean>();
    const noteFlag = new Map<number, number>();
    // Every real Anki collection has queue and flags. A hand-built or damaged
    // export might not, and losing the parked/marked state is far better than
    // refusing to import the deck at all — so fall back rather than throw.
    const cardRows = (() => {
      try {
        return db.exec("select nid, did, ord, queue, flags from cards")[0];
      } catch {
        return db.exec("select nid, did, ord, 0 as queue, 0 as flags from cards")[0];
      }
    })();
    for (const [rawNid, rawDid, rawOrd, rawQueue, rawFlags] of cardRows?.values ?? []) {
      const nid = Number(rawNid);
      const ord = Number(rawOrd);
      const existing = noteHome.get(nid);
      if (!existing || ord < existing.ord) noteHome.set(nid, { did: Number(rawDid), ord });
      noteOrdinals.set(nid, (noteOrdinals.get(nid) ?? 0) + 1);
      const suspended = Number(rawQueue) === -1;
      noteSuspended.set(nid, (noteSuspended.get(nid) ?? true) && suspended);
      const flag = Number(rawFlags) & 7;
      if (flag > 0 && !noteFlag.get(nid)) noteFlag.set(nid, flag);
    }

    const decks = new Map<string, AnkiImportCard[]>();
    let cardCount = 0;
    let skippedNotes = 0;
    let imageFields = 0;
    let needsImageCount = 0;
    let suspendedCount = 0;
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
      const card = ankiNoteToCard(
        splitAnkiFields(flds),
        typeof rawTags === "string" ? rawTags : "",
        (noteOrdinals.get(nid) ?? 1) > 1,
        options?.resolveImage,
        { flag: noteFlag.get(nid) ?? 0, suspended: noteSuspended.get(nid) === true },
      );
      if (!card) {
        skippedNotes += 1;
        continue;
      }
      const bucket = decks.get(deckName);
      if (bucket) bucket.push(card);
      else decks.set(deckName, [card]);
      cardCount += 1;
      if (card.needsImage) needsImageCount += 1;
      if (card.suspended) suspendedCount += 1;
    }
    if (cardCount === 0) throw new Error("That export has no text cards Nemesis can import.");
    // The legacy stub database contains exactly one "please upgrade" note.
    const firstCard = decks.values().next().value?.[0];
    if (cardCount === 1 && firstCard?.front.includes("Please update to the latest Anki version")) {
      throw new Error(NEW_FORMAT_FAILED);
    }

    return {
      cardCount,
      decks: Array.from(decks.entries())
        .map(([name, cards]) => ({ cards, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      mediaCount: Math.max(mediaEntryCount(files, skippedMediaEntries), imageFields > 0 ? 1 : 0),
      needsImageCount,
      skippedNotes,
      suspendedCount,
    };
  } finally {
    db.close();
  }
}
