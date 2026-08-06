// The DeepSeek V4 acceptance gate — the blocking one.
//
//   NEMESIS_DEVICE_KEY=nmk_… \
//   NEMESIS_LLM_URL=https://<project>.supabase.co/functions/v1/nemesis-llm \
//     node_modules/.bin/tsx apps/web/scripts/deepseek-v4-gate.mts
//
// Runs the four-round sequence the owner specified — Library search → web search
// → refined web search → final cited answer — through the EXACT production path:
// the same valve, the same OpenAI-compatible body, the same tool catalogue, the
// same streaming reader.
//
// 🔴 THE GATE IS DRIVEN BY PROMPTS, NOT BY A CONFIGURATION (owner 2026-08-06:
// "The gate should test 'a prompt automatically classified as complex selects
// V4 Pro', not 'High was selected'"). There is no effort field to set and no
// model to name — the body below is byte-identical to what the browser sends,
// and the only thing that varies between cases is the sentence. Each case
// declares the model it EXPECTS and fails if a different one answered, because
// a configuration saying "Pro" proves nothing when Flash replied.
//
// 🔴 WHY FOUR ROUNDS AND NOT ONE. The historical bug was invisible to a single
// tool call. Thinking mode requires the reasoning that preceded a tool call to
// be echoed back on every following round; a first call succeeds whether or not
// we retain it, and the round AFTER is where a wrong implementation 400s. One
// green tool call is not evidence.
//
// 🔴 WHAT IS NEVER PRINTED. Reasoning text is the model's private working. This
// prints its LENGTH and whether it was carried, never a character of it. Same
// for the student-facing answer beyond a short head, and for the device key.
//
// The tools are answered with canned results rather than executed: this gate is
// about the protocol between us and the provider, and running real searches
// would put the workspace, the network and live spend into a measurement about
// message shape.

import { AGENT_TOOLS } from "../lib/workspace/agent-tools";
import { appendToolRound, completionPayload, type ChatReply, type WireMsg } from "../lib/workspace/chat-api";
import { chatSystemPrompt } from "../lib/workspace/chat-api";
import { readCompletionStreamFull } from "../lib/workspace/chat-stream";
import type { ChatRouteDecision } from "../lib/workspace/chat-routing";
import { classifyWork, type WorkClass } from "@nemesis/shared";

const KEY = process.env.NEMESIS_DEVICE_KEY ?? "";
const URL_BASE = process.env.NEMESIS_LLM_URL ?? "";
if (!KEY || !URL_BASE) {
  console.error("Set NEMESIS_DEVICE_KEY (nmk_…) and NEMESIS_LLM_URL. This gate is worthless without a real round trip;");
  console.error("it deliberately does not fall back to a stub, because a stubbed pass reads exactly like a real one.");
  process.exit(2);
}

/** Canned tool results. Shaped like the real executors' output, so the model
 *  behaves as it would in production without anything being executed. */
const CANNED: Record<string, unknown> = {
  search_library: { notes: [{ path: "Pharmacology/Lecture 6.md", snippet: "Warfarin: target INR 2-3 for AF.", title: "Lecture 6 — Anticoagulants" }] },
  search_web: { found: 2, results: "1. 2026 anticoagulation guidance\nURL: https://example.org/guideline\nTarget INR 2.0-3.0 retained for AF." },
};

interface RoundTrace {
  round: number;
  status: number;
  finishReason: string | null;
  answeringModel: string | null;
  toolCallIds: string[];
  toolNames: string[];
  /** LENGTH ONLY. The reasoning itself is never recorded or printed. */
  reasoningChars: number;
  /** reasoning_content values we sent back on this request, by length. */
  echoedReasoningChars: number[];
  contentChars: number;
}

async function runSequence(label: string, prompt: string, rounds: number, streaming: boolean): Promise<{ traces: RoundTrace[]; ok: boolean }> {
  let messages: WireMsg[] = [
    { content: chatSystemPrompt(true), role: "system" },
    { content: prompt, role: "user" },
  ];
  const traces: RoundTrace[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    // The last round goes out WITHOUT tools so the model must answer in text —
    // the same rule production uses.
    const offerTools = round < rounds;
    const payload = completionPayload(messages, DECISION, {
      ...(offerTools ? { tools: AGENT_TOOLS } : {}),
      ...(streaming ? { onDelta: () => {} } : {}),
    });
    const echoed = messages
      .filter((message) => message.role === "assistant" && typeof message.reasoning_content === "string")
      .map((message) => message.reasoning_content!.length);

    const response = await fetch(`${URL_BASE}/v1/chat/completions`, {
      body: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "x-nemesis-caps": "reasoning-echo", "x-nemesis-client": "web" },
      method: "POST",
    });

    let text: string | null = null;
    let reasoning = "";
    let toolCalls: { id: string; name: string; arguments: string }[] = [];
    let finishReason: string | null = null;
    let answeringModel: string | null = null;

    if (!response.ok) {
      const body = await response.text();
      console.error(`\n${label} round ${round}: HTTP ${response.status}`);
      // The provider's own error text is diagnostic and contains no student
      // data — but it can quote our reasoning back, so it is truncated hard.
      console.error(`  upstream said: ${body.slice(0, 240)}`);
      traces.push({ answeringModel: null, contentChars: 0, echoedReasoningChars: echoed, finishReason: null, reasoningChars: 0, round, status: response.status, toolCallIds: [], toolNames: [] });
      return { ok: false, traces };
    }

    if (streaming) {
      // 🔴 THE ANSWERING MODEL HAS TO BE READ OFF THE STREAM TOO. It arrives in
      // every SSE chunk and our reader does not surface it, so without this the
      // streamed cases could only ever report "(not reported)" — and a gate that
      // cannot see which model answered is the exact failure this whole change
      // exists to stop. `tee` splits the body so the real reader still consumes a
      // genuine incremental stream rather than a re-parsed string.
      const [forReader, forTrace] = response.body!.tee();
      const [streamed, rawTail] = await Promise.all([
        readCompletionStreamFull(forReader, () => {}),
        new Response(forTrace).text(),
      ]);
      text = streamed.text || null;
      reasoning = streamed.reasoning;
      toolCalls = streamed.toolCalls;
      answeringModel = /"model"\s*:\s*"([^"]+)"/.exec(rawTail)?.[1] ?? null;
      finishReason = /"finish_reason"\s*:\s*"([^"]+)"/.exec(rawTail)?.[1] ?? null;
    } else {
      const body = await response.json() as {
        model?: string;
        choices?: { finish_reason?: string; message?: { content?: string; reasoning_content?: string; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[];
      };
      const choice = body.choices?.[0];
      text = choice?.message?.content ?? null;
      reasoning = choice?.message?.reasoning_content ?? "";
      finishReason = choice?.finish_reason ?? null;
      answeringModel = body.model ?? null;
      toolCalls = (choice?.message?.tool_calls ?? []).map((call) => ({
        arguments: call.function?.arguments ?? "",
        id: call.id ?? "",
        name: call.function?.name ?? "",
      }));
    }

    traces.push({
      answeringModel,
      contentChars: (text ?? "").length,
      echoedReasoningChars: echoed,
      finishReason,
      reasoningChars: reasoning.length,
      round,
      status: response.status,
      toolCallIds: toolCalls.map((call) => call.id),
      toolNames: toolCalls.map((call) => call.name),
    });

    if (!toolCalls.length) break;

    const reply: ChatReply = { errorKind: null, errorText: null, reasoning, sources: [], text, toolCalls };
    messages = appendToolRound(messages, reply, toolCalls, toolCalls.map((call) => ({
      id: call.id,
      result: CANNED[call.name] ?? { error: `no canned result for ${call.name}` },
    })));
  }

  return { ok: true, traces };
}

function report(label: string, traces: RoundTrace[]): void {
  console.log(`\n── ${label} ──`);
  for (const trace of traces) {
    console.log(
      `  round ${trace.round}: HTTP ${trace.status} finish=${trace.finishReason ?? "(streamed)"} model=${trace.answeringModel ?? "(not reported)"}`
      + `\n    tools=[${trace.toolNames.join(", ") || "none"}] ids=[${trace.toolCallIds.join(", ") || "none"}]`
      + `\n    reasoning=${trace.reasoningChars} chars (text withheld) echoed_back=[${trace.echoedReasoningChars.join(", ")}] content=${trace.contentChars} chars`,
    );
  }
}

// The decision only carries the FRAMING now — which instruction rides. It names
// no model and no effort, and `completionPayload` ignores it for both.
const DECISION: ChatRouteDecision = { route: "learning", searchWeb: false };

/** One case: a sentence, and the model it must make the server pick. */
interface GateCase {
  label: string;
  prompt: string;
  /** What `classifyWork` says about this sentence, checked before we spend. */
  expectClass: WorkClass;
  /** Substring the answering model must contain. */
  expectModel: string;
  expectReasoning: boolean;
  rounds: number;
  streaming: boolean;
}

const CASES: GateCase[] = [
  {
    expectClass: "simple",
    expectModel: "flash",
    expectReasoning: false,
    label: "small talk → Flash, no thinking",
    prompt: "Who are you?",
    rounds: 1,
    streaming: false,
  },
  {
    expectClass: "standard",
    expectModel: "flash",
    expectReasoning: true,
    label: "an ordinary explanation → Flash with thinking",
    prompt: "Why does this reaction need a catalyst?",
    rounds: 1,
    streaming: false,
  },
  {
    expectClass: "complex",
    expectModel: "pro",
    expectReasoning: true,
    label: "a question the server judged complex → v4-pro, four rounds, non-streamed",
    prompt: "Does my lecture on anticoagulants still match current practice? Compare them and cite what you use.",
    rounds: 4,
    streaming: false,
  },
  {
    expectClass: "complex",
    expectModel: "pro",
    expectReasoning: true,
    label: "the same question streamed",
    prompt: "Does my lecture on anticoagulants still match current practice? Compare them and cite what you use.",
    rounds: 4,
    streaming: true,
  },
];

let failed = false;

for (const gateCase of CASES) {
  // Free: check our own reading of the sentence before spending a token on it.
  // If this disagrees, the live result would be measuring the wrong thing.
  const classified = classifyWork({ prompt: gateCase.prompt });
  if (classified.workClass !== gateCase.expectClass) {
    console.error(`  FAIL ${gateCase.label}: the classifier calls this ${classified.workClass} (${classified.reason}), not ${gateCase.expectClass}.`);
    failed = true;
    continue;
  }

  const { ok, traces } = await runSequence(gateCase.label, gateCase.prompt, gateCase.rounds, gateCase.streaming);
  report(gateCase.label, traces);
  if (!ok) { failed = true; continue; }

  // 🔴 THE ASSERTION THE OWNER ASKED FOR, AND THE ONE THE OLD GATE COULD NOT
  // MAKE: which model actually replied. Nothing in the request names a model, so
  // this is the server's automatic choice observed from the outside — the only
  // evidence that survives being wrong.
  const answered = traces.map((trace) => trace.answeringModel).filter(Boolean) as string[];
  if (!answered.length) {
    console.error(`  FAIL ${gateCase.label}: no round reported an answering model. Nothing here can be trusted.`);
    failed = true;
  } else if (!answered.every((model) => model.toLowerCase().includes(gateCase.expectModel))) {
    console.error(`  FAIL ${gateCase.label}: expected a model containing "${gateCase.expectModel}", got [${answered.join(", ")}].`);
    console.error("        If this says flash where pro was expected, the entitlement change is not deployed on this project.");
    failed = true;
  }

  if (gateCase.expectReasoning && !traces.some((trace) => trace.reasoningChars > 0)) {
    console.error(`  FAIL ${gateCase.label}: expected the server to switch thinking on, and no reasoning came back.`);
    failed = true;
  }
  if (!gateCase.expectReasoning && traces.some((trace) => trace.reasoningChars > 0)) {
    console.error(`  FAIL ${gateCase.label}: small talk was answered with the thinking model — the cheap lane is not being taken.`);
    failed = true;
  }

  if (gateCase.rounds > 1) {
    // 🔴 More than one tool round must have happened, and the reasoning must
    // have been carried into the round AFTER the first — that is the seam the
    // historical bug lived in, and a single green tool call cannot show it.
    const toolRounds = traces.filter((trace) => trace.toolNames.length).length;
    if (toolRounds < 2) {
      console.error(`  FAIL ${gateCase.label}: only ${toolRounds} tool round(s). One successful call cannot show the between-rounds bug.`);
      failed = true;
    }
    if (!traces.some((trace) => trace.echoedReasoningChars.length > 0)) {
      console.error(`  FAIL ${gateCase.label}: no reasoning was echoed back on any later round.`);
      failed = true;
    }
    const ids = traces.flatMap((trace) => trace.toolCallIds);
    if (new Set(ids).size !== ids.length) {
      console.error(`  FAIL ${gateCase.label}: a tool-call id was reused across rounds.`);
      failed = true;
    }
  }
}

console.log(failed ? "\nGATE FAILED" : "\nGATE PASSED");
process.exit(failed ? 1 : 0);
