// The DeepSeek V4 acceptance gate — the blocking one.
//
//   NEMESIS_DEVICE_KEY=nmk_… \
//   NEMESIS_LLM_URL=https://<project>.supabase.co/functions/v1/nemesis-llm \
//     node_modules/.bin/tsx apps/web/scripts/deepseek-v4-gate.mts
//
// Runs the four-round sequence the owner specified — Library search → web search
// → refined web search → final cited answer — through the EXACT production path:
// the same valve, the same OpenAI-compatible body, the same tool catalogue, the
// same streaming reader. Twice: once in the High-effort thinking configuration
// and once non-thinking.
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

async function runSequence(label: string, decision: ChatRouteDecision, streaming: boolean): Promise<{ traces: RoundTrace[]; ok: boolean }> {
  let messages: WireMsg[] = [
    { content: chatSystemPrompt(true), role: "system" },
    { content: "Does my lecture on anticoagulants still match current practice? Compare them and cite what you use.", role: "user" },
  ];
  const traces: RoundTrace[] = [];

  for (let round = 1; round <= 4; round += 1) {
    // The last round goes out WITHOUT tools so the model must answer in text —
    // the same rule production uses.
    const offerTools = round < 4;
    const payload = completionPayload(messages, decision, {
      ...(offerTools ? { tools: AGENT_TOOLS } : {}),
      ...(streaming ? { onDelta: () => {} } : {}),
    });
    const echoed = messages
      .filter((message) => message.role === "assistant" && typeof message.reasoning_content === "string")
      .map((message) => message.reasoning_content!.length);

    const response = await fetch(`${URL_BASE}/v1/chat/completions`, {
      body: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "x-nemesis-client": "web" },
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
      const streamed = await readCompletionStreamFull(response.body, () => {});
      text = streamed.text || null;
      reasoning = streamed.reasoning;
      toolCalls = streamed.toolCalls;
      // A streamed response carries finish_reason inside the SSE, which our
      // reader does not surface; recorded as null rather than guessed.
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

const HIGH: ChatRouteDecision = { model: "deepseek-reasoner", reasoningEffort: "high", route: "learning", searchWeb: false };
const FLASH: ChatRouteDecision = { model: "deepseek-chat", route: "conversation", searchWeb: false };

let failed = false;

for (const [label, decision, streaming] of [
  ["HIGH effort, thinking, non-streamed", HIGH, false],
  ["HIGH effort, thinking, streamed", HIGH, true],
  ["Instant, non-thinking, non-streamed", FLASH, false],
] as const) {
  const { ok, traces } = await runSequence(label, decision, streaming);
  report(label, traces);
  if (!ok) { failed = true; continue; }

  // 🔴 THE GATE. More than one tool round must have happened, and the reasoning
  // must have been carried into the round AFTER the first — that is the seam.
  const toolRounds = traces.filter((trace) => trace.toolNames.length).length;
  const thinking = decision.reasoningEffort === "high" || decision.model.includes("reasoner");
  if (toolRounds < 2) {
    console.error(`  FAIL ${label}: only ${toolRounds} tool round(s). One successful call cannot show the between-rounds bug.`);
    failed = true;
  }
  if (thinking && !traces.some((trace) => trace.reasoningChars > 0)) {
    console.error(`  FAIL ${label}: thinking configuration produced no reasoning_content at all.`);
    failed = true;
  }
  if (thinking && !traces.some((trace) => trace.echoedReasoningChars.length > 0)) {
    console.error(`  FAIL ${label}: no reasoning was echoed back on any later round.`);
    failed = true;
  }
  const ids = traces.flatMap((trace) => trace.toolCallIds);
  if (new Set(ids).size !== ids.length) {
    console.error(`  FAIL ${label}: a tool-call id was reused across rounds.`);
    failed = true;
  }
}

console.log(failed ? "\nGATE FAILED" : "\nGATE PASSED");
process.exit(failed ? 1 : 0);
