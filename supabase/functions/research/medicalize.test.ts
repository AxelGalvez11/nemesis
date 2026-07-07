import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { medicalizeSubQuestions, normalizeMedicalized } from "./medicalize.ts";

// ── normalizeMedicalized (PURE — bounds + shape contract, no stub needed) ──

Deno.test("normalizeMedicalized: valid 1:1 rewrite is returned, trimmed", () => {
  const input = ["does metformin prevent cancer", "is metformin safe in ckd"];
  const raw = ["  metformin AND neoplasms/prevention and control  ", "metformin AND renal insufficiency, chronic"];
  assertEquals(normalizeMedicalized(raw, input), [
    "metformin AND neoplasms/prevention and control",
    "metformin AND renal insufficiency, chronic",
  ]);
});

Deno.test("normalizeMedicalized: count mismatch (fewer) → input unchanged", () => {
  const input = ["a", "b", "c"];
  assertEquals(normalizeMedicalized(["x", "y"], input), input);
});

Deno.test("normalizeMedicalized: count mismatch (more) → input unchanged", () => {
  const input = ["a"];
  assertEquals(normalizeMedicalized(["x", "y"], input), input);
});

Deno.test("normalizeMedicalized: a non-string entry → input unchanged", () => {
  const input = ["a", "b"];
  assertEquals(normalizeMedicalized(["ok", 42], input), input);
});

Deno.test("normalizeMedicalized: an empty/whitespace entry → input unchanged", () => {
  const input = ["a", "b"];
  assertEquals(normalizeMedicalized(["ok", "   "], input), input);
});

Deno.test("normalizeMedicalized: non-array raw → input unchanged", () => {
  const input = ["a"];
  assertEquals(normalizeMedicalized(null, input), input);
  assertEquals(normalizeMedicalized("not an array", input), input);
});

Deno.test("normalizeMedicalized: each rewrite clamped to 300 chars", () => {
  const input = ["short question"];
  const long = "x".repeat(500);
  const [out] = normalizeMedicalized([long], input);
  assertEquals(out.length, 300);
});

Deno.test("normalizeMedicalized: returns a new array, never the input reference", () => {
  const input = ["a", "b"];
  const out = normalizeMedicalized(["p", "q"], input);
  // fallback path also copies (so callers can't mutate the caller's array)
  const fb = normalizeMedicalized(["mismatch"], input);
  assertEquals(out === input, false);
  assertEquals(fb === input, false);
  assertEquals(fb, input);
});

// ── medicalizeSubQuestions (LLM path — fetch stubbed) ──

async function withFetchStub<T>(stub: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

/** OpenAI-compatible forced-tool response carrying `medicalized` as the tool arguments. */
const toolResponse = (medicalized: unknown) =>
  new Response(
    JSON.stringify({
      model: "test-model",
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "medicalize_sub_questions", arguments: JSON.stringify({ medicalized }) },
          }],
        },
        finish_reason: "tool_calls",
      }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

Deno.test("medicalizeSubQuestions: empty input short-circuits (no LLM call)", async () => {
  let called = false;
  const out = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => {
      called = true;
      return toolResponse([]);
    }) as typeof fetch,
    () => medicalizeSubQuestions([], "key"),
  );
  assertEquals(out, []);
  assertEquals(called, false);
});

Deno.test("medicalizeSubQuestions: happy path returns the rewritten set", async () => {
  const input = ["does metformin prevent cancer in diabetics"];
  const out = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => toolResponse(["metformin AND (neoplasms/prevention and control) AND diabetes mellitus, type 2"])) as typeof fetch,
    () => medicalizeSubQuestions(input, "key"),
  );
  assertEquals(out, ["metformin AND (neoplasms/prevention and control) AND diabetes mellitus, type 2"]);
});

Deno.test("medicalizeSubQuestions: LLM throw → input returned unchanged (graceful degrade)", async () => {
  const input = ["does metformin prevent cancer", "is metformin safe in ckd"];
  const out = await withFetchStub(
    // throwing stub propagates instantly (no retry/backoff) through chat→callTool→catch
    (() => {
      throw new Error("llm down");
    }) as unknown as typeof fetch,
    () => medicalizeSubQuestions(input, "key"),
  );
  assertEquals(out, input);
});

Deno.test("medicalizeSubQuestions: empty LLM output → input returned unchanged", async () => {
  const input = ["does metformin prevent cancer", "is metformin safe in ckd"];
  const out = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => toolResponse([])) as typeof fetch,
    () => medicalizeSubQuestions(input, "key"),
  );
  assertEquals(out, input);
});

Deno.test("medicalizeSubQuestions: count-mismatched LLM output → input returned unchanged", async () => {
  const input = ["q1", "q2", "q3"];
  const out = await withFetchStub(
    // deno-lint-ignore require-await
    (async () => toolResponse(["only one rewrite"])) as typeof fetch,
    () => medicalizeSubQuestions(input, "key"),
  );
  assertEquals(out, input);
});
