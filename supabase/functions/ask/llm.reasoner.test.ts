// Tests for the reasoner-model path of the LLM client: isReasonerModel routing, the JSON-in-text
// protocol (schema in system prompt, no tools on the wire), fence/prose recovery, the independent
// re-roll, the hard fallback to the chat-class model, and the streaming guard. All network stubbed
// via globalThis.fetch (same pattern as retrieve.test.ts).
// Run: deno test --allow-env supabase/functions/ask/
import { assert, assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callTool, chatToolArgsStream, isReasonerModel, type ChatParams } from "./llm.ts";

const TOOL = {
  name: "emit_answer",
  description: "Emit the structured answer.",
  parameters: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
};

function params(model: string): ChatParams {
  return {
    model,
    max_tokens: 200,
    system: "You are a careful assistant.",
    messages: [{ role: "user", content: "What is the answer?" }],
    tools: [TOOL],
  };
}

function chatResponse(content: string, model = "deepseek-reasoner"): Response {
  return new Response(JSON.stringify({
    model,
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function toolCallResponse(args: string, model = "deepseek-chat"): Response {
  return new Response(JSON.stringify({
    model,
    choices: [{
      message: { content: null, tool_calls: [{ id: "1", type: "function", function: { name: "emit_answer", arguments: args } }] },
      finish_reason: "tool_calls",
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

/** Run fn with a stubbed fetch; returns the captured request bodies and URLs. */
async function withFetch(
  responses: Response[],
  fn: () => Promise<void>,
): Promise<{ bodies: Array<Record<string, unknown>>; urls: string[] }> {
  const original = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  const urls: string[] = [];
  let i = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    urls.push(typeof input === "string" ? input : input.toString());
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    const res = responses[Math.min(i, responses.length - 1)];
    i++;
    return Promise.resolve(res.clone());
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
  return { bodies, urls };
}

Deno.test("isReasonerModel: matches 'reasoner' names, not chat names; env pattern overrides", () => {
  Deno.env.delete("REASONER_MODEL_PATTERN");
  assertEquals(isReasonerModel("deepseek-reasoner"), true);
  assertEquals(isReasonerModel("DeepSeek-Reasoner-v4"), true);
  assertEquals(isReasonerModel("deepseek-chat"), false);
  assertEquals(isReasonerModel("gpt-4.1-mini"), false);
  Deno.env.set("REASONER_MODEL_PATTERN", "^deepseek-r\\d");
  assertEquals(isReasonerModel("deepseek-r2"), true);
  assertEquals(isReasonerModel("deepseek-reasoner"), false); // pattern replaces the default
  Deno.env.set("REASONER_MODEL_PATTERN", "(("); // invalid regex -> default match
  assertEquals(isReasonerModel("deepseek-reasoner"), true);
  Deno.env.delete("REASONER_MODEL_PATTERN");
});

Deno.test("reasoner callTool: JSON-in-text — no tools on the wire, schema in system, parses clean JSON", async () => {
  const { bodies } = await withFetch([chatResponse('{"answer":"42"}')], async () => {
    const out = await callTool<{ answer: string }>(params("deepseek-reasoner"), "emit_answer", "k");
    assertEquals(out.input.answer, "42");
    assertEquals(out.model, "deepseek-reasoner");
  });
  assertEquals(bodies.length, 1);
  const body = bodies[0];
  assertEquals(body.tools, undefined);
  assertEquals(body.tool_choice, undefined);
  const system = (body.messages as Array<{ role: string; content: string }>)[0];
  assertEquals(system.role, "system");
  assertStringIncludes(system.content, "ONLY a single JSON object");
  assertStringIncludes(system.content, '"emit_answer"');
  assertStringIncludes(system.content, '"required":["answer"]'); // schema embedded
  assert((body.max_tokens as number) >= 1024, "reasoner answer budget floored");
});

Deno.test("reasoner callTool: recovers JSON wrapped in thinking prose and fences", async () => {
  const content = 'Let me think about this.\n\n```json\n{"answer":"met formin"}\n```\nDone.';
  await withFetch([chatResponse(content)], async () => {
    const out = await callTool<{ answer: string }>(params("deepseek-reasoner"), "emit_answer", "k");
    assertEquals(out.input.answer, "met formin");
  });
});

Deno.test("reasoner callTool: first roll unparseable -> independent re-roll succeeds", async () => {
  const { bodies } = await withFetch(
    [chatResponse("I cannot express this as JSON, sorry."), chatResponse('{"answer":"second roll"}')],
    async () => {
      const out = await callTool<{ answer: string }>(params("deepseek-reasoner"), "emit_answer", "k");
      assertEquals(out.input.answer, "second roll");
    },
  );
  assertEquals(bodies.length, 2);
});

Deno.test("reasoner callTool: both rolls fail -> hard fallback to chat model via forced tool call", async () => {
  Deno.env.delete("LLM_GENERATE_MODEL"); // fallback = deepseek-chat default
  const { bodies } = await withFetch(
    [
      chatResponse("nope"),
      chatResponse("still nope"),
      toolCallResponse('{"answer":"from fallback"}'),
    ],
    async () => {
      const out = await callTool<{ answer: string }>(params("deepseek-reasoner"), "emit_answer", "k");
      assertEquals(out.input.answer, "from fallback");
      assertEquals(out.model, "deepseek-chat"); // reports the model that actually answered
    },
  );
  assertEquals(bodies.length, 3);
  const fallbackBody = bodies[2];
  assertEquals(fallbackBody.model, "deepseek-chat");
  assert(fallbackBody.tool_choice !== undefined, "fallback uses a real forced tool call");
});

Deno.test("reasoner callTool: fallback misconfigured as a reasoner -> throws (no infinite recursion)", async () => {
  Deno.env.set("LLM_GENERATE_MODEL", "deepseek-reasoner");
  try {
    await withFetch([chatResponse("nope")], async () => {
      await assertRejects(
        () => callTool(params("deepseek-reasoner"), "emit_answer", "k"),
        Error,
        "also a reasoner",
      );
    });
  } finally {
    Deno.env.delete("LLM_GENERATE_MODEL");
  }
});

Deno.test("chat-class models are untouched: forced tool call exactly as before", async () => {
  const { bodies } = await withFetch([toolCallResponse('{"answer":"chat path"}')], async () => {
    const out = await callTool<{ answer: string }>(params("deepseek-chat"), "emit_answer", "k");
    assertEquals(out.input.answer, "chat path");
  });
  assertEquals(bodies.length, 1);
  assert(bodies[0].tools !== undefined, "chat path still sends tools");
  assert(bodies[0].tool_choice !== undefined, "chat path still forces the tool");
});

Deno.test("reasoner leg uses its OWN provider: DeepSeek base even when chat slots point elsewhere", async () => {
  Deno.env.set("LLM_BASE_URL", "https://api.other-provider.example/v1");
  Deno.env.delete("REASONER_BASE_URL");
  Deno.env.delete("LLM_GENERATE_MODEL");
  try {
    const { urls, bodies } = await withFetch(
      [chatResponse("not json"), chatResponse("still not json"), toolCallResponse('{"answer":"ok"}')],
      async () => {
        const out = await callTool<{ answer: string }>(params("deepseek-reasoner"), "emit_answer", "k");
        assertEquals(out.input.answer, "ok");
      },
    );
    // Two reasoner rolls on DeepSeek's own endpoint, then the fallback on the chat slots' provider.
    assertStringIncludes(urls[0], "api.deepseek.com");
    assertStringIncludes(urls[1], "api.deepseek.com");
    assertStringIncludes(urls[2], "api.other-provider.example");
    assertEquals(bodies[2].model, "deepseek-chat");
  } finally {
    Deno.env.delete("LLM_BASE_URL");
  }
});

Deno.test("reasoner API error (wrong key / model not found) counts as a failed attempt -> graceful fallback, no crash", async () => {
  Deno.env.delete("LLM_GENERATE_MODEL");
  const badRequest = new Response('{"error":{"message":"Model Not Exist"}}', { status: 400 });
  const { bodies } = await withFetch(
    [badRequest, badRequest, toolCallResponse('{"answer":"rescued"}')],
    async () => {
      const out = await callTool<{ answer: string }>(params("deepseek-reasoner"), "emit_answer", "k");
      assertEquals(out.input.answer, "rescued");
      assertEquals(out.model, "deepseek-chat");
    },
  );
  assertEquals(bodies.length, 3);
});

Deno.test("chatToolArgsStream: reasoner model throws before any network call", async () => {
  const original = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (() => {
    fetched = true;
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  try {
    await assertRejects(
      () => chatToolArgsStream(params("deepseek-reasoner"), "emit_answer", "k", () => {}),
      Error,
      "use callTool",
    );
    assertEquals(fetched, false, "must not hit the network");
  } finally {
    globalThis.fetch = original;
  }
});
