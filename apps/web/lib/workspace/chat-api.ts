// Chat wiring for the Sessions surface — ported verbatim from the mobile
// nemesis-llm recipe (apps/mobile/src/api/chat.ts + src/lib/chat-thread.ts):
// same device-key mint, same chat/completions call, same system prompt and
// history budget, same error copy. Web swaps SecureStore for localStorage and
// adds AbortSignal support (mobile has no cancel affordance).

import {
  ARTIFACT_REFERENCE_RULE,
  type PendingDelete,
  expandArtifactContext,
  formatBrainContext,
  shouldRecallBrain,
  studyCreationKindFromPreferencePrompt,
  WRITING_VOICE,
} from "@nemesis/shared";

import { supabaseUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { SessionMessage, SessionOutput } from "@/lib/workspace/sessions-store";
import { AGENT_TOOLS, executeAgentTool, loadWorkspaceOverview, type AgentToolCall } from "@/lib/workspace/agent-tools";
import { activityLabel } from "@/lib/workspace/chat-activity";
import { PROGRESS_TICK_MS, WRITING_PHRASE, waitingPhrase } from "@/lib/workspace/chat-progress";
import {
  readWebNeedReply,
  shouldAskModelAboutWeb,
  WEB_NEED_PROMPT,
  WEB_NEED_TIMEOUT_MS,
  type WebNeedContext,
} from "@/lib/workspace/chat-web-need";
import { buildFreshSearchQuery, formatWebSearchContext, MAX_WEB_RESULTS, shouldSearchWeb, usableWebResults, type ChatWebResult } from "@/lib/workspace/chat-web-search";
import { applyChatEffort, DEFAULT_CHAT_EFFORT, toolsAllowed, type ChatEffort } from "@/lib/workspace/chat-effort";
import { recallBrain } from "@/lib/workspace/brain-api";
import { ATTACHMENT_ONLY_DECISION, classifyChatRequest, promptWithoutAttachments, routeInstruction, SAVE_INSTRUCTION, WORKSPACE_INSTRUCTION, type ChatRouteDecision } from "@/lib/workspace/chat-routing";
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
  // Owner 2026-08-05: chat is the CONTROL LAYER; Library, Study, and Calendar
  // are views of a workspace you maintain. The old opening listed only a few
  // read/create verbs, and the model behaved exactly that small. A capability
  // the model does not believe it has is the same as no capability.
  "You manage this student's Nemesis workspace through your tools. Chat is the control layer: the Library, Study, and Calendar " +
  "pages are views of state you and the student maintain together, and you can inspect and reorganize all three. " +
  "READ before answering about their material — never guess and never claim you cannot see it: get_workspace_overview orients you; " +
  "get_library_tree browses folders and notes with no search term; search_library and read_library_note reach content; " +
  "get_study_overview and read_study_deck carry real due counts, lapses, and scheduling; list_calendar_events returns the COMPLETE " +
  "window it reports for any date range, past included, with recurring classes expanded. The snapshot and overview are orientation — " +
  "for anything about 'everything', a whole semester, or a reorganization, read the full tree or range first. " +
  "ORGANIZE as well as create: move and rename notes and folders (rename_library_folder, move_library_folder, move_library_note), " +
  "move decks and re-file tests (move_study_deck, move_study_artifact, rename_study_deck), and correct calendar events " +
  "(update_calendar_event). Run find_calendar_issues before reorganizing a calendar; when a newer trustworthy source disagrees with " +
  "an existing event, UPDATE that event rather than adding a copy, and when you are not confident which version is right, ask. " +
  "FILING: material lives under the student's own courses and topics — never under folders named for who made it. When you cannot " +
  "tell where something belongs, put it in the Inbox folder and say so; a wrong course is worse than an honest Inbox. Prefer " +
  "updating an existing note on a topic over creating a near-duplicate second one. " +
  "Editing takes the item's id, which the list and read tools return — pass only the fields that should change, and leave the rest " +
  "out so they stay as they are. " +
  // 🔴 The nearest thing to a confirmation step this lane has. There is no
  // dialog inside a chat turn, so the bar for a destructive call is the
  // student's own words: "tidy up my notes" is a request to reorganise, not a
  // licence to delete, and the cost of asking is one sentence.
  "A delete never happens immediately: it puts a confirmation card on screen and the student has to tap it. So do not say anything has been deleted until they have — say the card is there and ask them to tap it. " +
  "Delete ONLY when the student has clearly asked for that specific thing to go. If the request is vague, or you are inferring which " +
  "item they mean, ask them which one first — deleting is the one action they cannot take back from here. Never delete something as " +
  "a side effect of tidying, reorganising, or making room. " +
  // Same correction as the phone's CHAT_SYSTEM_PROMPT — see the long comment
  // there. This used to say school portals were "handled by the Mac app's
  // missions", pointing the student at a deferred product. The inability is
  // real and stays; the dead-end referral does not.
  "You cannot sign in to school portals or course sites, and never tell the student another app will do it for them: when their material lives in one, ask them to upload or paste it, and work from that. " +
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

// 🔴 NO SCORING RITUAL HERE, and that is deliberate (owner 2026-08-04: "can we
// just have deepseek answer normally since its already a frontier model —
// theres a prompt making it output a confidence number").
//
// What used to live here: decompose every question into claims, label each one
// verified/inference/assumption/unknown, then close with a numeric confidence
// from 0.0 to 1.0 and, under 0.8, recite a fixed sentence. Three things were
// wrong with it. A model's self-reported score is not a measurement — it is
// generated text that looks like one, and evidence-grade.ts already says so in
// as many words. The scripted sentence turned every ordinary uncertainty into
// the same rehearsed line. And the labelling made short answers read like
// audit reports, which is the exact stiffness the voice rules downstream
// exist to undo.
//
// What survives is the part that is a GUARDRAIL rather than theatre: check the
// work, and never fabricate a source. Saying "I don't know" is now asked for in
// the model's own words, because a frontier model does that well unprompted and
// badly on a script.
const CHAT_PROMPT_TAIL =
  "Check your own work before you answer: verify every number, unit, name, and date you are about to state, and re-read the question to confirm you " +
  "answered what was actually asked. If a step does not hold up, fix it before replying rather than hedging afterwards. " +
  "Never invent a statistic, quotation, citation, date, or link to close a gap — a missing source is a finding to report, not a hole to fill. " +
  "Where you are genuinely unsure, or the question needed context you do not have, say so plainly in your own words and say what would settle it. " +
  "Answer at the length the question deserves: a short question gets a short answer.";

/**
 * The base prompt for one turn. The workspace paragraph is chosen from the SAME
 * boolean that decides whether the tools ride, so the prompt can never claim a
 * capability the request does not carry.
 */
export function chatSystemPrompt(toolsEnabled: boolean): string {
  // Voice rides LAST, after the verification procedure. Two reasons: it is the
  // instruction most easily crowded out by everything above it, and the tail's
  // "label every claim, score your confidence" rules produce exactly the stiff,
  // hedge-heavy prose the voice rules exist to prevent — so they need to be read
  // in that order. Shared with the phone (packages/shared) so the two surfaces
  // cannot drift.
  return `${CHAT_PROMPT_HEAD}${toolsEnabled ? CHAT_TOOLS_PROMPT : CHAT_NO_TOOLS_PROMPT}${CHAT_PROMPT_TAIL} ${WRITING_VOICE}`;
}

/** The tools-on prompt, kept as a named export for callers and tests that want
 *  the full text rather than a per-turn build. */
export const CHAT_SYSTEM_PROMPT = chatSystemPrompt(true);

/** Keep the upstream payload bounded: the most recent messages whose combined
 *  length fits the budget (always at least the latest message, even if huge —
 *  the valve's own caps are the final authority).
 *
 *  60k, up from 24k on 2026-08-03: a turn that carried attached-file text got
 *  evicted from history on the VERY NEXT turn at 24k, so "what did slide 10
 *  say" right after uploading the deck drew a blank — the chat literally
 *  lagged one turn behind the student's own files. 60k chars is ~15k tokens,
 *  which alongside the attachment budget still fits the model window. */
export const HISTORY_CHAR_BUDGET = 60_000;
export const HISTORY_MAX_MESSAGES = 40;

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
  /** Retrieved background — the second-brain packet. Its OWN system message, on
   *  purpose; see the block comment on the grounding message below. */
  groundingContext = "",
  /** The compact workspace snapshot (JSON), attached on workspace-intent turns
   *  so the model starts oriented. Orientation only — the message says so. */
  workspaceSnapshot = "",
): WireMsg[] {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const liveClock = `The current date is ${now.toISOString().slice(0, 10)} and the user's time zone is ${timeZone}. You do have this clock context; never claim you cannot know today's date.`;
  // 🔴 EXPAND BEFORE TRIMMING, never after. The artifact notes are real
  // characters on the wire — up to ARTIFACT_BODY_BUDGET (4,000) for the newest
  // one, plus a bracket per message that has outputs. Trimming first and
  // expanding after would enforce the 24,000-character budget and then walk
  // straight past it, and an oversized packet is dropped SILENTLY elsewhere in
  // this codebase rather than erroring. Mobile has done it in this order from
  // the start; this file briefly did not.
  //
  // The anchor is measured against `expanded`, not `history`, on purpose:
  // buildContinuityAnchor tests `kept.includes(firstUser)` by object identity,
  // and expandArtifactContext returns NEW objects for messages carrying
  // outputs. Comparing the two different sets would make the anchor fire for a
  // message that is actually present.
  const expanded = expandArtifactContext(history);
  const kept = trimHistory(expanded);
  const continuityAnchor = buildContinuityAnchor(expanded, kept);
  const priorAssistantText =
    [...history].reverse().find((message) => message.role === "assistant")?.content ?? "";
  const continuationKind = studyCreationKindFromPreferencePrompt(priorAssistantText);
  const skillText = continuationKind === "test"
    ? `${userText}\ncreate a practice test`
    : continuationKind === "flashcards"
      ? `${userText}\ncreate flashcards`
      : userText;
  // Skills go last among the system messages so their procedure is the most
  // recent instruction the model reads before the conversation itself.
  const skills = buildSkillMessage(selectChatSkills(skillText));
  return [
    {
      content: [
        chatSystemPrompt(toolsEnabled),
        ARTIFACT_REFERENCE_RULE,
        routeInstruction(decision.route),
        // Only when the tools are really riding — see SAVE_INSTRUCTION.
        ...(decision.savesToWorkspace && toolsEnabled ? [SAVE_INSTRUCTION] : []),
        ...(decision.workspaceIntent && toolsEnabled ? [WORKSPACE_INSTRUCTION] : []),
        liveClock,
      ].join("\n\n"),
      role: "system",
    },
    ...(continuityAnchor ? [{ content: continuityAnchor, role: "system" as const }] : []),
    ...(skills ? [{ content: skills, role: "system" as const }] : []),
    // 🔴 This used to be a bare content+role map over the raw history, which
    // dropped every message's `outputs` — so a recording, a deck or a note THIS
    // CONVERSATION had just produced was invisible on the next turn and "make
    // flashcards from this" had nothing to bind "this" to. Fixed on iOS first
    // (owner 2026-07-30); web had the identical hole. Shared module, not a
    // second copy. `kept` is already expanded — see the note above.
    ...kept.map((msg) => ({ content: msg.content, role: msg.role })),
    // 🔴 The retrieved packet rides its OWN system message. Concatenating it
    // onto the student's sentence — which is what `groundedText` used to do —
    // put unrelated Library notes, deadlines and weak cards immediately after
    // the word "this", making them the nearest antecedent for a pronoun that
    // meant something else entirely. Retrieved material is not something the
    // student said. It still sits last, closest to the answer, which is where
    // it earns its keep when the question really is about their notes.
    // The workspace snapshot rides its own system message for the same reason
    // the brain packet does. It is labeled orientation-only so it can never
    // become another silently-capped packet the model mistakes for full state.
    ...(workspaceSnapshot.trim()
      ? [{
        content:
          "Live snapshot of this student's workspace, generated for this turn. ORIENTATION ONLY: the counts are complete, "
          + "the lists are samples. Read the full state with the workspace tools before reorganizing anything or claiming "
          + "completeness.\n\n"
          + workspaceSnapshot.trim(),
        role: "system" as const,
      }]
      : []),
    ...(groundingContext.trim()
      ? [{
        content:
          "Background retrieved automatically from this student's workspace. It was NOT said by them and is "
          + "not what they are pointing at. Use it only where it is relevant to what they actually asked; if it "
          + "is about a different subject, ignore it.\n\n"
          + groundingContext.trim(),
        role: "system" as const,
      }]
      : []),
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

/**
 * The model a non-streaming response says actually produced it.
 *
 * Pure and exported so the fallback-detection rule can be pinned by a test
 * without a network call. Returns null rather than a guess when the field is
 * missing: "we do not know" and "it was the model we asked for" must never
 * collapse into the same value, or an undetected downgrade reads as healthy.
 */
export function completionModel(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const model = (body as { model?: unknown }).model;
  return typeof model === "string" && model.trim() ? model.trim() : undefined;
}

/**
 * Whether `answered` is a different engine from the `requested` alias.
 *
 * Compares only up to the first "-", because a provider legitimately answers a
 * request for "deepseek-chat" with a dated build like "deepseek-chat-0324" and
 * flagging that as a downgrade would cry wolf on every healthy turn. What must
 * be caught is the family changing: deepseek -> glm, qwen, kimi, claude.
 *
 * Unknown (undefined) is NOT a downgrade. A missing field is a gap in what the
 * provider told us, and warning a student about a model swap that may not have
 * happened would train them to ignore the warning that matters.
 */
export function isFallbackModel(requested: string, answered: string | undefined): boolean {
  if (!answered) return false;
  const family = (name: string) => name.toLowerCase().split("-")[0] ?? "";
  return family(requested) !== family(answered);
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
  /** A delete the model asked for and the gate held. NOTHING has been deleted;
   *  the page shows a card and only the student's click carries it out. Never
   *  persisted — a decision they have not made is not a deliverable. */
  pendingDelete?: PendingDelete;
  /**
   * The model that ACTUALLY answered, as reported by the provider — not the one
   * we asked for.
   *
   * nemesis-llm keeps a fallback chain (DeepSeek, then GLM, Qwen, Kimi,
   * Anthropic) as uptime insurance, and it swaps providers without telling
   * anyone. That is the right call for availability and the wrong call for
   * anything that depends on following a long instruction: on 2026-07-29 the
   * recording notes silently stopped obeying their prompt — no headings, no
   * opening summary, just the transcript restated line by line — and nothing
   * anywhere said a different model had answered.
   *
   * The value was on the wire the whole time; the valve returns the provider's
   * body verbatim and it carries `model`. This type was simply dropping it.
   *
   * Undefined on streamed turns (the field arrives in the SSE chunks, which
   * readCompletionStreamFull does not surface) and whenever the provider omits
   * it — so treat undefined as "unknown", never as "the model we asked for".
   */
  model?: string;
}

export interface ChatCompletionOptions {
  signal?: AbortSignal;
  decision?: ChatRouteDecision;
  onDelta?: CompletionDeltaHandler;
  /** OpenAI-format tool schemas; the valve forwards them verbatim. */
  tools?: readonly unknown[];
  /**
   * This call is INTERNAL — the student never asked for it and must never be
   * interrupted by it.
   *
   * 🔴 THE UPGRADE DIALOG IS A SIDE EFFECT OF THIS FUNCTION. A budget error
   * pops the shell-mounted upsell, which is right for the turn the student
   * pressed send on and badly wrong for a hidden classification call: a
   * student out of credits would get the modal thrown at them BEFORE their own
   * question had started, and then again when the real call failed. Background
   * callers set this and swallow their own failure.
   */
  background?: boolean;
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
      if (errorKind === "budget" && !options.background) showUpgradePrompt(errorText, budgetResetOf(body));
      return { errorKind, errorText, sources: [], text: null };
    }
    let text: string | null = null;
    let toolCalls: AgentToolCall[] = [];
    let answeringModel: string | undefined;
    if (options.onDelta) {
      const streamed = await readCompletionStreamFull(res.body, options.onDelta);
      text = streamed.text.trim() ? streamed.text : null;
      toolCalls = streamed.toolCalls;
    } else {
      const body = (await res.json().catch(() => null)) as unknown;
      text = completionText(body);
      toolCalls = completionToolCalls(body);
      answeringModel = completionModel(body);
    }
    if (text || toolCalls.length) {
      return {
        errorKind: null,
        errorText: null,
        sources: [],
        text,
        ...(answeringModel ? { model: answeringModel } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
      };
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

/**
 * Only kinds whose items all open the SAME place may collapse.
 *
 * Calendar events qualify: every one of them lands on the calendar, so a single
 * card loses nothing. Decks, notes and tests do NOT — each has its own
 * destination, and folding four decks into one card would leave three of them
 * unreachable from the transcript. Better a short list of real links than one
 * tidy card that hides them.
 */
const COLLAPSED_NOUN: Partial<Record<SessionOutput["kind"], string>> = {
  event: "calendar events",
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
    if (total <= threshold || !COLLAPSED_NOUN[output.kind]) {
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
/**
 * Keep the thinking strip moving while the model says nothing.
 *
 * Returns its own stop function, which is safe to call twice — the first
 * character of a streamed answer and the completed reply both want to end it,
 * and they race by design.
 */
interface WaitingStrip {
  /** Hold a specific verb ("Searching the web") until resume(). */
  pin: (label: string) => void;
  /** Back to the elapsed-time phrases, on the ORIGINAL clock. */
  resume: () => void;
  /** End it. Safe to call twice — the first streamed character and the
   *  completed reply both want to, and they race by design. */
  stop: (final: string | null) => void;
}

function startWaitingStrip(onActivity?: (label: string | null) => void): WaitingStrip {
  if (!onActivity) return { pin: () => {}, resume: () => {}, stop: () => {} };
  const startedAt = Date.now();
  let pinned: string | null = null;
  let stopped = false;
  const paint = () => {
    if (!stopped) onActivity(pinned ?? waitingPhrase(Date.now() - startedAt));
  };
  paint();
  const timer = setInterval(paint, PROGRESS_TICK_MS);
  return {
    pin: (label: string) => { pinned = label; paint(); },
    resume: () => { pinned = null; paint(); },
    stop: (final: string | null) => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      onActivity(final);
    },
  };
}

/**
 * Ask the model whether this turn needs the live web.
 *
 * Bounded twice over: it is only called when the cheap checks could not decide
 * (shouldAskModelAboutWeb), and it gives up after WEB_NEED_TIMEOUT_MS. Every
 * failure path — timeout, network, auth, a reply that is not the one word it
 * was asked for — resolves to false, so the worst case is the behaviour we had
 * before this existed rather than a stalled turn.
 */
async function modelWantsWeb(uid: string, context: WebNeedContext, signal?: AbortSignal): Promise<boolean> {
  if (!shouldAskModelAboutWeb(context)) return false;
  const timer = new AbortController();
  // Linked to the caller's signal so pressing Stop kills the pre-flight too,
  // rather than leaving a request running against a turn nobody wants.
  const onAbort = () => timer.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const deadline = setTimeout(() => timer.abort(), WEB_NEED_TIMEOUT_MS);
  try {
    const reply = await postChatCompletion(
      uid,
      [{ content: WEB_NEED_PROMPT, role: "system" }, { content: context.ask, role: "user" }],
      { background: true, decision: { model: "deepseek-chat", route: "conversation", searchWeb: false }, signal: timer.signal },
    );
    return readWebNeedReply(reply.text);
  } catch {
    return false;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function sendChatTurn(
  uid: string,
  history: SessionMessage[],
  userText: string,
  signal?: AbortSignal,
  onDelta?: CompletionDeltaHandler,
  effort: ChatEffort = DEFAULT_CHAT_EFFORT,
  /** Live thinking-strip copy (owner 2026-08-03: the static "Thinking" shimmer
   *  on a minute-long turn "wasn't dynamic"). Fed from two places: the
   *  reasoner's streamed thoughts and the agent's tool rounds. null = back to
   *  the plain shimmer. */
  onActivity?: (label: string | null) => void,
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
  // 🔴 THE STRIP STARTS HERE, NOT AT THE MODEL CALL. Everything between this
  // line and the answer is time the student spends waiting — the web-need
  // pre-flight, the search itself, the brain lookup — and a strip that only
  // woke up for the final call would leave a silent gap in front of it and
  // then restart its clock at zero, which is the exact staleness this is
  // meant to fix. One strip, one clock, for the whole turn.
  let strip = startWaitingStrip(onActivity);
  // The keyword lists are a fast path, not the whole decision: when they miss,
  // the model itself is asked whether this question needs live sources. See
  // chat-web-need.ts for why this is a pre-flight and not a tool.
  //
  // A WORKSPACE turn opts out of the whole web apparatus unless the student
  // explicitly asked for the web (classifyChatRequest already set searchWeb
  // then): "what's my schedule tomorrow" is a database read, and it used to
  // buy a paid search off the word "tomorrow" AND get promoted onto the
  // tool-less reasoner below — the two halves of the calendar incident.
  const regexSaidYes = classified.workspaceIntent
    ? classified.searchWeb
    : classified.searchWeb || shouldSearchWeb(askText);
  const needsWeb = regexSaidYes || (!classified.workspaceIntent && await modelWantsWeb(uid, {
    ask: askText,
    hasAttachments: userText.trim() !== askText.trim(),
    regexSaidYes,
    savesToWorkspace: classified.savesToWorkspace === true,
  }, signal));
  const routed: ChatRouteDecision = needsWeb && classified.route === "conversation" && !classified.workspaceIntent
    ? { route: "current", model: "deepseek-reasoner", searchWeb: true }
    : classified;
  // The student's dial wins over the route's own guess at how hard to think.
  const decision = applyChatEffort(routed, effort);
  let groundedText = userText;
  let sources: ChatWebResult[] = [];
  // Start the second-brain lookup beside live web search. It combines semantic
  // Library passages with typed graph neighbors, Calendar deadlines, and Study
  // weak spots in one bounded packet; failures are a normal empty context.
  const brainLookup = shouldRecallBrain(askText)
    ? recallBrain(askText)
    : Promise.resolve(null);
  // Workspace turns also start ORIENTED: the compact snapshot rides as its own
  // system message (buildWireMessages labels it orientation-only). Fetched in
  // parallel with everything else; a failure just means no snapshot.
  const overviewLookup: Promise<unknown> = classified.workspaceIntent
    ? loadWorkspaceOverview().catch(() => null)
    : Promise.resolve(null);
  if (needsWeb) {
    strip.pin("Searching the web");
    const result = await searchWebContext(uid, buildFreshSearchQuery(askText), signal);
    strip.resume();
    sources = result.sources;
    groundedText = result.context
      ? `${userText}\n\n${result.context}`
      : `${userText}\n\nLive search was requested but returned no verifiable sources. Do not guess a current result; say clearly that it could not be verified.`;
  }
  // The question decides which parts of the packet survive — Calendar and Study
  // rows have to be asked for or share vocabulary with it now, rather than
  // riding along on every turn. See brain-context.ts.
  const brainContext = formatBrainContext(await brainLookup, askText);
  const overview = await overviewLookup;
  const workspaceSnapshot = overview ? JSON.stringify(overview) : "";

  const toolsEnabled = toolsAllowed(decision);
  let messages: WireMsg[] = buildWireMessages(history, groundedText, decision, toolsEnabled, brainContext, workspaceSnapshot);
  let reply: ChatReply = { errorKind: null, errorText: null, sources: [], text: null };
  const outputs: SessionOutput[] = [];
  let pendingDelete: PendingDelete | undefined;
  // The strip shows curated verbs only ("Searching the web", "Making
  // flashcards") — never the reasoner's own running text, which echoes raw
  // search snippets and reads as noise (owner 2026-08-04: no verbose
  // thinking previews). Between verbs it falls back to the quiet shimmer.
  for (let round = 0; round <= AGENT_MAX_TOOL_ROUNDS; round += 1) {
    // The last permitted round goes out without tools so it must answer in text.
    const offerTools = toolsEnabled && round < AGENT_MAX_TOOL_ROUNDS;
    // A second or later round waits again after a tool ran, so it gets a fresh
    // clock — that wait genuinely did start over.
    if (round > 0) strip = startWaitingStrip(onActivity);
    let seenDelta = false;
    try {
      reply = await postChatCompletion(uid, messages, {
        decision,
        onDelta: onDelta
          ? (delta, accumulated) => {
            // The moment text appears, the answer itself is the progress.
            if (!seenDelta) {
              seenDelta = true;
              strip.stop(WRITING_PHRASE);
            }
            onDelta(delta, accumulated);
          }
          : undefined,
        signal,
        ...(offerTools ? { tools: AGENT_TOOLS } : {}),
      });
    } finally {
      // finally, not a plain call: an abort or a throw here would otherwise
      // leave the interval running and the strip shimmering forever.
      strip.stop(null);
    }
    const calls = reply.toolCalls ?? [];
    if (!calls.length || reply.errorKind) break;
    onActivity?.(activityLabel(calls));
    const results = await Promise.all(calls.map(async (call) => ({ call, result: await executeAgentTool(call) })));
    onActivity?.(null);
    for (const { result } of results) {
      const output = outputFromToolResult(result);
      if (output && !outputs.some((existing) => existing.id === output.id)) outputs.push(output);
      // Only the FIRST held delete is kept: two confirmation cards at once is a
      // queue the student has to reason about, and a turn asking to delete two
      // things is exactly when they should be slowing down, not clicking twice.
      const held = (result as Record<string, unknown> | null)?.pending_delete;
      if (!pendingDelete && held && typeof held === "object") pendingDelete = held as PendingDelete;
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
  onActivity?.(null);
  return {
    ...reply,
    sources,
    ...(shown.length ? { outputs: shown } : {}),
    ...(pendingDelete ? { pendingDelete } : {}),
  };
}

export async function searchWebContext(uid: string, query: string, signal?: AbortSignal): Promise<{ context: string; sources: ChatWebResult[] }> {
  const key = await deviceKey(uid);
  if (!key) return { context: "", sources: [] };
  try {
    const response = await fetch("/api/workspace/search", {
      body: JSON.stringify({ query, limit: MAX_WEB_RESULTS }),
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
