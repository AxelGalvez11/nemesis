import { assert, assertEquals } from "jsr:@std/assert@1";

import { stripDeepSeekOnlyFields } from "./model-routing.ts";

// Forced-fallback contract tests.
//
// 🔴 THE FALLBACK CHAIN IS THE LEAST-EXERCISED CODE IN THE PRODUCT AND THE MOST
// EXPENSIVE TO GET WRONG. It runs only when DeepSeek is down — which is exactly
// when nobody is watching a dashboard, and when a second bug turns an outage
// into an incident. None of it had a test.
//
// These force each provider's request shape and assert the contract every one
// of them must satisfy, without a network: DeepSeek-only fields gone, the
// student's conversation intact, and the model's private reasoning never
// leaving for a third party.

/** A mid-flight conversation, exactly as the valve would hold it when DeepSeek
 *  dies on round three: system, question, two completed tool rounds. */
const inFlight = () => ({
  messages: [
    { content: "system prompt", role: "system" },
    { content: "Does my lecture still match current practice?", role: "user" },
    {
      content: "",
      reasoning_content: "PRIVATE CHAIN OF THOUGHT",
      role: "assistant",
      tool_calls: [{ function: { arguments: '{"query":"anticoagulants"}', name: "search_library" }, id: "call_a1", type: "function" }],
    },
    { content: '{"notes":[]}', role: "tool", tool_call_id: "call_a1" },
    {
      content: "",
      reasoning_content: "MORE PRIVATE THINKING",
      role: "assistant",
      tool_calls: [{ function: { arguments: '{"query":"guideline"}', name: "search_web" }, id: "call_b2", type: "function" }],
    },
    { content: '{"found":1}', role: "tool", tool_call_id: "call_b2" },
  ],
  model: "deepseek-v4-flash",
  reasoning_effort: "high",
  stream: true,
  thinking: { type: "enabled" },
  tools: [{ function: { name: "search_web" }, type: "function" }],
});

/** Every non-DeepSeek provider the valve can fail over to. Each is
 *  OpenAI-compatible on /chat/completions — except Anthropic, which is not, and
 *  is tracked separately (see the last test). */
const PROVIDERS = ["glm-5.2", "qwen3.7-plus", "kimi-k3", "claude-sonnet-4-6"];

for (const model of PROVIDERS) {
  Deno.test(`fallback to ${model}: no DeepSeek-only field survives`, () => {
    const sent = stripDeepSeekOnlyFields({ ...inFlight(), model });
    assertEquals("thinking" in sent, false);
    assertEquals("reasoning" in sent, false);
    assertEquals("reasoning_effort" in sent, false);
    for (const message of sent.messages as Record<string, unknown>[]) {
      assertEquals("reasoning_content" in message, false, "reasoning followed the conversation to another vendor");
    }
  });

  Deno.test(`fallback to ${model}: the student's turn survives intact`, () => {
    const before = inFlight();
    const sent = stripDeepSeekOnlyFields({ ...before, model });
    const messages = sent.messages as Record<string, unknown>[];
    assertEquals(messages.length, before.messages.length, "a message was dropped mid-outage");
    assertEquals(messages[1].content, before.messages[1].content, "the question changed");
    // Tool calls and their pairings are the only thing making the history
    // legible; a provider that receives results with no calls 400s.
    assertEquals(messages[2].tool_calls, before.messages[2].tool_calls);
    assertEquals(messages[3].tool_call_id, "call_a1");
    assertEquals(messages[5].tool_call_id, "call_b2");
    assertEquals(sent.tools, before.tools, "the tool catalogue must ride the retry");
  });
}

Deno.test("stripping does not mutate the original — the chain retries from one body", () => {
  const body = inFlight();
  stripDeepSeekOnlyFields(body);
  stripDeepSeekOnlyFields(body);
  // GLM is tried, then Qwen, then Kimi, each from the SAME body. If the first
  // strip mutated it, the DeepSeek retry inside the pro lane would already have
  // lost its thinking selector.
  assertEquals(body.thinking, { type: "enabled" });
  assertEquals("reasoning_content" in (body.messages[2] as Record<string, unknown>), true);
});

// 🔴 ANTHROPIC IS NOT OPENAI-COMPATIBLE, and the valve used to treat it as if
// it were: `callProvider` posts `${base}/chat/completions` with
// `Authorization: Bearer`, while Anthropic's API is `/v1/messages` with
// `x-api-key` and `anthropic-version`. The last link in the outage chain would
// have failed on every call, and never fired, so nobody found out.
//
// It is translated now (anthropic-adapter.ts). What this asserts is the
// property that matters at THIS layer: the stripped body still contains
// everything the adapter needs to build a valid Anthropic request. The
// translation itself is pinned in anthropic-adapter.test.ts.
Deno.test("the stripped body still carries what the Anthropic adapter needs", () => {
  const sent = stripDeepSeekOnlyFields({ ...inFlight(), model: "claude-sonnet-4-6" });
  const messages = sent.messages as Record<string, unknown>[];
  assertEquals(messages[0].role, "system", "the system prompt must survive to become a top-level field");
  assert("tools" in sent, "the tool catalogue must survive to be re-schema'd");
  // Tool pairing is what the adapter turns into tool_use / tool_result blocks;
  // an id lost here becomes an unanswerable call there.
  assertEquals(messages[2].tool_calls, inFlight().messages[2].tool_calls);
  assertEquals(messages[3].tool_call_id, "call_a1");
});
