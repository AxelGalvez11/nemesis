// Chat-thread pure logic (cloud-first pivot §6): transcript shaping for the
// phone's Chat surface. Dependency-free by design (Deno-testable) — the network
// half lives in api/chat.ts.
//
// The phone talks to the SAME metered valve as the desktop (nemesis-llm), so
// there is no client-side token accounting here — just context-window hygiene:
// send a bounded slice of the transcript, never the whole history.
import {
  ARTIFACT_REFERENCE_RULE,
  expandArtifactContext,
  UNTRUSTED_CONTENT_RULE,
  WRITING_VOICE,
  wrapUntrusted,
} from "@nemesis/shared";

import { classifyChatRequest, routeInstruction, type ChatRouteDecision } from "./chat-routing.ts";
import { academicSkillInstruction } from "./academic-skills.ts";


export type ChatRole = "assistant" | "user";

export interface ChatSource {
  title: string;
  url: string;
  description: string;
}

/** A deliverable/artifact attached to one turn or the whole thread — SAME shape
 *  as web's SessionOutput (apps/web/lib/workspace/sessions-store.ts), persisted
 *  into `chat_messages.meta.outputs` / `chat_threads.meta.outputs`. The phone
 *  Chat surface creates these for workspace tools and also displays artifacts
 *  synced down through the shared cloud tables. */
export interface ChatOutput {
  id: string;
  kind: "flashcards" | "slides" | "test" | "mindmap" | "note" | "event" | "report" | "recording" | "other";
  title: string;
  url?: string;
  /** An in-app destination for a saved artifact. Kept separate from `url` so
   *  an Expo route is never handed to the OS as though it were a web link. */
  route?: string;
  transcript?: string;
  notes?: string;
  durationSeconds?: number;
  createdAt?: string;
  /** Enhance-pass state for recordings (api/chat.ts maintains it on the chip
   *  entry): "pending" while the server transcript is being produced, "done"
   *  once it replaced the on-device text. Absent for non-recordings, for saves
   *  that kept no audio, and after a failed pass. */
  polish?: "pending" | "done";
}

export interface ChatAttachment {
  name: string;
  kind: "image" | "file";
  mime?: string;
  url?: string;
  storagePath?: string;
}

export interface ChatMsg {
  role: ChatRole;
  content: string;
  /** ISO timestamp — display + persistence only, never sent upstream. */
  at: string;
  /** Client-generated UUID — the identity of this message's `chat_messages`
   *  cloud row (see lib/chat-threads.ts). Optional only for rows cached before
   *  this field existed; the sync path backfills one the next time it runs. */
  id?: string;
  /** Web-search citations attached when the router decided this turn needed
   *  live results (persisted into the cloud row's `meta.sources`). */
  sources?: ChatSource[];
  /** Deliverables recorded against this turn (persisted into the cloud row's
   *  `meta.outputs`) — see ChatOutput's doc. */
  outputs?: ChatOutput[];
  /** Original files shown as part of conversation history on every device.
   * Extracted text remains wire-only; this metadata is safe to persist. */
  attachments?: ChatAttachment[];
  /** What the model worked through before answering, kept so it can be reopened
   *  after the fact (persisted into the cloud row's `meta.thinking`).
   *
   *  This is the model's OWN reasoning as it streamed — never a summary and never
   *  written by us. Turns with thinking switched off (Instant mode) simply have
   *  no field, which is the normal quiet case rather than a failure.
   *
   *  It used to be discarded the instant the first answer word arrived, so a
   *  student who looked away had no way to see why an answer said what it said. */
  thinking?: MessageThinking;
}

export interface MessageThinking {
  /** Wall-clock milliseconds from question to first answer text. */
  ms: number;
  /** The reasoning text itself. */
  text: string;
}

export interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** One message on the WIRE — not one message in the thread.
 *
 *  The `tool` role and `tool_calls` exist only inside a single turn's agent loop
 *  (api/chat.ts): the assistant asks for a tool, we answer with a `tool` message,
 *  and the model then writes its real reply. NONE of that is ever persisted. A
 *  `ChatMsg` (above) is what the student sees and what syncs to `chat_messages`,
 *  and it has no tool roles at all — the web renderer reads those same rows and
 *  knows nothing about a role called "tool". */
export interface WireMsg {
  role: "assistant" | "system" | "user" | "tool";
  content: string;
  /** Assistant messages that requested tools (echoed back on the next round). */
  tool_calls?: WireToolCall[];
  /** Tool-result messages: which call this answers. */
  tool_call_id?: string;
}

/** Nemesis speaks for itself here (same soul rules as the desktop agent):
 *  plain, concise, no emojis, never a different product's name. Adopted from the
 *  web CHAT_SYSTEM_PROMPT (apps/web/lib/workspace/chat-api.ts) so a thread shared
 *  between phone and web sounds the same either side.
 *
 *  THE WORKSPACE PARAGRAPH IS LOAD-BEARING, and it used to say the opposite. This
 *  prompt previously ended "if a question needs the student's own files … say that
 *  the Mac app's missions handle those" — correct while the phone had no tools, and
 *  actively harmful the moment it did: the same turn would hand the model
 *  search_library and create_library_note while instructing it to decline and send
 *  the student to a different app. A tool the prompt disowns is a tool the model
 *  will not call. The list below is deliberately concrete about what this app's
 *  tools can do, and stops at what the phone actually offers.
 *
 *  That last clause used to read "no calendar tools here, unlike web" — true when
 *  it was written and stale by 2026-07-28: agent-tools.ts advertises BOTH
 *  list_calendar_events and add_calendar_event, and chat.ts:441 hands the whole
 *  array over unfiltered. So the phone was running the exact failure this comment
 *  warns about, in the other direction — carrying tools the prompt never
 *  mentioned. Whenever a tool is added to agent-tools.ts, this sentence is the
 *  second half of the change. */
export const CHAT_SYSTEM_PROMPT =
  "You are Nemesis, a rigorous study and research partner for learners in any discipline, major, or profession. " +
  "Never assume the user's field or level; infer it from context and adapt. Answer directly before expanding. " +
  "Use markdown when structure helps, render math clearly, and use examples, code, primary evidence, or counterarguments when they improve understanding. " +
  "Separate established facts from inference and uncertainty. Correct misconceptions without being condescending. " +
  // 🔴 NUMBERS, NOT ADDRESSES. This said "cite the relevant URLs", which contradicted the per-turn
  // evidence block below it and is half of why raw links reached the screen. The web carries the
  // same generic line harmlessly because its evidence block overrides it every turn; the phone's
  // did not, so this one was the operative instruction.
  "When live web results are supplied, use them for current facts and cite them by their bracketed number, like [1]. Never write a raw URL in the prose. " +
  "Never use emojis. " +
  "You can see and change this student's own Nemesis workspace through your tools: search and read their Library notes, create a note, " +
  "add to an existing note, create slide decks, make folders, rename and move notes, list their flashcard decks, add cards to a deck, save practice tests " +
  "and mind maps to their Study page, and read or add events on their Calendar. Flashcards, tests, and mind maps belong in Study. Notes and slide decks belong in Library. " +
  "Events belong on the Calendar tab. Use the tools whenever a question involves their own notes, decks, or schedule, or when they ask you to make or " +
  "save something — read their real material instead of guessing, and never invent what one of their notes or their calendar says. After any change, say " +
  "plainly what you created or changed and where it is — one short line, and never a copy of what you just saved. " +
  // The list above used to stop at the creating verbs, and the model answered
  // accordingly: asked to move an exam or fix a card's wording it said it could
  // not, while holding a tool that does exactly that. A capability the model
  // does not believe it has is the same as no capability.
  "You can also CHANGE and REMOVE things, not only make them: correct an event's date or time, rewrite a note, fix a flashcard's wording, and delete a " +
  "note, card, event, or generated test the student no longer wants. Editing takes the item's id, which the list and read tools return — pass only the " +
  "fields that should change, and leave the rest out so they stay as they are. " +
  // 🔴 The nearest thing to a confirmation step this lane has. There is no
  // dialog inside a chat turn, so the bar for a destructive call is the
  // student's own words: "tidy up my notes" is a request to reorganise, not a
  // licence to delete, and the cost of asking is one sentence.
  "A delete never happens immediately: it puts a confirmation card on screen and the student has to tap it. So do not say anything has been deleted until they have — say the card is there and ask them to tap it. " +
  "Delete ONLY when the student has clearly asked for that specific thing to go. If the request is vague, or you are inferring which item they mean, ask " +
  "which one first — deleting is the one action they cannot take back from here. Never delete something as a side effect of tidying or making room. " +
  // 🔴 THIS SENTENCE USED TO SEND THE STUDENT TO AN APP THEY CANNOT GET. It read
  // "School portals are still handled by the Mac app." The owner caught it on
  // their phone (2026-07-30): the model answered "I cannot access your Canvas
  // portal directly — that requires the Mac app." The Mac app is deferred, so
  // that is a dead end wearing the clothes of an answer.
  //
  // The restriction it encodes is real and stays — Nemesis genuinely cannot log
  // into a school portal, and a model that thinks it can will invent what it
  // found there. What changes is the destination: name what the student can do
  // on the surface they are holding instead of naming a product. Deliberately
  // "course sites", not any one system's name — a law student's portal and an
  // apprentice's are not called the same thing.
  "You cannot sign in to school portals or course sites, and never tell the student another app will do it for them: when their material lives in one, ask them to upload, paste, or photograph it, and work from that. " +
  // The SAME voice rules the web prompt carries, from packages/shared, so the
  // phone and the browser cannot answer in two different registers. Appended
  // last for the same reason as on web — see chatSystemPrompt in chat-api.ts.
  WRITING_VOICE;

/** Keep the upstream payload bounded: the most recent messages whose combined
 *  length fits the budget (always at least the latest message, even if huge —
 *  the valve's own caps are the final authority). */
export const HISTORY_CHAR_BUDGET = 24_000;
export const HISTORY_MAX_MESSAGES = 30;

export function trimHistory(
  history: ChatMsg[],
  charBudget = HISTORY_CHAR_BUDGET,
  maxMessages = HISTORY_MAX_MESSAGES,
): ChatMsg[] {
  const recent = history.slice(-maxMessages);
  const out: ChatMsg[] = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const cost = recent[i].content.length;
    if (out.length > 0 && used + cost > charBudget) break;
    out.unshift(recent[i]);
    used += cost;
  }
  return out;
}

/** The chat/completions message array for one turn. `decision` (defaulting to
 *  a fresh classification of `userText`) folds the router's per-route framing
 *  into the system message — mirrors web's buildWireMessages, minus the
 *  continuity-anchor/live-clock extras (not requested for the phone in this
 *  round; the history budget already keeps context bounded). */
export function buildWireMessages(
  history: ChatMsg[],
  userText: string,
  decision?: ChatRouteDecision,
  learnerProfile = "",
  /** True when course material rides along with this turn — see MATERIAL_OFFER. */
  hasMaterial = false,
  /** Retrieved background — the second-brain packet. Its OWN system message, on
   *  purpose.
   *
   *  🔴 IT USED TO BE CONCATENATED ONTO THE USER'S MESSAGE. A student asking "make
   *  flashcards from this" therefore sent one message reading, in full: their seven
   *  words, then several unrelated Library notes, their calendar, and their
   *  most-failed cards. The word "this" had that pile as its nearest antecedent and
   *  the recording they meant was nowhere on the wire, so the model built cards on
   *  the wrong subject entirely (owner 2026-07-30).
   *
   *  Retrieved material is not something the student said. Keeping it in a separate
   *  system message is what lets a pronoun in their sentence resolve to their
   *  conversation rather than to a search result. It still sits last, closest to the
   *  answer, which is where it earns its keep when the question IS about their notes. */
  groundingContext = "",
): WireMsg[] {
  const priorAssistantText =
    [...history].reverse().find((message) => message.role === "assistant")?.content ?? "";
  const resolvedDecision = decision ?? classifyChatRequest(userText, priorAssistantText);
  const profile = learnerProfile.trim() ? `\n\n${learnerProfile.trim()}` : "";
  return [
    {
      content: `${CHAT_SYSTEM_PROMPT}\n\n${ARTIFACT_REFERENCE_RULE}\n\n${routeInstruction(resolvedDecision.route)}\n\n${academicSkillInstruction(userText, hasMaterial, priorAssistantText)}${profile}`,
      role: "system",
    },
    // 🔴 expandArtifactContext BEFORE trimHistory, and that order is the point.
    // This line used to be a bare `.map` that kept only content+role, so every
    // artifact the conversation produced — a recording's notes, a deck, a saved
    // note — was invisible to the next turn, and a question like "make flashcards
    // from this" had nothing to bind "this" to. Expanding first also means the
    // 24,000-character budget is measured against what is ACTUALLY sent; appending
    // afterwards would silently blow it. See lib/history-artifacts.ts.
    ...trimHistory(expandArtifactContext(history)).map((msg) => ({ content: msg.content, role: msg.role })),
    ...(groundingContext.trim()
      ? [{
        content:
          "Background retrieved automatically from this student's workspace. It was NOT said by them and is " +
          "not what they are pointing at. Use it only where it is relevant to what they actually asked; if it " +
          "is about a different subject, ignore it.\n\n" +
          groundingContext.trim(),
        role: "system" as const,
      }]
      : []),
    { content: userText, role: "user" },
  ];
}

/** "aborted" is the student pressing Stop — NOT a failure. It carries no
 *  errorText on purpose: nothing should be painted red for a thing they asked for. */
export type ChatErrorKind = "budget" | "auth" | "unreachable" | "generic" | "aborted";

function errorCode(body: unknown): string {
  return typeof body === "object" && body !== null
    ? ((body as { error?: { code?: string } }).error?.code ?? "")
    : "";
}

/** Classify the valve's error shape — mirrors web's chatErrorKind so the UI can
 *  (eventually) style a budget card differently from a plain error row. */
export function chatErrorKind(status: number, body: unknown): ChatErrorKind {
  if (errorCode(body) === "daily_token_budget_exhausted" || status === 429) return "budget";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500 || status === 502) return "unreachable";
  return "generic";
}

/** Which credit window ran dry — drives the upgrade sheet's reset line.
 *  The valve's ledger keys are UTC calendar days (daily) and the 1st of the
 *  month (monthly), so "daily" resets at the next UTC midnight. */
export type BudgetResetKind = "daily" | "monthly";

export function budgetResetKind(body: unknown): BudgetResetKind | null {
  const code = errorCode(body);
  if (code === "monthly_token_budget_exhausted") return "monthly";
  if (code === "daily_token_budget_exhausted") return "daily";
  return null;
}

/** Next UTC midnight after `now` — when the daily credit ledger rolls over. */
export function nextDailyReset(now: Date): Date {
  const reset = new Date(now.getTime());
  reset.setUTCHours(24, 0, 0, 0);
  return reset;
}

/** Map the valve's error shapes to one student-readable line. */
export function chatErrorMessage(status: number, body: unknown): string {
  const message =
    typeof body === "object" && body !== null
      ? ((body as { error?: { message?: string } }).error?.message ?? "")
      : "";
  const kind = chatErrorKind(status, body);

  if (kind === "budget") {
    return message || "You've reached today's usage limit. It resets tomorrow, or upgrade for more.";
  }
  if (kind === "auth") {
    return "This device needs to re-connect to your account. Try again — it repairs itself.";
  }
  if (kind === "unreachable") {
    return "The answer engine is unreachable right now. Try again in a moment.";
  }
  return message || "Something went wrong sending that. Try again.";
}

/** A Library note picked from the composer's "+" → "Attach from Library" menu —
 *  just enough to build a wire-only context block (see buildAttachmentContext). */
export interface AttachedLibraryDoc {
  title: string;
  content: string;
  /** What the student actually attached. Defaults to a written document.
   *
   *  🔴 A PHOTOGRAPH IS NOT A NOTE, AND CALLING IT ONE BROKE THE ANSWER. The
   *  phone cannot put pixels on the chat wire, so a photo is read by the vision
   *  pass and travels as prose. That prose used to be handed over under
   *  "Type: Library note" with no further explanation, so the model correctly
   *  concluded it had been given a document ABOUT a photo — and answered
   *  literally: "I see a text caption describing a photograph of a gym floor."
   *  (owner screenshot, 2026-07-31). It was not confused; it was told the truth
   *  in a way that made the photograph a second-hand report. */
  kind?: "image" | "note";
}

/** Owner-specified clamp for the composer's attach feature (~8000 chars) — a
 *  DIFFERENT budget than web's file-upload attachments (12,000/22,000, see
 *  apps/web/lib/workspace/chat-attachments.ts), since the phone attaches at
 *  most one Library document at a time via the picker rather than several
 *  arbitrary files, so a single per-doc clamp is the only limit needed. */
export const ATTACHMENT_CONTEXT_MAX_CHARS = 8000;

/** Wire-only context block for one attached Library document, folded into the
 *  prompt for a single turn (see api/chat.ts's sendChat). Prompt SHAPE mirrored
 *  from web's chat-attachments.ts::prepareChatAttachments (the
 *  `### Attachment: NAME` block) so an attach-grounded answer reads the same
 *  either side — only the "Type:" line differs (a Library note has no MIME
 *  type). NEVER persisted into the ChatMsg the UI stores/displays — see
 *  withAttachmentNote below — so the full text isn't silently re-sent on every
 *  later turn once it's part of the thread's history. */
/** What the model is told when the "attachment" is really a photograph.
 *
 *  Two things have to be true at once and the wording is doing both jobs: the
 *  reading is genuinely second-hand (so it must not be presented as infallible),
 *  and the student's experience is that they showed it a picture (so narrating
 *  the machinery is useless to them). Saying "the caption describes a blue
 *  bench" answers a question nobody asked. */
export const PHOTO_ATTACHMENT_RULE =
  "The student attached a PHOTOGRAPH and it was read for you — what follows is what is in the picture. "
  + "Answer as though you looked at the photo yourself: say \"the bench\", not \"the description mentions a bench\". "
  + "Never call it a caption, a description, a text, or a summary, never say you cannot see images, and never "
  + "explain how the reading was produced. If something they asked about is not in the reading, say that detail "
  + "is not clear in the photo and ask them to reshoot it closer — that is a fact about the picture, not about you.";

export function buildAttachmentContext(doc: AttachedLibraryDoc, maxChars = ATTACHMENT_CONTEXT_MAX_CHARS): string {
  const clipped = doc.content.trim().slice(0, maxChars);
  if (!clipped) return "";
  if (doc.kind === "image") {
    // Deliberately NOT the "Type: Library note" block below. A photograph is
    // neither a note nor a document, and labelling it as one is what produced
    // the "I see a text caption" answer. Still fenced: whatever was in shot was
    // written by someone else, and a lecture slide reading "ignore all previous
    // instructions" is a photograph of an instruction, not an instruction.
    return `### Photograph the student attached\n\n${PHOTO_ATTACHMENT_RULE}\n\n`
      + `${UNTRUSTED_CONTENT_RULE}\n\n`
      + wrapUntrusted("what is in the photograph", clipped);
  }
  // Fenced, same as web (chat-attachments.ts). A Library note is not safe by
  // virtue of being the student's own: most of them arrive by importing a
  // lecture, and the phone shares one cloud Library with the browser — so a
  // poisoned deck imported anywhere reaches the model everywhere.
  return `### Attachment: ${doc.title}\nType: Library note\n\n` +
    `${UNTRUSTED_CONTENT_RULE}\n\n` +
    wrapUntrusted(doc.title, clipped);
}

/** The compact line appended to what's actually shown/persisted for a turn that
 *  attached a document — mirrors web's attachmentSummary (chat-attachments.ts):
 *  the transcript records THAT a document was attached, never its full text. */
export function withAttachmentNote(text: string, title: string | null): string {
  return title ? `${text}\n\nAttached: ${title}`.trim() : text;
}

/** The route decision forced when the composer's "Deep research" toggle is on,
 *  bypassing classifyChatRequest's text-based inference entirely. IDENTICAL to
 *  chat-routing.ts's own RESEARCH_PATTERN branch — reused rather than invented,
 *  because web's own "Deep research" composer menu item
 *  (apps/web/components/workspace/sessions/composer.tsx's AddMenu) turned out to
 *  be an unwired stub with no onSelect handler and no valve-side flag to mirror.
 *  Forcing the SAME route the classifier already infers from research language
 *  is the closest fidelity available: fidelity to web's routing model over
 *  inventing a new one. */
export function forcedResearchDecision(): ChatRouteDecision {
  return { model: "deepseek-reasoner", reasoningEffort: "high", route: "research", searchWeb: true };
}

/** Format live web-search results into a context block the model is told to
 *  cite from — ported from apps/web/lib/workspace/chat-web-search.ts's
 *  formatWebSearchContext (that module's trigger heuristics are NOT ported;
 *  the phone's ONLY search trigger is chat-routing.ts's `searchWeb` decision). */
/**
 * The results that are worth showing the model AND the learner — ONE list, exported, because two
 * lists is a citation pointing at the wrong page.
 *
 * 🔴 THE NUMBERING THE MODEL IS GIVEN AND THE ARRAY THE SCREEN INDEXES MUST BE THE SAME LIST. They
 * were not: `api/chat.ts` kept every result that had a `url`, while the block below numbered only
 * those that also had a title or a description. One result with a bare URL and no snippet was
 * enough to shift every number after it, so `[2]` in the prose opened result 3 — a wrong citation,
 * rendered confidently, which is worse than no citation at all. Both callers now filter here.
 */
export function usableWebResults(results: ChatSource[]): ChatSource[] {
  return results.filter((result) => result.url && (result.title || result.description)).slice(0, 10);
}

export function formatWebSearchContext(results: ChatSource[]): string {
  const usable = usableWebResults(results);
  if (usable.length === 0) return "";
  return [
    // 🔴 THE WEB'S SENTENCE, CHARACTER FOR CHARACTER, AND THE PORT DROPPING IT WAS THE BUG. This
    // line used to read "Live web search results (use these for current facts and cite the relevant
    // URL in the answer)" — it ASKED the model for raw addresses, and got them: answers arrived with
    // "(https://api-docs.deepseek.com/updates, https://releasebot.io/updates/deepseek)" sitting in
    // the middle of a paragraph (owner 2026-08-20, from a screenshot). The web has never had that
    // problem because its block ends with the opposite instruction. Copied rather than paraphrased:
    // a second wording is how these two files drifted apart in the first place.
    "PROVISIONAL EXTERNAL EVIDENCE from live web search. Search snippets are evidence leads, not automatically settled facts and not learner knowledge. Use them for current claims only to the degree they support those claims. When a sentence relies on one of them, end that sentence with that result's number in square brackets, like [1]. Only cite a number for a fact that actually came from these results, use at most one number per sentence, and never write the raw URL in the prose.",
    UNTRUSTED_CONTENT_RULE,
    ...usable.map((result, index) =>
      wrapUntrusted(
        `result ${index + 1}`,
        `${index + 1}. ${result.title || result.url}\nURL: ${result.url}\n${result.description}`,
      ),
    ),
  ].join("\n\n");
}

/** Parse a non-streaming chat/completions response body into assistant text. */
export function completionText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" && message.content.trim() ? message.content : null;
}
