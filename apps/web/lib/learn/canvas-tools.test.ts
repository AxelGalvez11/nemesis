import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { WEB_WORKSPACE_AGENT_TOOL_NAMES, EXAM_RULES_PLACEHOLDER } from "@nemesis/shared";

import { confirmationCopy, labelFor, MAX_CALLS_PER_ROUND, MAX_TOOL_ROUNDS, toolCatalogueBlock } from "./canvas-tools";
import { readTurnDecision, turnRouterMessages, type TurnContext } from "./turn-router";

// ── The calendar and the connected apps, reachable from a Canvas at last ─────────────────────
//
// Owner, 2026-08-25, told that five calendar tools and the whole connected-apps plumbing had been
// shipped and left with no door on them: *"yes wire the calendar tools and the connect apps
// plumbing"*.
//
// 🔴 WHAT THIS FILE IS REALLY FOR IS THE GATE, NOT THE PLUMBING. A tool that fails is a turn that
// says so. A tool that runs when it should have asked is somebody's email in a stranger's inbox and
// somebody's exam gone off their calendar, and no error message afterwards fixes either. So the
// guards below are weighted accordingly: the wiring gets one test each and `confirmed` gets four.

const TOOLS = readFileSync(new URL("./canvas-tools.ts", import.meta.url), "utf8");
const CHAT = readFileSync(new URL("../../components/workspace/learn/canvas-chat.ts", import.meta.url), "utf8");
const SESSION = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
const CANVAS = readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8");
const CARD = readFileSync(new URL("../../components/workspace/learn/confirm-card.tsx", import.meta.url), "utf8");
const CLIENT = readFileSync(new URL("../workspace/composio-client.ts", import.meta.url), "utf8");
const ROUTE = readFileSync(new URL("../../app/api/composio/route.ts", import.meta.url), "utf8");

/**
 * Source with its comments removed.
 *
 * 🔴 THE `confirmed` GUARD BELOW COUNTS OCCURRENCES, AND THIS FILE ARGUES ABOUT `confirmed: true`
 * in prose more than it writes it. Counting raw text would make the guard fail the moment somebody
 * explained the rule more carefully, which trains the next person to delete the explanation.
 */
function code(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  spokenConversation: false,
  materialContext: "",
  memory: "",
  projectInstructions: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  pinnedComments: "",
  stagedPassage: "",
  today: "Tuesday, 25 August 2026",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  webContext: "",
};

const turn = (decision: Record<string, unknown>, answer = "sure.") =>
  `\`\`\`json\n${JSON.stringify(decision)}\n\`\`\`\n${answer}`;

// ── The catalogue ────────────────────────────────────────────────────────────────────────────

test("🔴 every calendar tool this app has is offered, so none is shipped with no door again", () => {
  // This whole feature exists because five tools were built and then became unreachable. A
  // catalogue that names four of the five would be the same defect at a smaller scale.
  const block = toolCatalogueBlock([]);
  for (const name of WEB_WORKSPACE_AGENT_TOOL_NAMES) {
    assert.ok(block.includes(name), `${name} is not offered to the model`);
  }
});

test("🔴🔴 no description reaches the model still carrying its placeholder", () => {
  // `workspace-agent-tools.ts` makes `toolDescription()` the only legal way to read a description
  // precisely so a literal `${EXAM_ITEM_RULES_SHORT}` cannot travel. Calibration: read the map
  // directly instead and this reddens.
  assert.ok(!toolCatalogueBlock([]).includes(EXAM_RULES_PLACEHOLDER), "a raw placeholder is in the packet");
  assert.match(TOOLS, /toolDescription\(name, EXAM_ITEM_RULES_SHORT\)/);
});

test("🔴 a connected app appears only once it is connected, and by its own slug", () => {
  // Nobody who has connected nothing may be offered anything: `composioTools()` returns [] for
  // every failure, and [] has to mean the canvas someone had before this feature existed.
  assert.ok(!toolCatalogueBlock([]).includes("connected"), "apps are described to a learner with none");
  const withApp = toolCatalogueBlock([{ function: { description: "Send an email", name: "GMAIL_SEND_EMAIL" } }]);
  assert.ok(withApp.includes("GMAIL_SEND_EMAIL"), "the action slug is not what the model is offered");
  // 🔴 THE SLUG IS UNCHANGED. Renaming it to something friendlier needs a map back at execution
  // time, and a map that loses an entry sends a call to the wrong action against a real mailbox.
  assert.ok(!withApp.includes("gmail_send_email"), "the slug was rewritten on its way to the model");
});

test("🔴 the strip never shows a raw action slug", () => {
  // "GMAIL_FETCH_EMAILS" on screen is our plumbing showing through; the learner asked about mail.
  for (const [name, app] of [["list_calendar_events", undefined], ["GMAIL_FETCH_EMAILS", "gmail"]] as const) {
    const note = labelFor(name, app);
    assert.ok(!note.label.includes("_"), `${note.label} is a slug, not a sentence`);
    assert.ok(note.label.length > 0);
  }
  // The mark that used to ride beside each label died 2026-08-30 with the ChatGPT-parity
  // thinking preview — the reference draws a bare shimmering sentence. The WORDS still carry it.
  assert.deepEqual(labelFor("delete_calendar_event", undefined), { label: "Checking before deleting" });
});

test("🔴🔴 the strip moves BEFORE each call, not after the round", () => {
  // Owner, 2026-08-25: *"make it live"*. Handing the labels back once the round is over shows a
  // blank shimmer through the part that takes time and then names the work for the instant before
  // the answer replaces it — a receipt, not a status. Calibration: move `onCall` below the await
  // and this reddens.
  // 🔴 COMMENTS STRIPPED, for the same reason the `confirmed` guard strips them: this function's
  // note EXPLAINS the old label-collecting shape, and a guard that reddened on the explanation
  // would train the next person to delete it.
  const source = code(TOOLS);
  const round = source.slice(source.indexOf("export async function runToolRound"), source.indexOf("export async function runConfirmed"));
  const announced = round.indexOf("options.onCall?.(labelFor(");
  const ran = round.indexOf("await runConnectedApp");
  assert.ok(announced > 0 && ran > announced, "the strip is told after the call rather than before it");
  assert.ok(!/labels/.test(round), "the round still collects labels to hand back at the end");
});

test("🔴 the label travels alone now — the mark machinery may not creep back (2026-08-30)", () => {
  // The mark beside the caption died with the ChatGPT-parity thinking preview (the reference
  // draws a bare shimmering sentence in every working state). The WORDS still travel live:
  // tool → onWork → setWork, announced before the call runs.
  assert.match(CHAT, /onCall: \(note\) => onWork\?\.\(note\.label\)/, "the label stopped travelling from the tool to the caption");
  assert.ok(!/workMark|ThinkingMark/.test(SESSION), "the session grew a mark again");
});

// ── The envelope ─────────────────────────────────────────────────────────────────────────────

test("the model asks for tools in the envelope, and the reader keeps what it asked for", () => {
  const read = readTurnDecision(turn({
    then: "reply",
    tools: [{ arguments: { end_date: "2026-09-07", start_date: "2026-09-01" }, name: "list_calendar_events" }],
  }));
  assert.equal(read?.tools.length, 1);
  assert.equal(read?.tools[0]?.name, "list_calendar_events");
  assert.equal((read?.tools[0]?.arguments as Record<string, unknown>).start_date, "2026-09-01");
});

test("🔴 a call with no arguments is kept as {}, not dropped", () => {
  // `list_calendar_events` legitimately takes none. Dropping the call would turn "what is on this
  // week" into silence with nothing on screen to explain it.
  const read = readTurnDecision(turn({ then: "reply", tools: [{ name: "list_calendar_events" }] }));
  assert.deepEqual(read?.tools, [{ arguments: {}, name: "list_calendar_events" }]);
});

test("🔴 a nameless row is dropped and the list is capped", () => {
  const read = readTurnDecision(turn({
    then: "reply",
    tools: [
      { arguments: {} },
      ...Array.from({ length: 9 }, (_unused, i) => ({ arguments: {}, name: `delete_calendar_event_${i}` })),
    ],
  }));
  assert.ok((read?.tools.length ?? 0) <= MAX_CALLS_PER_ROUND, "one envelope can ask for an unbounded pile of calls");
  assert.ok(read?.tools.every((ask) => ask.name.length > 0), "a nameless call survived the reader");
});

test("🔴 the contract shows the tools field FILLED IN, never as an empty array", () => {
  // Measured on `visuals` and again on `checkFigure`: a field displayed as `[]` in the contract's
  // highest-signal position is a field the model sends as empty forever.
  const packet = turnRouterMessages({ context: EMPTY, utterance: "when is my exam" });
  const contract = packet.map((message) => message.content).join("\n");
  assert.match(contract, /"tools": \[\{"name": "list_calendar_events"/, "the tools field is shown empty");
});

test("the catalogue and the results ride as their own labelled blocks, or not at all", () => {
  const none = turnRouterMessages({ context: EMPTY, utterance: "hello" }).map((m) => m.content).join("\n");
  assert.ok(!none.includes("WHAT YOU CAN DO IN THIS LEARNER'S OWN WORKSPACE"), "an empty catalogue still sends a heading");
  const some = turnRouterMessages({
    context: { ...EMPTY, toolCatalogue: "list_calendar_events — read it", toolContext: "list_calendar_events({}) -> []", toolRoundsLeft: 2 },
    utterance: "hello",
  }).map((m) => m.content).join("\n");
  assert.ok(some.includes("WHAT YOU CAN DO IN THIS LEARNER'S OWN WORKSPACE"));
  assert.ok(some.includes("WHAT YOUR TOOLS RETURNED THIS TURN"));
  // 🔴 THE MODEL IS TOLD THE BUDGET RATHER THAN BEING CUT OFF — the same rule `searchesLeft` keeps.
  assert.ok(some.includes("2 more round(s)"), "the tool budget is not stated");
  // 🔴 AND IT IS TOLD WHAT A HELD RESULT MEANS, or it writes "I've deleted it" because that reads
  // better than "I have shown you a card".
  assert.ok(some.includes("Never say you did something that came back held"));
});

// ── The gate ─────────────────────────────────────────────────────────────────────────────────

test("🔴🔴🔴 `confirmed: true` is set in exactly two places, both of them a press", () => {
  // This is the single most important guard in the feature. `heldForConfirmation` and
  // `heldForApproval` both return a PENDING result instead of acting; the only thing that may
  // overrule them is a learner's click. Calibration: set `confirmed` anywhere a model's output can
  // reach — a tool round, an envelope field, a retry — and this reddens.
  const source = code(TOOLS);
  assert.equal((source.match(/confirmed: true/g) ?? []).length, 2, "confirmed is set somewhere other than the two runConfirmed branches");
  const runner = source.slice(source.indexOf("export async function runConfirmed"));
  assert.equal((runner.match(/confirmed: true/g) ?? []).length, 2, "confirmed is set outside runConfirmed");
  // And nothing in the turn loop can set it.
  assert.ok(!/confirmed/.test(code(CHAT)), "the turn loop can confirm its own writes");
});

test("🔴🔴 a held call stops the turn's tool half rather than being retried", () => {
  // Feeding "confirm_required" back and granting another round is asking the thing being gated to
  // route around the gate. Calibration: drop `!pending` from either condition and this reddens.
  assert.match(CHAT, /toolRounds < MAX_TOOL_ROUNDS && !pending/, "a held call can still buy another tool round");
  assert.match(CHAT, /if \(ran\.pending\) pending = ran\.pending;/);
  assert.match(CHAT, /pending \? 0 :/, "a held turn is still told it has rounds left");
});

test("🔴🔴 approving re-runs the SAME call, never a reconstruction of it", () => {
  // A card that describes one thing and performs another converts a click from consent into a
  // rubber stamp. Both pending shapes therefore carry what they will re-run.
  assert.match(TOOLS, /const \{ args, tool \} = confirmation\.pending;/, "a delete is rebuilt rather than replayed");
  assert.match(TOOLS, /const \{ action, app, arguments: args \} = confirmation\.pending;/, "an app action is rebuilt rather than replayed");
  // 🔴 AND A PAYLOAD WITH NO ARGUMENTS REFUSES RATHER THAN SENDING `{}`. An empty object is how an
  // empty email reaches somebody.
  assert.match(TOOLS, /if \(!args\) return \{ error: "That request could not be read back\. Nothing was sent\.", ok: false \}/);
});

test("🔴🔴 every producer of a pending action records the arguments it will replay", () => {
  // The field is optional only for the wire, because an older payload has no such key. Every
  // producer in this repo has to set it or approval is unimplementable.
  assert.match(CLIENT, /arguments: input\.arguments,/, "the client holds an action without its arguments");
  assert.match(ROUTE, /arguments: args, summary: summarise\(action, args\)/, "the server holds an action without its arguments");
});

test("🔴🔴 a server that still says no after a confirmed run wins", () => {
  // Saying "done" on a `held` result from a confirmed call is the one lie this feature exists to
  // prevent, and the server re-runs the same gate on its own side for exactly this reason.
  const runner = TOOLS.slice(TOOLS.indexOf("export async function runConfirmed"));
  assert.match(runner, /That app would not accept it\. Nothing was sent\./);
});

// ── The card ─────────────────────────────────────────────────────────────────────────────────

test("🔴🔴 the card is mounted, and only a press can answer it", () => {
  assert.match(CANVAS, /<ConfirmCard onAnswer=\{\(approve\) => session\.confirmPending\(approve\)\} pending=\{session\.aside\.pending\}/);
  // 🔴 GATED ON `turnInFlight` LIKE THE ROW BELOW IT. A "Delete" button under half an answer is a
  // button under a sentence that is about to say something else.
  assert.match(CANVAS, /\{!turnInFlight && session\.aside\?\.pending && \(/);
  // 🔴 THE PRESS IS THE ONLY DOOR TO `runConfirmed`.
  assert.equal((SESSION.match(/runConfirmed\(/g) ?? []).length, 1, "there is a second way to run a held call");
  assert.match(SESSION, /const confirmPending = useCallback\(async \(approve: boolean\)/);
});

test("🔴 the card cannot be double-fired, and neither button is the default", () => {
  // A second click while the first is in flight is a second email.
  assert.match(CARD, /if \(busy\) return;/, "the card can be pressed twice");
  assert.ok(!/autoFocus|type="submit"|onKeyDown/.test(CARD), "a stray keystroke can now confirm a write");
});

test("🔴 the card says what will happen, from the arguments and never from the model's prose", () => {
  const del = confirmationCopy({
    kind: "delete",
    pending: { args: { event_id: "e1" }, recoverable: false, target: "the exam “Physiology midterm”", tool: "delete_calendar_event" },
  });
  assert.ok(del.title.includes("Physiology midterm"), "the card does not name what is going");
  assert.equal(del.detail, "This cannot be undone.");
  const act = confirmationCopy({
    kind: "action",
    pending: { action: "GMAIL_SEND_EMAIL", app: "gmail", arguments: {}, summary: "send email: sam@example.com" },
  });
  assert.ok(act.title.includes("gmail") && act.title.includes("sam@example.com"), "the card does not name the recipient");
  assert.equal(act.detail, "Nothing has been sent yet.");
});

test("🔴 the card is cleared either way, and the answer says which", () => {
  // A card that stayed after a press is one a second click can fire again; one that vanished
  // silently leaves the learner unsure whether their email went.
  assert.match(SESSION, /setAside\(\(current\) => \(current \? \{ \.\.\.current, pending: null \} : current\)\)/, "declining leaves the card up");
  assert.match(SESSION, /pending: null, text: `\$\{current\.text\}/, "approving leaves the card up, or says nothing about the outcome");
});

// ── The bounds ───────────────────────────────────────────────────────────────────────────────

test("the round bound is a real number, big enough to read-then-act and small enough to wait out", () => {
  // One round cannot do "move my Thursday lecture": that is a listing to find it and then an
  // update to move it. Unbounded is a model that can spend somebody's afternoon in a loop.
  assert.ok(MAX_TOOL_ROUNDS >= 2, "one round cannot read before it writes");
  assert.ok(MAX_TOOL_ROUNDS <= 4, `${MAX_TOOL_ROUNDS} rounds is a turn nobody is waiting through`);
  assert.ok(MAX_CALLS_PER_ROUND >= 1 && MAX_CALLS_PER_ROUND <= 6);
});

test("🔴🔴 the catalogue is cached, so this feature does not tax every 'hello'", () => {
  // It has to be fetched BEFORE the first model call — the model cannot ask for a tool it was never
  // told about — so uncached it is a POST in front of every single canvas turn, including the
  // overwhelming majority that never touch anybody's calendar.
  assert.match(TOOLS, /Date\.now\(\) - cached\.at < CATALOGUE_TTL_MS/, "the catalogue is fetched again on every turn");
  // 🔴 A FAILURE IS CACHED TOO. `composioTools()` returns [] for a missing key exactly as it does
  // for an outage, and re-asking forever in a workspace with no Composio configured is a request
  // per message for an answer that will never change.
  const loader = TOOLS.slice(TOOLS.indexOf("export async function loadToolCatalogue"));
  assert.match(loader, /cached = \{ at: Date\.now\(\)/);
  // 🔴 AND CONNECTING AN APP CLEARS IT, or authorising Gmail and going straight to a canvas reads
  // as the connection not having worked.
  const SETTINGS = readFileSync(new URL("../../components/settings/connections-settings.tsx", import.meta.url), "utf8");
  assert.match(SETTINGS, /forgetToolCatalogue\(\);/, "connecting an app leaves the canvas with a stale catalogue");
});

test("🔴 a tool result is serialised, never sliced", () => {
  // An over-budget result comes back as valid JSON saying `complete: false` and where to resume.
  // Cutting it with `.slice()` hands the model truncated JSON, and it reads half a calendar as
  // the whole one.
  assert.match(TOOLS, /serializeToolResult\(result\)/);
  assert.ok(!/\.slice\(0, \d+\)/.test(TOOLS.slice(TOOLS.indexOf("export async function runToolRound"))), "a result is being truncated by hand");
});

test("🔴 every call in a round runs, even after one comes back held", () => {
  // Skipping the rest would hide a second thing that also needed confirming, and the model would be
  // told about one problem while a different one waited silently. Only the FIRST is surfaced.
  const round = TOOLS.slice(TOOLS.indexOf("export async function runToolRound"), TOOLS.indexOf("export async function runConfirmed"));
  assert.match(round, /if \(!pending\) pending = readPending\(result\);/, "a later held call overwrites the first, or the loop breaks early");
  assert.ok(!/\bbreak;/.test(round), "the round stops at the first held call");
});
