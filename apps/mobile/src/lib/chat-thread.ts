// Chat-thread pure logic (cloud-first pivot §6): transcript shaping for the
// phone's Chat surface. Dependency-free by design (Deno-testable) — the network
// half lives in api/chat.ts.
//
// The phone talks to the SAME metered valve as the desktop (nemesis-llm), so
// there is no client-side token accounting here — just context-window hygiene:
// send a bounded slice of the transcript, never the whole history.
import { classifyChatRequest, routeInstruction, type ChatRouteDecision } from "./chat-routing.ts";

export type ChatRole = "assistant" | "user";

export interface ChatSource {
  title: string;
  url: string;
  description: string;
}

/** A deliverable/artifact attached to one turn or the whole thread — SAME shape
 *  as web's SessionOutput (apps/web/lib/workspace/sessions-store.ts), persisted
 *  into `chat_messages.meta.outputs` / `chat_threads.meta.outputs`. The phone
 *  Chat surface never CREATES one of these (no recording composer, no tool
 *  executor — see lib/chat-threads.ts's outputsFromMeta doc) — it only ever
 *  displays artifacts web already synced down through the shared cloud tables. */
export interface ChatOutput {
  id: string;
  kind: "flashcards" | "slides" | "test" | "report" | "recording" | "other";
  title: string;
  url?: string;
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

export interface WireMsg {
  role: "assistant" | "system" | "user";
  content: string;
}

/** Nemesis speaks for itself here (same soul rules as the desktop agent):
 *  plain, concise, no emojis, never a different product's name. Adopted
 *  verbatim from the web CHAT_SYSTEM_PROMPT (apps/web/lib/workspace/chat-api.ts)
 *  so a thread shared between phone and web sounds the same either side — the
 *  "Mac app's missions" line is a known stale reference on web too (tracked,
 *  out of scope for this round). */
export const CHAT_SYSTEM_PROMPT =
  "You are Nemesis, a rigorous study and research partner for learners in any discipline, major, or profession. " +
  "Never assume the user's field or level; infer it from context and adapt. Answer directly before expanding. " +
  "Use markdown when structure helps, render math clearly, and use examples, code, primary evidence, or counterarguments when they improve understanding. " +
  "Separate established facts from inference and uncertainty. Correct misconceptions without being condescending. " +
  "When live web results are supplied, use them for current facts and cite the relevant URLs. " +
  "Never use emojis. If a question needs the student's own files or their school portals, " +
  "say that the Mac app's missions handle those and answer what you can from knowledge.";

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
  decision: ChatRouteDecision = classifyChatRequest(userText),
): WireMsg[] {
  return [
    { content: `${CHAT_SYSTEM_PROMPT}\n\n${routeInstruction(decision.route)}`, role: "system" },
    ...trimHistory(history).map((msg) => ({ content: msg.content, role: msg.role })),
    { content: userText, role: "user" },
  ];
}

export type ChatErrorKind = "budget" | "auth" | "unreachable" | "generic";

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
export function buildAttachmentContext(doc: AttachedLibraryDoc, maxChars = ATTACHMENT_CONTEXT_MAX_CHARS): string {
  const clipped = doc.content.trim().slice(0, maxChars);
  if (!clipped) return "";
  return `### Attachment: ${doc.title}\nType: Library note\n\n${clipped}`;
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
export function formatWebSearchContext(results: ChatSource[]): string {
  const usable = results.filter((result) => result.url && (result.title || result.description)).slice(0, 5);
  if (usable.length === 0) return "";
  return [
    "Live web search results (use these for current facts and cite the relevant URL in the answer):",
    ...usable.map((result, index) => `${index + 1}. ${result.title || result.url}\nURL: ${result.url}\n${result.description}`),
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
