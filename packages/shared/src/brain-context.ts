import {
  UNTRUSTED_CONTENT_RULE,
  wrapUntrusted,
} from "./untrusted-content.ts";
import { contentWords, sharesVocabulary } from "./word-overlap.ts";

export interface BrainNoteHit {
  chunk_index?: number;
  content: string;
  document_id: string;
  path: string;
  similarity: number;
  title: string;
}

export interface BrainLinkedNote {
  content: string;
  id: string;
  path: string;
  title: string;
  updated_at?: string;
}

export interface BrainConnection {
  id: string;
  origin?: string;
  relation: string;
  source_document_id: string;
  target_document_id: string | null;
  target_ref: string;
}

export interface BrainCalendarEvent {
  course?: string | null;
  date: string;
  id: string;
  kind?: string;
  note?: string | null;
  time?: string | null;
  title: string;
}

export interface BrainWeakCard {
  back?: string;
  due_at?: string;
  front: string;
  id: string;
  lapses: number;
  source_path?: string | null;
  study_decks?: { name?: string } | Array<{ name?: string }> | null;
}

export interface BrainProposal {
  action: string;
  confidence: number;
  created_at: string;
  id: string;
  reason: string;
  relation?: string | null;
  source_document_id?: string | null;
  target_document_id?: string | null;
  trigger_kind?: string;
}

export interface BrainContext {
  connections: BrainConnection[];
  events: BrainCalendarEvent[];
  linkedNotes: BrainLinkedNote[];
  notes: BrainNoteHit[];
  proposals: BrainProposal[];
  provenance: unknown[];
  weakCards: BrainWeakCard[];
}

const EMPTY_CONTEXT: BrainContext = {
  connections: [],
  events: [],
  linkedNotes: [],
  notes: [],
  proposals: [],
  provenance: [],
  weakCards: [],
};

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row)
    )
    : [];
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/** Parse the Edge Function response defensively at the shared app boundary. */
export function brainContextFrom(value: unknown): BrainContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const notes = records(root.notes).flatMap((row) => {
    const documentId = stringOf(row.document_id);
    const path = stringOf(row.path);
    const content = stringOf(row.content);
    if (!documentId || !path || !content.trim()) return [];
    return [{
      chunk_index: numberOf(row.chunk_index),
      content,
      document_id: documentId,
      path,
      similarity: numberOf(row.similarity),
      title: stringOf(row.title),
    }];
  });
  return {
    connections: records(root.connections).flatMap((row) => {
      const id = stringOf(row.id);
      const source = stringOf(row.source_document_id);
      const relation = stringOf(row.relation);
      const targetRef = stringOf(row.target_ref);
      if (!id || !source || !relation || !targetRef) return [];
      return [{
        id,
        origin: stringOf(row.origin),
        relation,
        source_document_id: source,
        target_document_id: stringOf(row.target_document_id) || null,
        target_ref: targetRef,
      }];
    }),
    events: records(root.events).flatMap((row) => {
      const id = stringOf(row.id);
      const date = stringOf(row.date);
      const title = stringOf(row.title);
      if (!id || !date || !title) return [];
      return [{
        course: stringOf(row.course) || null,
        date,
        id,
        kind: stringOf(row.kind),
        note: stringOf(row.note) || null,
        time: stringOf(row.time) || null,
        title,
      }];
    }),
    linkedNotes: records(root.linkedNotes).flatMap((row) => {
      const id = stringOf(row.id);
      const path = stringOf(row.path);
      if (!id || !path) return [];
      return [{
        content: stringOf(row.content),
        id,
        path,
        title: stringOf(row.title),
        updated_at: stringOf(row.updated_at),
      }];
    }),
    notes,
    proposals: records(root.proposals).flatMap((row) => {
      const id = stringOf(row.id);
      const action = stringOf(row.action);
      const reason = stringOf(row.reason);
      if (!id || !action || !reason) return [];
      return [{
        action,
        confidence: numberOf(row.confidence),
        created_at: stringOf(row.created_at),
        id,
        reason,
        relation: stringOf(row.relation) || null,
        source_document_id: stringOf(row.source_document_id) || null,
        target_document_id: stringOf(row.target_document_id) || null,
        trigger_kind: stringOf(row.trigger_kind),
      }];
    }),
    provenance: Array.isArray(root.provenance) ? root.provenance : [],
    weakCards: records(root.weakCards).flatMap((row) => {
      const id = stringOf(row.id);
      const front = stringOf(row.front);
      if (!id || !front) return [];
      return [{
        back: stringOf(row.back),
        due_at: stringOf(row.due_at),
        front,
        id,
        lapses: numberOf(row.lapses),
        source_path: stringOf(row.source_path) || null,
        study_decks: row.study_decks as BrainWeakCard["study_decks"],
      }];
    }),
  };
}

/**
 * Is there anything here worth looking up?
 *
 * 🔴 A SUBJECT, NOT A WORD LIST. This used to hold a set of twenty-three English acknowledgements
 * — ok, kk, ty, thx, cheers, got it, cool, nice, hi, hey — and skip the lookup when the whole
 * message was one of them. It was the cheapest possible version of the defect: English-only, so
 * "gracias" and "ありがとう" each bought a semantic search over the student's Library, and blind to
 * anything not on the list, so "lol ok whatever" bought one too.
 *
 * The turn's own decision already says whether the message has a subject (`topic`) and whether it
 * touches their workspace, and a message with neither has nothing to look up. Passing those in is
 * strictly better information than the list was, and it costs nothing: the decision was read for
 * this turn anyway.
 */
export function shouldRecallBrain(input: { topic: string | null; workspaceTurn: boolean }): boolean {
  return Boolean(input.topic?.trim()) || input.workspaceTurn;
}

function displayName(title: string, path: string): string {
  if (title.trim()) return title.trim();
  return (path.split("/").filter(Boolean).pop() ?? path)
    .replace(/\.(md|markdown|txt)$/i, "");
}

function deckName(card: BrainWeakCard): string {
  const deck = Array.isArray(card.study_decks)
    ? card.study_decks[0]
    : card.study_decks;
  return deck?.name?.trim() || "Study";
}

/**
 * A bounded, injection-fenced context packet shared by web and iOS chat.
 * Notes carry the semantic answer, graph neighbors add one-hop structure,
 * Calendar adds deadlines, and Study adds demonstrated weak spots.
 *
 * 🔴 `query` IS NOT OPTIONAL DECORATION. Calendar and Study rows used to ride
 * along on EVERY turn regardless of what was asked — the edge function fetches
 * 20 events and the 12 most-failed cards with no filter of any kind, and this
 * formatter printed the first 8 and 6 of them unconditionally. Ask "make
 * flashcards from this recording" and the nearest text to the request was a
 * list of unrelated deadlines and someone's worst cards, which is exactly the
 * decoy that produced twenty cards on the wrong subject.
 *
 * So a Calendar or Study row now has to earn its place: either the student is
 * asking about their schedule or their progress, or the row shares real
 * vocabulary with what they typed. Everything else is dropped — and dropping it
 * costs nothing now that the chat has list_calendar_events, list_study_decks
 * and read_study_deck to go and fetch on purpose.
 */
export function formatBrainContext(
  context: BrainContext | null,
  query: string,
  /**
   * This turn needs the student's own workspace — their calendar, Library or Study state.
   *
   * 🔴 IT REPLACES TWO KEYWORD LISTS. `SCHEDULE_ASK` matched due|deadline|calendar|today|tomorrow|
   * this week|semester and `PROGRESS_ASK` matched weak|struggling|behind|forgetting|cramming, and
   * between them they decided whether Calendar rows and weak cards earned their place in the
   * packet. Both were reading what the student meant, one word at a time, and the file's own
   * comment records the fix they needed: "exam", "test" and "quiz" had to be REMOVED from the
   * schedule list, because "make me a practice test" then read as a question about the timetable
   * and pulled in the whole calendar as a decoy.
   *
   * The turn's own decision already answers this (`workspace !== "none"`, see chat-intent.ts), so
   * it is passed in rather than re-derived. Defaults to false, which is the conservative reading:
   * a caller that has not decided gets the vocabulary filter alone, exactly as an ordinary turn
   * always did.
   */
  workspaceTurn = false,
): string {
  if (!context) return "";
  const asked = contentWords(query);
  const notes = [...context.notes]
    .sort((a, b) => b.similarity - a.similarity)
    .filter((hit, index, rows) =>
      rows.findIndex((row) =>
        row.document_id === hit.document_id &&
        row.chunk_index === hit.chunk_index
      ) === index
    )
    .slice(0, 6);
  const primaryIds = new Set(notes.map((note) => note.document_id));
  const linked = context.linkedNotes
    .filter((note) => !primaryIds.has(note.id))
    .slice(0, 5);
  const events = context.events
    .filter((event) =>
      workspaceTurn ||
      sharesVocabulary(
        asked,
        `${event.title} ${event.course ?? ""} ${event.kind ?? ""} ${event.note ?? ""}`,
      )
    )
    .slice(0, 8);
  const weakCards = context.weakCards
    .filter((card) =>
      workspaceTurn ||
      sharesVocabulary(asked, `${card.front} ${card.back ?? ""} ${deckName(card)}`)
    )
    .slice(0, 6);
  const sections: string[] = [];

  if (notes.length) {
    sections.push(
      "Semantically matching Library notes:\n" +
        notes.map((note, index) =>
          wrapUntrusted(
            `${index + 1}. ${displayName(note.title, note.path)} (${note.path})`,
            note.content.slice(0, 800),
          )
        ).filter(Boolean).join("\n\n"),
    );
  }
  if (linked.length) {
    sections.push(
      "One-hop linked notes:\n" +
        linked.map((note, index) =>
          wrapUntrusted(
            `${index + 1}. ${displayName(note.title, note.path)} (${note.path})`,
            note.content.slice(0, 500),
          )
        ).filter(Boolean).join("\n\n"),
    );
  }
  if (context.connections.length) {
    const titleById = new Map<string, string>([
      ...notes.map((note) => [
        note.document_id,
        displayName(note.title, note.path),
      ] as const),
      ...linked.map((note) => [
        note.id,
        displayName(note.title, note.path),
      ] as const),
    ]);
    const lines = context.connections.slice(0, 12).map((edge) => {
      const source = titleById.get(edge.source_document_id) ??
        edge.source_document_id;
      const target = edge.target_document_id
        ? titleById.get(edge.target_document_id) ?? edge.target_ref
        : edge.target_ref;
      return `- ${source} —${edge.relation}→ ${target}`;
    });
    sections.push(`Knowledge-graph relationships:\n${lines.join("\n")}`);
  }
  if (events.length) {
    sections.push(
      "Upcoming Calendar events (next 30 days):\n" +
        events.map((event) =>
          `- ${event.date}${event.time ? ` ${event.time}` : ""}: ${event.title}` +
          `${event.course ? ` (${event.course})` : ""}`
        ).join("\n"),
    );
  }
  if (weakCards.length) {
    sections.push(
      "Study concepts with repeated misses:\n" +
        weakCards.map((card) =>
          `- ${deckName(card)} · ${card.front.slice(0, 180)} · ${card.lapses} lapses` +
          `${card.source_path ? ` · source ${card.source_path}` : ""}`
        ).join("\n"),
    );
  }
  if (!sections.length) return "";

  return [
    "Nemesis second-brain context from this student's own Library, Calendar, and Study history. " +
    "Use only the parts relevant to the question. Prefer their course notes when answering about their course, name the note used, and do not pretend this packet is the whole Library. " +
    "Dates are real upcoming events; repeated misses are learning signals, not proof the student lacks knowledge.",
    UNTRUSTED_CONTENT_RULE,
    ...sections,
  ].join("\n\n");
}

export function emptyBrainContext(): BrainContext {
  return { ...EMPTY_CONTEXT };
}

