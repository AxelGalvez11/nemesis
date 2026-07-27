// Sessions-chat agent tools (owner decision 2026-07-20: READ + WRITE over the
// student's Library, Study, and Calendar). Schemas ride the OpenAI `tools`
// field straight through the valve to the model (tool_choice stays auto —
// DeepSeek thinking mode rejects forced choices, see
// docs/research/deepseek-tool-calling-fix-2026-07.md); executors run here in
// the browser against the same RLS-scoped Supabase tables the pages use, so
// the agent can never see or touch another account's data.

import { WORKSPACE_AGENT_TOOL_NAMES } from "@nemesis/shared";
import { supabase } from "@/lib/supabase";
import { mergeLibraryHits, type LexicalHit, type SemanticHit } from "./library-search-merge";
import { writeLibraryNote } from "./library-write";
import { parseGeneratedMindmap, parseMindmapContent, parseTestContent } from "./study-artifact-content";
import { balanceAnswerPositions } from "./test-answer-balance";

const MAX_NOTE_CHARS = 8_000;
const MAX_LIST = 30;
const GENERATED_NOTES_FOLDER = "Nemesis/Notes";
const GENERATED_SLIDES_FOLDER = "Nemesis/Slides";
const GENERATED_TESTS_GROUP = "Generated tests";

export interface AgentToolCall {
  id: string;
  name: string;
  /** Raw JSON string from the model. */
  arguments: string;
}

export const AGENT_TOOL_NAMES = WORKSPACE_AGENT_TOOL_NAMES;

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
      description: `Create a new Library note for the student. Use markdown. If no folder was requested, omit folder to file it in '${GENERATED_NOTES_FOLDER}'.`,
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
      description:
        `Create and save a structured slide deck in the student's Library. You MUST use this when slides or a presentation are requested. If no folder was requested, omit folder to file it in '${GENERATED_SLIDES_FOLDER}'.`,
      name: "create_slide_deck",
      parameters: {
        properties: {
          folder: { description: "Optional Library folder path", type: "string" },
          slides: {
            items: {
              properties: {
                bullets: { items: { type: "string" }, type: "array" },
                speaker_notes: { description: "Optional teaching notes", type: "string" },
                title: { type: "string" },
              },
              required: ["title", "bullets"],
              type: "object",
            },
            type: "array",
          },
          title: { type: "string" },
        },
        required: ["title", "slides"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Append markdown to an existing Library note without replacing its current contents.",
      name: "append_library_note",
      parameters: {
        properties: {
          content: { type: "string" },
          path: { description: "Existing note path from search_library", type: "string" },
        },
        required: ["path", "content"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Create an empty folder in the student's Library.",
      name: "create_library_folder",
      parameters: {
        properties: { path: { description: "Folder path such as 'Biology/Unit 3'", type: "string" } },
        required: ["path"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Rename one Library note while keeping it in its current folder.",
      name: "rename_library_note",
      parameters: {
        properties: { path: { type: "string" }, title: { type: "string" } },
        required: ["path", "title"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Move one Library note into another folder. Use an empty folder string for the top level.",
      name: "move_library_note",
      parameters: {
        properties: { folder: { type: "string" }, path: { type: "string" } },
        required: ["path", "folder"],
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
      description:
        "Read the cards in one Study deck so you can tutor from, compare, summarize, or improve the student's actual material. Call list_study_decks first if the name is uncertain.",
      name: "read_study_deck",
      parameters: {
        properties: {
          deck_name: { description: "Full deck name or unique leaf name", type: "string" },
          limit: { description: "Cards to read, default 12 and maximum 20", type: "number" },
          offset: { description: "How many cards to skip for the next page", type: "number" },
        },
        required: ["deck_name"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "List saved Study tests and mind maps with their ids, titles, folders, and status. Use read_study_artifact for one item's content.",
      name: "list_study_artifacts",
      parameters: {
        properties: { kind: { description: "Optional: test or mindmap", type: "string" } },
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Read one saved Study test or mind map by the id returned from list_study_artifacts.",
      name: "read_study_artifact",
      parameters: {
        properties: { id: { description: "Study artifact id", type: "string" } },
        required: ["id"],
        type: "object",
      },
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
      description:
        "Save a multiple-choice practice test to the student's Study page. Write the questions yourself from the material — do not ask a second tool to generate them. Tell the student you saved it.",
      name: "add_practice_test",
      parameters: {
        properties: {
          group_name: { description: `Optional folder/group on the Study page. Omit to use '${GENERATED_TESTS_GROUP}'.`, type: "string" },
          questions: {
            items: {
              properties: {
                answer: { description: "0-based index into options of the correct answer", type: "number" },
                options: { items: { type: "string" }, type: "array" },
                q: { description: "The question", type: "string" },
                why: { description: "One-sentence explanation of the correct answer", type: "string" },
              },
              required: ["q", "options", "answer"],
              type: "object",
            },
            type: "array",
          },
          title: { description: "Test title, e.g. 'ACE inhibitors practice test'", type: "string" },
        },
        required: ["title", "questions"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "Save a mind map to the student's Study page. Provide a markdown outline you write yourself. Tell the student you saved it.",
      name: "add_mindmap",
      parameters: {
        properties: {
          group_name: { description: "Optional folder/group on the Study page", type: "string" },
          outline: {
            description: "Markdown outline: one '# Topic' root heading, then nested '- ' bullets (2-space indents, at most 3 levels, at most ~35 nodes)",
            type: "string",
          },
          title: { description: "Mind map title, e.g. 'RAAS pathway'", type: "string" },
        },
        required: ["title", "outline"],
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

function safeLibraryLeaf(value: string): string {
  return value.trim().replace(/[\\/:]/g, "-").slice(0, 120) || "Untitled note";
}

function safeLibraryFolder(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function usableSlides(raw: unknown) {
  return (Array.isArray(raw) ? raw : [])
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      const title = str(row.title).trim().slice(0, 180);
      const bullets = (Array.isArray(row.bullets) ? row.bullets : [])
        .map((bullet) => str(bullet).trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 8);
      const speakerNotes = str(row.speaker_notes).trim().slice(0, 4_000);
      return title && (bullets.length || speakerNotes) ? [{ bullets, speakerNotes, title }] : [];
    })
    .slice(0, 40);
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

/** The signed-in user id for THIS turn. readable_library_documents.user_id is
 *  NOT NULL with no auth.uid() default (unlike study_*), so every Library write
 *  must set it explicitly or the insert violates NOT NULL and the note never
 *  saves. Read from the cached session — no extra round-trip. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function createLibraryNote(title: string, content: string, folder: string) {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to save a note." };
  try {
    const saved = await writeLibraryNote({ content, folder: folder.trim() || GENERATED_NOTES_FOLDER, title, userId });
    return {
      artifact: {
        id: saved.path,
        kind: "other",
        title: saved.title,
        url: `/library?note=${encodeURIComponent(saved.path)}`,
      },
      created: true,
      path: saved.path,
      title: saved.title,
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Couldn't save the note." };
  }
}

async function createSlideDeck(args: Record<string, unknown>) {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to save slides." };
  const title = str(args.title).trim().slice(0, 180);
  if (!title) return { error: "A slide deck needs a title." };
  const slides = usableSlides(args.slides);
  if (slides.length < 2) return { error: "A slide deck needs at least two usable slides." };
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
  try {
    const saved = await writeLibraryNote({
      content: body,
      folder: str(args.folder).trim() || GENERATED_SLIDES_FOLDER,
      title,
      userId,
    });
    return {
      artifact: {
        id: saved.path,
        kind: "slides",
        title: saved.title,
        url: `/slides?note=${encodeURIComponent(saved.path)}`,
      },
      created: true,
      kind: "slides",
      path: saved.path,
      slides: slides.length,
      title: saved.title,
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Couldn't save the slide deck." };
  }
}

async function appendLibraryNote(path: string, addition: string) {
  const cleanPath = path.trim();
  const content = addition.trim();
  if (!cleanPath) return { error: "Which note? Use search_library first." };
  if (!content) return { error: "Nothing to append." };
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("id,title,content")
    .eq("deleted", false)
    .eq("kind", "note")
    .eq("path", cleanPath)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No note at '${cleanPath}'.` };
  const existing = str(data.content).replace(/\s+$/, "");
  const merged = existing ? `${existing}\n\n${content}` : content;
  const { error: updateError } = await supabase
    .from("readable_library_documents")
    .update({ content: merged.slice(0, 100_000) })
    .eq("id", data.id);
  if (updateError) return { error: updateError.message };
  return { appended: true, path: cleanPath, title: str(data.title) };
}

async function createLibraryFolder(path: string) {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to create a folder." };
  const cleanPath = safeLibraryFolder(path);
  if (!cleanPath) return { error: "A folder needs a name." };
  const title = cleanPath.split("/").pop() ?? cleanPath;
  const { error } = await supabase.from("readable_library_documents").insert({
    content: null,
    deleted: false,
    kind: "folder",
    path: cleanPath,
    title,
    user_id: userId,
  });
  if (error?.code === "23505") return { created: false, folder: cleanPath, note: "That folder already exists." };
  if (error) return { error: error.message };
  return { created: true, folder: cleanPath };
}

async function availableNotePath(userId: string, title: string, folder: string, currentId: string) {
  const leaf = safeLibraryLeaf(title);
  const dir = safeLibraryFolder(folder);
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const name = suffix === 1 ? leaf : `${leaf} ${suffix}`;
    const path = `${dir ? `${dir}/` : ""}${name}.md`;
    const { data, error } = await supabase
      .from("readable_library_documents")
      .select("id")
      .eq("user_id", userId)
      .eq("path", path)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || str(data.id) === currentId) return { path, title: name };
  }
  throw new Error("Couldn't find an available note name.");
}

async function renameLibraryNote(path: string, title: string) {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to rename a note." };
  const cleanTitle = safeLibraryLeaf(title);
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("id,path")
    .eq("deleted", false)
    .eq("kind", "note")
    .eq("path", path.trim())
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No note at '${path.trim()}'.` };
  const folder = str(data.path).split("/").slice(0, -1).join("/");
  try {
    const target = await availableNotePath(userId, cleanTitle, folder, str(data.id));
    const { error: updateError } = await supabase
      .from("readable_library_documents")
      .update({ path: target.path, title: target.title })
      .eq("id", data.id);
    if (updateError) return { error: updateError.message };
    return { path: target.path, renamed: true, title: target.title };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Couldn't rename that note." };
  }
}

async function moveLibraryNote(path: string, folder: string) {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to move a note." };
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("id,path,title")
    .eq("deleted", false)
    .eq("kind", "note")
    .eq("path", path.trim())
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No note at '${path.trim()}'.` };
  try {
    const target = await availableNotePath(userId, str(data.title), folder, str(data.id));
    const { error: updateError } = await supabase
      .from("readable_library_documents")
      .update({ path: target.path, title: target.title })
      .eq("id", data.id);
    if (updateError) return { error: updateError.message };
    return { moved: true, path: target.path };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Couldn't move that note." };
  }
}

async function addPracticeTest(args: Record<string, unknown>) {
  const title = str(args.title).trim().slice(0, 160);
  if (!title) return { error: "A test title is required." };
  const groupName = str(args.group_name).trim().slice(0, 120) || GENERATED_TESTS_GROUP;
  const rawQuestions = Array.isArray(args.questions) ? args.questions : [];
  // Validate through the same parser the generation flow uses so a malformed
  // question (bad answer index, <2 options) is dropped, not saved broken.
  const parsed = parseTestContent({ attempts: [], questions: rawQuestions });
  if (!parsed) return { error: "No usable questions — each needs a prompt, at least two options, and a valid answer index." };
  // Spread the correct answers across the positions, exactly as the Study tab's
  // generator does — a model writing questions in chat has the same bias towards
  // putting the true option first, and this is the other lane that produces
  // tests. Safe here because the paper is brand new: `attempts` is empty, and
  // reordering options after an attempt exists would rewrite what the student
  // answered. See test-answer-balance.ts.
  const content = { ...parsed, questions: balanceAnswerPositions(parsed.questions) };
  const { data, error } = await supabase
    .from("study_artifacts")
    .insert({ content, group_name: groupName, kind: "test", status: "ready", title })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the test." };
  return {
    added: true,
    artifact: { id: str(data.id), kind: "test", title, url: "/study?section=tests" },
    group: groupName,
    kind: "test",
    questions: content.questions.length,
    title,
  };
}

async function addMindmap(args: Record<string, unknown>) {
  const title = str(args.title).trim().slice(0, 160);
  if (!title) return { error: "A mind map title is required." };
  const groupName = str(args.group_name).trim().slice(0, 120);
  // Accept a {outline} JSON wrapper or a bare markdown outline, then re-validate.
  const outline = parseGeneratedMindmap(str(args.outline));
  const content = outline ? parseMindmapContent({ outline }) : null;
  if (!content) return { error: "The outline wasn't usable — provide a markdown outline with a heading and nested bullets." };
  const { data, error } = await supabase
    .from("study_artifacts")
    .insert({ content, group_name: groupName, kind: "mindmap", status: "ready", title })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't save the mind map." };
  return {
    added: true,
    artifact: { id: str(data.id), kind: "mindmap", title, url: "/study?section=mindmaps" },
    group: groupName || null,
    kind: "mindmap",
    title,
  };
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

function matchDeckName(wanted: string, names: string[]): string | null {
  const exact = names.find((name) => name === wanted);
  if (exact) return exact;
  const lowered = wanted.toLowerCase();
  const insensitive = names.filter((name) => name.toLowerCase() === lowered);
  if (insensitive.length === 1) return insensitive[0] ?? null;
  const leaves = names.filter((name) => (name.split("::").pop() ?? name).toLowerCase() === lowered);
  return leaves.length === 1 ? (leaves[0] ?? null) : null;
}

async function readStudyDeck(deckName: string, rawOffset: number, rawLimit: number) {
  const wanted = deckName.trim();
  if (!wanted) return { error: "Which deck? Use list_study_decks first." };
  const { data: decks, error: deckError } = await supabase.from("study_decks").select("id,name").limit(200);
  if (deckError) return { error: deckError.message };
  const matched = matchDeckName(wanted, (decks ?? []).map((deck) => str(deck.name)));
  if (!matched) return { error: `No unique Study deck matched '${wanted}'. Use the full name from list_study_decks.` };
  const deck = (decks ?? []).find((row) => str(row.name) === matched);
  if (!deck) return { error: `No Study deck matched '${wanted}'.` };
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 20) : 12;
  const { data: cards, error } = await supabase
    .from("study_cards")
    .select("front,back,card_type,tags,suspended")
    .eq("deck_id", deck.id)
    .order("created_at")
    .range(offset, offset + limit - 1);
  if (error) return { error: error.message };
  return {
    cards: (cards ?? []).map((card) => ({
      back: clip(str(card.back), 600),
      card_type: str(card.card_type),
      front: clip(str(card.front), 300),
      suspended: card.suspended === true,
      tags: Array.isArray(card.tags) ? card.tags.map(str).filter(Boolean).slice(0, 20) : [],
    })),
    deck: matched,
    next_offset: (cards?.length ?? 0) === limit ? offset + limit : null,
    offset,
  };
}

async function listStudyArtifacts(kind: string) {
  const requestedKind = kind.trim().toLowerCase();
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

async function readStudyArtifact(id: string) {
  const artifactId = id.trim();
  if (!artifactId) return { error: "Which item? Use list_study_artifacts to get its id." };
  const { data, error } = await supabase
    .from("study_artifacts")
    .select("id,kind,title,group_name,status,content,updated_at")
    .eq("id", artifactId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No Study item with id '${artifactId}'.` };
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

async function addFlashcards(deckName: string, cards: { front: string; back: string }[]) {
  const name = deckName.trim().slice(0, 120);
  if (!name) return { error: "Deck name is required." };
  const cleanCards = cards
    .map((card) => ({ back: str(card.back).trim().slice(0, 20_000), front: str(card.front).trim().slice(0, 12_000) }))
    .filter((card) => card.front && card.back)
    .slice(0, 100);
  if (cleanCards.length === 0) return { error: "No valid cards — each needs a front and a back." };

  const { data: existingDecks, error: findError } = await supabase.from("study_decks").select("id,name").limit(200);
  if (findError) return { error: findError.message };
  const matchedName = matchDeckName(name, (existingDecks ?? []).map((deck) => str(deck.name)));
  const existing = matchedName ? (existingDecks ?? []).find((deck) => str(deck.name) === matchedName) : null;
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
  return {
    added: cleanCards.length,
    artifact: { id: deckId, kind: "flashcards", title: matchedName ?? name, url: "/study?section=cards" },
    created_deck: createdDeck,
    deck: matchedName ?? name,
  };
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
  const { data, error } = await supabase.from("calendar_events").insert({
    course: str(args.course).trim().slice(0, 200) || null,
    date,
    kind: EVENT_KINDS.has(kindRaw) ? kindRaw : "other",
    note: str(args.note).trim().slice(0, 4000) || null,
    source: "agent",
    time: str(args.time).trim().slice(0, 40) || null,
    title,
  }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't add that event." };
  return {
    added: true,
    artifact: { id: str(data.id), kind: "other", title, url: `/calendar?date=${encodeURIComponent(date)}` },
    date,
    title,
  };
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
      case "create_slide_deck": return await createSlideDeck(args);
      case "append_library_note": return await appendLibraryNote(str(args.path), str(args.content));
      case "create_library_folder": return await createLibraryFolder(str(args.path));
      case "rename_library_note": return await renameLibraryNote(str(args.path), str(args.title));
      case "move_library_note": return await moveLibraryNote(str(args.path), str(args.folder));
      case "list_study_decks": return await listStudyDecks();
      case "read_study_deck": return await readStudyDeck(str(args.deck_name), Number(args.offset), Number(args.limit));
      case "list_study_artifacts": return await listStudyArtifacts(str(args.kind));
      case "read_study_artifact": return await readStudyArtifact(str(args.id));
      case "add_flashcards": return await addFlashcards(str(args.deck_name), Array.isArray(args.cards) ? (args.cards as { front: string; back: string }[]) : []);
      case "add_practice_test": return await addPracticeTest(args);
      case "add_mindmap": return await addMindmap(args);
      case "list_calendar_events": return await listCalendarEvents(Number(args.days_ahead));
      case "add_calendar_event": return await addCalendarEvent(args);
      default: return { error: `Unknown tool '${call.name}'.` };
    }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Tool failed." };
  }
}
