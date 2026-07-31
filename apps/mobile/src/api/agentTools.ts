// The phone chat's workspace tools, executed. The schemas and the pure argument
// handling live in lib/agent-tools.ts; this file is the I/O half.
//
// WHY THESE GO THROUGH cloudLibrary/cloudStudy INSTEAD OF RAW INSERTS. The phone
// keeps an on-disk cache of the Library so it opens instantly and works offline. A
// note written straight into Supabase would be correct in the cloud and MISSING
// from that cache, so the student would ask chat to write a note, be told it was
// written, open the Library, and see nothing until the next network fetch landed.
// The existing helpers already do the cloud write and the cache write together,
// which is exactly what a tool needs — so they are the callers here, not
// `supabase.from(...)` directly. The web's copy of these tools writes directly
// because a browser has no such cache to keep in step.
//
// EVERY TOOL RESOLVES. A tool never throws: a failure comes back as `{error}` so
// the model can tell the student what went wrong, or try a different tool, instead
// of the whole turn dying with an empty bubble. Error strings are written for the
// student, because the model repeats them almost verbatim.
import {
  calendarEventPatch,
  deckDeletionVerdict,
  isPatchFailure,
  noteReplacementBody,
  workspaceId,
} from "@nemesis/shared";
import { supabase } from "./supabase";
import {
  createFolder,
  createNoteWithContent,
  deleteNote,
  fetchLibrary,
  fetchNote,
  moveNote,
  renameNote,
  updateNoteContent,
  type CloudLibraryNote,
  type CloudLibrarySnapshot,
} from "./cloudLibrary";
import {
  deleteCalendarEvent as deleteCloudCalendarEvent,
  updateCalendarEvent as updateCloudCalendarEvent,
} from "./cloudCalendar";
import type { AgendaEventKind } from "@/lib/agenda";
import {
  deleteStudyCard,
  deleteStudyDeck as deleteCloudStudyDeck,
  fetchCloudStudy,
  renameStudyDeck as renameCloudStudyDeck,
  updateStudyCard,
} from "./cloudStudy";
import {
  createStudyMindmap,
  createStudyTest,
  deleteStudyArtifact as deleteCloudStudyArtifact,
} from "./studyArtifacts";
import {
  clip,
  deckNameParts,
  isAgentToolName,
  matchDeckName,
  MAX_LIST,
  parseToolArgs,
  str,
  usableCards,
  usableSlides,
  type AgentToolName,
} from "@/lib/agent-tools";
import {
  GENERATED_NOTES_FOLDER,
  GENERATED_SLIDES_FOLDER,
  GENERATED_TESTS_GROUP,
} from "@/lib/academic-skills";
import { qualityPracticeQuestions } from "@/lib/item-writing";

export interface AgentToolCall {
  id: string;
  name: string;
  /** Raw JSON string from the model. */
  arguments: string;
}

/** Everything a handler is given: the signed-in user (every mobile cloud helper
 *  takes it explicitly) and the model's parsed arguments. */
interface ToolContext {
  uid: string;
  args: Record<string, unknown>;
}

type ToolHandler = (context: ToolContext) => Promise<unknown>;

// ── library ────────────────────────────────────────────────────────────────────

/** Substring search over the student's own notes.
 *
 *  Lexical only. The web's copy also calls a semantic (embedding) arm through
 *  /api/v1/library/search and merges the two; the phone has no route to that
 *  today, and a tool that quietly returned fewer results than the same question
 *  on the laptop is better than one that pretends otherwise — so this is
 *  deliberately the simple arm, and the description tells the model it matches
 *  title and text. Worth upgrading when the phone gets that endpoint. */
async function searchLibrary({ args }: ToolContext) {
  const query = str(args.query).trim();
  if (!query) return { error: "Give me something to search for." };
  // ilike patterns treat % and _ as wildcards; a student searching for "50%" must
  // not match everything.
  const escaped = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("id,path,title,content")
    .eq("deleted", false)
    .eq("kind", "note")
    .or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)
    .limit(MAX_LIST);
  if (error) return { error: error.message };
  const notes = (data ?? []).map((row) => {
    const content = str(row.content);
    const at = content.toLowerCase().indexOf(query.toLowerCase());
    // A window around the hit, not the first 160 characters — the whole point is
    // to show the model the part that matched.
    const snippet = at >= 0 ? content.slice(Math.max(0, at - 80), at + 160) : content.slice(0, 160);
    // id is the stable handle; path is rewritten by rename and move.
    return { id: str(row.id), path: str(row.path), snippet: snippet.trim(), title: str(row.title) };
  });
  return notes.length > 0 ? { notes } : { notes: [], note: `Nothing in the Library matches '${query}'.` };
}

async function readLibraryNote({ args }: ToolContext) {
  const path = str(args.path).trim();
  if (!path) return { error: "Which note? Use search_library to get its path." };
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("id,path,title,content")
    .eq("deleted", false)
    .eq("path", path)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No note at '${path}'. Use search_library to find the right path.` };
  return { content: clip(str(data.content)), id: str(data.id), path: str(data.path), title: str(data.title) };
}

async function createLibraryNote({ args, uid }: ToolContext) {
  const title = str(args.title).trim();
  const content = str(args.content);
  if (!title) return { error: "A note needs a title." };
  if (!content.trim()) return { error: "A note needs a body — write the markdown yourself." };
  const folder = str(args.folder).trim() || GENERATED_NOTES_FOLDER;
  const note = await createNoteWithContent(uid, title, content, folder);
  return {
    artifact: { id: note.id, kind: "other", route: `/note?id=${encodeURIComponent(note.id)}`, title: note.title },
    created: true,
    path: note.path,
    title: note.title,
  };
}

async function createSlideDeck({ args, uid }: ToolContext) {
  const title = str(args.title).trim().slice(0, 180);
  if (!title) return { error: "A slide deck needs a title." };
  const slides = usableSlides(args.slides);
  if (slides.length < 2) {
    return { error: "A slide deck needs at least two usable slides with a title and content." };
  }
  const folder = str(args.folder).trim() || GENERATED_SLIDES_FOLDER;
  const body = [
    "---",
    "nemesis_artifact: slides",
    `slide_count: ${slides.length}`,
    "---",
    "",
    `# ${title}`,
    "",
    ...slides.flatMap((slide, index) => [
      `## ${index + 1}. ${slide.title}`,
      "",
      ...slide.bullets.map((bullet) => `- ${bullet}`),
      ...(slide.speakerNotes ? ["", "### Speaker notes", "", slide.speakerNotes] : []),
      ...(index < slides.length - 1 ? ["", "---", ""] : []),
    ]),
  ].join("\n");
  const note = await createNoteWithContent(uid, title, body, folder);
  return {
    artifact: { id: note.id, kind: "slides", route: `/slides?id=${encodeURIComponent(note.id)}`, title: note.title },
    created: true,
    kind: "slides",
    path: note.path,
    slides: slides.length,
    title: note.title,
  };
}

/** Notes on the phone are addressed by PATH everywhere the model can see (search
 *  returns paths), but every write helper takes the row's id. This is that
 *  translation for the tools that already hold a full snapshot, kept in one place
 *  so each of them resolves a path the same way and gives the same advice when it
 *  misses. (appendLibraryNote does not use it — it fetches its single note
 *  directly rather than pulling a snapshot it has no other use for.) */
function noteByPath(snapshot: CloudLibrarySnapshot, path: string): CloudLibraryNote | null {
  const wanted = path.trim();
  if (!wanted) return null;
  return (
    snapshot.notes.find((note) => note.path === wanted) ??
    snapshot.notes.find((note) => note.path.toLowerCase() === wanted.toLowerCase()) ??
    null
  );
}

/**
 * Add to the end of a note, never over the top of it.
 *
 * There is no `edit_library_note` that replaces a body, and that is a decision
 * rather than an omission: a model that misjudges "update my ACE inhibitor note"
 * would destroy work the student typed themselves, and the phone has no version
 * history to get it back from. Appending can be undone by deleting a paragraph.
 */
async function appendLibraryNote({ args, uid }: ToolContext) {
  const addition = str(args.content).trim();
  if (!addition) return { error: "Nothing to add." };
  const path = str(args.path).trim();
  if (!path) return { error: "Which note? Use search_library to get its path." };
  // ONE ROW, not the whole Library. fetchLibrary selects `content` for every note
  // the student owns, so using it here would pull their entire Library — note
  // bodies and all — across a phone connection to add one paragraph. The three
  // tools below genuinely need the full snapshot (they check name collisions
  // against every sibling); this one only needs the note it is writing to.
  const note = await fetchNote(uid, { path });
  if (!note) return { error: `No note at '${path}'. Use search_library to find the right path.` };
  // One blank line between what was there and what is being added, unless the
  // note is empty — otherwise the new text runs into the last sentence.
  const existing = note.content.replace(/\s+$/, "");
  const merged = existing ? `${existing}\n\n${addition}` : addition;
  const saved = await updateNoteContent(uid, note.id, merged);
  return { appended: true, added_characters: addition.length, path: saved.path, title: saved.title };
}

async function createLibraryFolder({ args, uid }: ToolContext) {
  const path = str(args.path).trim();
  if (!path) return { error: "A folder needs a name." };
  const snapshot = await fetchLibrary(uid);
  const created = await createFolder(uid, snapshot, path);
  return { created: true, folder: created };
}

async function renameLibraryNote({ args, uid }: ToolContext) {
  const title = str(args.title).trim();
  if (!title) return { error: "What should it be called?" };
  const snapshot = await fetchLibrary(uid);
  const note = noteByPath(snapshot, str(args.path));
  if (!note) return { error: `No note at '${str(args.path)}'. Use search_library to find the right path.` };
  const path = await renameNote(uid, snapshot, note.id, title);
  return { path, renamed: true, title };
}

async function moveLibraryNote({ args, uid }: ToolContext) {
  const snapshot = await fetchLibrary(uid);
  const note = noteByPath(snapshot, str(args.path));
  if (!note) return { error: `No note at '${str(args.path)}'. Use search_library to find the right path.` };
  // "" is a legitimate destination: the top level of the library.
  const folder = str(args.folder);
  const path = await moveNote(uid, snapshot, note.id, folder);
  return { moved: true, path };
}

// ── study ──────────────────────────────────────────────────────────────────────

async function listStudyDecks(_context: ToolContext) {
  const { data, error } = await supabase.from("study_decks").select("id,name").order("name").limit(MAX_LIST);
  if (error) return { error: error.message };
  const decks = data ?? [];
  const counts = new Map<string, number>();
  if (decks.length > 0) {
    const { data: cards } = await supabase
      .from("study_cards")
      .select("deck_id")
      .in("deck_id", decks.map((deck) => deck.id))
      .limit(2000);
    for (const card of cards ?? []) counts.set(str(card.deck_id), (counts.get(str(card.deck_id)) ?? 0) + 1);
  }
  // name/folder/full_name rather than the raw "Folder::Deck": see deckNameParts.
  return {
    decks: decks.map((deck) => {
      const parts = deckNameParts(str(deck.name));
      return {
        cards: counts.get(str(deck.id)) ?? 0,
        full_name: parts.full,
        name: parts.name,
        ...(parts.folder ? { folder: parts.folder } : {}),
      };
    }),
  };
}

async function readStudyDeck({ args }: ToolContext) {
  const wanted = str(args.deck_name).trim();
  if (!wanted) return { error: "Which deck? Use list_study_decks to see the names." };
  const { data: decks, error: deckError } = await supabase.from("study_decks").select("id,name").limit(200);
  if (deckError) return { error: deckError.message };
  const names = (decks ?? []).map((deck) => str(deck.name));
  const matched = matchDeckName(wanted, names);
  if (!matched) return { error: `No unique Study deck matched '${wanted}'. Use list_study_decks and pass the full name.` };
  const deck = (decks ?? []).find((row) => str(row.name) === matched);
  if (!deck) return { error: `No Study deck matched '${wanted}'.` };
  const rawOffset = Number(args.offset);
  const rawLimit = Number(args.limit);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 20) : 12;
  const { data: cards, error } = await supabase
    .from("study_cards")
    .select("id,front,back,card_type,tags,suspended")
    .eq("deck_id", deck.id)
    .order("created_at")
    .range(offset, offset + limit - 1);
  if (error) return { error: error.message };
  const deckParts = deckNameParts(matched);
  return {
    deck: deckParts.name,
    ...(deckParts.folder ? { folder: deckParts.folder } : {}),
    full_name: deckParts.full,
    cards: (cards ?? []).map((card) => ({
      back: clip(str(card.back), 600),
      card_type: str(card.card_type),
      front: clip(str(card.front), 300),
      // The handle for edit_flashcard and delete_flashcard. Without it those
      // tools have nothing to point at and the model guesses.
      id: str(card.id),
      suspended: card.suspended === true,
      tags: Array.isArray(card.tags) ? card.tags.map(str).filter(Boolean).slice(0, 20) : [],
    })),
    next_offset: (cards?.length ?? 0) === limit ? offset + limit : null,
    offset,
  };
}

async function listStudyArtifacts({ args }: ToolContext) {
  const requestedKind = str(args.kind).trim().toLowerCase();
  let query = supabase
    .from("study_artifacts")
    .select("id,kind,title,group_name,status,content,updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_LIST);
  if (requestedKind === "test" || requestedKind === "mindmap") query = query.eq("kind", requestedKind);
  const { data, error } = await query;
  if (error) return { error: error.message };
  return {
    artifacts: (data ?? []).map((artifact) => ({
      group: str(artifact.group_name),
      id: str(artifact.id),
      kind: str(artifact.kind),
      status: str(artifact.status),
      title: str(artifact.title),
      updated_at: str(artifact.updated_at),
    })),
  };
}

async function readStudyArtifact({ args }: ToolContext) {
  const id = str(args.id).trim();
  if (!id) return { error: "Which item? Use list_study_artifacts to get its id." };
  const { data, error } = await supabase
    .from("study_artifacts")
    .select("id,kind,title,group_name,status,content,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No Study item with id '${id}'.` };
  return {
    content: clip(JSON.stringify(data.content ?? {}), 12_000),
    group: str(data.group_name),
    id: str(data.id),
    kind: str(data.kind),
    status: str(data.status),
    title: str(data.title),
    updated_at: str(data.updated_at),
  };
}

async function addFlashcards({ args, uid }: ToolContext) {
  const wanted = str(args.deck_name).trim().slice(0, 120);
  if (!wanted) return { error: "Which deck?" };
  const cards = usableCards(args.cards);
  if (cards.length === 0) return { error: "No usable cards — each one needs a front and a back." };

  const { data: existingDecks, error: listError } = await supabase.from("study_decks").select("id,name");
  if (listError) return { error: listError.message };
  const decks = existingDecks ?? [];
  // Folder-aware match: see matchDeckName for why an exact-only lookup silently
  // duplicates a deck that lives inside a folder.
  const matched = matchDeckName(wanted, decks.map((deck) => str(deck.name)));
  let deckId = matched ? str(decks.find((deck) => str(deck.name) === matched)?.id) : "";
  let createdDeck = false;
  if (!deckId) {
    const { data: created, error: createError } = await supabase
      .from("study_decks")
      .insert({ description: "", name: wanted, source_path: null, user_id: uid })
      .select("id")
      .single();
    if (createError || !created) return { error: createError?.message ?? "Couldn't create that deck." };
    deckId = str(created.id);
    createdDeck = true;
  }

  // ONE insert for the whole batch rather than a loop over createStudyCard: a
  // thirty-card deck would otherwise be thirty round trips on a phone connection,
  // and a failure halfway through would leave the deck half-written with no way to
  // tell the student which half.
  const rows = cards.flatMap((card) => [
    {
      back: card.back,
      card_type: card.cardType,
      deck_id: deckId,
      front: card.front,
      source_path: null,
      user_id: uid,
    },
    ...(card.cardType === "reversed"
      ? [{
          back: card.front,
          card_type: card.cardType,
          deck_id: deckId,
          front: card.back,
          source_path: null,
          user_id: uid,
        }]
      : []),
  ]).slice(0, 100);
  const { error: insertError } = await supabase.from("study_cards").insert(rows);
  if (insertError) return { error: insertError.message };
  const parts = deckNameParts(matched ?? wanted);
  return {
    added: rows.length,
    // The artifact keeps the FULL name; the card splits it for display itself
    // (lib/artifact-card.ts), which is also what makes the folder show up as
    // the destination line rather than as part of the deck's name.
    artifact: { id: deckId, kind: "flashcards", route: `/review?deckId=${encodeURIComponent(deckId)}`, title: parts.full },
    created_deck: createdDeck,
    deck: parts.name,
    ...(parts.folder ? { folder: parts.folder } : {}),
  };
}

/** Where a saved Study artifact lives, as a route. The folder is a query param
 *  the Study page is free to ignore; its job here is to reach the chat card,
 *  which otherwise has no way to know a test went anywhere but "Tests". */
function studyRoute(section: "tests" | "mindmaps", group: string): string {
  const folder = group.trim();
  return folder ? `/study?section=${section}&group=${encodeURIComponent(folder)}` : `/study?section=${section}`;
}

async function addPracticeTest({ args, uid }: ToolContext) {
  const groupName = str(args.group_name).trim() || GENERATED_TESTS_GROUP;
  const questions = qualityPracticeQuestions(args.questions);
  if (questions.length < 4) {
    return {
      error:
        "The test did not pass the quality check. Write at least four unique one-best-answer questions with 3–6 distinct options, a rationale, no negative stems, and no all/none-of-the-above choices.",
    };
  }
  const saved = await createStudyTest(uid, {
    groupName,
    questions,
    title: str(args.title),
  });
  const title = str(args.title).trim();
  return {
    added: true,
    // The folder rides in the ROUTE rather than a new ChatOutput field: the
    // card reads it back to name its destination, and `meta.outputs` is shared
    // with web, so a field only the phone writes is a schema web has to learn.
    artifact: { id: saved.id, kind: "test", route: `/test?testId=${encodeURIComponent(saved.id)}`, title },
    group: groupName,
    kind: "test",
    questions: saved.questions.length,
    title,
  };
}

async function addMindmap({ args, uid }: ToolContext) {
  const saved = await createStudyMindmap(uid, {
    groupName: str(args.group_name),
    outline: str(args.outline),
    title: str(args.title),
  });
  const title = str(args.title).trim();
  const group = str(args.group_name).trim();
  return {
    added: true,
    artifact: { id: saved.id, kind: "mindmap", route: studyRoute("mindmaps", group), title },
    group: group || null,
    kind: "mindmap",
    title,
  };
}

// ── calendar ──────────────────────────────────────────────────────────────────

async function listCalendarEvents({ args }: ToolContext) {
  const rawDays = Number(args.days_ahead);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.floor(rawDays), 120) : 14;
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id,title,date,time,kind,course,note")
    .gte("date", today)
    .lte("date", end)
    .order("date")
    .order("time")
    .limit(MAX_LIST * 2);
  if (error) return { error: error.message };
  return { events: data ?? [], window: { from: today, to: end } };
}

const EVENT_KINDS = new Set(["assignment", "exam", "rotation", "class", "other"]);

async function addCalendarEvent({ args, uid }: ToolContext) {
  const title = str(args.title).trim().slice(0, 300);
  const date = str(args.date).trim();
  if (!title) return { error: "An event needs a title." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Use YYYY-MM-DD for the date." };
  const rawKind = str(args.kind).trim().toLowerCase();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      course: str(args.course).trim().slice(0, 200) || null,
      date,
      kind: EVENT_KINDS.has(rawKind) ? rawKind : "other",
      note: str(args.note).trim().slice(0, 4_000) || null,
      // "manual", not "agent" — web made this same switch on 2026-07-28 and the
      // phone now needs it more, not less. calendar.tsx:317 sends a source:'agent'
      // row to the VIEW-ONLY sheet: no edit, no delete, and there is no update or
      // delete tool in AGENT_TOOLS to change it with either. That was survivable
      // while a chip in the transcript was a second way to reach the event; with
      // the chip gone (below) the calendar is the ONLY surface, so an
      // uncorrectable row there is a dead end. The student asked for the event,
      // so it is theirs to fix. Provenance stays readable in `note`.
      source: "manual",
      time: str(args.time).trim().slice(0, 40) || null,
      title,
      user_id: uid,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't add that event." };
  // NO `artifact` here, deliberately (owner 2026-07-28, web first and now the
  // phone). Every other write returns one because a deck, test or note has its
  // own destination and the chip is the only route to it. An event does not: it
  // is one row on a Calendar tab that is always one tap away, so the chip added
  // a duplicate rather than a way in — and a syllabus import minted one per date.
  return {
    added: true,
    date,
    // Steer from the TOOL RESULT, never by stripping the model's reply afterwards
    // — stripping throws away real answers when the same turn was doing something
    // else too. It says "no chip" outright rather than leaning on the system
    // prompt, which tells the model to report what it changed after every write:
    // true for notes and decks, and now false for this tool alone.
    instruction:
      "Saved. This tool shows the student NO chip and NO card — the Calendar tab is where the event lives, "
      + "and it is one tap away. Do NOT write the event back: no dates, no table, no list. "
      + "When every event in this batch is in, reply with ONE short line: \"I've put the events into your calendar.\" "
      + "Add a second short line only if something could not be added, naming just those.",
    title,
  };
}

/** Every advertised tool, with the thing that runs it.
 *
 *  A `Record` keyed by the AgentToolName union rather than a switch with a
 *  default: tsc refuses to compile if a name is added to lib/agent-tools.ts and
 *  not given a handler here, so "the model called a tool we forgot to build"
 *  cannot reach a student. */
// ── editing and removing ──────────────────────────────────────────────────────
//
// Everything below goes through the cloud* helpers for the reason at the top of
// this file: they write the on-disk cache as well as Supabase. A delete that
// only reached the cloud would leave the note sitting on the Library screen
// until the next fetch, which reads as "it didn't work" and invites the student
// to ask again.

/** The row a destructive verb was pointed at, or an error the model can act on. */
async function rowById(
  table: "calendar_events" | "readable_library_documents" | "study_cards" | "study_artifacts",
  rawId: unknown,
  uid: string,
  hint: string,
): Promise<{ error: string } | { id: string; row: Record<string, unknown> }> {
  const id = workspaceId(rawId);
  if (!id) return { error: `That is not a valid id. ${hint}` };
  const base = supabase.from(table).select("*").eq("id", id).eq("user_id", uid);
  const { data, error } = await (table === "readable_library_documents"
    ? base.eq("deleted", false)
    : base).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `Nothing found with that id — it may already be gone. ${hint}` };
  return { id, row: data as Record<string, unknown> };
}

async function updateCalendarEventTool({ args, uid }: ToolContext) {
  const found = await rowById("calendar_events", args.event_id, uid, "Use list_calendar_events to get event ids.");
  if ("error" in found) return found;
  const { event_id: _handle, ...fields } = args;
  const patch = calendarEventPatch(fields);
  if (isPatchFailure(patch)) return patch;
  // 🔴 updateCalendarEvent takes a WHOLE event, not a patch — toRow writes every
  // column. So the current row has to be merged under the change, or "move it to
  // 3pm" silently wipes the title, course and note it did not mention.
  const merged = {
    course: patch.course !== undefined ? patch.course ?? undefined : str(found.row.course) || undefined,
    date: patch.date ?? str(found.row.date),
    // `||`, not `??`: str() gives "" for a missing kind, and "" survives `??`.
    // calendar_events.kind carries a CHECK constraint, so an empty string is
    // rejected by Postgres and a perfectly ordinary edit fails.
    kind: (patch.kind ?? (str(found.row.kind) || "other")) as AgendaEventKind,
    note: patch.note !== undefined ? patch.note ?? undefined : str(found.row.note) || undefined,
    time: patch.time !== undefined ? patch.time ?? undefined : str(found.row.time) || undefined,
    title: patch.title ?? str(found.row.title),
  };
  await updateCloudCalendarEvent(uid, found.id, merged);
  return {
    changed: Object.keys(patch),
    instruction:
      "Updated. Do not write the event back — the Calendar tab shows it. One short line saying what changed.",
    title: merged.title,
    updated: true,
  };
}

async function deleteCalendarEventTool({ args, uid }: ToolContext) {
  const found = await rowById("calendar_events", args.event_id, uid, "Use list_calendar_events to get event ids.");
  if ("error" in found) return found;
  await deleteCloudCalendarEvent(uid, found.id);
  return { deleted: true, title: str(found.row.title) };
}

async function replaceLibraryNote({ args, uid }: ToolContext) {
  const found = await rowById("readable_library_documents", args.note_id, uid, "Use search_library to get note ids.");
  if ("error" in found) return found;
  if (str(found.row.kind) !== "note") return { error: "That id is a folder, not a note." };
  const body = noteReplacementBody(args.content);
  if (!body) return { error: "Nothing to write — a replacement needs a body. Use delete_library_note to remove it." };
  await updateNoteContent(uid, found.id, body);
  return { path: str(found.row.path), replaced: true, title: str(found.row.title) };
}

async function deleteLibraryNoteTool({ args, uid }: ToolContext) {
  const found = await rowById("readable_library_documents", args.note_id, uid, "Use search_library to get note ids.");
  if ("error" in found) return found;
  if (str(found.row.kind) !== "note") {
    return { error: "That id is a folder. Folders are removed from the Library screen, not from chat." };
  }
  // Soft — `deleted` is a flag, so the student can get this back.
  await deleteNote(uid, found.id);
  return { deleted: true, recoverable: true, title: str(found.row.title) };
}

async function editFlashcard({ args, uid }: ToolContext) {
  const found = await rowById("study_cards", args.card_id, uid, "Use read_study_deck to get card ids.");
  if ("error" in found) return found;
  const changed: string[] = [];
  let front = str(found.row.front);
  let back = str(found.row.back);
  if ("front" in args) {
    const next = str(args.front).trim().slice(0, 12_000);
    if (!next) return { error: "A card's front cannot be empty." };
    front = next;
    changed.push("front");
  }
  if ("back" in args) {
    const next = str(args.back).trim().slice(0, 12_000);
    if (!next) return { error: "A card's back cannot be empty." };
    back = next;
    changed.push("back");
  }
  if (changed.length === 0) return { error: "Nothing to change — pass front, back, or both." };
  // updateStudyCard writes both sides, so the untouched one is carried over from
  // the row above rather than left to become undefined.
  await updateStudyCard(uid, found.id, front, back);
  return { changed, edited: true };
}

async function deleteFlashcard({ args, uid }: ToolContext) {
  const found = await rowById("study_cards", args.card_id, uid, "Use read_study_deck to get card ids.");
  if ("error" in found) return found;
  await deleteStudyCard(uid, found.id);
  return { deleted: true, front: clip(str(found.row.front), 120) };
}

/** The one deck a name refers to, or an error naming the tool that lists them. */
async function deckByName(wanted: string) {
  const name = wanted.trim();
  if (!name) return { error: "Which deck? Use list_study_decks to see the names." };
  const { data, error } = await supabase.from("study_decks").select("id,name").limit(200);
  if (error) return { error: error.message };
  const decks = data ?? [];
  const matched = matchDeckName(name, decks.map((deck) => str(deck.name)));
  const deck = matched ? decks.find((row) => str(row.name) === matched) : undefined;
  if (!deck) return { error: `No unique Study deck matched '${name}'. Use the full name from list_study_decks.` };
  return { id: str(deck.id), name: str(deck.name) };
}

async function renameStudyDeckTool({ args, uid }: ToolContext) {
  const deck = await deckByName(str(args.deck_name));
  if ("error" in deck) return deck;
  const nextLeaf = str(args.new_name).trim().slice(0, 120);
  if (!nextLeaf) return { error: "A deck needs a name." };
  const { decks } = await fetchCloudStudy(uid);
  await renameCloudStudyDeck(uid, decks, deck.id, nextLeaf);
  return { from: deck.name, renamed: true, to: nextLeaf };
}

async function deleteStudyDeckTool({ args, uid }: ToolContext) {
  const deck = await deckByName(str(args.deck_name));
  if ("error" in deck) return deck;
  const { count, error } = await supabase
    .from("study_cards")
    .select("id", { count: "exact", head: true })
    .eq("deck_id", deck.id);
  if (error) return { error: error.message };
  // 🔴 FAIL CLOSED. `count ?? 0` would have read "I could not count" as "it is
  // empty" and deleted the deck — a null count is not an error, so no `error`
  // above would have caught it. On a permanent delete, unknown has to mean no.
  if (typeof count !== "number") {
    return { error: "Couldn't check whether that deck still has cards in it, so it was left alone." };
  }
  // Permanent, and it takes every card's review history with it. Empty decks
  // only — see deckDeletionVerdict for why that line is where it is.
  const verdict = deckDeletionVerdict(count);
  if (!verdict.allowed) return { error: verdict.reason };
  await deleteCloudStudyDeck(uid, deck.id);
  return { deck: deck.name, deleted: true };
}

async function deleteStudyArtifactTool({ args, uid }: ToolContext) {
  const found = await rowById("study_artifacts", args.artifact_id, uid, "Use list_study_artifacts to get ids.");
  if ("error" in found) return found;
  await deleteCloudStudyArtifact(found.id);
  return { deleted: true, kind: str(found.row.kind), title: str(found.row.title) };
}

const HANDLERS: Record<AgentToolName, ToolHandler> = {
  add_flashcards: addFlashcards,
  add_calendar_event: addCalendarEvent,
  add_mindmap: addMindmap,
  add_practice_test: addPracticeTest,
  append_library_note: appendLibraryNote,
  create_library_folder: createLibraryFolder,
  create_library_note: createLibraryNote,
  create_slide_deck: createSlideDeck,
  list_calendar_events: listCalendarEvents,
  list_study_artifacts: listStudyArtifacts,
  list_study_decks: listStudyDecks,
  move_library_note: moveLibraryNote,
  read_study_deck: readStudyDeck,
  read_study_artifact: readStudyArtifact,
  read_library_note: readLibraryNote,
  rename_library_note: renameLibraryNote,
  search_library: searchLibrary,
  update_calendar_event: updateCalendarEventTool,
  delete_calendar_event: deleteCalendarEventTool,
  replace_library_note: replaceLibraryNote,
  delete_library_note: deleteLibraryNoteTool,
  edit_flashcard: editFlashcard,
  delete_flashcard: deleteFlashcard,
  rename_study_deck: renameStudyDeckTool,
  delete_study_deck: deleteStudyDeckTool,
  delete_study_artifact: deleteStudyArtifactTool,
};

/** Handed back with every result that created something, because the model
 *  cannot see the screen and does not otherwise know a card is already there.
 *  Without it the natural next move is to write the deck out in the reply — the
 *  wall of text the card exists to replace (owner 2026-07-27). It is phrased as
 *  a permission as well as a prohibition: a turn that also asked a question
 *  still has to get its answer. */
const SAVED_NOTE =
  "Saved. The student already sees a card in the chat with this item's name and a link that opens it, so do NOT list, repeat, or preview the content you just saved. Say in one short sentence what you added and which deck or folder it went into, in plain words and never using the '::' form. If they asked a question as well, answer that too.";

/**
 * Run one tool call. ALWAYS resolves to something JSON-stringifiable.
 *
 * The helpers this delegates to throw student-readable messages (that is their
 * contract with the screens that already use them), so the catch here is not
 * defensive padding — it is the translation from "throws" to "returns {error}",
 * which is what the agent loop needs to keep the conversation alive.
 */
export async function executeAgentTool(uid: string, call: AgentToolCall): Promise<unknown> {
  if (!isAgentToolName(call.name)) return { error: `Unknown tool '${call.name}'.` };
  try {
    const result = await HANDLERS[call.name]({ args: parseToolArgs(call.arguments), uid });
    // Attached HERE rather than in each of the six creating handlers, so a tool
    // added later cannot forget it: "did it produce an artifact" is the exact
    // condition, and it is already in the shape of the result.
    return result && typeof result === "object" && "artifact" in result
      ? { ...result, note_to_assistant: SAVED_NOTE }
      : result;
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "That didn't work." };
  }
}
