// Sessions-chat agent tools (owner decision 2026-07-20: READ + WRITE over the
// student's Library, Study, and Calendar). Schemas ride the OpenAI `tools`
// field straight through the valve to the model (tool_choice stays auto —
// DeepSeek thinking mode rejects forced choices, see
// docs/research/deepseek-tool-calling-fix-2026-07.md); executors run here in
// the browser against the same RLS-scoped Supabase tables the pages use, so
// the agent can never see or touch another account's data.

import { supabase } from "@/lib/supabase";
import { mergeLibraryHits, type LexicalHit, type SemanticHit } from "./library-search-merge";

const MAX_NOTE_CHARS = 8_000;
const MAX_LIST = 30;

export interface AgentToolCall {
  id: string;
  name: string;
  /** Raw JSON string from the model. */
  arguments: string;
}

/** OpenAI-format tool schemas sent with every sessions turn. */
export const AGENT_TOOLS = [
  {
    function: {
      description: "Search the student's Library notes by title and text. Returns matching notes' path, title, and a snippet.",
      name: "search_library",
      parameters: {
        properties: { query: { description: "Words to look for", type: "string" } },
        required: ["query"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Read one Library note's full text by its path (get the path from search_library).",
      name: "read_library_note",
      parameters: {
        properties: { path: { description: "The note's path, e.g. 'Pharmacology/ACE inhibitors.md'", type: "string" } },
        required: ["path"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Create a new Library note for the student. Use markdown. Tell the student you created it.",
      name: "create_library_note",
      parameters: {
        properties: {
          content: { description: "Markdown body of the note", type: "string" },
          folder: { description: "Optional folder path like 'Pharmacology/Unit 3'", type: "string" },
          title: { description: "Note title", type: "string" },
        },
        required: ["title", "content"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "List the student's flashcard decks with card counts.",
      name: "list_study_decks",
      parameters: { properties: {}, type: "object" },
    },
    type: "function",
  },
  {
    function: {
      description: "Add flashcards to a deck (created if it doesn't exist). Tell the student how many cards you added.",
      name: "add_flashcards",
      parameters: {
        properties: {
          cards: {
            items: {
              properties: { back: { type: "string" }, front: { type: "string" } },
              required: ["front", "back"],
              type: "object",
            },
            type: "array",
          },
          deck_name: { description: "Deck name, e.g. 'Cardiovascular pharmacology'", type: "string" },
        },
        required: ["deck_name", "cards"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "List the student's upcoming calendar events (assignments, exams, classes).",
      name: "list_calendar_events",
      parameters: {
        properties: { days_ahead: { description: "How many days forward to look (default 14)", type: "number" } },
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Add an event to the student's calendar. Tell the student what you added and when.",
      name: "add_calendar_event",
      parameters: {
        properties: {
          course: { description: "Optional course name", type: "string" },
          date: { description: "Event date, YYYY-MM-DD", type: "string" },
          kind: { description: "One of assignment, exam, rotation, class, other", type: "string" },
          note: { description: "Optional details", type: "string" },
          time: { description: "Optional time like '14:00' or '2:00 PM'", type: "string" },
          title: { description: "Event title", type: "string" },
        },
        required: ["title", "date"],
        type: "object",
      },
    },
    type: "function",
  },
] as const;

function clip(text: string, max = MAX_NOTE_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Today's substring arm — also the fallback whenever the semantic arm is unavailable. */
export async function lexicalLibrarySearch(query: string): Promise<LexicalHit[]> {
  const escaped = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("path,title,content")
    .eq("deleted", false)
    .or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)
    .limit(MAX_LIST);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const content = str(row.content);
    const at = content.toLowerCase().indexOf(query.toLowerCase());
    const snippet = at >= 0 ? content.slice(Math.max(0, at - 80), at + 160) : content.slice(0, 160);
    return { path: str(row.path), snippet: snippet.trim(), title: str(row.title) };
  });
}

/** Semantic arm. Returns [] on ANY failure — search must never go dark. */
async function semanticLibrarySearch(query: string): Promise<SemanticHit[]> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return [];
    const res = await fetch("/api/v1/library/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 8 }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { hits?: SemanticHit[] };
    return Array.isArray(json.hits) ? json.hits : [];
  } catch {
    return [];
  }
}

async function searchLibrary(query: string) {
  const q = query.trim();
  if (!q) return { error: "Empty query." };
  try {
    const [semantic, lexical] = await Promise.all([
      semanticLibrarySearch(q),
      lexicalLibrarySearch(q).catch(() => [] as LexicalHit[]),
    ]);
    const hits = mergeLibraryHits(semantic, lexical, MAX_LIST);
    return { notes: hits.map(({ path, snippet, title }) => ({ path, snippet, title })) };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Search failed." };
  }
}

async function readLibraryNote(path: string) {
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

async function createLibraryNote(title: string, content: string, folder: string) {
  const cleanTitle = title.trim().replace(/[\\/:]/g, "-").slice(0, 120) || "Untitled note";
  const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
  const now = new Date().toISOString();
  for (let suffix = 1; suffix <= 20; suffix += 1) {
    const name = suffix === 1 ? cleanTitle : `${cleanTitle} ${suffix}`;
    const path = `${cleanFolder ? `${cleanFolder}/` : ""}${name}.md`;
    const { error } = await supabase
      .from("readable_library_documents")
      .insert({ content: content.slice(0, 100_000), deleted: false, kind: "note", path, title: name, updated_at: now });
    if (!error) return { created: true, path, title: name };
    if (!/duplicate|unique/i.test(error.message)) return { error: error.message };
  }
  return { error: "Couldn't find a free note name — too many duplicates." };
}

async function listStudyDecks() {
  const { data, error } = await supabase.from("study_decks").select("id,name").order("name").limit(MAX_LIST);
  if (error) return { error: error.message };
  const decks = data ?? [];
  const counts = new Map<string, number>();
  if (decks.length > 0) {
    const { data: cards } = await supabase.from("study_cards").select("deck_id").in("deck_id", decks.map((deck) => deck.id)).limit(2000);
    for (const card of cards ?? []) counts.set(str(card.deck_id), (counts.get(str(card.deck_id)) ?? 0) + 1);
  }
  return { decks: decks.map((deck) => ({ cards: counts.get(str(deck.id)) ?? 0, name: str(deck.name) })) };
}

async function addFlashcards(deckName: string, cards: { front: string; back: string }[]) {
  const name = deckName.trim().slice(0, 120);
  if (!name) return { error: "Deck name is required." };
  const cleanCards = cards
    .map((card) => ({ back: str(card.back).trim().slice(0, 20_000), front: str(card.front).trim().slice(0, 12_000) }))
    .filter((card) => card.front && card.back)
    .slice(0, 100);
  if (cleanCards.length === 0) return { error: "No valid cards — each needs a front and a back." };

  const { data: existing, error: findError } = await supabase.from("study_decks").select("id").eq("name", name).maybeSingle();
  if (findError) return { error: findError.message };
  let deckId = existing?.id as string | undefined;
  let createdDeck = false;
  if (!deckId) {
    const { data: created, error: createError } = await supabase.from("study_decks").insert({ name }).select("id").single();
    if (createError || !created) return { error: createError?.message ?? "Couldn't create the deck." };
    deckId = created.id as string;
    createdDeck = true;
  }
  const { error: insertError } = await supabase.from("study_cards").insert(cleanCards.map((card) => ({ back: card.back, deck_id: deckId, front: card.front })));
  if (insertError) return { error: insertError.message };
  return { added: cleanCards.length, created_deck: createdDeck, deck: name };
}

async function listCalendarEvents(daysAhead: number) {
  const days = Number.isFinite(daysAhead) && daysAhead > 0 ? Math.min(daysAhead, 120) : 14;
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("calendar_events")
    .select("title,date,time,kind,course,note")
    .gte("date", today)
    .lte("date", end)
    .order("date")
    .limit(MAX_LIST * 2);
  if (error) return { error: error.message };
  return { events: data ?? [], window: { from: today, to: end } };
}

const EVENT_KINDS = new Set(["assignment", "exam", "rotation", "class", "other"]);

async function addCalendarEvent(args: Record<string, unknown>) {
  const title = str(args.title).trim().slice(0, 300);
  const date = str(args.date).trim();
  if (!title) return { error: "Event title is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date must be YYYY-MM-DD." };
  const kindRaw = str(args.kind).trim().toLowerCase();
  const { error } = await supabase.from("calendar_events").insert({
    course: str(args.course).trim().slice(0, 200) || null,
    date,
    kind: EVENT_KINDS.has(kindRaw) ? kindRaw : "other",
    note: str(args.note).trim().slice(0, 4000) || null,
    source: "agent",
    time: str(args.time).trim().slice(0, 40) || null,
    title,
  });
  if (error) return { error: error.message };
  return { added: true, date, title };
}

/** Run one tool call; ALWAYS resolves to a JSON-stringifiable result (errors
 *  become `{error}` so the model can react instead of the turn dying). */
export async function executeAgentTool(call: AgentToolCall): Promise<unknown> {
  const args = parseArgs(call.arguments);
  try {
    switch (call.name) {
      case "search_library": return await searchLibrary(str(args.query));
      case "read_library_note": return await readLibraryNote(str(args.path));
      case "create_library_note": return await createLibraryNote(str(args.title), str(args.content), str(args.folder));
      case "list_study_decks": return await listStudyDecks();
      case "add_flashcards": return await addFlashcards(str(args.deck_name), Array.isArray(args.cards) ? (args.cards as { front: string; back: string }[]) : []);
      case "list_calendar_events": return await listCalendarEvents(Number(args.days_ahead));
      case "add_calendar_event": return await addCalendarEvent(args);
      default: return { error: `Unknown tool '${call.name}'.` };
    }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Tool failed." };
  }
}
