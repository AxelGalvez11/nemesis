/**
 * The web app's turn-routing surface.
 *
 * 🔴 THE DECISION ITSELF MOVED TO `@nemesis/shared` (chat-decision.ts), because the phone had a
 * second copy of it and the two had already drifted. Re-exported here so every call site in this
 * app keeps importing from where it always did. What is left below is genuinely web-only: how this
 * app marks up an attachment on the wire, and the two instruction paragraphs whose tool names are
 * this app's own.
 */

export {
  ATTACHMENT_ONLY_DECISION,
  DEFAULT_DECISION,
  decisionFromIntent,
  routeInstruction,
  type ChatModelAlias,
  type ChatRoute,
  type ChatRouteDecision,
} from "@nemesis/shared";

/** The extra line a WORKSPACE turn carries when its tools are attached. The
 *  snapshot message (buildWireMessages) holds the data; this holds the rule.
 *
 *  🔴 IT NAMED `get_library_tree` AND `get_study_overview` UNTIL THOSE TOOLS WENT. A prompt that
 *  tells the model to read the complete state with a tool it was not given is an instruction to
 *  invent the reading — the same defect CHAT_NO_TOOLS_PROMPT exists to prevent one layer up. */
export const WORKSPACE_INSTRUCTION =
  "This turn is about the student's own calendar. Ground every claim in what the tools return THIS turn, start from the " +
  "attached snapshot for orientation, then read deeper before stating contents, counts, or dates. The snapshot's lists are " +
  "samples: for anything about 'everything' or a full semester, read the complete range first with list_calendar_events " +
  "rather than answering from the sample. When you change things, say plainly what " +
  "changed and what you left alone; when something is ambiguous or risky, ask before acting.";

/**
 * The extra line a SAVE turn carries, on top of its route instruction.
 *
 * Routing the turn correctly only buys the tools; it does not make the model
 * reach for them. Owner 2026-07-28 asked that "anytime user asked for
 * flashcards or tests it should automatically create in the study page", and a
 * model handed both a tool and a blank page will often just write the artifact
 * out — which is what a student sees as "it went into the chat instead".
 *
 * Only sent when the tools are actually attached: a turn that promises to save
 * and cannot is worse than one that never offered (see CHAT_NO_TOOLS_PROMPT).
 */
export const SAVE_INSTRUCTION =
  "This turn asks you to PUT SOMETHING on the student's calendar. Do it with the tools, in this turn, rather than after asking permission, " +
  "and take every date from what the student or their material actually said, never from a guess about what a term usually looks like. " +
  "Never write the events out in your reply as a substitute for saving them: the student is looking at their calendar, and a list in the chat is not there. " +
  "Once it is saved, say in one short line what you added and when it falls.";

/** The header prepareChatAttachments puts above each attached file's text.
 *  Defined here rather than beside the builder because chat-attachments imports
 *  chat-api, so the reverse import would close a cycle. */
export const ATTACHMENT_BLOCK_MARKER = "### Attachment: ";

/**
 * What the student actually TYPED, with attached file contents removed.
 *
 * The routing and web-search matchers were reading the whole wire text, so a
 * lecture deck decided them: one slide citing "Smith et al., 2024" matches the
 * recent-year pattern and bought a live web search on every upload — paid for,
 * and then pasted into a prompt already carrying the deck. Raising the
 * attachment budget to 90k made that strictly likelier, which is what turned a
 * long-standing quirk into a regression worth fixing.
 *
 * Still the right split now that the decision is semantic rather than a keyword
 * match: what a turn IS comes from the student, and the model deciding that
 * should be reading their message, not forty pages of somebody else's slides.
 * What the attachments are is given to it separately, by name, as a fact.
 */
export function promptWithoutAttachments(wireText: string): string {
  // Attached with NOTHING typed — the commonest case, and the one a
  // hand-written fixture keeps missing. prepareChatAttachments trims the wire
  // text, so the blank line before the first header is GONE and the header
  // starts the string. Matching only "\n\n### Attachment: " returned the entire
  // lecture as though the student had typed it.
  if (wireText.trimStart().startsWith(ATTACHMENT_BLOCK_MARKER)) return "";
  const marker = wireText.indexOf(`\n\n${ATTACHMENT_BLOCK_MARKER}`);
  return (marker === -1 ? wireText : wireText.slice(0, marker)).trim();
}

/** The names of the files riding on this turn, read back out of the wire text.
 *  A fact about the turn, handed to the intent call so it knows a lecture is
 *  attached without being given forty pages of it. */
export function attachmentNames(wireText: string): string[] {
  const names: string[] = [];
  for (const line of wireText.split("\n")) {
    if (!line.startsWith(ATTACHMENT_BLOCK_MARKER)) continue;
    const name = line.slice(ATTACHMENT_BLOCK_MARKER.length).trim();
    if (name) names.push(name);
  }
  return names;
}
