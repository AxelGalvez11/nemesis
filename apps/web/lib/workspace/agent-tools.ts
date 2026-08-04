// Sessions-chat agent tools (owner decision 2026-07-20: READ + WRITE over the
// student's Library, Study, and Calendar). Schemas ride the OpenAI `tools`
// field straight through the valve to the model (tool_choice stays auto —
// DeepSeek thinking mode rejects forced choices, see
// docs/research/deepseek-tool-calling-fix-2026-07.md); executors run here in
// the browser against the same RLS-scoped Supabase tables the pages use, so
// the agent can never see or touch another account's data.

import {
  folderForNewItem,
  knownCourses,
  calendarEventPatch,
  deckDeletionVerdict,
  describeTarget,
  destructiveSpec,
  isDestructiveTool,
  isPatchFailure,
  noteReplacementBody,
  pendingDeleteInstruction,
  WORKSPACE_AGENT_TOOL_NAMES,
  workspaceId,
  type PendingDelete,
} from "@nemesis/shared";
import { supabase } from "@/lib/supabase";
import { refreshStudyAfterExternalWrite } from "@/lib/workspace/study-cloud-store";
import { mergeLibraryHits, type LexicalHit, type SemanticHit } from "./library-search-merge";
import { writeLibraryNote } from "./library-write";
import { parseGeneratedMindmap, parseMindmapContent, parseTestContent } from "./study-artifact-content";
import { splitCalendarConflicts } from "./calendar-conflicts";
import { balanceAnswerPositions } from "./test-answer-balance";

const MAX_NOTE_CHARS = 8_000;
// 🔴 30 made the model deny things that exist. list_study_decks orders by
// NAME, so with more than 30 decks anything past the alphabetical cutoff was
// invisible — the chat saved 22 cards to a deck and then told the owner the
// deck wasn't in the deck list (2026-08-03). 200 names is still only a few
// hundred tokens.
const MAX_LIST = 200;
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
        properties: { path: { description: "The note's path, e.g. 'Contract law/Consideration.md'", type: "string" } },
        required: ["path"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: `Create a new Library note for the student. Use markdown. If no folder was requested, OMIT folder — it is then filed under the student's own course automatically. Only pass folder when they named one. When the note draws on web sources, cite inline: end the claim with a link whose text is just a number, like [1](https://the-source-url), numbering sources in order. The Library renders these as small source pills and builds the note's Sources section from them automatically — never write a manual "Sources" list.`,
      name: "create_library_note",
      parameters: {
        properties: {
          content: { description: "Markdown body of the note", type: "string" },
          folder: { description: "Optional folder path like 'Contract law/Unit 3'", type: "string" },
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
        `Create and save a structured slide deck in the student's Library. You MUST use this when slides or a presentation are requested. If no folder was requested, OMIT folder — it is then filed under the student's own course automatically. Only pass folder when they named one.`,
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
      description: "Append markdown to an existing Library note without replacing its current contents. Cite web sources inline as numbered links like [1](https://the-source-url) — the Library turns them into source pills and a Sources section.",
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
              properties: {
                back: { type: "string" },
                card_type: {
                  description: "The learner's selected format for this card.",
                  enum: ["basic", "cloze", "reversed"],
                  type: "string",
                },
                front: { type: "string" },
              },
              required: ["front", "back", "card_type"],
              type: "object",
            },
            type: "array",
          },
          deck_name: { description: "Deck name, e.g. 'Constitutional law'", type: "string" },
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
          title: { description: "Test title, e.g. 'Commerce clause practice test'", type: "string" },
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
      // "Tell the student what you added and when" used to close this line, and
      // it was the loudest voice in the room on a syllabus import: the schema
      // description rides every turn, so it outranked anything the reply-side
      // prompt asked for. Fifty-one calls, fifty-one dates read back.
      description: "Add an event to the student's calendar. Do not read the event back to them afterwards; the calendar is where they will see it.",
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
  // ── Editing and removing what already exists ────────────────────────────────
  //
  // The descriptions below are deliberately flat and short. Two of this file's
  // schema lines have already steered the model badly — search_library's "use
  // this before answering anything" and add_calendar_event's date read-back —
  // because a tool description rides EVERY turn and outranks the system prompt.
  // A destructive tool that oversells itself is the worst version of that, so
  // none of these say "always", "whenever", or "make sure to".
  {
    function: {
      description:
        "Change an existing calendar event. Pass only the fields that should change; anything omitted is left alone. "
        + "Needs the event's id from list_calendar_events.",
      name: "update_calendar_event",
      parameters: {
        properties: {
          course: { description: "Course name, or empty string to clear it", type: "string" },
          date: { description: "New date, YYYY-MM-DD", type: "string" },
          event_id: { description: "The event's id from list_calendar_events", type: "string" },
          kind: { description: "One of assignment, exam, rotation, class, other", type: "string" },
          note: { description: "Details, or empty string to clear them", type: "string" },
          time: { description: "New time, or empty string to make it all-day", type: "string" },
          title: { description: "New title", type: "string" },
        },
        required: ["event_id"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Remove an event from the student's calendar. Needs the event's id from list_calendar_events.",
      name: "delete_calendar_event",
      parameters: {
        properties: { event_id: { description: "The event's id from list_calendar_events", type: "string" } },
        required: ["event_id"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "Replace a Library note's whole body with new text. Use append_library_note to add to the end instead. "
        + "Needs the note's id from search_library or read_library_note. "
        + "Cite web sources inline as numbered links like [1](https://the-source-url) — the Library turns them into source pills and a Sources section; never write a manual \"Sources\" list.",
      name: "replace_library_note",
      parameters: {
        properties: {
          content: { description: "The note's new full markdown body", type: "string" },
          note_id: { description: "The note's id from search_library", type: "string" },
        },
        required: ["note_id", "content"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "Move a Library note to the student's trash. It stops appearing in their Library but is recoverable. "
        + "Needs the note's id from search_library.",
      name: "delete_library_note",
      parameters: {
        properties: { note_id: { description: "The note's id from search_library", type: "string" } },
        required: ["note_id"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "Change the front or back of one flashcard. Pass only the side that changes. "
        + "Needs the card's id from read_study_deck.",
      name: "edit_flashcard",
      parameters: {
        properties: {
          back: { description: "New back/answer text", type: "string" },
          card_id: { description: "The card's id from read_study_deck", type: "string" },
          front: { description: "New front/question text", type: "string" },
        },
        required: ["card_id"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Delete one flashcard. This cannot be undone. Needs the card's id from read_study_deck.",
      name: "delete_flashcard",
      parameters: {
        properties: { card_id: { description: "The card's id from read_study_deck", type: "string" } },
        required: ["card_id"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "Rename a Study deck. Give the deck's current full name and the new name; its folder and cards stay where they are.",
      name: "rename_study_deck",
      parameters: {
        properties: {
          deck_name: { description: "The deck's current full name from list_study_decks", type: "string" },
          new_name: { description: "The new deck name", type: "string" },
        },
        required: ["deck_name", "new_name"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "Delete a Study deck. Only works on a deck with no cards left in it — a deck that still holds cards has to "
        + "be removed by the student from the Study page, because deleting it would destroy their review history.",
      name: "delete_study_deck",
      parameters: {
        properties: { deck_name: { description: "The deck's full name from list_study_decks", type: "string" } },
        required: ["deck_name"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Delete a practice test or mind map. This cannot be undone. Needs the id from list_study_artifacts.",
      name: "delete_study_artifact",
      parameters: {
        properties: { artifact_id: { description: "The artifact's id from list_study_artifacts", type: "string" } },
        required: ["artifact_id"],
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
    // Hand back the note's id as well as its path. Path is fine for reading and
    // appending, but it is NOT a stable handle: rename_library_note and
    // move_library_note both rewrite it, and availableNotePath hands freed names
    // straight to the next note. A delete keyed on a path the model picked up
    // three turns ago could land on a different note entirely. Ids never move.
    return { notes: await withNoteIds(hits.map(({ path, snippet, title }) => ({ path, snippet, title }))) };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Search failed." };
  }
}

/** Attach each note's stable id to a list of path-keyed hits, in one query. */
async function withNoteIds<T extends { path: string }>(hits: T[]): Promise<(T & { id: string })[]> {
  if (hits.length === 0) return [];
  const { data } = await supabase
    .from("readable_library_documents")
    .select("id,path")
    .eq("deleted", false)
    .in("path", hits.map((hit) => hit.path));
  const idByPath = new Map((data ?? []).map((row) => [str(row.path), str(row.id)]));
  return hits.map((hit) => ({ ...hit, id: idByPath.get(hit.path) ?? "" }));
}

async function readLibraryNote(path: string) {
  const { data, error } = await supabase
    .from("readable_library_documents")
    .select("id,path,title,content")
    .eq("deleted", false)
    .eq("path", path)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `No note at '${path}'. Use search_library to find the right path.` };
  return {
    content: clip(str(data.content)),
    id: str(data.id),
    path: str(data.path),
    title: str(data.title),
  };
}

/** The signed-in user id for THIS turn. readable_library_documents.user_id is
 *  NOT NULL with no auth.uid() default (unlike study_*), so every Library write
 *  must set it explicitly or the insert violates NOT NULL and the note never
 *  saves. Read from the cached session — no extra round-trip. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * The courses this student is actually taking, in their own words.
 *
 * Their calendar events' `course` field plus the top-level folders they made
 * themselves. Both are things they typed; nothing here is inferred, which is
 * what keeps course filing field-agnostic.
 *
 * NEVER THROWS — an empty list just means "file it where it is filed today".
 * Losing a note because a folder lookup timed out would be a far worse trade.
 */
async function loadKnownCourses(): Promise<string[]> {
  try {
    const [events, folders] = await Promise.all([
      supabase.from("calendar_events").select("course").not("course", "is", null).limit(500),
      supabase.from("readable_library_documents").select("path").eq("deleted", false).limit(1000),
    ]);
    const top = new Set<string>();
    for (const row of folders.data ?? []) {
      const segments = str((row as { path?: string }).path).split("/").filter(Boolean);
      if (segments.length > 1) top.add(segments[0] as string);
    }
    return knownCourses((events.data ?? []).map((row) => (row as { course?: string }).course), [...top]);
  } catch {
    return [];
  }
}

async function createLibraryNote(title: string, content: string, folder: string) {
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to save a note." };
  try {
    // An explicit folder always wins — the student asked for it. Otherwise
    // file by course instead of dropping everything in one pile.
    const destination = folder.trim()
      || folderForNewItem("note", `${title}\n${content}`, await loadKnownCourses());
    const saved = await writeLibraryNote({ content, folder: destination, title, userId });
    return {
      artifact: {
        id: saved.path,
        // Was "other", which labelled a saved note "Output" in the transcript.
        kind: "note",
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
      folder: str(args.folder).trim()
        || folderForNewItem("slides", `${title}\n${slides.map((slide) => slide.title).join("\n")}`, await loadKnownCourses()),
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
    artifact: {
      id: str(data.id),
      kind: "test",
      title,
      url: `/study?section=tests&artifact=${encodeURIComponent(str(data.id))}`,
    },
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
    .select("id,front,back,card_type,tags,suspended")
    .eq("deck_id", deck.id)
    .order("created_at")
    .range(offset, offset + limit - 1);
  if (error) return { error: error.message };
  return {
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
      // A test the student has TAKEN says so right in the list. Without this
      // the model had no idea an attempt happened unless it read the whole
      // artifact — "i just did the tests" got "did you?" back (2026-08-03).
      ...testAttemptSummary(artifact.content),
    })),
  };
}

/** For a test artifact: how many sittings and how the last one went, straight
 *  from the content column the list query already fetches. Empty object for
 *  anything that is not a taken test, so other kinds gain no noise. */
function testAttemptSummary(content: unknown): { attempts?: number; last_score?: string; last_taken_at?: string } {
  if (!content || typeof content !== "object") return {};
  const attempts = (content as { attempts?: unknown }).attempts;
  if (!Array.isArray(attempts) || attempts.length === 0) return {};
  const last = attempts[attempts.length - 1] as { at?: unknown; score?: unknown; total?: unknown };
  const summary: { attempts: number; last_score?: string; last_taken_at?: string } = { attempts: attempts.length };
  if (typeof last?.score === "number" && typeof last?.total === "number") summary.last_score = `${last.score}/${last.total}`;
  if (typeof last?.at === "string") summary.last_taken_at = last.at;
  return summary;
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

type AgentFlashcard = {
  front: string;
  back: string;
  card_type?: "basic" | "cloze" | "reversed";
};

async function addFlashcards(deckName: string, cards: AgentFlashcard[]) {
  const name = deckName.trim().slice(0, 120);
  if (!name) return { error: "Deck name is required." };
  const cleanCards = cards
    .map((card) => {
      const front = str(card.front).trim().slice(0, 12_000);
      const requestedType = str(card.card_type).trim().toLowerCase();
      const cardType =
        requestedType === "cloze" || requestedType === "reversed"
          ? requestedType
          : /\{\{c\d+::/.test(front)
            ? "cloze"
            : "basic";
      return {
        back: str(card.back).trim().slice(0, 20_000),
        cardType,
        front,
      };
    })
    .filter((card) => card.front && card.back)
    .flatMap((card) => [
      card,
      ...(card.cardType === "reversed"
        ? [{ back: card.front, cardType: card.cardType, front: card.back }]
        : []),
    ])
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
  // .select() so `added` is what LANDED, not what we tried to send. Without it
  // the tool reported its own intent, the model repeated that number to the
  // student, and the artifact card corroborated it — three confident sources
  // for one unchecked assumption.
  const { data: inserted, error: insertError } = await supabase
    .from("study_cards")
    .insert(cleanCards.map((card) => ({
      back: card.back,
      card_type: card.cardType,
      deck_id: deckId,
      front: card.front,
    })))
    .select("id");
  if (insertError) return { error: insertError.message };
  return {
    added: (inserted ?? []).length,
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
    .select("id,title,date,time,kind,course,note")
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

  // Look before writing (owner 2026-08-03: conflicts must be recognized, not
  // discovered later on the calendar). Same rules as the syllabus importer,
  // via the same lib/workspace/calendar-conflicts helpers: an event with this
  // name already on this date is NOT added again; a clock overlap is added
  // and reported so the model can say so. One date's rows is a tiny read.
  const time = str(args.time).trim().slice(0, 40) || null;
  const sameDay = await supabase.from("calendar_events").select("id,title,date,time,end_time").eq("date", date);
  if (!sameDay.error) {
    const existing: CalendarConflictEvent[] = (sameDay.data ?? []).map((row) => ({
      date: str(row.date),
      id: str(row.id),
      kind: "other",
      title: str(row.title),
      ...(row.time ? { time: str(row.time) } : {}),
      ...(row.end_time ? { endTime: str(row.end_time) } : {}),
    }));
    const incoming: CalendarConflictEvent = { date, id: "incoming", kind: "other", title, ...(time ? { time } : {}) };
    const split = splitCalendarConflicts([incoming], existing);
    if (split.duplicates.length > 0) {
      return {
        added: false,
        already_on_calendar: true,
        instruction: `"${title}" is already on the calendar for ${date} — nothing was added. Tell the student it was already there.`,
      };
    }
    const clash = split.clashes[0];
    if (clash) {
      const clashNote = `Heads up: it overlaps "${clash.existing.title}"${clash.existing.time ? ` at ${clash.existing.time}` : ""} on ${date}. Mention this to the student in one short line.`;
      return addCalendarEventRow(args, { date, kindRaw, time, title }, clashNote);
    }
  }
  return addCalendarEventRow(args, { date, kindRaw, time, title }, null);
}

type CalendarConflictEvent = Parameters<typeof splitCalendarConflicts>[0][number];

async function addCalendarEventRow(
  args: Record<string, unknown>,
  fields: { date: string; kindRaw: string; time: string | null; title: string },
  clashNote: string | null,
) {
  const { date, kindRaw, time, title } = fields;
  const { data, error } = await supabase.from("calendar_events").insert({
    course: str(args.course).trim().slice(0, 200) || null,
    date,
    kind: EVENT_KINDS.has(kindRaw) ? kindRaw : "other",
    note: str(args.note).trim().slice(0, 4000) || null,
    // "manual", not "agent", and this is load-bearing: calendar-workspace routes
    // source === "agent" to EventViewDialog, which takes only onClose — no edit,
    // no delete. Every event chat wrote was therefore permanent, while the dialog
    // told the student to "ask it to change this" with no update or delete tool
    // in AGENT_TOOLS to change it with. The student asked for this event, so it
    // is theirs to correct. Provenance stays readable in `note`.
    source: "manual",
    time,
    title,
  }).select("id").single();
  if (error || !data) return { error: error?.message ?? "Couldn't add that event." };
  // NO `artifact` here, deliberately (owner 2026-07-28: "it shouldnt output as
  // an artifact in sidebar either"). Every other write returns one because a
  // deck, test or note has its own destination that a card is the only route
  // to. An event does not: it is one row on a calendar the student already
  // has a tab for, so the card added a click and a duplicate rather than a way
  // in. Dropping it here clears BOTH surfaces at once — the transcript cards
  // and the right rail read the same `outputs` array (chat-api.ts).
  return {
    added: true,
    date,
    // Owner 2026-07-28: "syllabus and calendar events should not be outputted
    // into chat, the chat should just say 'ive put the events into the
    // calendar'". Steering it from the TOOL RESULT rather than stripping the
    // model's reply afterwards — stripping throws away real answers when the
    // same turn was doing something else too.
    //
    // It says "no card" out loud because CHAT_TOOLS_PROMPT promises one for
    // saves in general, and that promise is now false for this tool alone. A
    // prompt that over-claims what a tool did is how the model starts
    // narrating the gap — listing the dates back to prove the save happened.
    instruction:
      "Saved. This tool shows the student NO card and NO artifact — the calendar itself is where the event lives, "
      + "and they already have it open. Do NOT write the event back: no dates, no table, no list. "
      + "When every event in this batch is in, reply with ONE short line: \"I've put the events into your calendar.\" "
      + "Add a second short line only if something could not be added, naming just those."
      + (clashNote ? ` ${clashNote}` : ""),
    title,
  };
}

/**
 * Resolve the handle a destructive verb was given.
 *
 * Returns the row's id only when it is a real uuid AND the row exists and
 * belongs to this student. A model that passed a title, a list position, or an
 * id it half-remembered gets a readable error naming the tool that produces
 * real ids, instead of a query that reaches the database and matches something
 * the student never mentioned.
 */
async function resolveRow(
  table: "calendar_events" | "readable_library_documents" | "study_cards" | "study_artifacts",
  rawId: unknown,
  hint: string,
): Promise<{ error: string } | { id: string; row: Record<string, unknown> }> {
  const id = workspaceId(rawId);
  if (!id) return { error: `That is not a valid id. ${hint}` };
  const query = supabase.from(table).select("*").eq("id", id);
  const { data, error } = await (table === "readable_library_documents"
    ? query.eq("deleted", false)
    : query).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: `Nothing found with that id — it may already be gone. ${hint}` };
  return { id, row: data as Record<string, unknown> };
}

async function updateCalendarEventTool(args: Record<string, unknown>) {
  const found = await resolveRow("calendar_events", args.event_id, "Use list_calendar_events to get event ids.");
  if ("error" in found) return found;
  // Strip the handle before building the patch: `event_id` is how we found the
  // row, not a field on it, and letting it through would make a call that
  // changes nothing look like a change.
  const fields = Object.fromEntries(Object.entries(args).filter(([key]) => key !== "event_id"));
  const patch = calendarEventPatch(fields);
  if (isPatchFailure(patch)) return patch;
  const { error } = await supabase.from("calendar_events").update(patch).eq("id", found.id);
  if (error) return { error: error.message };
  return {
    changed: Object.keys(patch),
    // Same reasoning as add_calendar_event: the calendar is where they see it,
    // so do not read the event back at them.
    instruction:
      "Updated. Do not read the event back — the calendar shows it. Reply with one short line saying what changed.",
    title: str(patch.title) || str(found.row.title),
    updated: true,
  };
}

async function deleteCalendarEventTool(args: Record<string, unknown>) {
  const found = await resolveRow("calendar_events", args.event_id, "Use list_calendar_events to get event ids.");
  if ("error" in found) return found;
  const { error } = await supabase.from("calendar_events").delete().eq("id", found.id);
  if (error) return { error: error.message };
  return { deleted: true, title: str(found.row.title) };
}

async function replaceLibraryNoteTool(args: Record<string, unknown>) {
  const found = await resolveRow("readable_library_documents", args.note_id, "Use search_library to get note ids.");
  if ("error" in found) return found;
  if (str(found.row.kind) !== "note") return { error: "That id is a folder, not a note." };
  const body = noteReplacementBody(args.content);
  if (!body) return { error: "Nothing to write — a replacement needs a body. Use delete_library_note to remove it." };
  const { error } = await supabase
    .from("readable_library_documents")
    .update({ content: body, updated_at: new Date().toISOString() })
    .eq("id", found.id);
  if (error) return { error: error.message };
  return { path: str(found.row.path), replaced: true, title: str(found.row.title) };
}

async function deleteLibraryNoteTool(args: Record<string, unknown>) {
  const found = await resolveRow("readable_library_documents", args.note_id, "Use search_library to get note ids.");
  if ("error" in found) return found;
  if (str(found.row.kind) !== "note") {
    // Folder deletion would take every note inside it with no way to see what
    // that was from here. Out of scope for this lane on purpose.
    return { error: "That id is a folder. Folders are removed from the Library page, not from chat." };
  }
  // Soft: `deleted` is a flag, so this is recoverable and the row survives.
  const { error } = await supabase
    .from("readable_library_documents")
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq("id", found.id);
  if (error) return { error: error.message };
  return { deleted: true, recoverable: true, title: str(found.row.title) };
}

async function editFlashcardTool(args: Record<string, unknown>) {
  const found = await resolveRow("study_cards", args.card_id, "Use read_study_deck to get card ids.");
  if ("error" in found) return found;
  // Same only-what-was-named rule as the calendar patch: a call carrying just
  // `back` must not blank the front.
  const patch: { back?: string; front?: string } = {};
  if ("front" in args) {
    const front = str(args.front).trim().slice(0, 12_000);
    if (!front) return { error: "A card's front cannot be empty." };
    patch.front = front;
  }
  if ("back" in args) {
    const back = str(args.back).trim().slice(0, 12_000);
    if (!back) return { error: "A card's back cannot be empty." };
    patch.back = back;
  }
  if (Object.keys(patch).length === 0) return { error: "Nothing to change — pass front, back, or both." };
  const { error } = await supabase.from("study_cards").update(patch).eq("id", found.id);
  if (error) return { error: error.message };
  return { changed: Object.keys(patch), edited: true };
}

async function deleteFlashcardTool(args: Record<string, unknown>) {
  const found = await resolveRow("study_cards", args.card_id, "Use read_study_deck to get card ids.");
  if ("error" in found) return found;
  const { error } = await supabase.from("study_cards").delete().eq("id", found.id);
  if (error) return { error: error.message };
  return { deleted: true, front: str(found.row.front).slice(0, 120) };
}

/** The deck a name refers to, or an error the model can act on. */
async function findDeck(deckName: string) {
  const wanted = deckName.trim();
  if (!wanted) return { error: "Which deck? Use list_study_decks to see the names." };
  const { data, error } = await supabase.from("study_decks").select("id,name").limit(200);
  if (error) return { error: error.message };
  const matches = (data ?? []).filter((deck) =>
    str(deck.name).toLowerCase() === wanted.toLowerCase()
    || str(deck.name).toLowerCase().endsWith(`::${wanted.toLowerCase()}`)
  );
  const only = matches.length === 1 ? matches[0] : undefined;
  if (!only) {
    return { error: `No single Study deck matched '${wanted}'. Use the full name from list_study_decks.` };
  }
  return { id: str(only.id), name: str(only.name) };
}

async function renameStudyDeckTool(args: Record<string, unknown>) {
  const deck = await findDeck(str(args.deck_name));
  if ("error" in deck) return deck;
  const newName = str(args.new_name).trim().slice(0, 120);
  if (!newName) return { error: "A deck needs a name." };
  const { error } = await supabase.from("study_decks").update({ name: newName }).eq("id", deck.id);
  if (error) return { error: error.message };
  return { from: deck.name, renamed: true, to: newName };
}

async function deleteStudyDeckTool(args: Record<string, unknown>) {
  const deck = await findDeck(str(args.deck_name));
  if ("error" in deck) return deck;
  const { count, error: countError } = await supabase
    .from("study_cards")
    .select("id", { count: "exact", head: true })
    .eq("deck_id", deck.id);
  if (countError) return { error: countError.message };
  // 🔴 FAIL CLOSED. `count ?? 0` would have read "I could not count" as "it is
  // empty" and deleted the deck — a null count is not an error, it is what a
  // head-count returns when the option is not honoured, so no `countError`
  // would have caught it. On a permanent delete, unknown has to mean no.
  if (typeof count !== "number") {
    return { error: "Couldn't check whether that deck still has cards in it, so it was left alone." };
  }
  // The guard. study_decks has no soft-delete column, so this is permanent and
  // takes every card's scheduling history with it. See deckDeletionVerdict.
  const verdict = deckDeletionVerdict(count);
  if (!verdict.allowed) return { error: verdict.reason };
  const { error } = await supabase.from("study_decks").delete().eq("id", deck.id);
  if (error) return { error: error.message };
  return { deleted: true, deck: deck.name };
}

async function deleteStudyArtifactTool(args: Record<string, unknown>) {
  const found = await resolveRow("study_artifacts", args.artifact_id, "Use list_study_artifacts to get ids.");
  if ("error" in found) return found;
  const { error } = await supabase.from("study_artifacts").delete().eq("id", found.id);
  if (error) return { error: error.message };
  return { deleted: true, kind: str(found.row.kind), title: str(found.row.title) };
}

/**
 * Look up what a pending delete is about to destroy, for the confirmation card.
 *
 * Best effort: a failed lookup costs the card its label, never the student their
 * confirmation. The guard still runs when they approve.
 */
async function pendingDeleteFor(name: string, args: Record<string, unknown>): Promise<PendingDelete | null> {
  const spec = destructiveSpec(name);
  if (!spec) return null;
  const handle = args[spec.handle];
  let label = spec.table === null ? str(handle) : "";
  if (spec.table !== null) {
    const id = workspaceId(handle);
    if (id) {
      const { data } = await supabase.from(spec.table).select(spec.labelColumn).eq("id", id).maybeSingle();
      label = str((data as Record<string, unknown> | null)?.[spec.labelColumn]);
    }
  }
  return {
    args,
    recoverable: spec.recoverable,
    target: describeTarget(spec.noun, label),
    tool: name,
  };
}

/**
 * Tools that CHANGE the student's Study page.
 *
 * These write straight to Supabase, which is correct — but the Study store
 * holds its list in memory and, unlike the Library store, keeps no live channel
 * open to hear about outside writes. Without a nudge the page shows a stale
 * list, which is how a quiz the chat genuinely saved was not on the Tests page
 * (owner 2026-08-01).
 *
 * One set in one place, checked at the dispatch site — the same reasoning as
 * the confirmation gate below. A per-handler call is one a future tool forgets,
 * and forgetting it means silently losing the student's work on screen.
 */
const STUDY_WRITING_TOOLS = new Set([
  "add_flashcards",
  "add_mindmap",
  "add_practice_test",
  "delete_flashcard",
  "delete_study_artifact",
  "delete_study_deck",
  "edit_flashcard",
  "rename_study_deck",
]);

/** Run one tool call; ALWAYS resolves to a JSON-stringifiable result (errors
 *  become `{error}` so the model can react instead of the turn dying). */
export async function executeAgentTool(
  call: AgentToolCall,
  /** Set ONLY by the student's click on the confirmation card. The model has no
   *  way to send it, which is the entire point. */
  options: { confirmed?: boolean } = {},
): Promise<unknown> {
  const args = parseArgs(call.arguments);
  // 🔴 INSIDE THE TRY, and that is not a formatting preference. This file's
  // contract is that a tool NEVER throws — a failure comes back as {error} so
  // the model can react, instead of the turn dying with an empty bubble. The
  // gate does a label lookup over the network, so a blip on that lookup outside
  // the try would break the contract at exactly the moment a delete was pending.
  try {
    // THE CONFIRMATION GATE — one place, not a check inside each delete
    // handler. A per-handler check is one a future tool can forget, and the cost
    // of forgetting is a delete with no confirmation at all. Adding a name to
    // DESTRUCTIVE_TOOLS is what puts it behind this line, and a shared test
    // asserts the map and the tool catalogue never drift apart.
    if (!options.confirmed && isDestructiveTool(call.name)) {
      const pending = await pendingDeleteFor(call.name, args);
      if (pending) {
        return {
          confirm_required: true,
          instruction: pendingDeleteInstruction(pending.target, pending.recoverable),
          pending_delete: pending,
        };
      }
    }
    const result = await dispatchTool(call, args, options);
    // A write the student cannot see is a write that did not happen, as far as
    // they are concerned. Only on success: a failed tool must not blank the list.
    if (STUDY_WRITING_TOOLS.has(call.name) && !isToolError(result)) refreshStudyAfterExternalWrite();
    return result;
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Tool failed." };
  }
}

function isToolError(result: unknown): boolean {
  return typeof result === "object" && result !== null && "error" in result;
}

/** The dispatch table itself. Split out so executeAgentTool can act on the
 *  RESULT of a tool without wrapping every case in bookkeeping. */
async function dispatchTool(
  call: AgentToolCall,
  args: Record<string, unknown>,
  options: { confirmed?: boolean },
): Promise<unknown> {
  void options;
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
    case "add_flashcards": return await addFlashcards(str(args.deck_name), Array.isArray(args.cards) ? (args.cards as AgentFlashcard[]) : []);
    case "add_practice_test": return await addPracticeTest(args);
    case "add_mindmap": return await addMindmap(args);
    case "list_calendar_events": return await listCalendarEvents(Number(args.days_ahead));
    case "add_calendar_event": return await addCalendarEvent(args);
    case "update_calendar_event": return await updateCalendarEventTool(args);
    case "delete_calendar_event": return await deleteCalendarEventTool(args);
    case "replace_library_note": return await replaceLibraryNoteTool(args);
    case "delete_library_note": return await deleteLibraryNoteTool(args);
    case "edit_flashcard": return await editFlashcardTool(args);
    case "delete_flashcard": return await deleteFlashcardTool(args);
    case "rename_study_deck": return await renameStudyDeckTool(args);
    case "delete_study_deck": return await deleteStudyDeckTool(args);
    case "delete_study_artifact": return await deleteStudyArtifactTool(args);
    default: return { error: `Unknown tool '${call.name}'.` };
  }
}
