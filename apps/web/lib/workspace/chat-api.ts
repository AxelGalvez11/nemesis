// Chat wiring for the Sessions surface — ported verbatim from the mobile
// nemesis-llm recipe (apps/mobile/src/api/chat.ts + src/lib/chat-thread.ts):
// same device-key mint, same chat/completions call, same system prompt and
// history budget, same error copy. Web swaps SecureStore for localStorage and
// adds AbortSignal support (mobile has no cancel affordance).

import { supabaseUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { SessionMessage, SessionOutput } from "@/lib/workspace/sessions-store";
import { AGENT_TOOLS, executeAgentTool, type AgentToolCall } from "@/lib/workspace/agent-tools";
import { buildFreshSearchQuery, formatWebSearchContext, shouldSearchWeb, usableWebResults, type ChatWebResult } from "@/lib/workspace/chat-web-search";
import { applyChatEffort, DEFAULT_CHAT_EFFORT, toolsAllowed, type ChatEffort } from "@/lib/workspace/chat-effort";
import { ATTACHMENT_ONLY_DECISION, classifyChatRequest, promptWithoutAttachments, routeInstruction, type ChatRouteDecision } from "@/lib/workspace/chat-routing";
import { buildSkillMessage, selectChatSkills } from "@/lib/workspace/chat-skills";
import { readCompletionStreamFull, type CompletionDeltaHandler } from "@/lib/workspace/chat-stream";
import { showUpgradePrompt, type UpgradeResetKind } from "@/lib/workspace/upgrade-prompt";

const LLM_BASE = `${supabaseUrl}/functions/v1/nemesis-llm`;

// Cost attribution: tells the metering valve WHICH app spent the tokens, so provider
// spend can be reported per app. The valve falls back to the device-key label when
// this is missing, and to "unknown" when neither says — never silently to "web".
const CLIENT_HEADER = { "X-Nemesis-Client": "web" } as const;

export interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface WireMsg {
  role: "assistant" | "system" | "user" | "tool";
  content: string;
  /** Assistant messages that requested tools (echoed back on the next round). */
  tool_calls?: WireToolCall[];
  /** Tool-result messages: which call this answers. */
  tool_call_id?: string;
}

/** Nemesis speaks for itself here (same soul rules as the desktop agent):
 *  plain, concise, no emojis, never a different product's name.
 *  Universal rigor lives here because it rides every turn at no marginal cost;
 *  task-specific craft lives in chat-skills.ts and is injected only on match. */
const CHAT_PROMPT_HEAD =
  "You are Nemesis, a rigorous study and research partner for learners in any discipline, major, or profession. " +
  "Never assume the user's field or level; infer it from context and adapt. Answer directly before expanding. " +
  "Use markdown when structure helps, render math clearly, and use examples, code, primary evidence, or counterarguments when they improve understanding. " +
  "Separate established facts from inference and uncertainty. Correct misconceptions without being condescending. " +
  "When live web results are supplied, use them for current facts and cite the relevant URLs. " +
  "Never use emojis. ";

/** True ONLY on a turn that actually carries AGENT_TOOLS. */
export const CHAT_TOOLS_PROMPT =
  "You can see and edit this student's Nemesis workspace through your tools: search and read their Library notes, create notes, " +
  "list flashcard decks and add cards, and list or add calendar events. Use the tools whenever a question involves their own notes, " +
  "decks, or schedule, or when they ask you to save something — read their real data instead of guessing, and never invent what a " +
  "note or calendar says. School portals are still handled by the Mac app's missions. " +
  // Owner 2026-07-27: "flashcards, tests, or notes that were created should not
  // be output in chat but rather as an artifact in chat that routes user to the
  // location of it." The app renders a card for every write and that card opens
  // the deck, test, or note — so reprinting the contents duplicates a
  // deliverable the student already has, and the copy in chat is the one that
  // goes stale the moment they edit the real thing.
  "When you save something, the app shows the student a card that opens it. So do not reprint what you saved: no card lists, no question-and-answer " +
  "dumps, no full note text. Give one short line saying what you saved, how many items, and where it now lives, then stop. Write the material out in " +
  "full ONLY when the student asked to see it rather than save it, or when the save failed and they would otherwise lose the work. ";

/**
 * What replaces it when the turn goes out WITHOUT tools (a reasoner route, or
 * high effort — see chat-effort.ts:toolsAllowed).
 *
 * This paragraph exists because the sentence above used to ride every turn
 * unconditionally, including the ones with no tools attached. Observed live
 * 2026-07-27: told it could add cards and told to "state plainly what you
 * created", the model wrote "[Calling tool: add_flashcards ...]" as prose,
 * invented a "Pharmacology" deck the student does not have, and reported 14
 * cards saved. A prompt that promises a capability the request never carried is
 * an instruction to fabricate one.
 */
export const CHAT_NO_TOOLS_PROMPT =
  "This turn carries no tools. You cannot read or change the student's Library, decks, or calendar right now, and you cannot see what is in them. " +
  "Never write a line that imitates a tool call (for example '[Calling tool: ...]'), never say or imply that anything was created, added, saved, or " +
  "scheduled, and never describe what their existing notes, decks, or events contain. Put the material itself in your reply instead, and tell them to " +
  "ask for it to be saved if they want it kept. ";

const CHAT_PROMPT_TAIL =
  "Check your own work before you answer: verify every number, unit, name, and date you are about to state, and re-read the question to confirm you " +
  "answered what was actually asked. If a step does not hold up, fix it before replying rather than hedging afterwards. " +
  // Owner-specified verification procedure (2026-07-27): decompose, label,
  // audit, score, disclose. It lives in the BASE prompt rather than in
  // chat-skills.ts because the owner asked for it on every factual request —
  // a matcher broad enough to do that starved the task skills outright, since
  // only MAX_ACTIVE_SKILLS packets ride any turn. Compressed to the behaviour
  // rather than the five headings, and explicitly proportionate, so a one-line
  // question still gets a one-line answer.
  "On any factual or multi-part question, break it into its separate claims and take them one at a time; mark each substantive claim as a verified " +
  "fact, an inference (say what from), an assumption you supplied yourself, or unknown; then re-read your answer for contradictions and for steps that " +
  "merely sound right. Never invent a statistic, quotation, citation, date, or link to close a gap — a missing source is a finding to report, not a hole " +
  "to fill. End a factual answer with an overall confidence from 0.0 to 1.0. If that confidence is below 0.8, or the question needed context you do not " +
  "have, write exactly 'I cannot confirm this with high certainty', then say what stays unknown and what would settle it. " +
  "Keep this proportionate: a simple question needs a labelled answer and a score, not a five-part report.";

/**
 * The base prompt for one turn. The workspace paragraph is chosen from the SAME
 * boolean that decides whether the tools ride, so the prompt can never claim a
 * capability the request does not carry.
 */
export function chatSystemPrompt(toolsEnabled: boolean): string {
  return `${CHAT_PROMPT_HEAD}${toolsEnabled ? CHAT_TOOLS_PROMPT : CHAT_NO_TOOLS_PROMPT}${CHAT_PROMPT_TAIL}`;
}

/** The tools-on prompt, kept as a named export for callers and tests that want
 *  the full text rather than a per-turn build. */
export const CHAT_SYSTEM_PROMPT = chatSystemPrompt(true);

/** Keep the upstream payload bounded: the most recent messages whose combined
 *  length fits the budget (always at least the latest message, even if huge —
 *  the valve's own caps are the final authority). */
export const HISTORY_CHAR_BUDGET = 24_000;
export const HISTORY_MAX_MESSAGES = 30;

export function trimHistory(
  history: SessionMessage[],
  charBudget = HISTORY_CHAR_BUDGET,
  maxMessages = HISTORY_MAX_MESSAGES,
): SessionMessage[] {
  const recent = history.slice(-maxMessages);
  const out: SessionMessage[] = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    if (!msg) continue;
    const cost = msg.content.length;
    if (out.length > 0 && used + cost > charBudget) break;
    out.unshift(msg);
    used += cost;
  }
  return out;
}

/** Preserve the conversation's originating goal when a long transcript has to
 * drop older turns. This is deterministic and bounded, so continuity does not
 * require another paid model call. */
export function buildContinuityAnchor(history: SessionMessage[], kept: SessionMessage[]): string {
  if (history.length === 0 || kept.length === history.length) return "";
  const firstUser = history.find((message) => message.role === "user" && message.content.trim());
  if (!firstUser || kept.includes(firstUser)) return "";
  return `The conversation originally began with this user goal; preserve it unless the user has changed direction:\n${firstUser.content.slice(0, 1_200)}`;
}

/** The chat/completions message array for one turn. */
export function buildWireMessages(
  history: SessionMessage[],
  userText: string,
  decision = classifyChatRequest(userText),
  // Derived from the decision by default so a caller cannot accidentally
  // describe tools that will not be sent.
  toolsEnabled = toolsAllowed(decision),
): WireMsg[] {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const liveClock = `The current date is ${now.toISOString().slice(0, 10)} and the user's time zone is ${timeZone}. You do have this clock context; never claim you cannot know today's date.`;
  const kept = trimHistory(history);
  const continuityAnchor = buildContinuityAnchor(history, kept);
  // Skills go last among the system messages so their procedure is the most
  // recent instruction the model reads before the conversation itself.
  const skills = buildSkillMessage(selectChatSkills(userText));
  return [
    { content: `${chatSystemPrompt(toolsEnabled)}\n\n${routeInstruction(decision.route)}\n\n${liveClock}`, role: "system" },
    ...(continuityAnchor ? [{ content: continuityAnchor, role: "system" as const }] : []),
    ...(skills ? [{ content: skills, role: "system" as const }] : []),
    ...kept.map((msg) => ({ content: msg.content, role: msg.role })),
    { content: userText, role: "user" },
  ];
}

export type ChatErrorKind = "budget" | "auth" | "unreachable" | "generic";

function errorCode(body: unknown): string {
  return typeof body === "object" && body !== null
    ? ((body as { error?: { code?: string } }).error?.code ?? "")
    : "";
}

/** Classify the valve's error shape — drives which error card the UI renders
 *  (the budget-exhausted card is visually distinct from a plain error row). */
export function chatErrorKind(status: number, body: unknown): ChatErrorKind {
  if (errorCode(body) === "daily_token_budget_exhausted" || status === 429) return "budget";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500 || status === 502) return "unreachable";
  return "generic";
}

/** Which credit window ran dry (a bare 429 without a code reads as daily). */
function budgetResetOf(body: unknown): UpgradeResetKind {
  return errorCode(body) === "monthly_token_budget_exhausted" ? "monthly" : "daily";
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

/** Parse a non-streaming chat/completions response body into assistant text. */
export function completionText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" && message.content.trim() ? message.content : null;
}

/** Tool calls from a non-streaming chat/completions response, if any. */
export function completionToolCalls(body: unknown): AgentToolCall[] {
  if (typeof body !== "object" || body === null) return [];
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) return [];
  const raw = (choices[0] as { message?: { tool_calls?: unknown } }).message?.tool_calls;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const call = entry as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    if (typeof call.id !== "string" || typeof call.function?.name !== "string") return [];
    return [{ arguments: typeof call.function.arguments === "string" ? call.function.arguments : "{}", id: call.id, name: call.function.name }];
  });
}

// ── Device key (web: localStorage instead of SecureStore) ──────────────────

const deviceKeyStorageKey = (uid: string) => `nemesis_device_key_v1_${uid}`;

function readStoredKey(uid: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(deviceKeyStorageKey(uid));
    return stored?.startsWith("nmk_") ? stored : null;
  } catch {
    return null;
  }
}

function storeKey(uid: string, key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(deviceKeyStorageKey(uid), key);
  } catch {
    // Quota/private mode — the mint still succeeds for this call, just not cached.
  }
}

/** Mint a device key for the CURRENT session, only if it belongs to `uid` —
 *  a stale tab from a previous account must never mint under the new one. */
async function mintDeviceKey(uid: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== uid) return null;
  try {
    const res = await fetch(`${LLM_BASE}/device-key`, {
      body: JSON.stringify({ label: "Nemesis Web" }),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: string };
    if (typeof body.key !== "string" || !body.key.startsWith("nmk_")) return null;
    storeKey(uid, body.key);
    return body.key;
  } catch {
    return null;
  }
}

export async function deviceKey(uid: string): Promise<string | null> {
  const stored = readStoredKey(uid);
  if (stored) return stored;
  return mintDeviceKey(uid);
}

export interface ChatReply {
  text: string | null;
  errorText: string | null;
  errorKind: ChatErrorKind | null;
  sources: ChatWebResult[];
  /** Workspace artifacts created during tool rounds. Rendered as destination
   *  cards instead of dumping the deliverable body into chat. */
  outputs?: SessionOutput[];
  /** Present when the model asked to run tools instead of (or before) answering. */
  toolCalls?: AgentToolCall[];
}

export interface ChatCompletionOptions {
  signal?: AbortSignal;
  decision?: ChatRouteDecision;
  onDelta?: CompletionDeltaHandler;
  /** OpenAI-format tool schemas; the valve forwards them verbatim. */
  tools?: readonly unknown[];
}

/** One completion turn from an arbitrary wire-message array — the shared transport for
 *  both the main Sessions chat and per-notebook chats (same device-key mint, same valve, same error
 *  copy). Streams when `onDelta` is supplied. Resolves (never rejects) for network/API failures —
 *  those come back as a student-readable line. Only an aborted `signal` rejects, so the caller can
 *  tell "the user stopped it" apart from "it failed". */
export async function postChatCompletion(
  uid: string,
  wireMessages: WireMsg[],
  options: ChatCompletionOptions = {},
): Promise<ChatReply> {
  let key = await deviceKey(uid);
  if (!key) return { errorKind: "auth", errorText: "Sign in to chat.", sources: [], text: null };

  const decision = options.decision ?? { route: "conversation", model: "deepseek-chat", searchWeb: false };
  const payload = JSON.stringify({
    messages: wireMessages,
    model: decision.model,
    ...(decision.reasoningEffort ? { reasoning_effort: decision.reasoningEffort } : {}),
    ...(options.onDelta ? { stream: true } : {}),
    ...(options.tools?.length ? { tools: options.tools } : {}),
  });
  const call = (bearer: string) =>
    fetch(`${LLM_BASE}/v1/chat/completions`, {
      body: payload,
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", ...CLIENT_HEADER },
      method: "POST",
      signal: options.signal,
    });

  try {
    let res = await call(key);
    // A revoked/unknown key (wiped server-side, restored browser) re-mints once —
    // still strictly under this uid's session.
    if (res.status === 401 || res.status === 403) {
      const fresh = await mintDeviceKey(uid);
      if (fresh) {
        key = fresh;
        res = await call(key);
      }
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as unknown;
      const errorKind = chatErrorKind(res.status, body);
      const errorText = chatErrorMessage(res.status, body);
      // Out of credits is an upsell moment, not just an error row: pop the
      // shell-mounted upgrade dialog on every budget-exhausted turn.
      if (errorKind === "budget") showUpgradePrompt(errorText, budgetResetOf(body));
      return { errorKind, errorText, sources: [], text: null };
    }
    let text: string | null = null;
    let toolCalls: AgentToolCall[] = [];
    if (options.onDelta) {
      const streamed = await readCompletionStreamFull(res.body, options.onDelta);
      text = streamed.text.trim() ? streamed.text : null;
      toolCalls = streamed.toolCalls;
    } else {
      const body = (await res.json().catch(() => null)) as unknown;
      text = completionText(body);
      toolCalls = completionToolCalls(body);
    }
    if (text || toolCalls.length) {
      return { errorKind: null, errorText: null, sources: [], text, ...(toolCalls.length ? { toolCalls } : {}) };
    }
    return { errorKind: "generic", errorText: "The answer came back empty. Try again.", sources: [], text: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return {
      errorKind: "unreachable",
      errorText: "You're offline — chat needs a connection. Try again in a moment.",
      sources: [],
      text: null,
    };
  }
}

/** Most tool rounds a single turn may run before we force a plain answer. */
const AGENT_MAX_TOOL_ROUNDS = 4;

function outputFromToolResult(result: unknown): SessionOutput | null {
  if (!result || typeof result !== "object") return null;
  const artifact = (result as Record<string, unknown>).artifact;
  if (!artifact || typeof artifact !== "object") return null;
  const row = artifact as Record<string, unknown>;
  const kinds = new Set<SessionOutput["kind"]>(["flashcards", "slides", "test", "mindmap", "note", "event", "report", "recording", "other"]);
  if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.kind !== "string") return null;
  if (!kinds.has(row.kind as SessionOutput["kind"])) return null;
  return {
    id: row.id,
    kind: row.kind as SessionOutput["kind"],
    title: row.title,
    ...(typeof row.url === "string" ? { url: row.url } : {}),
  };
}

/** Above this many cards of one kind, a transcript stops being a list of things
 *  you made and becomes a wall to scroll past. */
export const OUTPUT_COLLAPSE_THRESHOLD = 3;

const COLLAPSED_NOUN: Partial<Record<SessionOutput["kind"], string>> = {
  event: "calendar events",
  flashcards: "decks",
  note: "notes",
  test: "practice tests",
};

/**
 * Collapse a run of same-kind writes into ONE card.
 *
 * Owner 2026-07-27 asked for a created thing to appear as "an artifact in chat
 * that routes user to the location of it" — singular. Importing a syllabus calls
 * add_calendar_event once per date, so a real 51-date syllabus produced 51 cards
 * in a row: a worse wall than the prose the rule replaced.
 *
 * The survivor keeps the FIRST item's url, which for a syllabus lands on the
 * first date of term — where you would want to start reading anyway.
 */
export function collapseOutputs(outputs: readonly SessionOutput[], threshold = OUTPUT_COLLAPSE_THRESHOLD): SessionOutput[] {
  const counts = new Map<SessionOutput["kind"], number>();
  for (const output of outputs) counts.set(output.kind, (counts.get(output.kind) ?? 0) + 1);

  const collapsed: SessionOutput[] = [];
  const done = new Set<SessionOutput["kind"]>();
  for (const output of outputs) {
    const total = counts.get(output.kind) ?? 0;
    if (total <= threshold) {
      collapsed.push(output);
      continue;
    }
    if (done.has(output.kind)) continue;
    done.add(output.kind);
    collapsed.push({ ...output, title: `${total} ${COLLAPSED_NOUN[output.kind] ?? "items"}` });
  }
  return collapsed;
}

/** One routed completion turn for the signed-in user `uid` on the main Sessions chat.
 *  Runs the workspace agent loop (owner 2026-07-20): the model can call the
 *  Library/Study/Calendar tools; results are fed back until it answers in text.
 *  Tools are withheld on reasoner-model routes (DeepSeek thinking mode requires
 *  echoing reasoning_content on tool turns, which the stream doesn't retain). */
export async function sendChatTurn(
  uid: string,
  history: SessionMessage[],
  userText: string,
  signal?: AbortSignal,
  onDelta?: CompletionDeltaHandler,
  effort: ChatEffort = DEFAULT_CHAT_EFFORT,
): Promise<ChatReply> {
  // Route and search on what the student TYPED. Reading the attached deck too
  // meant one slide citing a recent year bought a paid web search on every
  // upload. Skills below still see the full text, deliberately.
  const askText = promptWithoutAttachments(userText);
  // The previous assistant turn is what makes a one-word "flashcards" or "all
  // three" legible as a save: our own lecture-intake skill ends by offering to
  // build them, and the reply that accepts the offer carries no save verb.
  // (copied before reversing — findLast is ES2023 and this project targets ES2022)
  const priorAssistant = [...history].reverse().find((message) => message.role === "assistant" && message.content.trim())?.content ?? "";
  // An empty ask alongside a non-empty wire text means files and nothing typed.
  const classified = !askText && userText.trim()
    ? ATTACHMENT_ONLY_DECISION
    : classifyChatRequest(askText, priorAssistant);
  const needsWeb = classified.searchWeb || shouldSearchWeb(askText);
  const routed: ChatRouteDecision = needsWeb && classified.route === "conversation"
    ? { route: "current", model: "deepseek-reasoner", searchWeb: true }
    : classified;
  // The student's dial wins over the route's own guess at how hard to think.
  const decision = applyChatEffort(routed, effort);
  let groundedText = userText;
  let sources: ChatWebResult[] = [];
  if (needsWeb) {
    const result = await searchWebContext(uid, buildFreshSearchQuery(askText), signal);
    sources = result.sources;
    groundedText = result.context
      ? `${userText}\n\n${result.context}`
      : `${userText}\n\nLive search was requested but returned no verifiable sources. Do not guess a current result; say clearly that it could not be verified.`;
  }

  const toolsEnabled = toolsAllowed(decision);
  let messages: WireMsg[] = buildWireMessages(history, groundedText, decision, toolsEnabled);
  let reply: ChatReply = { errorKind: null, errorText: null, sources: [], text: null };
  const outputs: SessionOutput[] = [];
  for (let round = 0; round <= AGENT_MAX_TOOL_ROUNDS; round += 1) {
    // The last permitted round goes out without tools so it must answer in text.
    const offerTools = toolsEnabled && round < AGENT_MAX_TOOL_ROUNDS;
    reply = await postChatCompletion(uid, messages, {
      decision,
      onDelta,
      signal,
      ...(offerTools ? { tools: AGENT_TOOLS } : {}),
    });
    const calls = reply.toolCalls ?? [];
    if (!calls.length || reply.errorKind) break;
    const results = await Promise.all(calls.map(async (call) => ({ call, result: await executeAgentTool(call) })));
    for (const { result } of results) {
      const output = outputFromToolResult(result);
      if (output && !outputs.some((existing) => existing.id === output.id)) outputs.push(output);
    }
    messages = [
      ...messages,
      {
        content: reply.text ?? "",
        role: "assistant",
        tool_calls: calls.map((call) => ({ function: { arguments: call.arguments, name: call.name }, id: call.id, type: "function" as const })),
      },
      ...results.map(({ call, result }) => ({
        content: JSON.stringify(result).slice(0, 20_000),
        role: "tool" as const,
        tool_call_id: call.id,
      })),
    ];
  }
  const shown = collapseOutputs(outputs);
  return { ...reply, sources, ...(shown.length ? { outputs: shown } : {}) };
}

export async function searchWebContext(uid: string, query: string, signal?: AbortSignal): Promise<{ context: string; sources: ChatWebResult[] }> {
  const key = await deviceKey(uid);
  if (!key) return { context: "", sources: [] };
  try {
    const response = await fetch("/api/workspace/search", {
      body: JSON.stringify({ query, limit: 5 }),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      method: "POST",
      signal,
    });
    if (!response.ok) return { context: "", sources: [] };
    const body = (await response.json()) as { data?: { web?: ChatWebResult[] } };
    // Same list the prompt numbers, so an inline [n] in the answer resolves to
    // the source the model actually cited.
    const sources = usableWebResults(body.data?.web ?? []);
    return { context: formatWebSearchContext(sources), sources };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { context: "", sources: [] };
  }
}
