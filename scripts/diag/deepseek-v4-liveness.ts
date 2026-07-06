// Liveness + structured-output probe for DeepSeek V4. Confirms the existing DEEPSEEK_API_KEY
// still authenticates against the V4 models, and tests the historically-flaky path: a FORCED
// single-shot tool call (how our engine gets structured answers) in BOTH non-thinking (flash)
// and thinking (pro) modes. Prints status only — never the key.
//
// Run: deno run --env-file=supabase/functions/.env --allow-net --allow-env scripts/diag/deepseek-v4-liveness.ts
const KEY = Deno.env.get("DEEPSEEK_API_KEY") ?? "";
const BASE = "https://api.deepseek.com";
if (!KEY) {
  console.log("DEEPSEEK_API_KEY: NOT SET locally — cannot probe.");
  Deno.exit(1);
}
console.log(`DEEPSEEK_API_KEY present (len ${KEY.length}). Probing ${BASE} ...\n`);

const ECHO_TOOL = {
  type: "function",
  function: {
    name: "echo",
    description: "Return the answer to the question in a structured field.",
    parameters: {
      type: "object",
      properties: { answer: { type: "string", description: "the answer" } },
      required: ["answer"],
      additionalProperties: false,
    },
  },
};

async function probe(label: string, body: Record<string, unknown>) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const ms = Math.round(performance.now() - t0);
    const txt = await res.text();
    if (!res.ok) {
      console.log(`[${label}] HTTP ${res.status} (${ms}ms) — ${txt.slice(0, 200)}`);
      return;
    }
    const json = JSON.parse(txt);
    const msg = json.choices?.[0]?.message;
    const tool = msg?.tool_calls?.[0]?.function;
    let toolOk = "no tool_call";
    if (tool) {
      try {
        const args = JSON.parse(tool.arguments);
        toolOk = `tool_call OK, valid JSON (answer="${String(args.answer ?? "").slice(0, 40)}")`;
      } catch {
        toolOk = `tool_call present but INVALID JSON: ${String(tool.arguments).slice(0, 80)}`;
      }
    }
    const hadReasoning = typeof msg?.reasoning_content === "string" && msg.reasoning_content.length > 0;
    console.log(
      `[${label}] HTTP 200 (${ms}ms) model=${json.model} finish=${json.choices?.[0]?.finish_reason} ` +
        `reasoning=${hadReasoning ? "yes" : "no"} | ${toolOk}`,
    );
  } catch (e) {
    console.log(`[${label}] ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 1) Basic liveness: flash, non-thinking, plain reply.
await probe("flash/non-thinking/plain", {
  model: "deepseek-v4-flash",
  max_tokens: 16,
  messages: [{ role: "user", content: "Reply with exactly: OK" }],
  thinking: { type: "disabled" },
});

// 2) Forced structured output, non-thinking (the Fast-mode path).
await probe("flash/non-thinking/forced-tool", {
  model: "deepseek-v4-flash",
  max_tokens: 128,
  messages: [{ role: "user", content: "What is the capital of France?" }],
  tools: [ECHO_TOOL],
  tool_choice: { type: "function", function: { name: "echo" } },
  thinking: { type: "disabled" },
});

// 3) Forced structured output, THINKING (pro) — the historically-flaky path the engine relies on.
await probe("pro/thinking/forced-tool", {
  model: "deepseek-v4-pro",
  max_tokens: 512,
  reasoning_effort: "high",
  messages: [{ role: "user", content: "What is the capital of France?" }],
  tools: [ECHO_TOOL],
  tool_choice: { type: "function", function: { name: "echo" } },
  thinking: { type: "enabled" },
});

// 4) Pro NON-thinking + forced tool — the Deep Research path IF we run V4 without thinking.
await probe("pro/non-thinking/forced-tool", {
  model: "deepseek-v4-pro",
  max_tokens: 128,
  messages: [{ role: "user", content: "What is the capital of France?" }],
  tools: [ECHO_TOOL],
  tool_choice: { type: "function", function: { name: "echo" } },
  thinking: { type: "disabled" },
});

// 5) Pro thinking + tools with AUTO choice (not forced) — does thinking allow tools at all?
await probe("pro/thinking/auto-tool", {
  model: "deepseek-v4-pro",
  max_tokens: 512,
  reasoning_effort: "high",
  messages: [{ role: "user", content: "Use the echo tool to answer: capital of France?" }],
  tools: [ECHO_TOOL],
  tool_choice: "auto",
  thinking: { type: "enabled" },
});

console.log("\nDone.");
