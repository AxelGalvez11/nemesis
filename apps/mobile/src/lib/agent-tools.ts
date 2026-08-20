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
import { toolDescription, WORKSPACE_AGENT_TOOL_NAMES, type WorkspaceAgentToolName } from "@nemesis/shared";

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
export type AgentCardType = "basic" | "cloze" | "reversed";

export function usableCards(raw: unknown): { front: string; back: string; cardType: AgentCardType }[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  return list
    .flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const row = entry as Record<string, unknown>;
      const front = str(row.front).trim().slice(0, 800);
      const back = str(row.back).trim().slice(0, 4_000);
      const requestedType = str(row.card_type).trim().toLowerCase();
      const cardType: AgentCardType =
        requestedType === "cloze" || requestedType === "reversed"
          ? requestedType
          : /\{\{c\d+::/.test(front)
            ? "cloze"
            : "basic";
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
      return [{ back, cardType, front }];
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
        // 🔴 THIS DESCRIPTION USED TO END "Use this before answering anything about
        // their own notes", and a tool's schema description outranks the system
        // prompt. Asked to build flashcards "from this" — meaning a recording made
        // moments earlier in the same conversation — the model dutifully swept the
        // Library first and built the cards from whatever it found there instead
        // (owner 2026-07-30). "Before answering" made retrieval the first move on
        // every turn, including the turns whose subject was already on screen.
        "Search the student's Library notes by title and text. Returns each match's path, title, and a snippet. Use it when the student refers to material that is NOT already in this conversation, or names a note to find, and to get the path other Library tools need. When they point at something this conversation already produced or discussed, work from that instead of searching.",
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
      description: toolDescription("read_library_note", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("create_library_note", EXAM_ITEM_RULES_SHORT),
      name: "create_library_note",
      parameters: {
        properties: {
          content: { description: "Markdown body of the note", type: "string" },
          folder: { description: "Optional folder path, only when the student named one. Omit to file by course.", type: "string" },
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
      description: toolDescription("create_slide_deck", EXAM_ITEM_RULES_SHORT),
      name: "create_slide_deck",
      parameters: {
        properties: {
          folder: {
            description: "Optional folder path, only when the student named one. Omit to file by course.",
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
      description: toolDescription("append_library_note", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("create_library_folder", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("rename_library_note", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("move_library_note", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("list_study_decks", EXAM_ITEM_RULES_SHORT),
      name: "list_study_decks",
      parameters: { properties: {}, type: "object" },
    },
    type: "function",
  },
  {
    function: {
      description: toolDescription("read_study_deck", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("list_study_artifacts", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("read_study_artifact", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("add_flashcards", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("add_practice_test", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("add_mindmap", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("list_calendar_events", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("add_calendar_event", EXAM_ITEM_RULES_SHORT),
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
  // ── Editing and removing what already exists ────────────────────────────────
  //
  // Short and flat on purpose. Two lines in this file have already steered the
  // model badly — search_library's "use this before answering anything" and
  // add_calendar_event's date read-back — because a schema description rides
  // EVERY turn and outranks the system prompt. A destructive tool that oversells
  // itself is the worst version of that, so none of these say "always",
  // "whenever", or "make sure to".
  {
    function: {
      description: toolDescription("update_calendar_event", EXAM_ITEM_RULES_SHORT),
      name: "update_calendar_event",
      parameters: {
        properties: {
          course: { description: "Course name, or empty string to clear it", type: "string" },
          date: { description: "New date in YYYY-MM-DD", type: "string" },
          event_id: { description: "The event's id from list_calendar_events", type: "string" },
          kind: { description: "assignment, exam, rotation, class, or other", type: "string" },
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
      description: toolDescription("delete_calendar_event", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("replace_library_note", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("delete_library_note", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("edit_flashcard", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("delete_flashcard", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("rename_study_deck", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("delete_study_deck", EXAM_ITEM_RULES_SHORT),
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
      description: toolDescription("delete_study_artifact", EXAM_ITEM_RULES_SHORT),
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
