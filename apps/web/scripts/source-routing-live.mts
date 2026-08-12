// Scores the REAL model's source routing against the acceptance set.
//
//   NEMESIS_DEVICE_KEY=nmk_… NEMESIS_LLM_URL=https://…/functions/v1/nemesis-llm \
//     node_modules/.bin/tsx apps/web/scripts/source-routing-live.mts
//
// 🔴 THIS IS THE ONLY HONEST MEASUREMENT OF ROUTING, and it needs credentials.
// The unit test beside it (lib/workspace/source-routing.test.ts) proves the
// STRUCTURE — that every source is reachable and nothing is spent before the
// model decides — and structure is all a no-network harness can prove. Which
// source a turn actually reaches for is now a model decision, and the only way
// to measure a model decision is to ask the model.
//
// What it does NOT do, deliberately: run the tools. It sends one turn per case
// with the real system prompt and the real tool catalogue, and reads which
// tools come back in the FIRST round. That first reach is the routing decision;
// executing it would add the workspace, the network, and the student's own data
// to a measurement that is about none of those.
//
// Consequence worth stating: a case needing two sources is scored on whether
// the model asks for both up front. A model that reads the Library first and
// searches the web on round two is scored as private-only here. That is a known
// under-count, not a silent one — it is reported as `firstRoundOnly` so a run
// is never mistaken for a full-turn measurement.

import { classifyWork } from "@nemesis/shared";

import { AGENT_TOOLS } from "../lib/workspace/agent-tools";
import { CHAT_SYSTEM_PROMPT, WIRE_MODEL } from "../lib/workspace/chat-api";
import { ROUTING_CASES, type RoutingCase } from "../lib/workspace/source-routing-cases";
import { formatRoutingReport, scoreRouting, type ObservedSources } from "../lib/workspace/source-routing-score";

const DEVICE_KEY = process.env.NEMESIS_DEVICE_KEY ?? "";
const LLM_URL = process.env.NEMESIS_LLM_URL ?? "";
if (!DEVICE_KEY || !LLM_URL) {
  console.error("Set NEMESIS_DEVICE_KEY and NEMESIS_LLM_URL. Without them this cannot measure anything, and a run that");
  console.error("silently scored zero searches would read as a perfect over-search rate.");
  process.exit(2);
}

/** Which family a tool belongs to. The point of the whole exercise is that
 *  these are DIFFERENT PLACES, so the scorer never lumps them together. */
const PRIVATE_LIBRARY = new Set(["search_library", "read_library_note", "get_library_tree", "list_recordings", "read_recording_transcript", "read_study_deck", "get_study_overview", "list_study_decks"]);
const PRIVATE_SCHEDULE = new Set(["list_calendar_events", "find_calendar_issues", "get_workspace_overview"]);

interface Round {
  names: string[];
  queries: string[];
  /** 🔴 WHAT ACTUALLY ANSWERED, not what was asked for. Nothing in the request
   *  names a model any more, so this is the server's automatic choice observed
   *  from outside — and the only thing that makes a score comparable to another
   *  run (owner 2026-08-06: "identify which production model … produced every
   *  result"). A configuration saying "Pro" is not proof if Flash replied. */
  answeringModel: string | null;
  /** Whether reasoning actually came back — observed, never requested. */
  thinking: boolean;
}

async function firstRound(ask: string): Promise<Round> {
  const response = await fetch(`${LLM_URL}/v1/chat/completions`, {
    body: JSON.stringify({
      messages: [{ content: CHAT_SYSTEM_PROMPT, role: "system" }, { content: ask, role: "user" }],
      model: WIRE_MODEL,
      tools: AGENT_TOOLS,
    }),
    headers: {
      Authorization: `Bearer ${DEVICE_KEY}`,
      "Content-Type": "application/json",
      // This harness echoes nothing back — but it also never sends a second
      // round, so declaring the capability is honest and is what lets the server
      // pick the tier this question deserves rather than the tools-safe floor.
      "x-nemesis-caps": "reasoning-echo",
      "x-nemesis-client": "web",
    },
    method: "POST",
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const body = await response.json() as { model?: string; choices?: { message?: { reasoning_content?: string; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] };
  const calls = body.choices?.[0]?.message?.tool_calls ?? [];
  const names = calls.map((call) => call.function?.name ?? "").filter(Boolean);
  const queries = calls
    .filter((call) => call.function?.name === "search_web")
    .map((call) => { try { return String(JSON.parse(call.function?.arguments ?? "{}").query ?? ""); } catch { return ""; } });
  return { answeringModel: body.model ?? null, names, queries, thinking: Boolean(body.choices?.[0]?.message?.reasoning_content) };
}

const rounds = new Map<string, Round>();
for (const testCase of ROUTING_CASES) {
  try {
    rounds.set(testCase.ask, await firstRound(testCase.ask));
  } catch (cause) {
    console.error(`FAILED ${JSON.stringify(testCase.ask)}: ${cause instanceof Error ? cause.message : cause}`);
    process.exit(1);
  }
}

const observe = (testCase: RoutingCase): ObservedSources => {
  const round = rounds.get(testCase.ask) ?? { answeringModel: null, names: [], queries: [], thinking: false };
  return {
    library: round.names.some((name) => PRIVATE_LIBRARY.has(name)),
    schedule: round.names.some((name) => PRIVATE_SCHEDULE.has(name)),
    web: round.names.includes("search_web"),
  };
};

const report = scoreRouting(ROUTING_CASES, observe);
console.log(formatRoutingReport("live model (first round only)", report));
console.log("");

// 🔴 EVERY CASE, WITH THE CLASS THE SERVER ASSIGNED AND THE MODEL THAT REPLIED.
// This is the owner's "identify which production model and effort mode produced
// every result", written the only way it can now be true: there is no effort
// mode to name, so the row carries the class the server derived from the
// sentence, and the model observed answering it.
console.log("case                                                        class      why               answered by          thinking");
for (const testCase of ROUTING_CASES) {
  const round = rounds.get(testCase.ask);
  const classified = classifyWork({ prompt: testCase.ask });
  console.log(
    `${JSON.stringify(testCase.ask).padEnd(58).slice(0, 58)}  ${classified.workClass.padEnd(9)}  ${classified.reason.padEnd(16)}  `
    + `${(round?.answeringModel ?? "NOT REPORTED").padEnd(19)}  ${round?.thinking ? "on" : "off"}`,
  );
}
console.log("");

// A model nobody can name makes the whole score uncomparable — say so loudly
// rather than printing a percentage that looks like the last one.
if ([...rounds.values()].some((round) => !round.answeringModel)) {
  console.log("⚠️  At least one round did not report an answering model. Treat this score as UNRECORDED.");
  console.log("");
}

// QUERY QUALITY, reported rather than scored. A judge would need its own model
// and its own baseline; what is cheap and objective is whether the model wrote
// a QUERY or echoed the SENTENCE, which is the specific defect being fixed —
// the old engine passed the student's raw words straight to the provider.
for (const testCase of ROUTING_CASES) {
  for (const query of rounds.get(testCase.ask)?.queries ?? []) {
    const echoed = query.trim().toLowerCase() === testCase.ask.trim().toLowerCase();
    console.log(`${echoed ? "ECHOED " : "query  "}${JSON.stringify(testCase.ask)} -> ${JSON.stringify(query)}`);
  }
}
console.log("");

for (const failure of report.failures) {
  const called = rounds.get(failure.ask)?.names.join(", ") || "(no tools)";
  console.log(`${failure.hard ? "HARD " : "     "}${JSON.stringify(failure.ask)}\n       called: ${called}`);
}

// A hard case regressing is a gate, not a note: these are the six the owner
// wrote out by hand.
const hardFailures = report.failures.filter((failure) => failure.hard);
if (hardFailures.length) {
  console.error(`\n${hardFailures.length} of the owner's hard requirements failed.`);
  process.exit(1);
}
