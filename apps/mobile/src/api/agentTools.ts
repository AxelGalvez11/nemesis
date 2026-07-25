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
import { supabase } from "./supabase";
import {
  createFolder,
  createNoteWithContent,
  fetchLibrary,
  fetchNote,
  moveNote,
  renameNote,
  updateNoteContent,
  type CloudLibraryNote,
  type CloudLibrarySnapshot,
} from "./cloudLibrary";
import { createStudyMindmap, createStudyTest } from "./studyArtifacts";
import {
  clip,
  isAgentToolName,
  matchDeckName,
  MAX_LIST,
  parseToolArgs,
  str,
  usableCards,
  type AgentToolName,
} from "@/lib/agent-tools";

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
    .select("path,title,content")
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
    return { path: str(row.path), snippet: snippet.trim(), title: str(row.title) };
  });
  return notes.length > 0 ? { notes } : { notes: [], note: `Nothing in the Library matches '${query}'.` };
}

async function readLibraryNote({ args }: ToolContext) {
  const path = str(args.path).trim();
  if (!path) return { error: "Which note? Use search_library to get its path." };
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("path,title,content")
    .eq("deleted", false)
    .eq("path", path)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No note at '${path}'. Use search_library to find the right path.` };
  return { content: clip(str(data.content)), path: str(data.path), title: str(data.title) };
}

async function createLibraryNote({ args, uid }: ToolContext) {
  const title = str(args.title).trim();
  const content = str(args.content);
  if (!title) return { error: "A note needs a title." };
  if (!content.trim()) return { error: "A note needs a body — write the markdown yourself." };
  const note = await createNoteWithContent(uid, title, content, str(args.folder));
  return { created: true, path: note.path, title: note.title };
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
  return { decks: decks.map((deck) => ({ cards: counts.get(str(deck.id)) ?? 0, name: str(deck.name) })) };
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
  const { error: insertError } = await supabase.from("study_cards").insert(
    cards.map((card) => ({
      back: card.back,
      card_type: "basic",
      deck_id: deckId,
      front: card.front,
      source_path: null,
      user_id: uid,
    })),
  );
  if (insertError) return { error: insertError.message };
  return { added: cards.length, created_deck: createdDeck, deck: matched ?? wanted };
}

async function addPracticeTest({ args, uid }: ToolContext) {
  const saved = await createStudyTest(uid, {
    groupName: str(args.group_name),
    questions: args.questions,
    title: str(args.title),
  });
  return { added: true, group: str(args.group_name).trim() || null, kind: "test", questions: saved.questions.length, title: str(args.title).trim() };
}

async function addMindmap({ args, uid }: ToolContext) {
  await createStudyMindmap(uid, {
    groupName: str(args.group_name),
    outline: str(args.outline),
    title: str(args.title),
  });
  return { added: true, group: str(args.group_name).trim() || null, kind: "mindmap", title: str(args.title).trim() };
}

/** Every advertised tool, with the thing that runs it.
 *
 *  A `Record` keyed by the AgentToolName union rather than a switch with a
 *  default: tsc refuses to compile if a name is added to lib/agent-tools.ts and
 *  not given a handler here, so "the model called a tool we forgot to build"
 *  cannot reach a student. */
const HANDLERS: Record<AgentToolName, ToolHandler> = {
  add_flashcards: addFlashcards,
  add_mindmap: addMindmap,
  add_practice_test: addPracticeTest,
  append_library_note: appendLibraryNote,
  create_library_folder: createLibraryFolder,
  create_library_note: createLibraryNote,
  list_study_decks: listStudyDecks,
  move_library_note: moveLibraryNote,
  read_library_note: readLibraryNote,
  rename_library_note: renameLibraryNote,
  search_library: searchLibrary,
};

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
    return await HANDLERS[call.name]({ args: parseToolArgs(call.arguments), uid });
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "That didn't work." };
  }
}
