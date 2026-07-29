// WHAT the phone's chat can do to the student's own workspace — the schemas and
// the pure argument handling. The code that actually touches Supabase lives in
// api/agentTools.ts; this half pulls in nothing but pure data, so the Deno test
// runner can load it (it can load neither Supabase nor React Native), which is
// what lets the catalog itself be tested.
//
// Owner 2026-07-24: "the phone chat needs to be able to create flashcards, tests,
// mindmaps and those should show up in the study page. it should also be able to
// manipulate the library too."
//
// Before this, the phone's chat had NO tool lane at all: no schemas on the
// request, no tool_call parsing, no executor. Asking it for a practice test got a
// nicely formatted test in the message bubble and nothing on the Study page.
//
// These schemas ride the OpenAI `tools` field straight through the metering valve
// to the model. `tool_choice` is never sent — DeepSeek's thinking mode rejects a
// forced choice (docs/research/deepseek-tool-calling-fix-2026-07.md) — so the
// model decides, and the descriptions below are the only steering there is. They
// are written as instructions to the model, not as documentation for us.
//
// EVERY EXECUTOR RUNS ON THE PHONE, under the signed-in student's own RLS-scoped
// Supabase session. There is no server-side agent and no service key in this path,
// so a tool physically cannot read or write another account's rows.
//
// DELETE IS NOT IN THIS LIST, deliberately. Create, read, edit, rename, move and
// folder-making cover "manipulate the library"; deleting is the one action with no
// confirm step available inside a chat turn and no undo surface on the phone
// today. A model that misreads "clear up my ACE inhibitor notes" should not be
// able to act on that reading. Adding it later means adding a confirm first.

import { EXAM_ITEM_RULES_SHORT } from "./item-writing.ts";
import { GENERATED_NOTES_FOLDER, GENERATED_SLIDES_FOLDER, GENERATED_TESTS_GROUP } from "./academic-skills.ts";
import { WORKSPACE_AGENT_TOOL_NAMES, type WorkspaceAgentToolName } from "@nemesis/shared";

/** Every tool the phone offers, as a literal tuple. api/agentTools.ts keys its
 *  handler map by this union, so tsc refuses to compile a tool that is advertised
 *  to the model with nothing behind it — the failure that would otherwise show up
 *  as "Unknown tool" mid-conversation. */
export const AGENT_TOOL_NAMES = WORKSPACE_AGENT_TOOL_NAMES;

export type AgentToolName = WorkspaceAgentToolName;

export function isAgentToolName(name: string): name is AgentToolName {
  return (AGENT_TOOL_NAMES as readonly string[]).includes(name);
}

/** Longest note body handed back to the model. A note can be far longer than this;
 *  a truncation marker is added so the model knows it is reading part of one and
 *  does not, say, summarise "the whole note" from its first eight thousand
 *  characters. */
export const MAX_NOTE_CHARS = 8_000;
/** Rows returned by a list or a search. */
export const MAX_LIST = 30;
/** Cards accepted in one add_flashcards call. */
export const MAX_CARDS_PER_CALL = 100;
/** Slides accepted in one create_slide_deck call. */
export const MAX_SLIDES_PER_CALL = 40;

export function clip(text: string, max = MAX_NOTE_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text;
}

/** Arguments as an object, whatever the model actually sent. The `arguments` field
 *  is a JSON STRING assembled from stream fragments, so a truncated turn yields
 *  invalid JSON — an empty object then flows into the executor, which reports a
 *  missing-field error the model can act on. Throwing here would kill the turn. */
export function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Front/back pairs a model wrote, cleaned and bounded. A card missing either side
 *  is dropped rather than saved half-blank: a card with no back cannot be
 *  reviewed, so it would sit in the deck failing forever. */
export function usableCards(raw: unknown): { front: string; back: string }[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  return list
    .flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const row = entry as Record<string, unknown>;
      const front = str(row.front).trim().slice(0, 800);
      const back = str(row.back).trim().slice(0, 4_000);
      const key = front.toLocaleLowerCase().replace(/\s+/g, " ");
      const answerKey = back.toLocaleLowerCase().replace(/\s+/g, " ");
      const vague = /^(?:what is|define|explain)\s+(?:it|this|that|the concept)\??$/i.test(front);
      const questionCount = (front.match(/\?/g) ?? []).length;
      // Quality gate for new AI cards. The Library reader remains permissive;
      // only newly generated cards are held to this minimum-information bar.
      if (
        !front ||
        !back ||
        front.length < 3 ||
        answerKey === key ||
        vague ||
        questionCount > 1 ||
        seen.has(key)
      ) return [];
      seen.add(key);
      return [{ back, front }];
    })
    .slice(0, MAX_CARDS_PER_CALL);
}

export interface UsableSlide {
  title: string;
  bullets: string[];
  speakerNotes: string;
}

/** Clean, bounded slide payloads. A slide without a title or content is not a
 * slide; dropping it keeps malformed model output out of the Library artifact. */
export function usableSlides(raw: unknown): UsableSlide[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const row = entry as Record<string, unknown>;
      const title = str(row.title).trim().slice(0, 180);
      const bullets = (Array.isArray(row.bullets) ? row.bullets : [])
        .map((bullet) => str(bullet).trim().slice(0, 500))
        .filter(Boolean)
        .slice(0, 8);
      const speakerNotes = str(row.speaker_notes).trim().slice(0, 4_000);
      return title && (bullets.length > 0 || speakerNotes) ? [{ bullets, speakerNotes, title }] : [];
    })
    .slice(0, MAX_SLIDES_PER_CALL);
}

/**
 * Which existing deck a name refers to, or null for "make a new one".
 *
 * The phone encodes Study folders IN THE DECK NAME as "Folder::Deck"
 * (cloudStudy.ts deckGroupInfo — there is no separate group entity server-side).
 * So an exact-match lookup, which is what the web's copy of this tool does, fails
 * to find "Cardiology" when the student's deck is really named
 * "Pharmacology::Cardiology", and silently creates a SECOND deck of that name at
 * the top level. The student then adds cards for weeks and finds them split across
 * two decks with the same label.
 *
 * So: exact match first, then a unique leaf match. Ambiguity — two folders each
 * holding a "Cardiology" — returns null rather than guessing, and the caller
 * creates the deck exactly as named, which is the only outcome that cannot put
 * cards somewhere the student did not ask for.
 */
/**
 * A stored deck name split into the parts a PERSON would say.
 *
 * "Pharmacology::Cardiology" is storage, not language, and a model handed that
 * string says it back to the student verbatim — the raw encoding turned up in
 * a saved chat message on device (2026-07-27), the same class of leak as the
 * Supabase URL that used to show when editing a card. Handing back `name` and
 * `folder` separately removes the temptation instead of instructing against it,
 * while `full` keeps the exact string the other tools need.
 */
export function deckNameParts(full: string): { name: string; folder: string; full: string } {
  const parts = full.split("::").map((part) => part.trim()).filter(Boolean);
  return {
    folder: parts.length > 1 ? parts.slice(0, -1).join(" / ") : "",
    full,
    name: parts.length ? (parts[parts.length - 1] as string) : full,
  };
}

export function matchDeckName(wanted: string, existing: readonly string[]): string | null {
  const name = wanted.trim();
  if (!name) return null;
  const exact = existing.find((deck) => deck === name);
  if (exact) return exact;
  const lowered = name.toLowerCase();
  const caseInsensitive = existing.filter((deck) => deck.toLowerCase() === lowered);
  if (caseInsensitive.length === 1) return caseInsensitive[0] as string;
  const leafMatches = existing.filter((deck) => {
    const leaf = deck.slice(deck.lastIndexOf("::") + 2);
    return leaf.toLowerCase() === lowered;
  });
  return leafMatches.length === 1 ? (leafMatches[0] as string) : null;
}

/** OpenAI-format tool schemas sent with every phone chat turn that is allowed
 *  tools. Descriptions are addressed to the model. */
export const AGENT_TOOLS = [
  {
    function: {
      description:
        "Search the student's Library notes by title and text. Returns each match's path, title, and a snippet. Use this before answering anything about their own notes, and to get the path other Library tools need.",
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
        properties: { path: { description: "The note's path, e.g. 'Biology/Cell division.md'", type: "string" } },
        required: ["path"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        `Create a new Library note. Write the body yourself in markdown. If the student did not name a folder, omit folder and it will be filed in '${GENERATED_NOTES_FOLDER}'. Tell the student you created it and where it is.`,
      name: "create_library_note",
      parameters: {
        properties: {
          content: { description: "Markdown body of the note", type: "string" },
          folder: { description: `Optional requested folder path. Omit it to use '${GENERATED_NOTES_FOLDER}'.`, type: "string" },
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
        `Create and save a slide deck as a structured Library artifact. You MUST use this when the student asks for slides or a presentation. If they did not name a folder, omit folder and it will be filed in '${GENERATED_SLIDES_FOLDER}'. Tell the student the saved path.`,
      name: "create_slide_deck",
      parameters: {
        properties: {
          folder: {
            description: `Optional requested folder path. Omit it to use '${GENERATED_SLIDES_FOLDER}'.`,
            type: "string",
          },
          slides: {
            items: {
              properties: {
                bullets: {
                  description: "Up to 8 concise teaching bullets; one idea per bullet",
                  items: { type: "string" },
                  type: "array",
                },
                speaker_notes: {
                  description: "Optional explanation, example, or teaching cue not shown as a bullet",
                  type: "string",
                },
                title: { description: "The slide heading", type: "string" },
              },
              required: ["title", "bullets"],
              type: "object",
            },
            type: "array",
          },
          title: { description: "Deck title", type: "string" },
        },
        required: ["title", "slides"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "Add text to the END of an existing Library note, keeping everything already in it. Use this to add to a note rather than rewriting one. Get the path from search_library.",
      name: "append_library_note",
      parameters: {
        properties: {
          content: { description: "Markdown to add at the end of the note", type: "string" },
          path: { description: "The note's path", type: "string" },
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
        properties: { path: { description: "Folder path like 'Biology/Unit 3'", type: "string" } },
        required: ["path"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Rename one Library note. Get its path from search_library. The note stays in its current folder.",
      name: "rename_library_note",
      parameters: {
        properties: {
          path: { description: "The note's current path", type: "string" },
          title: { description: "The new title", type: "string" },
        },
        required: ["path", "title"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description: "Move one Library note into a folder. Get its path from search_library.",
      name: "move_library_note",
      parameters: {
        properties: {
          folder: { description: "Destination folder path, or \"\" for the top level", type: "string" },
          path: { description: "The note's current path", type: "string" },
        },
        required: ["path", "folder"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "List the student's flashcard decks with card counts. Each deck gives `name`, its `folder` if it is in one, and `full_name`. Pass `full_name` to other tools; when writing to the student say the name and the folder in words (\"your Cardiology deck in Pharmacology\") and NEVER show the 'Folder::Deck' form — that is storage, not something they typed.",
      name: "list_study_decks",
      parameters: { properties: {}, type: "object" },
    },
    type: "function",
  },
  {
    function: {
      description:
        "Read the cards in one Study deck so you can tutor from, compare, summarize, or improve the student's actual study material. Call list_study_decks first when the deck name is uncertain.",
      name: "read_study_deck",
      parameters: {
        properties: {
          deck_name: { description: "Full deck name or its unique leaf name", type: "string" },
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
        "List the student's saved Study tests and mind maps with their ids, titles, folders, and status. Use read_study_artifact for one item's content.",
      name: "list_study_artifacts",
      parameters: {
        properties: {
          kind: { description: "Optional: 'test' or 'mindmap'", type: "string" },
        },
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
      description:
        "Add flashcards to a deck, creating the deck if it does not exist. Every requested flashcard must be saved with this tool rather than printed only in chat. Apply the minimum-information principle: one retrievable fact or relationship per card, precise prompt, concise self-contained answer, no duplicates, and no answer leakage. Tell the student how many you added and to which deck.",
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
          deck_name: {
            description:
              "Deck name. To put it inside a folder, use 'Folder::Deck' — that encoding is for THIS field only; never write it in your reply to the student. Check list_study_decks first so you add to a deck they already have instead of making a near-duplicate.",
            type: "string",
          },
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
        `Save a multiple-choice practice test to the student's Study page. Every requested test must be saved with this tool rather than printed only in chat. Write the questions yourself from the material — do not ask another tool to generate them. Use '${GENERATED_TESTS_GROUP}' when the student did not name a group. Tell the student you saved it. ` +
        `How to write them: ${EXAM_ITEM_RULES_SHORT} That last rule matters here specifically: the app re-seats the options after saving, so 'option B' in an explanation would become wrong.`,
      name: "add_practice_test",
      parameters: {
        properties: {
          group_name: { description: `Optional folder on the Study page. Omit it to use '${GENERATED_TESTS_GROUP}'.`, type: "string" },
          questions: {
            items: {
              properties: {
                answer: { description: "0-based index into options of the correct answer", type: "number" },
                options: { items: { type: "string" }, type: "array" },
                q: { description: "The question", type: "string" },
                why: { description: "One-sentence explanation of the correct answer", type: "string" },
              },
              required: ["q", "options", "answer", "why"],
              type: "object",
            },
            type: "array",
          },
          title: { description: "Test title, e.g. 'Limits and continuity practice test'", type: "string" },
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
          group_name: { description: "Optional folder on the Study page", type: "string" },
          outline: {
            description:
              "Markdown outline: one '# Topic' root heading, then nested '- ' bullets (2-space indents, at most 3 levels, at most ~35 nodes)",
            type: "string",
          },
          title: { description: "Mind map title, e.g. 'Cellular respiration'", type: "string" },
        },
        required: ["title", "outline"],
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      description:
        "List the student's upcoming Calendar events. Use this whenever the answer depends on their schedule, deadlines, exams, classes, or available study time.",
      name: "list_calendar_events",
      parameters: {
        properties: {
          days_ahead: { description: "How many days forward to read (default 14, maximum 120)", type: "number" },
        },
        type: "object",
      },
    },
    type: "function",
  },
  {
    function: {
      // "and tell them what was scheduled" used to close this line, and it was
      // the loudest voice in the room on a syllabus import: a schema description
      // rides EVERY turn, so it outranked anything the system prompt or the tool
      // result asked for. Fifty-one calls, fifty-one dates read back (web hit
      // this first — same wording, same outcome).
      description: "Add an event to the student's Calendar. Do not read the event back to them afterwards; the Calendar tab is where they will see it.",
      name: "add_calendar_event",
      parameters: {
        properties: {
          course: { description: "Optional course name", type: "string" },
          date: { description: "Event date in YYYY-MM-DD", type: "string" },
          kind: { description: "assignment, exam, rotation, class, or other", type: "string" },
          note: { description: "Optional details", type: "string" },
          time: { description: "Optional time such as '14:00' or '2:00 PM'", type: "string" },
          title: { description: "Event title", type: "string" },
        },
        required: ["title", "date"],
        type: "object",
      },
    },
    type: "function",
  },
] as const;
