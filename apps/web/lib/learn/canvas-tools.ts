// What the Canvas can DO in the learner's workspace, and how one round of it runs.
//
// 🔴🔴🔴 THESE TOOLS EXISTED AND WERE UNREACHABLE. `agent-tools.ts` has held four calendar tools
// plus `find_calendar_issues` since July, and `composio-client.ts` has held the connected-apps
// plumbing since 2026-08-24. Both were wired to `sendChatTurn`, which belonged to the Sessions
// chat — a screen the two-surface retirement deleted. Nothing has called `sendChatTurn` since, so
// on 2026-08-25 a whole shipped capability was sitting in the repository with no door: the learner
// could see their calendar on `/calendar` and could not ask Nemesis a single thing about it.
// Owner, told exactly that: *"yes wire the calendar tools and the connect apps plumbing"*.
//
// 🔴🔴 IT RIDES THE ENVELOPE, NOT AN OpenAI `tools` ROUND, AND THAT IS NOT A SHORTCUT. `turn-router.ts`
// sets out why the Canvas asks for one JSON envelope per turn rather than a tool round: a tool
// round answers with a CALL and needs a second trip to produce the sentence that goes with it, so
// every "hello" would pay the latency of a capability it never uses. The envelope already carries
// `needsWeb` the same way and `canvas-chat.ts` already loops on it — search, feed the results back,
// ask again, stop when the model says it has enough. A tool ask is that same loop with a different
// executor behind it, which is why this file is small.
//
// 🔴🔴 A WRITE IS NEVER SILENT. Two independent gates already existed and both are kept:
// `heldForConfirmation` (destructive workspace tools) and `heldForApproval` (any connected-app
// action whose verb is not a known read). Either one returns a PENDING result instead of doing the
// thing, and this file stops the turn there rather than feeding "confirm_required" back to a model
// that would then claim it had asked. The learner gets a card with two buttons; approving re-runs
// the SAME call with `confirmed: true`, never a reconstruction of it.
//
// 🔴 AND `[]` IS ALWAYS A VALID ANSWER. Every failure in here — no key, nothing connected, a
// network blip, arguments that will not parse — comes back as a tool result the model can read and
// talk about, or as an empty catalogue. A learner who has connected nothing sees exactly the canvas
// they saw before this file existed.

import { WEB_WORKSPACE_AGENT_TOOL_NAMES, toolDescription, type PendingDelete } from "@nemesis/shared";


import { EXAM_ITEM_RULES_SHORT } from "@/lib/workspace/item-writing";

import { executeAgentTool, type AgentToolCall } from "@/lib/workspace/agent-tools";
import { composioTools, runConnectedApp, runAction, type ComposioToolIndex } from "@/lib/workspace/composio-client";
import type { PendingAction } from "@/lib/workspace/composio-actions";
import { serializeToolResult } from "@/lib/workspace/chat-tool-result";

/** One thing the model asked to do, as it comes out of the envelope. */
export interface ToolAsk {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/**
 * How many rounds of tools one turn may take.
 *
 * 🔴 THREE, NOT UNBOUNDED, AND NOT ONE. One is too few because reading is almost always the first
 * half of a change: "move my Thursday lecture" is a `list_calendar_events` to find it and then an
 * `update_calendar_event` to move it, which is two rounds before anything has happened. Unbounded
 * is a model that can spend the learner's afternoon in a loop. Three lets read → act → check, and
 * the packet is told how many are left so a model near the end answers instead of asking again.
 */
export const MAX_TOOL_ROUNDS = 3;

/**
 * The most calls one round may carry.
 *
 * 🔴 A CAP ON THE ROUND, NOT ON THE TURN, because the danger is a single envelope asking for
 * forty deletions rather than a conversation that touches several things over three rounds.
 */
export const MAX_CALLS_PER_ROUND = 4;

/** Something that will not happen until the learner presses a button. */
export type PendingConfirmation =
  | { readonly kind: "delete"; readonly pending: PendingDelete }
  | { readonly kind: "action"; readonly pending: PendingAction };

/** A practice test a tool round just wrote — the reply grows a card to sit it. */
export interface ProducedTest {
  readonly artifactId: string;
  readonly title: string;
}

export interface ToolRoundResult {
  /** What to put in front of the model next round, already serialised. */
  readonly context: string;
  /** Set when something is waiting on the learner. The loop stops when this appears. */
  readonly pending: PendingConfirmation | null;
  /** Set when a round produced a test — the conversation is where it lives
   *  (owner 2026-08-31), so the canvas renders the card, not a page. */
  readonly produced: ProducedTest | null;
}

/** What the strip says while one call runs, and which mark sits beside it. */
export interface WorkNote {
  readonly label: string;
}

/**
 * The catalogue, as prose the envelope can carry.
 *
 * 🔴🔴 BUILT FRESH PER TURN, BECAUSE HALF OF IT IS THE LEARNER'S. The calendar half is fixed and
 * always present; the connected-apps half is whatever they have authorised, which can change
 * between two messages. A hard-coded list would either promise apps nobody connected or hide ones
 * they just did.
 *
 * 🔴 THE SLUG IS THE NAME THE MODEL SEES, unchanged from Composio's catalogue. Renaming it to
 * something friendlier means mapping back at execution time, and a mapping that loses an entry
 * sends a call to the wrong action against somebody's real mailbox.
 */
export function toolCatalogueBlock(connected: readonly { function: { name: string; description: string } }[]): string {
  const lines: string[] = [
    "The student's workspace — their calendar, and their study record and practice tests — which you can read and act in:",
    // 🔴 `toolDescription`, NEVER THE MAP DIRECTLY. A description may carry the exam-rules
    //    placeholder, and the shared file makes this function the only way to read one so a tool
    //    cannot reach the model still carrying the literal token.
    ...WEB_WORKSPACE_AGENT_TOOL_NAMES.map((name) => `  ${name} — ${toolDescription(name, EXAM_ITEM_RULES_SHORT)}`),
  ];
  if (connected.length > 0) {
    lines.push(
      "",
      "Apps this learner has connected. Reading one is free; anything that writes, sends or deletes "
      + "is held until they press a button, so say what you are about to do and stop:",
      ...connected.map((tool) => `  ${tool.function.name} — ${tool.function.description || "no description given"}`),
    );
    if (connected.some((tool) => concernsCalendar(tool.function.name))) lines.push("", ...CALENDAR_RULES);
  }
  return lines.join("\n");
}

/**
 * Whether an offered action reads or writes a calendar.
 *
 * 🔴 IT MATCHES THE ACTION NAME, NOT THE APP, for the same reason `riskOf` does: Google puts its
 * calendar in a toolkit of its own and Microsoft folds it into Outlook, so "which app is the
 * calendar" has no stable answer and "does this action concern events" does.
 */
function concernsCalendar(action: string): boolean {
  // 🔴 SEGMENTS, NOT A SUBSTRING SCAN OF THE WHOLE SLUG, which is the same rule `riskOf` states one
  // file over and for the same reason: `/EVENTS?_/` needed a trailing underscore and therefore
  // missed `OUTLOOK_OUTLOOK_LIST_EVENTS`, where the word ends the name. A test caught it.
  //
  // 🔴 `includes("CALENDAR")` RATHER THAN AN EXACT MATCH, DELIBERATELY, because Google's own
  // toolkit spells it `GOOGLECALENDAR` with no separator. `riskOf` may not be this loose — a false
  // positive there runs a write without asking — but the worst case here is a few lines of advice
  // attached to a tool that did not need them.
  const segments = action.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return segments.some((segment) => segment.includes("CALENDAR") || segment === "EVENT" || segment === "EVENTS");
}

/**
 * What to do differently when reading a calendar, because the tools' own defaults are wrong for a
 * student and wrong quietly.
 *
 * 🔴🔴 ALL THREE OF THESE ARE MEASURED OFF THE LIVE SCHEMAS, 2026-08-31, after the owner reported
 * that asking what he had that week returned some of it: *"it gave a few events, but ... I actually
 * had more events this week."* None of them announce themselves — every one returns a short, well
 * formed, confident answer that is missing things.
 *
 *   1. `calendar_id` defaults to `primary`. A student's classes are very often on a second,
 *      shared or subscribed calendar, and none of it is in the primary one.
 *   2. `max_results` defaults to 10, and the reply does not say it truncated.
 *   3. 🔴 WORST: `GOOGLECALENDAR_EVENTS_LIST` ships FIXED `timeMin`/`timeMax` defaults of
 *      2025-08-25 to 2025-09-01 — a specific week over a year in the past, not a rolling window.
 *      Omitting the dates does not mean "now", it means "that week in 2025", so the honest-looking
 *      answer is about the wrong year entirely.
 *
 * 🔴 THIS IS GUIDANCE, NOT A GUARANTEE, AND IT IS DELIBERATELY NOT ARGUMENT REWRITING. We could
 * force these values in the route, but inventing a date range the learner did not ask for is a
 * different kind of wrong, and silently editing a model's call is how a system becomes impossible
 * to reason about. The last line matters most: a partial week presented as a whole one is worse
 * than a short answer that says it was cut.
 */
const CALENDAR_RULES: readonly string[] = [
  "Reading a calendar, every time:",
  "  - List the learner's calendars first and read all of them. The default is their main calendar "
  + "only, and classes are usually on a separate, shared or subscribed one.",
  "  - Always set the start and end of the range yourself. Leaving them out does NOT mean now: the "
  + "tool's own default is a fixed week in a past year, so the answer will be about the wrong dates.",
  "  - Raise the result limit above its default of 10, or a normal week comes back cut with no sign "
  + "that it was.",
  "  - If a result still looks truncated, say so. A partial week presented as the whole week is "
  + "worse than saying you could not see all of it.",
];

/**
 * How long a fetched catalogue is reused.
 *
 * 🔴🔴 A CACHE, BECAUSE WITHOUT ONE THIS FEATURE TAXES EVERY "hello". `composioTools()` is a POST
 * to `/api/composio` behind a Supabase session lookup, and it has to run BEFORE the first model
 * call — the model cannot ask for a tool it was never told about. Uncached, that is a network round
 * trip in front of every single canvas turn, including the overwhelming majority that never touch
 * anybody's calendar. Two minutes is long enough that a conversation pays once and short enough
 * that connecting an app and going straight back to the canvas works.
 */
const CATALOGUE_TTL_MS = 120_000;

let cached: { at: number; block: string; index: ComposioToolIndex } | null = null;

/**
 * Throw the cached catalogue away.
 *
 * 🔴 EXPORTED SO CONNECTING OR DISCONNECTING AN APP IS IMMEDIATE rather than up to two minutes
 * late. A learner who has just authorised Gmail and comes back to ask about their mail is exactly
 * the person who would read the delay as the connection not having worked.
 */
export function forgetToolCatalogue(): void {
  cached = null;
}

/** The catalogue for this turn, and the index that routes a call to the right executor. */
export async function loadToolCatalogue(): Promise<{ block: string; index: ComposioToolIndex }> {
  // 🔴 ONE LOOKUP PER TURN AT MOST, NEVER PER ROUND. The catalogue cannot change between two rounds
  // of one turn, and asking again would put a network round trip in front of every tool result.
  if (cached && Date.now() - cached.at < CATALOGUE_TTL_MS) return { block: cached.block, index: cached.index };
  const connected = await composioTools();
  // 🔴 A FAILURE IS CACHED TOO, DELIBERATELY. `composioTools()` returns [] for a missing key just as
  // it does for an outage, and re-asking on every turn of a workspace with no Composio configured
  // would be a request per message forever for an answer that is never going to change.
  cached = { at: Date.now(), block: toolCatalogueBlock(connected.tools), index: connected.index };
  return { block: cached.block, index: cached.index };
}

/**
 * What the strip says while one call runs, and the mark that goes with it.
 *
 * 🔴 NEVER THE RAW SLUG. "GMAIL_FETCH_EMAILS" on screen is our plumbing showing through; the
 * learner asked about their mail.
 *
 * 🔴🔴 THE MARK TRAVELS WITH THE LABEL, AND THAT IS WHAT MAKES IT LEGAL. `thinking-phases.ts` holds
 * a rule that a free-text work label earns no mark, because guessing a kind from words is the
 * keyword-matching this codebase refuses everywhere. That rule is about GUESSING. Here the caller
 * is not reading a sentence, it is naming the call it is about to make — so the kind is a fact it
 * already has, and it is carried rather than re-derived downstream.
 */
export function labelFor(name: string, app: string | undefined): WorkNote {
  if (name.startsWith("list_calendar") || name === "find_calendar_issues") {
    return { label: "Reading the calendar" };
  }
  if (name.startsWith("add_calendar")) return { label: "Adding to the calendar" };
  if (name.startsWith("update_calendar")) return { label: "Changing the calendar" };
  if (name.startsWith("delete_calendar")) return { label: "Checking before deleting" };
  if (name === "get_study_record") return { label: "Reading your study record" };
  if (name === "make_practice_test") return { label: "Writing a practice test" };
  return { label: app ? `Working in ${app}` : "Working in a connected app" };
}

function readPending(result: unknown): PendingConfirmation | null {
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  const held = row.pending_delete;
  if (held && typeof held === "object") return { kind: "delete", pending: held as PendingDelete };
  const action = row.pending_action;
  if (row.confirm_required === true && action && typeof action === "object") {
    return { kind: "action", pending: action as PendingAction };
  }
  return null;
}

/**
 * Run one round of what the model asked for.
 *
 * 🔴 EVERY CALL RUNS, EVEN WHEN AN EARLIER ONE COMES BACK HELD. Skipping the rest would hide a
 * second thing that also needed confirming, and the model would be told about one problem while a
 * different one waited silently. Only the FIRST pending one is surfaced — two confirmation cards
 * at once is a queue the learner has to reason about, and a turn asking to delete two things is
 * exactly when they should be slowing down rather than clicking twice.
 *
 * 🔴 ROUTED BY WHETHER THE INDEX KNOWS THE NAME, NEVER BY GUESSING AT ITS SHAPE. A name Composio
 * minted goes to Composio; everything else goes to the workspace executor, which already answers an
 * unrecognised tool with `{error}` the model can react to.
 */
export async function runToolRound(
  asks: readonly ToolAsk[],
  index: ComposioToolIndex,
  options: {
    askText: string;
    /**
     * Called BEFORE each call runs, never after.
     *
     * 🔴🔴 BEFORE, AND THAT IS THE DIFFERENCE BETWEEN A STATUS AND A RECEIPT (owner, 2026-08-25:
     * *"make it live"*). The first version of this collected the labels and handed them back when
     * the whole round was over, so the learner watched a blank shimmer through the part that
     * actually takes time and then read "Reading the calendar" for the instant before the answer
     * replaced it. A line that appears once the work is finished is not telling them what is
     * happening; it is telling them what happened, in the one moment they no longer need to know.
     */
    onCall?: (note: WorkNote) => void;
  },
): Promise<ToolRoundResult> {
  const capped = asks.slice(0, MAX_CALLS_PER_ROUND);
  const lines: string[] = [];
  let pending: PendingConfirmation | null = null;
  let produced: ProducedTest | null = null;

  for (const ask of capped) {
    const app = index.get(ask.name);
    options.onCall?.(labelFor(ask.name, app));
    const call: AgentToolCall = { arguments: JSON.stringify(ask.arguments ?? {}), id: ask.name, name: ask.name };
    const result = app !== undefined
      ? await runConnectedApp(call, app)
      : await executeAgentTool(call, { askText: options.askText });
    if (!pending) pending = readPending(result);
    if (!produced) produced = readProducedTest(result);
    // 🔴 NEVER A BLIND SLICE. An over-budget result comes back as valid JSON that says
    // `complete: false` and where to resume; cutting it with `.slice()` would hand the model
    // truncated JSON and it would read half a calendar as the whole one.
    lines.push(`${ask.name}(${JSON.stringify(ask.arguments ?? {})}) -> ${serializeToolResult(result)}`);
  }

  return { context: lines.join("\n\n"), pending, produced };
}

/** The `produced_test` marker a make_practice_test result carries for the UI. */
function readProducedTest(result: unknown): ProducedTest | null {
  if (!result || typeof result !== "object") return null;
  const row = (result as Record<string, unknown>).produced_test;
  if (!row || typeof row !== "object") return null;
  const artifactId = String((row as Record<string, unknown>).artifact_id ?? "");
  const title = String((row as Record<string, unknown>).title ?? "");
  return artifactId && title ? { artifactId, title } : null;
}

/**
 * Do the thing the learner just approved.
 *
 * 🔴🔴 THE SAME CALL, RE-RUN VERBATIM, NOT A RECONSTRUCTION OF IT. `PendingDelete` and
 * `PendingAction` both carry the exact tool and arguments for this reason: a card that describes
 * one thing and performs another turns the learner's click from consent into a rubber stamp.
 *
 * 🔴 `confirmed: true` IS SET HERE AND NOWHERE ELSE IN THE CANVAS. It cannot come from the model
 * and it cannot come from an envelope; only a press reaches this function.
 */
export async function runConfirmed(confirmation: PendingConfirmation): Promise<{ ok: boolean; error: string | null }> {
  if (confirmation.kind === "delete") {
    const { args, tool } = confirmation.pending;
    const result = await executeAgentTool(
      { arguments: JSON.stringify(args ?? {}), id: tool, name: tool },
      { confirmed: true },
    );
    const error = result && typeof result === "object" && "error" in (result as Record<string, unknown>)
      ? String((result as Record<string, unknown>).error)
      : null;
    return { error, ok: error === null };
  }
  const { action, app, arguments: args } = confirmation.pending;
  // 🔴 NO ARGUMENTS MEANS AN OLDER PAYLOAD, AND THE ANSWER IS TO REFUSE RATHER THAN TO SEND `{}`.
  // Running a send with an empty object because the field was missing is how an empty email
  // reaches somebody — the same reasoning `runConnectedApp` gives for unparseable arguments.
  if (!args) return { error: "That request could not be read back. Nothing was sent.", ok: false };
  const result = await runAction({ action, app, arguments: args, confirmed: true });
  if (result.kind === "ran") return { error: null, ok: true };
  if (result.kind === "failed") return { error: result.error, ok: false };
  // 🔴 STILL HELD AFTER A CONFIRMED RUN MEANS THE SERVER REFUSED IT, and the server wins. Saying
  // "done" here would be the one lie this whole feature exists to prevent.
  return { error: "That app would not accept it. Nothing was sent.", ok: false };
}

/** What the learner reads on the card, built from the arguments and never from the model's prose. */
export function confirmationCopy(confirmation: PendingConfirmation): { title: string; detail: string; verb: string } {
  if (confirmation.kind === "delete") {
    return {
      detail: confirmation.pending.recoverable
        ? "You can get it back afterwards."
        : "This cannot be undone.",
      title: `Delete ${confirmation.pending.target}?`,
      verb: "Delete",
    };
  }
  return {
    detail: "Nothing has been sent yet.",
    title: `In ${confirmation.pending.app}: ${confirmation.pending.summary}?`,
    verb: "Go ahead",
  };
}
