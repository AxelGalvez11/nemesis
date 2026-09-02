// Phone Chat (cloud-first pivot §6): talks to the SAME metered valve as the
// desktop app (nemesis-llm edge function) — server-side model routing, plan
// budgets, and failover all apply unchanged, so chat here bills exactly like
// chat on the Mac. No Mac involvement anywhere in this path.
//
// Cloud-first pivot §6: threads/messages now live in `chat_threads`/
// `chat_messages` (same tables as the web Sessions surface, §4) — the on-disk
// JSON cache stays as an instant-open + offline-read layer, write-through
// synced to the cloud on every mutation. All the merge/mapping logic is pure
// and lives in lib/chat-threads.ts; this file is the I/O layer (Supabase
// calls, streaming fetch, device-key mint, local file cache).
//
// Identity rules (review findings, 2026-07-17 — same class as reviewEvents):
// EVERYTHING here is scoped to the signed-in user's id. The device key lives
// under a per-user SecureStore entry and is only ever minted from a session
// whose user matches; the rolling thread file is per-user too. An account
// switch on this phone can neither read, upload, nor bill against another
// account's conversation — each user's key and thread simply wait for them.
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import {
  DEFAULT_INTENT,
  formatBrainContext,
  INTENT_TIMEOUT_MS,
  intentMessages,
  readChatIntent,
  shouldRecallBrain,
  type ChatIntent,
  type IntentContext,
  type IntentExchange,
} from "@nemesis/shared";
import { ACADEMIC_SKILL_CATALOG } from "@/lib/academic-skills";
import { supabase } from "./supabase";
import { createNoteWithContent, renameNoteById, updateNoteContent } from "./cloudLibrary";
import {
  budgetResetKind,
  buildAttachmentContext,
  buildWireMessages,
  chatErrorKind,
  chatErrorMessage,
  forcedResearchDecision,
  formatWebSearchContext,
  type AttachedLibraryDoc,
  type BudgetResetKind,
  type ChatErrorKind,
  type ChatMsg,
  type ChatOutput,
  type ChatSource,
  type WireMsg,
} from "@/lib/chat-thread";
import { routeForTurn, type ChatRouteDecision } from "@/lib/chat-routing";
import { applyChatEffort, DEFAULT_CHAT_EFFORT, toolsAllowed, type ChatEffort } from "@/lib/chat-effort";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { executeAgentTool, type AgentToolCall } from "./agentTools";
import { folderForNewItem, studyCreationKindFromPreferencePrompt, type PendingDelete } from "@nemesis/shared";
import { recallBrain } from "./brain";
import { loadKnownCourses } from "./courses";
import {
  buildFinalNoteMessages,
  buildLiveNotesMessages,
  parseLiveNotes,
  splitFinalNote,
} from "@/lib/live-notes";
import { isDefaultRecordingTitle, mergeOutputsMeta, type RecordingDraft } from "@/lib/recording";
import { folderOf } from "@/lib/library-paths";
import { readCompletionStreamFull, type CompletionDeltaHandler } from "@/lib/chat-stream";
import { base64ToBytes, bytesToBase64, readWav, trimWavSilence } from "@/lib/wav-trim";
import { encodeToM4A } from "../../modules/nemesis-audio-encoder";
import type { ThinkingPhase } from "@/lib/thinking-phase";
import {
  generalPrefsInstruction,
  generalPrefsStoreKey,
  parseGeneralPrefs,
} from "@/lib/general-prefs";
import {
  chatMsgFromCloudRow,
  deriveMessageId,
  emptyStore,
  ensureMessageIds,
  withoutPendingRecordings,
  generateUuidV4,
  getThread,
  isValidThreadId,
  MAX_MESSAGES_PER_THREAD,
  MAX_THREADS,
  mergeCloudThreadList,
  mergeMessages,
  newMessagesSince,
  outputsFromMeta,
  parseThreadStore,
  remapThreadId,
  removeThread,
  renameThreadTitle,
  setThreadMessages,
  setThreadPinned,
  threadSummaries,
  upsertThread,
  type ChatThread,
  type CloudThreadMeta,
  type ThreadStore,
  type ThreadSummary,
} from "@/lib/chat-threads";

const LLM_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/nemesis-llm`;

// Cost attribution: tells the metering valve WHICH app spent the tokens. Until a build
// carrying this ships, the valve reads the device-key label ("Nemesis iPhone") instead,
// so phone spend is attributed either way.
const CLIENT_HEADER = { "X-Nemesis-Client": "ios" } as const;
const SEARCH_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/nemesis-search/v2/search`;

// SecureStore keys allow [A-Za-z0-9._-]; uuids fit as-is.
const deviceKeyStoreFor = (uid: string) => `nemesis_device_key_v1_${uid}`;

async function learnerProfileForChat(uid: string): Promise<string> {
  try {
    const raw = await SecureStore.getItemAsync(generalPrefsStoreKey(uid));
    return generalPrefsInstruction(parseGeneralPrefs(raw));
  } catch {
    return generalPrefsInstruction(parseGeneralPrefs(null));
  }
}

/** Mint a device key for the CURRENT session, only if it belongs to `uid` —
 *  a stale screen from a previous account must never mint under the new one. */
async function mintDeviceKey(uid: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== uid) return null;
  try {
    const res = await fetch(`${LLM_BASE}/device-key`, {
      body: JSON.stringify({ label: "Nemesis iPhone" }),
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { key?: string };
    if (typeof body.key !== "string" || !body.key.startsWith("nmk_")) return null;
    await SecureStore.setItemAsync(deviceKeyStoreFor(uid), body.key);
    return body.key;
  } catch {
    return null;
  }
}

/** The device key this phone talks to the app's own API with. Exported for
 *  api/photos.ts, which posts a photograph to the same extract endpoint the web
 *  app uses and needs the same `nmk_` bearer that route gates on. */
export async function deviceKey(uid: string): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(deviceKeyStoreFor(uid));
    if (stored?.startsWith("nmk_")) return stored;
  } catch {
    // fall through to a fresh mint
  }
  return mintDeviceKey(uid);
}

// ── ids (thread ids double as the `chat_threads.id` uuid PK) ────────────────

/** A fresh thread id. MUST be a valid Postgres uuid — chat_threads.id is a
 *  `uuid` column, and this id is used verbatim as the cloud row's id (the
 *  route param `?c=` needs an id before the first cloud write can happen, so
 *  the id can't wait for a server-assigned one). */
export function newThreadId(): string {
  return generateUuidV4();
}

/** A fresh message id — the identity of its `chat_messages` cloud row. Stable
 *  client-generated ids let every cloud message write be insert-with-
 *  conflict-ignore, so re-sending a message after a dropped connection can
 *  never duplicate a row. */
export function newMessageId(): string {
  return generateUuidV4();
}

// ── web search (§3: phone calls nemesis-search directly with the device key) ─

/** Time-sensitive queries need an explicit date, or a search provider can rank an older result
 *  above today's.
 *
 *  🔴 THE FALLBACK, NOT THE RULE. The model writes the search query itself now and puts a date in
 *  it when recency is what matters (`webQuery`, see @nemesis/shared/chat-intent.ts). This stamps one
 *  on only when it did not — a current-events turn whose query came back empty. */
function withFreshDateAnchor(query: string): string {
  return `${query.trim()} current as of ${new Date().toISOString().slice(0, 10)}`;
}

/** Prompt-feeding copied from web's chat-api.ts::searchWebContext: fetch live
 *  results and format them into a context block the model is told to cite. */
async function searchWebContext(
  uid: string,
  query: string,
  /** How many pages the model asked to read. Null means it did not choose. */
  wanted: number | null = null,
  /** How recent they have to be, when the model asked for a window. Null means any age.
   *  Forwarded, not validated: which windows Brave accepts is the search function's fact. */
  freshness: string | null = null,
): Promise<{ context: string; sources: ChatSource[] }> {
  const key = await deviceKey(uid);
  if (!key) return { context: "", sources: [] };
  try {
    const res = await fetch(SEARCH_URL, {
      // 🔴 NO CAP OF OURS. This asked for ten and then threw away anything past ten — after the
      // search had been paid for and the pages fetched. One search bills one unit however many
      // come back, so the number saved nothing and cost evidence. How many to read is the model's
      // call (`webResults`); omitting the limit lets the search function fall back to the
      // provider's own ceiling rather than to a number either side invented.
      body: JSON.stringify({ query, ...(wanted ? { limit: wanted } : {}), ...(freshness ? { freshness } : {}) }),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...CLIENT_HEADER },
      method: "POST",
    });
    if (!res.ok) return { context: "", sources: [] };
    const body = (await res.json()) as { data?: { web?: ChatSource[] } };
    const sources = (body.data?.web ?? []).filter((source) => source.url);
    return { context: formatWebSearchContext(sources), sources };
  } catch {
    return { context: "", sources: [] };
  }
}

// ── chat/completions (streaming) ────────────────────────────────────────────

export interface ChatReply {
  text: string | null;
  errorText: string | null;
  errorKind: ChatErrorKind | null;
  /** Set only on budget errors — which credit window ran dry (drives the
   *  upgrade sheet's reset line). */
  budgetReset: BudgetResetKind | null;
  sources: ChatSource[];
  /** Saved deliverables created by workspace tools on this turn. */
  outputs?: ChatOutput[];
  /** Workspace tools the model asked for on this round. Present only inside
   *  sendChat's agent loop; a reply handed back to the screen never has any. */
  toolCalls?: AgentToolCall[];
  /** A delete the model asked for and the gate held. NOTHING has been deleted;
   *  the screen shows a card and only the student's tap carries it out.
   *  Deliberately NOT a ChatOutput: a decision they have not made yet is not a
   *  deliverable, so it is never persisted and closing the app declines it. */
  pendingDelete?: PendingDelete;
}

/**
 * One plain completion for a caller that is not a chat thread — the canvas screen's turn
 * (api/canvases.ts). Same valve, same device key, same routing default as an ordinary chat turn
 * with nothing special asked; nothing here touches `chat_threads`.
 */
export async function completeMessages(
  uid: string,
  wireMessages: WireMsg[],
  options: { onDelta?: CompletionDeltaHandler; signal?: AbortSignal } = {},
): Promise<{ text: string | null; errorText: string | null }> {
  const reply = await postChatCompletion(uid, wireMessages, routeForTurn(DEFAULT_INTENT, null), options.onDelta, undefined, undefined, options.signal);
  return { text: reply.text, errorText: reply.errorText };
}

/** One completion turn over expo/fetch's streaming Response.body (SDK 56, no
 *  new dep — a real ReadableStream, same shape a browser gives web). Always
 *  requests `stream: true`; readCompletionStream still returns the full
 *  accumulated text when no `onDelta` is supplied, so this is also the
 *  non-streaming path. Never throws — network/API failures come back as a
 *  student-readable line. */
async function postChatCompletion(
  uid: string,
  wireMessages: WireMsg[],
  decision: ChatRouteDecision,
  onDelta?: CompletionDeltaHandler,
  onReasoning?: CompletionDeltaHandler,
  tools?: readonly unknown[],
  signal?: AbortSignal,
): Promise<ChatReply> {
  let key = await deviceKey(uid);
  if (!key) return { budgetReset: null, errorKind: "auth", errorText: "Sign in to chat.", sources: [], text: null };

  const payload = JSON.stringify({
    messages: wireMessages,
    model: decision.model,
    ...(decision.reasoningEffort ? { reasoning_effort: decision.reasoningEffort } : {}),
    stream: true,
    // The valve forwards `tools` to the provider verbatim. `tool_choice` is never
    // sent: DeepSeek's thinking mode rejects a forced choice.
    ...(tools?.length ? { tools } : {}),
  });
  const call = (bearer: string) =>
    expoFetch(`${LLM_BASE}/v1/chat/completions`, {
      body: payload,
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", ...CLIENT_HEADER },
      method: "POST",
      // What makes Stop physically possible. expo/fetch honours this and calls
      // the native request.cancel(); without it the only "cancellation" the phone
      // had was the epoch guard, which merely ignores a reply that is still
      // arriving and still being paid for.
      ...(signal ? { signal } : {}),
    });

  try {
    let res = await call(key);
    // A revoked/unknown key (wiped server-side, restored phone) re-mints once —
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
      return {
        budgetReset: budgetResetKind(body),
        errorKind: chatErrorKind(res.status, body),
        errorText: chatErrorMessage(res.status, body),
        sources: [],
        text: null,
      };
    }
    const streamed = await readCompletionStreamFull(res.body, onDelta, onReasoning);
    // A TOOL ROUND HAS NO TEXT AT ALL — the model's whole output is the tool call.
    // So "empty" only counts as a failure when nothing came back either way;
    // treating no-text as an error here would have reported "the answer came back
    // empty" on the first round of every save and broken out of the loop before a
    // single tool ran.
    if (streamed.text || streamed.toolCalls.length > 0) {
      return {
        budgetReset: null,
        errorKind: null,
        errorText: null,
        sources: [],
        text: streamed.text || null,
        ...(streamed.toolCalls.length > 0 ? { toolCalls: streamed.toolCalls } : {}),
      };
    }
    return { budgetReset: null, errorKind: "generic", errorText: "The answer came back empty. Try again.", sources: [], text: null };
  } catch {
    // 🔴 TEST THE SIGNAL, NEVER THE EXCEPTION. A cancelled expo/fetch does NOT
    // throw a DOMException named "AbortError" the way the browser does: before the
    // response it throws FetchError("fetch failed: The operation was aborted."),
    // and mid-stream the body controller errors with a plain Error. Checking
    // err.name would match neither, and the student would be told they were
    // offline every time they pressed Stop. It may also not throw AT ALL — a
    // native cancel can surface as a clean stream close — which is why the loop
    // above checks signal.aborted independently.
    if (signal?.aborted) {
      return { budgetReset: null, errorKind: "aborted", errorText: null, sources: [], text: null };
    }
    return {
      budgetReset: null,
      errorKind: "unreachable",
      errorText: "You're offline — chat needs a connection (your Library still works).",
      sources: [],
      text: null,
    };
  }
}

export interface SendChatOptions {
  onDelta?: CompletionDeltaHandler;
  /** Reports what this turn is ACTUALLY doing, so the screen can show a
   *  thinking line instead of anonymous dots. Every phase corresponds to a
   *  real step below — no phase is emitted for work that isn't happening. */
  onPhase?: (phase: ThinkingPhase) => void;
  /** The model's own working-out as it streams, for the live thinking preview.
   *  Fires many times a second on a deep turn, so the caller is expected to
   *  buffer rather than render every call. NEVER fires on an Instant turn (it
   *  runs with thinking disabled) — an empty preview is a normal outcome, not a
   *  failure, and the phase line covers it. */
  onReasoning?: CompletionDeltaHandler;
  /** Set when the composer's "Deep research" toggle was on for this turn —
   *  forces forcedResearchDecision() instead of the turn decision's
   *  text-based inference. See that function's doc for why. */
  forceResearch?: boolean;
  /** A Library document attached via the composer's "+" menu for this turn —
   *  folded into the wire-only prompt (buildAttachmentContext) and NEVER
   *  passed back out; the caller is responsible for what (if anything) it
   *  records into the persisted ChatMsg it builds for its own history (see
   *  chat.tsx's send(), which uses withAttachmentNote for that). */
  attachedDoc?: AttachedLibraryDoc;
  /** The composer "+" menu's Instant/Medium/High choice for this turn. An
   *  explicit pick BEATS the route's own guess (see lib/chat-effort.ts);
   *  omitted means Medium, which is the classifier's untouched behaviour. */
  effort?: ChatEffort;
  /** Cancels this turn — the composer's Stop control (owner 2026-07-30: "there is
   *  also no pause button for once it begins thinking and doing").
   *
   *  What it stops: the streaming request itself, any further tool rounds, and any
   *  remaining tool calls in the round it is in. What it does NOT stop: a tool call
   *  already executed. A deck that was written is written, so the UI must never
   *  imply a rollback. */
  signal?: AbortSignal;
}

/** Most tool rounds one turn may run before we force a plain answer. Same cap the
 *  web uses. Four is enough for "read my notes, then build me a deck from them";
 *  without a cap, a model that keeps re-reading the same note would spend the
 *  student's credits going round in a circle. */
const AGENT_MAX_TOOL_ROUNDS = 4;

/** One routed completion turn for the signed-in user `uid`: classifies the
 *  request (model + whether it needs live search) — or, when the composer's
 *  Deep research toggle forced it, research, unless the student asked us to save
 *  something (see routeForTurn) — optionally folds in an attached Library
 *  document's text, grounds with a nemesis-search call when the route calls for
 *  it, then streams the reply. `options.onDelta` is called with each chunk as it
 *  arrives so the screen can render into the assistant bubble live.
 *
 *  Runs the WORKSPACE AGENT LOOP (owner 2026-07-24: the phone chat must be able to
 *  make flashcards, tests and mind maps, and manipulate the Library). The model may
 *  call the tools in lib/agent-tools.ts; each result is fed back and it keeps going
 *  until it answers in words. Tools are withheld on thinking-model turns, which
 *  have to echo `reasoning_content` back on a tool round — something the stream does
 *  not retain (see toolsAllowed).
 *
 *  Never throws. */
/**
 * Pair a flat transcript into the exchanges the intent call reads. Nemesis's own turns go in as the
 * sentence the student actually saw, since that is what "yeah do that" is answering.
 */
export function intentHistory(history: readonly ChatMsg[]): IntentContext["history"] {
  const exchanges: IntentExchange[] = [];
  for (const message of history) {
    if (message.role === "user") {
      exchanges.push({ replied: "", said: message.content });
      continue;
    }
    const last = exchanges[exchanges.length - 1];
    if (last && !last.replied) last.replied = message.content;
  }
  return exchanges;
}

/**
 * Read what the student meant: one model call, one decision, for the whole turn.
 *
 * Bounded by a hard deadline, and every failure path — timeout, network, auth, a refusal, prose
 * where JSON was asked for — resolves to DEFAULT_INTENT. The student gets an answer; they do not
 * get a spinner, and they do not get "I can't see your calendar".
 */
/**
 * The most searches one turn may run.
 *
 * 🔴 A BACKSTOP, NOT THE DECISION. The model stops when it says it has enough; this exists so a
 * turn cannot run away, and the number is STATED to the model rather than enforced behind its back
 * (`searchesLeft` in `IntentContext`). Same value the Canvas uses, deliberately: one product, one
 * answer to "how hard will Nemesis look".
 */
export const MAX_SEARCH_ROUNDS = 4;

async function readTurnIntent(
  uid: string,
  ask: string,
  context: IntentContext,
  signal?: AbortSignal,
): Promise<ChatIntent> {
  if (!ask.trim()) return DEFAULT_INTENT;
  const timer = new AbortController();
  const onAbort = () => timer.abort();
  signal?.addEventListener("abort", onAbort);
  const deadline = setTimeout(() => timer.abort(), INTENT_TIMEOUT_MS);
  try {
    const reply = await postChatCompletion(
      uid,
      intentMessages({ ask, catalog: ACADEMIC_SKILL_CATALOG, context }) as WireMsg[],
      { model: "deepseek-chat", route: "conversation", searchWeb: false },
      undefined,
      undefined,
      undefined,
      timer.signal,
    );
    return readChatIntent(reply.text ?? "") ?? DEFAULT_INTENT;
  } catch {
    return DEFAULT_INTENT;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function sendChat(
  uid: string,
  history: ChatMsg[],
  userText: string,
  options: SendChatOptions = {},
): Promise<ChatReply> {
  const { attachedDoc, effort = DEFAULT_CHAT_EFFORT, forceResearch, onDelta, onPhase, onReasoning, signal } = options;
  onPhase?.({ kind: "routing" });
  const priorAssistantText =
    [...history].reverse().find((message) => message.role === "assistant")?.content ?? "";
  // 🔴 ONE CALL READS THE TURN, AND IT IS THE SAME ONE THE BROWSER MAKES. This used to be thirteen
  // regexes in `chat-routing.ts` — a second copy of the web classifier, with one of them already
  // drifted, so the identical question could behave differently on the two surfaces. See
  // @nemesis/shared/chat-intent.ts. A failed or timed-out read is DEFAULT_INTENT: an ordinary
  // conversational turn on the tools-capable model, which is a working turn rather than an error.
  /** One pass of the decision. `webContext` carries everything found so far; empty on the first. */
  const readIntent = (webContext: string, searchesLeft: number) => readTurnIntent(uid, userText, {
    attachments: attachedDoc ? [attachedDoc.title] : [],
    // Application state, not language: the prefix belongs to a question Nemesis itself wrote.
    awaitingStudyPreference: studyCreationKindFromPreferencePrompt(priorAssistantText),
    history: intentHistory(history),
    searchesLeft,
    today: new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", weekday: "long", year: "numeric" }),
    webContext,
  }, signal);
  const intent = await readIntent("", MAX_SEARCH_ROUNDS);
  // Then let the student's own dial override how hard to think about it — never the other way
  // round. Both steps make one exception, for a request to SAVE something into the student's own
  // workspace: that write happens through a tool call, and both the research toggle and the High
  // dial would otherwise switch the tools off and turn the save into an essay. See routeForTurn
  // and applyChatEffort.
  const decision = applyChatEffort(
    routeForTurn(intent, forceResearch ? forcedResearchDecision() : null),
    effort,
  );
  const attachmentContext = attachedDoc ? buildAttachmentContext(attachedDoc) : "";
  let groundedText = attachmentContext ? `${userText}\n\n${attachmentContext}` : userText;
  let sources: ChatSource[] = [];
  const outputs: ChatOutput[] = [];
  let pendingDelete: PendingDelete | undefined;
  // The student's second brain: semantic notes + one-hop links + deadlines +
  // demonstrated weak cards. It starts beside web search so the independent
  // calls cost one wait, and returns null on any degraded backend path.
  const brainLookup = shouldRecallBrain({ topic: intent.topic, workspaceTurn: intent.workspace !== "none" })
    ? recallBrain(userText)
    : Promise.resolve(null);
  // 🔴🔴 THE MODEL SEARCHES UNTIL IT SAYS IT HAS ENOUGH — the same loop the Canvas has run since
  // `MAX_SEARCH_ROUNDS`, brought here so one product does not look twice as hard on one screen.
  // This used to be a single `if`: one search, and a first query aimed slightly wrong ended the
  // turn, because the model then had to answer from pages it may already have judged useless with
  // no way to say so. Owner: *"deepseek should decide itself when it has enough information to
  // answer"*, and *"the phone should also follow the same as webapp canvas"*.
  //
  // 🔴 WHAT COMES BACK ACCUMULATES RATHER THAN REPLACING. A later search narrows or corrects an
  // earlier one; dropping the earlier pages would make the model re-find them, and would make an
  // inline [3] in the answer point at whatever happened to be third in the last batch.
  //
  // 🔴 THE LOOP ENDS ON `searchWeb`, WHICH IS THE MODEL'S OWN ANSWER re-read each round from a
  // packet that now contains what it found. The round count is only a backstop.
  let searched = decision.searchWeb;
  let webIntent = intent;
  if (searched) {
    const seen = new Set<string>();
    const found: ChatSource[] = [];
    let context = "";
    for (let round = 0; round < MAX_SEARCH_ROUNDS && searched; round += 1) {
      // The model wrote the query when it asked for the search, and puts a date in it itself when
      // recency is the point — which is what `withFreshDateAnchor` was guessing at from a word list.
      const query = webIntent.webQuery || (decision.route === "current" ? withFreshDateAnchor(userText) : userText);
      // The phase echoes the student's OWN words, not `query` — the "current"
      // route staples a freshness date onto the wire query, and showing that
      // back would read like the app invented part of the question.
      onPhase?.({ kind: "searching", query: userText });
      const result = await searchWebContext(uid, query, webIntent.webResults, webIntent.webFreshness);
      for (const source of result.sources) {
        if (seen.has(source.url)) continue;
        seen.add(source.url);
        found.push(source);
      }
      // 🔴 THE RUNNING TOTAL, NOT THIS ROUND'S HAUL. The student is watching one turn, and a
      // counter that went 12, then 9, then 14 would be describing our loop rather than their search.
      onPhase?.({ kind: "reading", sources: found.length });
      // Re-numbered over everything gathered, so an inline [n] resolves against what was shown.
      context = formatWebSearchContext(found);
      const again = await readIntent(context, MAX_SEARCH_ROUNDS - round - 1);
      // A round that came back unreadable leaves the previous decision standing and stops: a
      // DEFAULT_INTENT cannot ask for another search, so a failing provider cannot spin the loop.
      webIntent = again;
      searched = again.needsWeb;
    }
    sources = found;
    groundedText = context
      ? `${groundedText}\n\n${context}`
      : `${groundedText}\n\nLive search was requested but returned no verifiable sources. Do not guess a current result; say clearly that it could not be verified.`;
  }
  // Personal context goes LAST so it is closest to the answer and the student's
  // course material wins over generic model memory when the two disagree — but it
  // rides its OWN system message now, NOT the student's sentence. Appending it here
  // is what let "make flashcards from this" resolve "this" to a pile of retrieved
  // notes on an unrelated subject (owner 2026-07-30). See buildWireMessages.
  const brain = await brainLookup;
  // The question decides which parts of the packet survive: Calendar and Study
  // rows now have to be asked for or share vocabulary with it, instead of
  // riding along on every turn as a decoy. See brain-context.ts.
  const brainContext = formatBrainContext(brain, userText, intent.workspace !== "none");
  if (brainContext) {
    const noteCount = new Set(brain?.notes.map((hit) => hit.document_id) ?? []).size;
    onPhase?.({ kind: "recalling", notes: noteCount });
  }
  onPhase?.({ kind: "thinking", deep: decision.model === "deepseek-reasoner" });

  // Text already streamed by EARLIER rounds of this turn. Each round's stream
  // accumulates from empty, so without this prefix a model that says "Let me check
  // your notes." and then calls a tool would have that sentence wiped out by the
  // first word of the next round — the bubble would visibly jump backwards.
  let carried = "";
  // The preview's job ends the moment real words appear, so the first delta
  // flips it to "writing" and the screen drops the line.
  let announcedWriting = false;
  const relayDelta: CompletionDeltaHandler | undefined =
    onDelta || onPhase
      ? (delta, accumulated) => {
          if (!announcedWriting) {
            announcedWriting = true;
            onPhase?.({ kind: "writing" });
          }
          // Everything the model writes is relayed, INCLUDING on a turn that
          // saved something. This used to stop dead the moment a deliverable
          // existed, on the theory that the card was the whole answer — but
          // "explain X in three sentences AND make me cards" writes the
          // explanation in the same round as the tool call, so that rule threw
          // the answer away (reproduced on device 2026-07-27). What keeps the
          // deck itself out of the transcript is the instruction handed back
          // with the tool result — see SAVED_NOTE in api/agentTools.ts — which
          // is the model's job to follow, not something to fix by deletion.
          onDelta?.(delta, carried + accumulated);
        }
      : undefined;

  const toolsEnabled = toolsAllowed(decision);
  const learnerProfile = await learnerProfileForChat(uid);
  let messages: WireMsg[] = buildWireMessages(
    history,
    groundedText,
    decision,
    learnerProfile,
    Boolean(attachedDoc),
    brainContext,
    intent.skills,
  );
  let reply: ChatReply = { budgetReset: null, errorKind: null, errorText: null, sources: [], text: null };
  for (let round = 0; round <= AGENT_MAX_TOOL_ROUNDS; round += 1) {
    // The last permitted round goes out WITHOUT tools, so the model has no choice
    // but to answer in words. Otherwise a turn that hits the cap ends on a tool
    // call and the student is left looking at an empty bubble.
    const offerTools = toolsEnabled && round < AGENT_MAX_TOOL_ROUNDS;
    // Checked BEFORE each round, not only inside the fetch. A native cancel can
    // surface as a clean stream close rather than a throw, and a turn that has
    // already been stopped must not open a new round on the student's budget.
    if (signal?.aborted) {
      reply = { budgetReset: null, errorKind: "aborted", errorText: null, sources: [], text: reply.text };
      break;
    }
    reply = await postChatCompletion(
      uid,
      messages,
      decision,
      relayDelta,
      onReasoning,
      offerTools ? AGENT_TOOLS : undefined,
      signal,
    );
    const calls = reply.toolCalls ?? [];
    if (calls.length === 0 || reply.errorKind) break;

    // Saving a deck takes long enough that the line has to say so; leaving it on
    // "Putting this together" while thirty cards are written reads as hung. And the
    // next round starts a fresh stream, so "writing" has to be re-armed.
    onPhase?.({ kind: "acting", tools: calls.map((call) => call.name) });
    announcedWriting = false;
    if (reply.text) carried = `${carried}${reply.text}\n\n`;

    // SEQUENTIAL, not Promise.all. Two calls in one round can depend on each
    // other's writes: two add_flashcards naming the same NEW deck would both run
    // the does-this-deck-exist lookup before either insert landed, both miss, and
    // both create it — the duplicate-deck outcome matchDeckName exists to prevent,
    // handed straight back by the parallelism. A round almost never has more than
    // two calls and the wall-clock here is dominated by the model, so there is
    // nothing to win by overlapping them.
    const results: { call: AgentToolCall; result: unknown }[] = [];
    for (const call of calls) {
      // 🔴 STOP PREVENTS THE NEXT WRITE; IT CANNOT UNDO THE LAST ONE. Each tool
      // call creates something real — a deck, a note, a calendar event — and once
      // executeAgentTool returns, that row exists. Checking here is what stops the
      // REMAINING calls of a round the student has abandoned. Anything already
      // written stays written, and the UI says so rather than implying a rollback.
      if (signal?.aborted) break;
      const result = await executeAgentTool(uid, call);
      results.push({ call, result });
      if (result && typeof result === "object") {
        // A held delete. Only the FIRST is kept: two confirmation cards in one
        // turn is a queue the student has to reason about, and a model that
        // asked to delete two things at once is exactly when they should be
        // slowing down rather than tapping twice.
        const held = (result as Record<string, unknown>).pending_delete;
        if (!pendingDelete && held && typeof held === "object") {
          pendingDelete = held as PendingDelete;
        }
        const artifact = (result as Record<string, unknown>).artifact;
        if (artifact && typeof artifact === "object") {
          const row = artifact as Record<string, unknown>;
          const kind = row.kind;
          if (
            typeof row.id === "string" &&
            typeof row.title === "string" &&
            typeof kind === "string" &&
            ["flashcards", "slides", "test", "mindmap", "note", "event", "report", "recording", "other"].includes(kind)
          ) {
            outputs.push({
              id: row.id,
              kind: kind as ChatOutput["kind"],
              title: row.title,
              ...(typeof row.route === "string" ? { route: row.route } : {}),
              ...(typeof row.url === "string" ? { url: row.url } : {}),
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }
    // The assistant's tool request and each result are appended to THIS TURN'S wire
    // array only. None of it is persisted: a ChatMsg has no tool role, and the web
    // renderer reads the same `chat_messages` rows (see WireMsg's doc comment).
    messages = [
      ...messages,
      {
        content: reply.text ?? "",
        role: "assistant",
        tool_calls: calls.map((call) => ({
          function: { arguments: call.arguments, name: call.name },
          id: call.id,
          type: "function" as const,
        })),
      },
      ...results.map(({ call, result }) => ({
        content: JSON.stringify(result).slice(0, 20_000),
        role: "tool" as const,
        tool_call_id: call.id,
      })),
    ];
  }

  // Built field by field rather than spread from `reply`, so `toolCalls` cannot
  // ride out of here: it is internal to this turn, and the screen persists whatever
  // it is handed. `carried` is prepended so the saved message holds everything the
  // student watched arrive, not just the final round's share of it.
  //
  // This used to return `null` for the whole message whenever a tool had
  // created something, so that the card would be the only answer. That is right
  // for "make me a deck" and wrong for everything else: "explain X in three
  // sentences AND make me cards" saved the cards and silently threw the
  // explanation away (reproduced on device, 2026-07-27). The deck itself is
  // kept out of the transcript by SAVED_NOTE (api/agentTools.ts) instead — an
  // instruction the model follows, rather than deleting words it was asked for.
  return {
    budgetReset: reply.budgetReset,
    errorKind: reply.errorKind,
    errorText: reply.errorText,
    sources,
    ...(outputs.length ? { outputs } : {}),
    ...(pendingDelete ? { pendingDelete } : {}),
    text: carried ? `${carried}${reply.text ?? ""}`.trim() || null : reply.text,
  };
}

// --- local cache file (instant open + offline read) -------------------------
// One store file per user holds every thread + its messages; the drawer lists
// thread summaries. The OLD single rolling thread (chat-thread-v1-<uid>.json) is
// migrated into the store once, on first read, so nobody loses their conversation.

const legacyThreadPathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}chat-thread-v1-${uid}.json`;
const storePathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}chat-threads-v2-${uid}.json`;
const migratedFlagPathFor = (uid: string) => `${FileSystem.documentDirectory ?? ""}chat-threads-cloud-migrated-v1-${uid}.json`;

async function readJson(path: string): Promise<unknown | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(path));
  } catch {
    return null;
  }
}

async function writeStore(uid: string, store: ThreadStore): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(storePathFor(uid), JSON.stringify(store));
  } catch {
    // best-effort
  }
}

async function readStore(uid: string): Promise<ThreadStore> {
  const now = new Date().toISOString();
  const current = await readJson(storePathFor(uid));
  if (current) return parseThreadStore(current, newThreadId(), now);
  // First run on the new format: migrate the legacy single thread, if present.
  const legacy = await readJson(legacyThreadPathFor(uid));
  if (legacy) {
    const migrated = parseThreadStore(legacy, newThreadId(), now);
    if (migrated.threads.length) await writeStore(uid, migrated);
    return migrated;
  }
  return emptyStore();
}

// ── cloud sync (write-through + one-time migration) ─────────────────────────
// Thread ids are stable client-generated uuids (see newThreadId above);
// message ids are DERIVED deterministically from (threadId, role, at,
// content) — see deriveMessageId in lib/chat-threads.ts — rather than
// randomly minted, so re-deriving one for the same logical message (e.g. a
// save that re-runs before the screen's own object ever learns its id)
// converges on the same id instead of minting a new one. Combined with
// insert-with-conflict-ignore, that's what makes "fire-and-forget with one
// retry" safe — a dropped or repeated write simply gets re-attempted (in
// full, if needed) the next time this thread is saved, with no risk of
// duplicating a row.

interface SupabaseResult {
  error: { message?: string } | null;
}

/** Attempt `fn` once; on a thrown error OR a returned `.error`, attempt it ONE
 *  more time; otherwise give up silently (§4: "fire-and-forget with one
 *  retry" — no persistent queue). Returns null on total failure. Takes
 *  `PromiseLike` (not `Promise`) so supabase-js's thenable query builders —
 *  which implement `.then()` but aren't literal Promise instances — pass
 *  through without a cast. */
async function withOneRetry<T extends SupabaseResult>(fn: () => PromiseLike<T>): Promise<T | null> {
  try {
    const result = await fn();
    if (!result.error) return result;
  } catch {
    // fall through to the retry
  }
  try {
    const result = await fn();
    return result.error ? null : result;
  } catch {
    return null;
  }
}

/** One `chat_messages` row for `message` — content clamped to the column's
 *  60,000-char check constraint; `meta.sources`/`meta.outputs` use the SAME
 *  field shapes as web's SessionSource/SessionOutput, so a thread written from
 *  the phone reads back identically on web with no translation layer. The
 *  phone Chat surface never constructs a message with `.outputs` itself today
 *  (no recording composer, no tool executor) — this only matters for keeping
 *  a message's outputs intact if some future local write path ever sets them;
 *  a message already synced from web keeps its outputs regardless (chat_messages
 *  has no UPDATE grant, so an existing row is never overwritten — see
 *  syncThreadToCloud's ignoreDuplicates upsert below). */
function cloudMessageRow(uid: string, threadId: string, message: ChatMsg & { id: string }) {
  const thinking = message.thinking && (message.thinking.ms > 0 || message.thinking.text)
    ? { ms: message.thinking.ms, text: message.thinking.text.slice(0, 40_000) }
    : null;
  const meta = message.sources?.length || message.outputs?.length || message.attachments?.length || thinking
    ? {
        ...(message.sources?.length ? { sources: message.sources } : {}),
        ...(message.outputs?.length ? { outputs: message.outputs } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
        // Clamped well under the content column's own limit: reasoning on a deep
        // turn runs long, and this rides in a jsonb column alongside sources.
        ...(thinking ? { thinking } : {}),
      }
    : null;
  return {
    content: message.content.slice(0, 60_000),
    created_at: message.at,
    id: message.id,
    meta,
    role: message.role,
    thread_id: threadId,
    user_id: uid,
  };
}

function hasId(message: ChatMsg): message is ChatMsg & { id: string } {
  return typeof message.id === "string";
}

/** Write-through one thread's current state + any newly-added messages to the
 *  cloud. Fire-and-forget from the caller's perspective (never throws). */
async function syncThreadToCloud(uid: string, thread: ChatThread, newMessages: ChatMsg[]): Promise<void> {
  await withOneRetry(() =>
    supabase.from("chat_threads").upsert(
      {
        created_at: thread.createdAt,
        id: thread.id,
        pinned: thread.pinned === true,
        title: thread.title,
        updated_at: thread.updatedAt,
        user_id: uid,
      },
      { onConflict: "id" },
    ),
  );
  const rows = newMessages.filter(hasId).map((message) => cloudMessageRow(uid, thread.id, message));
  if (!rows.length) return;
  await withOneRetry(() => supabase.from("chat_messages").upsert(rows, { ignoreDuplicates: true, onConflict: "id" }));
}

const migratedUidsThisSession = new Set<string>();

async function isMigrated(uid: string): Promise<boolean> {
  if (migratedUidsThisSession.has(uid)) return true;
  const info = await FileSystem.getInfoAsync(migratedFlagPathFor(uid)).catch(() => null);
  return info?.exists === true;
}

async function markMigrated(uid: string): Promise<void> {
  migratedUidsThisSession.add(uid);
  await FileSystem.writeAsStringAsync(migratedFlagPathFor(uid), JSON.stringify({ migratedAt: new Date().toISOString() })).catch(() => {});
}

/** One-time upload of the existing local chat-threads-v2-<uid>.json into the
 *  cloud tables. Legacy (pre-cloud-build) thread ids aren't valid uuids, so
 *  those get remapped FIRST and persisted locally before any cloud write.
 *  Safe to re-run in full: every write is upsert/insert-ignore on a stable id,
 *  so a partial failure just means the next app open retries for free — the
 *  "migrated" flag is only set once every thread uploads cleanly. */
async function ensureMigrated(uid: string): Promise<void> {
  if (await isMigrated(uid)) return;
  let store = await readStore(uid);

  for (const thread of store.threads) {
    if (!isValidThreadId(thread.id)) store = remapThreadId(store, thread.id, newThreadId());
  }
  store = {
    threads: store.threads.map((thread) => ({
      ...thread,
      messages: ensureMessageIds(thread.messages, (message) => deriveMessageId(thread.id, message)),
    })),
    v: 2,
  };
  await writeStore(uid, store);

  let ok = true;
  for (const thread of store.threads) {
    if (!thread.messages.length) continue;
    const threadResult = await withOneRetry(() =>
      supabase.from("chat_threads").upsert(
        {
          created_at: thread.createdAt,
          id: thread.id,
          pinned: thread.pinned === true,
          title: thread.title,
          updated_at: thread.updatedAt,
          user_id: uid,
        },
        { onConflict: "id" },
      ),
    );
    const rows = thread.messages.filter(hasId).map((message) => cloudMessageRow(uid, thread.id, message));
    const messagesResult = rows.length
      ? await withOneRetry(() => supabase.from("chat_messages").upsert(rows, { ignoreDuplicates: true, onConflict: "id" }))
      : ({ error: null } as SupabaseResult);
    if (threadResult === null || messagesResult === null) ok = false;
  }
  if (ok) await markMigrated(uid);
}

// ── public store API (used by the Chat screen + drawer) ─────────────────────

/** Sidebar rows (title + when), newest first. Merges the cloud thread list in
 *  (metadata only — no message bodies) on every call; the AppDrawer already
 *  re-calls this every time it opens, which is what gives the drawer its
 *  "list refresh on open" behavior for free. Falls back to the local cache
 *  untouched when offline/erroring. */
export async function listThreads(uid: string): Promise<ThreadSummary[]> {
  await ensureMigrated(uid);
  let store = await readStore(uid);
  try {
    // `id` ends the sort so the page boundaries are stable — a thread and the
    // message that named it are written in the same instant, so updated_at ties
    // are ordinary and an ambiguous sort would skip rows between pages.
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id,title,pinned,created_at,updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(MAX_THREADS);
    if (!error && data) {
      const cloudMeta: CloudThreadMeta[] = data.map((row) => ({
        createdAt: row.created_at,
        id: row.id,
        pinned: row.pinned === true,
        title: row.title,
        updatedAt: row.updated_at,
      }));
      store = mergeCloudThreadList(store, cloudMeta);
      await writeStore(uid, store);
    }
  } catch {
    // offline/error — the local cache already has last-known-good summaries
  }
  return threadSummaries(store);
}

/** Whether the on-device cache already has ANY record of this thread id — set the
 *  moment listThreads first merges a thread's metadata in, well before its row is
 *  tappable in the drawer. A local-only (no network) read, so chat.tsx can use it
 *  to tell an existing thread apart from a just-minted id (e.g. AppDrawer's "New
 *  chat" — see newThreadId) without waiting on a round trip: a fresh id can never
 *  have a cache entry yet, so there is nothing to wait for before landing on the
 *  empty state. */
export async function hasCachedThread(uid: string, id: string): Promise<boolean> {
  const store = await readStore(uid);
  return getThread(store, id) !== null;
}

/** One thread's messages, merged with whatever the cloud has (so a message
 *  sent from web shows up here too). Falls back to the local cache alone when
 *  offline/erroring — reading a thread never requires a connection. */
export async function loadThreadMessages(uid: string, id: string): Promise<ChatMsg[]> {
  await ensureMigrated(uid);
  let store = await readStore(uid);
  const localMessages = getThread(store, id)?.messages ?? [];
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id,role,content,meta,created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true })
      .limit(MAX_MESSAGES_PER_THREAD);
    if (!error && data) {
      const cloudMessages = data.flatMap((row) => {
        const msg = chatMsgFromCloudRow(row);
        return msg ? [msg] : [];
      });
      const merged = mergeMessages(localMessages, cloudMessages);
      store = setThreadMessages(store, id, merged, new Date().toISOString());
      await writeStore(uid, store);
      return merged;
    }
  } catch {
    // offline/error — the local cache still reads fine
  }
  return localMessages;
}

/** Upsert a thread's messages (creates the thread on first save), write-
 *  through to the cloud in the background. Assigns ids to any message that
 *  doesn't have one yet (always true for new messages built by the Chat
 *  screen — see chat.tsx). */
export async function saveThreadMessages(uid: string, id: string, messages: ChatMsg[]): Promise<void> {
  // deriveMessageId (not a random newMessageId()) so that calling this twice
  // for the SAME logical still-id-less message — chat.tsx sends once on the
  // user turn, again once the reply lands, both times off the same object —
  // converges on the same id instead of double-inserting it. See
  // deriveMessageId's doc in lib/chat-threads.ts.
  // Filtered HERE rather than at each call site, because there are several and the
  // one that mattered was not the obvious one: send() persists the whole message
  // array, so an ordinary chat turn sent while a recording was being written up
  // was what pushed the placeholder into an insert-only table. See
  // isPendingRecordingMessage for what that costs.
  const withIds = ensureMessageIds(withoutPendingRecordings(messages), (message) => deriveMessageId(id, message));
  const before = await readStore(uid);
  const previousMessages = getThread(before, id)?.messages ?? [];
  const after = upsertThread(before, id, withIds, new Date().toISOString());
  await writeStore(uid, after);
  const thread = getThread(after, id);
  if (thread) void syncThreadToCloud(uid, thread, newMessagesSince(thread.messages, previousMessages));
}

export async function deleteThread(uid: string, id: string): Promise<void> {
  await writeStore(uid, removeThread(await readStore(uid), id));
  // Awaited (not fire-and-forget) so a caller can know the cloud write finished
  // before it refreshes a thread list — otherwise a refresh landing first would
  // re-merge the still-present cloud row (drawer revert bug). Callers that don't
  // care still `void` it, unaffected.
  await withOneRetry(() => supabase.from("chat_threads").delete().eq("id", id).eq("user_id", uid));
}

/** Whether a thread is currently pinned (drives the "…" menu's Pin/Unpin label). */
export async function isThreadPinned(uid: string, id: string): Promise<boolean> {
  return getThread(await readStore(uid), id)?.pinned === true;
}

/** Pin (or unpin) a thread so it sorts above the rest in the sidebar. */
export async function pinThread(uid: string, id: string, pinned: boolean): Promise<void> {
  await writeStore(uid, setThreadPinned(await readStore(uid), id, pinned));
  // Awaited so the drawer's refresh-guard can hold until it lands (see deleteThread).
  await withOneRetry(() =>
    supabase.from("chat_threads").update({ pinned, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", uid),
  );
}

/** Rename a thread (owner 2026-07-23 sidebar long-press menu). Writes the new
 *  title to the local cache, then to the cloud `chat_threads.title` — the same
 *  column web reads, so the rename shows up there too. upsertThread now
 *  preserves a set title, so a following message no longer reverts it. Blank
 *  title / unknown id is a no-op. Best-effort cloud write, same posture as pin. */
export async function renameThread(uid: string, id: string, title: string): Promise<void> {
  const clean = title.trim().slice(0, 80);
  if (!clean) return;
  await writeStore(uid, renameThreadTitle(await readStore(uid), id, clean));
  // Awaited so the drawer's refresh-guard can hold until it lands (see deleteThread).
  await withOneRetry(() => supabase.from("chat_threads").update({ title: clean }).eq("id", id).eq("user_id", uid));
}

/** Session-level deliverables (e.g. recordings) attached to a thread's own
 *  `chat_threads.meta.outputs` — written by web's Record-mode composer (see
 *  apps/web/lib/workspace/sessions-cloud.ts's threadRow) and by the phone's
 *  own Record screen (saveRecordingArtifact below); the chip row at the top
 *  of an open thread (chat.tsx) is this call's only consumer.
 *  Best-effort/offline-safe, same posture as isThreadPinned — a fetch failure
 *  just means the chip row stays empty until the thread is reopened online. */
export async function loadThreadOutputs(uid: string, id: string): Promise<ChatOutput[]> {
  try {
    const { data, error } = await supabase.from("chat_threads").select("meta").eq("id", id).eq("user_id", uid).maybeSingle();
    if (error || !data) return [];
    return outputsFromMeta(data.meta);
  } catch {
    return [];
  }
}

/** Save a phone recording exactly the way web's Record mode does: a canonical
 *  row in `chat_recording_artifacts` (web's right-rail source) plus a mirror
 *  entry in the thread's `chat_threads.meta.outputs` (the chip row BOTH this
 *  chat surface and web render — see loadThreadOutputs above). Recording into
 *  a thread that never reached the cloud (no message sent yet) creates the
 *  thread row so the chips have somewhere to live. The artifact insert is the
 *  load-bearing write and throws on failure; the meta mirror is best-effort —
 *  if it fails, the recording still exists server-side and web's rail shows
 *  it, the chip just waits for the next successful meta write. */
const RECORDINGS_LIBRARY_FOLDER = "Nemesis/Recordings";
const RECORDING_NOTE_PENDING =
  "Your recording is saved. Nemesis is preparing structured notes from the audio now.";
const RECORDING_NOTE_UNAVAILABLE =
  "The recording is saved, but Nemesis could not prepare the notes yet. Open the original chat and ask Nemesis to write them up.";

function recordingNoteId(route: string | undefined): string {
  const match = /[?&]id=([^&]+)/.exec(route ?? "");
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

async function updateRecordingLibraryNote(
  uid: string,
  artifact: ChatOutput,
  content: string,
  rename: string | null = null,
): Promise<void> {
  const noteId = recordingNoteId(artifact.route);
  if (!noteId) return;
  try {
    const note = await updateNoteContent(uid, noteId, content);
    // Separate write, and deliberately AFTER the content: a rename that fails
    // leaves a correctly-written note under a dull name, which is recoverable.
    // The other order risks a well-named note still holding the placeholder text.
    //
    // 🔴 GUARDED ON THE NOTE'S OWN NAME AND FOLDER, not the chat card's. Those are
    // two different records that drift apart the moment the student touches the
    // Library: renaming or moving the note there does not touch the chat artifact,
    // whose title was frozen when Save was pressed. Guarding on the card meant a
    // note the student had renamed still looked "untouched" and got overwritten,
    // and passing a hardcoded folder would have dragged a note they had filed
    // elsewhere back into Recordings — renameNoteById rebuilds the whole path from
    // that argument, so it is a destination, not a default.
    if (rename && isDefaultRecordingTitle(note.title)) {
      // FILE IT UNDER THE COURSE, now that there is finally something to read.
      // The note is created before the audio is transcribed, so at creation time
      // its only text is "Recording · Jul 30 at 5:23 PM" — nothing to match on.
      // This is the first moment the subject is known, and it is already the
      // moment the note gets its real name, so both happen in the one write.
      //
      // 🔴 ONLY IF IT IS STILL WHERE WE PUT IT. A student who has already moved
      // this note somewhere of their own has made a decision, and quietly
      // relocating it afterwards is the "reorganise" behaviour that reads as
      // data loss. Same guard the rename uses, for the same reason.
      const currentFolder = folderOf(note.path);
      const destination = currentFolder === RECORDINGS_LIBRARY_FOLDER
        ? folderForNewItem("recording", `${rename}\n${content}`, await loadKnownCourses(uid))
        : currentFolder;
      await renameNoteById(uid, noteId, rename, destination);
    }
  } catch (cause) {
    console.warn("recording Library note update skipped:", cause instanceof Error ? cause.message : cause);
  }
}

export async function saveRecordingArtifact(uid: string, threadId: string, draft: RecordingDraft): Promise<ChatOutput> {
  const id = generateUuidV4();
  const title = draft.title.slice(0, 200);
  let entry: ChatOutput = {
    id,
    kind: "recording",
    title,
    transcript: draft.transcript,
    ...(draft.notes ? { notes: draft.notes } : {}),
    durationSeconds: draft.durationSeconds,
    createdAt: draft.createdAt,
    polish: "pending",
  };
  const { error } = await supabase.from("chat_recording_artifacts").insert({
    id,
    user_id: uid,
    surface: "sessions",
    context_id: threadId,
    title,
    transcript: draft.transcript,
    notes: draft.notes,
    duration_seconds: draft.durationSeconds,
    created_at: draft.createdAt,
  });
  if (error) throw new Error(error.message);

  // Create the destination immediately, before the slower transcription/notes
  // pass. The chat card can route to a durable Library note as soon as Save
  // returns, and that same note is filled in place when the background work
  // finishes. Failure here never discards the canonical recording row above.
  try {
    const note = await createNoteWithContent(uid, title, RECORDING_NOTE_PENDING, RECORDINGS_LIBRARY_FOLDER);
    entry = { ...entry, route: `/note?id=${encodeURIComponent(note.id)}` };
  } catch (cause) {
    console.warn("recording Library note creation skipped:", cause instanceof Error ? cause.message : cause);
  }

  try {
    const { data } = await supabase.from("chat_threads").select("meta").eq("id", threadId).eq("user_id", uid).maybeSingle();
    if (data) {
      await supabase
        .from("chat_threads")
        .update({ meta: mergeOutputsMeta(data.meta, recordingOutputForChat(entry)), updated_at: draft.createdAt })
        .eq("id", threadId)
        .eq("user_id", uid);
    } else {
      await supabase.from("chat_threads").insert({
        id: threadId,
        user_id: uid,
        title,
        pinned: false,
        meta: { outputs: [recordingOutputForChat(entry)] },
        created_at: draft.createdAt,
        updated_at: draft.createdAt,
      });
    }
  } catch {
    // best-effort mirror — see the doc comment
  }
  return entry;
}

/** Chat history never exposes a recording transcript on iOS. The transcript
 * remains in chat_recording_artifacts as private processing input; shared
 * cards carry only progress, destination and finished notes. */
export function recordingOutputForChat(entry: ChatOutput): ChatOutput {
  const { transcript: _transcript, ...visible } = entry;
  return visible;
}

// Live notes ride the cheap conversational slot — never search, never the
// reasoner. Same decision web's recorder uses (live-audio-insights.ts).
const LIVE_NOTES_DECISION: ChatRouteDecision = { model: "deepseek-chat", route: "conversation", searchWeb: false };

/** One notes pass for the Record screen: the growing transcript (plus what's
 *  already on the board) in, up to six fresh bullets out. Metered like any
 *  chat turn through the same valve.
 *
 *  null means the CALL FAILED (offline, out of tokens, unparseable reply) —
 *  the recorder just tries again next interval. An empty array means the call
 *  succeeded and the model had nothing new to add, which is an ordinary
 *  outcome over a quiet stretch. The rebuild below depends on telling those
 *  two apart: a failure means it never saw that slice of the lecture, an empty
 *  pass means it saw it and there was nothing worth writing down. */
export async function requestLiveNotes(uid: string, transcript: string, previousNotes: string[]): Promise<string[] | null> {
  const reply = await postChatCompletion(uid, buildLiveNotesMessages(transcript, previousNotes), LIVE_NOTES_DECISION);
  if (!reply.text) return null;
  return parseLiveNotes(reply.text);
}

/** The Next.js app that hosts the shared HTTP API (transcription, file and
 *  photo extraction). Exported for api/photos.ts. */
export const APP_API_BASE = "https://app.enternemesis.com";

/** Rewrite one recording's chip entry on the thread (same merge the save path
 *  uses) — how the enhance pass below publishes its polish state and, at the
 *  end, the sharper transcript. Best-effort: the artifact row stays the
 *  durable source of truth. */
async function writeChipEntry(uid: string, threadId: string, entry: ChatOutput): Promise<void> {
  try {
    const { data } = await supabase.from("chat_threads").select("meta").eq("id", threadId).eq("user_id", uid).maybeSingle();
    if (!data) return;
    await supabase
      .from("chat_threads")
      .update({ meta: mergeOutputsMeta(data.meta, recordingOutputForChat(entry)) })
      .eq("id", threadId)
      .eq("user_id", uid);
  } catch {
    // best-effort — a missed state write only affects the indicator
  }
}

/** Write a finished recording's notes, in one pass over its final transcript
 *  (owner 2026-07-27 — see lib/live-notes.ts for why this is now the ONLY pass).
 *  Walks the transcript in order, each window told what is already on the board
 *  and not to repeat it, and returns the joined bullets or null if nothing came
 *  back. Never throws: requestLiveNotes resolves null on failure, and a window
 *  that comes back empty just contributes nothing. */
async function rebuildNotesFromTranscript(
  uid: string,
  transcript: string,
): Promise<{ body: string; title: string } | null> {
  if (!transcript.trim()) return null;
  // ONE PASS, matching web (owner 2026-07-30: "FIX IT").
  //
  // This walked the transcript in windows, asking for up to ten one-to-three
  // sentence notes per window and joining them. That is why the phone's notes
  // looked so different from the browser's: not a worse model and not a worse
  // transcript, but a windowed brief that asked for a list of sentences and got
  // exactly that. Headings and an opening summary were never possible.
  //
  // The window loop also cannot survive the new brief. "Organise BY IDEA, not
  // by chronology — group what belongs together even if it was said twenty
  // minutes apart" is impossible to honour a slice at a time: each window can
  // only see its own fifth of the lecture, so grouping across the whole thing
  // requires the whole thing in one call. Web has always done this, over a
  // 60k-char clip, which is about three hours of speech.
  const reply = await postChatCompletion(uid, buildFinalNoteMessages(transcript), LIVE_NOTES_DECISION);
  if (!reply.text) return null;
  // The title line is scaffolding for the caller, never part of the note body —
  // without this strip, every note would open with a stray "Title: …".
  //
  // 🔴 THE TITLE USED TO BE DESTRUCTURED AWAY HERE. splitFinalNote has always
  // returned it and the brief has always asked for it; this function kept only
  // `body` and returned a bare string, so a recording's Library note kept the
  // timestamp it was created with forever (owner 2026-07-30: "it did not rename
  // the title"). Web never had this bug because it names the note AFTER the
  // write-up; the phone creates it first, so the rename has to happen here.
  const { body, title } = splitFinalNote(reply.text.trim());
  const clean = body.trim();
  if (!clean) return null;
  return { body: clean, title: title.trim() };
}

/** Persist one recording's generated notes to every durable destination: the
 * recording row, the thread output mirror, and the Library note the card opens. */
async function publishRecordingNotes(
  uid: string,
  threadId: string,
  artifact: ChatOutput,
  transcript: string,
  chipBase: ChatOutput,
): Promise<ChatOutput> {
  const written = await rebuildNotesFromTranscript(uid, transcript);
  if (!written) {
    await updateRecordingLibraryNote(uid, artifact, RECORDING_NOTE_UNAVAILABLE);
    const finished = { ...chipBase, polish: "done" as const };
    await writeChipEntry(uid, threadId, finished);
    return finished;
  }
  const notes = written.body;
  // The timestamp name is a placeholder, and this is the moment there is finally
  // something better to call it. Only if the student has not named it themselves
  // in the minutes this pass took (isDefaultRecordingTitle), and only if the pass
  // actually produced a title.
  const rename = written.title && isDefaultRecordingTitle(chipBase.title) ? written.title.slice(0, 200) : null;
  const { error } = await supabase
    .from("chat_recording_artifacts")
    .update(rename ? { notes, title: rename } : { notes })
    .eq("id", artifact.id)
    .eq("user_id", uid);
  if (error) throw new Error(error.message);
  await updateRecordingLibraryNote(uid, artifact, notes, rename);
  // The chip entry too, or the chat card would keep showing the timestamp while
  // the Library showed the real name — the same artifact under two names.
  const finished = { ...chipBase, notes, ...(rename ? { title: rename } : {}), polish: "done" as const };
  await writeChipEntry(uid, threadId, finished);
  return finished;
}

/** Background "enhance transcript" pass (owner 2026-07-21): upload the kept
 *  on-device audio, run it through the server's batch transcription (top-
 *  accuracy engine, metered against the plan's monthly enhance allowance),
 *  and swap the sharper transcript into the saved artifact + the thread's
 *  chip entry. Fire-and-forget from the Record screen — any failure leaves
 *  the on-device transcript standing, so this can only improve things. The
 *  local audio files are deleted either way; the uploaded copy is deleted by
 *  the server once the transcript is back. */
export async function enhanceRecordingArtifact(
  uid: string,
  threadId: string,
  artifact: ChatOutput,
  audioUris: string[],
  elapsedSeconds: number,
  onUpdated?: (output: ChatOutput) => void,
): Promise<void> {
  // Every file, not the first eight. `audioUris.slice(0, 8)` silently DROPPED
  // the rest of a long lecture, and because the per-file estimate divided the
  // elapsed clock by the SLICED length, the student was still metered the whole
  // hour — billed in full, transcribed in part, with nothing in any log saying
  // so. Each file now carries its own real duration (read out of its WAV
  // header), so neither the cap nor the arithmetic is guesswork.
  const uris = audioUris;
  if (uris.length === 0) {
    try {
      const finished = await publishRecordingNotes(uid, threadId, artifact, artifact.transcript ?? "", artifact);
      onUpdated?.(recordingOutputForChat(finished));
    } catch (cause) {
      console.warn("recording notes skipped:", cause instanceof Error ? cause.message : cause);
      onUpdated?.(recordingOutputForChat({ ...artifact, polish: "done" }));
    }
    return;
  }
  // Trimmed/compressed copies WE created. Tracked outside the try so the finally
  // sweeps them even when the loop throws part-way: without this, a lecture that
  // lost the network mid-upload would strand a compressed copy of every file
  // uploaded so far in the cache directory.
  const derived: string[] = [];
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session || session.user.id !== uid) return;
    const token = session.access_token;
    // Flag the chip "polishing" for the duration of the pass; every exit from
    // this function rewrites the entry with the flag resolved (done) or
    // dropped (failed/empty), and lib/recording.ts's polishState treats a
    // stray pending flag as stale after 45 minutes.
    await writeChipEntry(uid, threadId, { ...artifact, polish: "pending" });
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const storageBase = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/recordings`;
    // Fallback only, for a file whose header will not parse: the old estimate.
    const fallbackSeconds = Math.max(15, Math.round(Math.max(elapsedSeconds, 15) / uris.length));

    const pieces: string[] = [];
    for (const uri of uris) {
      // Trim the dead air, then compress — see prepareAudioForUpload for why
      // that order, and why the two steps solve different problems.
      const prepared = await prepareAudioForUpload(uri);
      if (prepared.temporary) derived.push(prepared.uri);
      // The bucket enforces BOTH the extension's implied type and the header, so
      // they come from the same place rather than being written out twice.
      const path = `${uid}/${generateUuidV4()}.${prepared.extension}`;
      // uploadAsync streams straight from disk — a lecture never has to fit in
      // JS memory the way a base64 round-trip would force.
      const upload = await FileSystem.uploadAsync(`${storageBase}/${path}`, prepared.uri, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": prepared.contentType },
        httpMethod: "POST",
      });
      if (prepared.temporary) await deleteLocalAudio([prepared.uri]);
      if (upload.status !== 200) throw new Error(`audio upload failed (${upload.status})`);
      const submitRes = await fetch(`${APP_API_BASE}/api/transcription/submit`, {
        // WALL-CLOCK, deliberately — not the trimmed length we just uploaded.
        // This is what the student's monthly cap is charged; the saving from
        // trimming is ours (owner 2026-07-27). The server keeps it that way by
        // refusing to settle the meter downward — see the comment in
        // supabase/functions/nemesis-transcribe/index.ts.
        body: JSON.stringify({ seconds: prepared.wallClockSeconds ?? fallbackSeconds, storagePath: path }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
      });
      const submitBody = (await submitRes.json().catch(() => null)) as { jobId?: string; error?: string } | null;
      if (!submitRes.ok || !submitBody?.jobId) throw new Error(submitBody?.error ?? `submit failed (${submitRes.status})`);
      const text = await pollTranscription(token, submitBody.jobId);
      if (text) pieces.push(text.trim());
    }
    const enhanced = pieces.filter(Boolean).join("\n\n").trim();
    if (!enhanced) {
      const finished = await publishRecordingNotes(uid, threadId, artifact, artifact.transcript ?? "", artifact);
      onUpdated?.(recordingOutputForChat(finished));
      return;
    }

    await supabase
      .from("chat_recording_artifacts")
      .update({ transcript: enhanced })
      .eq("id", artifact.id)
      .eq("user_id", uid);
    const polished: ChatOutput = { ...artifact, polish: "done", transcript: enhanced };
    await writeChipEntry(uid, threadId, polished);

    // The recording is fully in the cloud now, so free the phone's copy before
    // the rebuild rather than after it — a lecture is 100MB+ and the rebuild
    // below can run for minutes. The finally block still sweeps, idempotently.
    await deleteLocalAudio(uris);

    // Sharper transcript, sharper notes. Deliberately AFTER the transcript is
    // durable and inside its own try: this costs several model calls and can
    // fail on its own (offline, out of tokens), and losing the notes must never
    // cost the better transcript — or reset the chip out of "done".
    try {
      const finished = await publishRecordingNotes(uid, threadId, artifact, enhanced, polished);
      onUpdated?.(recordingOutputForChat(finished));
    } catch (cause) {
      console.warn("notes rebuild skipped:", cause instanceof Error ? cause.message : cause);
      onUpdated?.(recordingOutputForChat(polished));
    }
  } catch (cause) {
    console.warn("transcript enhancement skipped:", cause instanceof Error ? cause.message : cause);
    // Clear the "polishing" flag — the on-device transcript is what stands.
    await writeChipEntry(uid, threadId, { ...artifact });
    // …and write the notes from THAT, because nothing else will. Notes used to
    // be written live during the lecture, so a failed accuracy pass still left
    // the student with bullets; the single end-of-recording pass above is now
    // the only one, and it runs inside the success branch. Without this, a
    // student who recorded a lecture offline, or past their monthly allowance,
    // would open the recording to a raw transcript and no notes at all.
    // Best-effort and separately guarded: this is already the failure path.
    try {
      const finished = await publishRecordingNotes(uid, threadId, artifact, artifact.transcript ?? "", artifact);
      onUpdated?.(recordingOutputForChat(finished));
    } catch (notesCause) {
      console.warn("fallback notes skipped:", notesCause instanceof Error ? notesCause.message : notesCause);
      onUpdated?.(recordingOutputForChat({ ...artifact, polish: "done" }));
    }
  } finally {
    // Originals AND the trimmed/compressed copies we made from them. Both lists
    // are swept here because the loop can throw between creating a derived file
    // and uploading it, and deleteLocalAudio is idempotent.
    await deleteLocalAudio([...uris, ...derived]);
  }
}

/**
 * How big a file we are willing to pull into JS memory to trim it. A base64
 * round trip costs roughly 2.3x the file size in RAM, so this is the line
 * between "worth the saving" and "risk an out-of-memory crash on a phone that
 * has just recorded for an hour". At 16kHz/16-bit this is about 16 minutes of
 * audio; a longer single file uploads untrimmed, which is exactly today's
 * behaviour, not a regression.
 */
const MAX_TRIM_BYTES = 32 * 1024 * 1024;

interface PreparedAudio {
  /** What to upload — the compressed copy if we made one, the trimmed copy if
   *  compression was unavailable, else the original. */
  uri: string;
  /** The recording's REAL length before trimming. Null when it could not be
   *  determined, in which case the caller falls back to its estimate. */
  wallClockSeconds: number | null;
  /** Drives the object's extension and Content-Type — the bucket enforces both. */
  extension: "wav" | "m4a";
  contentType: string;
  /** True when WE created this file and must delete it after the upload. */
  temporary: boolean;
}

/**
 * Get one recorded file ready to upload: TRIM the silence, then COMPRESS it.
 *
 * The order is the whole design. Trimming needs raw PCM (slicing samples is
 * arithmetic; slicing AAC is not), so it has to happen while the audio is still
 * a WAV. Compression has to happen after, or there is nothing cheap left to cut.
 *
 * The two do different jobs and it is worth not confusing them:
 *   TRIM     cuts the transcription BILL   (providers charge by duration)
 *   COMPRESS makes the UPLOAD POSSIBLE     (the bucket refuses wav, and caps
 *                                           a file at 40MB vs ~115MB/hr of PCM)
 *
 * Every failure path falls back to something uploadable rather than throwing:
 * unreadable file, unparseable header, not 16-bit PCM, too big to hold in
 * memory, no native encoder in this build, or any thrown error. Neither step may
 * ever cost a student their lecture.
 */
async function prepareAudioForUpload(uri: string): Promise<PreparedAudio> {
  const original: PreparedAudio = {
    contentType: "audio/wav",
    extension: "wav",
    temporary: false,
    uri,
    wallClockSeconds: null,
  };

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return original;

    let working = uri;
    let workingTemporary = false;
    let didTrim = false;
    let wallClockSeconds: number | null = null;

    // 1. TRIM — only for files small enough to hold in memory. A base64 round
    //    trip costs roughly 2.3x the file size in RAM, and a phone that has just
    //    recorded for an hour is the worst place to find that out.
    if (info.size !== undefined && info.size <= MAX_TRIM_BYTES) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = base64ToBytes(base64);
      const parsed = readWav(bytes);
      // Even when there is nothing to trim, the header is the file's true
      // duration — better than dividing the elapsed clock by the file count.
      if (parsed) {
        wallClockSeconds = Math.max(1, Math.round(parsed.dataLength / 2 / parsed.channels / parsed.sampleRate));
      }

      const trimmed = trimWavSilence(bytes);
      if (trimmed) {
        const target = `${FileSystem.cacheDirectory ?? ""}trimmed-${generateUuidV4()}.wav`;
        await FileSystem.writeAsStringAsync(target, bytesToBase64(trimmed.bytes), {
          encoding: FileSystem.EncodingType.Base64,
        });
        working = target;
        workingTemporary = true;
        didTrim = true;
      }
    }

    // 2. COMPRESS. Native and streaming, so unlike the trim it runs even for a
    //    file too large to read into JS — which is exactly the file that most
    //    needs it.
    const encodeTarget = `${FileSystem.cacheDirectory ?? ""}lecture-${generateUuidV4()}.m4a`;
    const encoded = await encodeToM4A(working, encodeTarget);
    // A failed encode can leave a partial file behind; the caller never learns
    // this path, so it is swept here or not at all.
    if (!encoded) await deleteLocalAudio([encodeTarget]);
    if (encoded) {
      if (workingTemporary) await deleteLocalAudio([working]);
      return {
        contentType: "audio/m4a",
        extension: "m4a",
        temporary: true,
        uri: encoded.uri,
        // The encoder measured whatever it was handed: the ORIGINAL duration if
        // we never trimmed, the trimmed one if we did. Only the former is the
        // wall-clock number the student's cap is charged.
        wallClockSeconds: wallClockSeconds ?? (didTrim ? null : Math.max(1, Math.round(encoded.seconds))),
      };
    }

    // No encoder (Android, Expo Go, or an encode failure). Upload what we have —
    // the bucket will refuse a wav today, which is the pre-existing state, not a
    // regression introduced here.
    return {
      contentType: "audio/wav",
      extension: "wav",
      temporary: workingTemporary,
      uri: working,
      wallClockSeconds,
    };
  } catch {
    return original;
  }
}

/** Drop the phone's copies of a recording's audio. Idempotent and never
 *  throws, so it is safe to call the moment the audio stops being needed AND
 *  again from the enhance pass's finally block. */
async function deleteLocalAudio(uris: string[]): Promise<void> {
  for (const uri of uris) {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // best effort — a stray temp file is harmless
    }
  }
}

async function pollTranscription(token: string, jobId: string): Promise<string | null> {
  // 5s cadence for up to 20 minutes — batch jobs run ~15-30% of audio length.
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const res = await fetch(`${APP_API_BASE}/api/transcription/status`, {
      body: JSON.stringify({ jobId }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await res.json().catch(() => null)) as { status?: string; transcript?: string | null; error?: string } | null;
    if (!body) continue;
    if (body.status === "done") return typeof body.transcript === "string" ? body.transcript : null;
    if (body.status === "error") throw new Error(body.error ?? "transcription failed");
  }
  throw new Error("transcription timed out");
}
