import assert from "node:assert/strict";
import { test } from "node:test";

import { maxToolRounds, NO_TOOLS_LEFT_INSTRUCTION, planToolRound } from "@/lib/workspace/chat-api";
import { classifyChatRequest } from "@/lib/workspace/chat-routing";
import { serializeToolResult, TOOL_RESULT_CHAR_BUDGET } from "@/lib/workspace/chat-tool-result";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";

const wire = [{ content: "hello", role: "user" as const }];
const plain: ChatRouteDecision = { model: "deepseek-chat", route: "conversation", searchWeb: false };
const workspace: ChatRouteDecision = { ...plain, workspaceIntent: true };

test("the final tool-free round tells the model its tools are gone", () => {
  const last = maxToolRounds(plain);
  const { messages, offerTools } = planToolRound(wire, plain, last, true);
  assert.equal(offerTools, false);
  const instruction = messages[messages.length - 1];
  assert.equal(instruction, NO_TOOLS_LEFT_INSTRUCTION);
  assert.equal(instruction.role, "system");
});

test("that instruction forbids every markup shape the owner listed", () => {
  for (const banned of [/DSML/, /XML/, /JSON tool syntax/, /invocation markup/, /No tools are attached/]) {
    assert.match(NO_TOOLS_LEFT_INSTRUCTION.content, banned);
  }
  // It must also say what to do INSTEAD, or the model has no exit.
  assert.match(NO_TOOLS_LEFT_INSTRUCTION.content, /already retrieved/);
  assert.match(NO_TOOLS_LEFT_INSTRUCTION.content, /could not be completed/);
});

test("earlier rounds carry tools and no such instruction", () => {
  const { messages, offerTools } = planToolRound(wire, plain, 0, true);
  assert.equal(offerTools, true);
  assert.deepEqual(messages, wire);
});

test("a turn that never had tools is not told it lost them", () => {
  const { messages, offerTools } = planToolRound(wire, plain, 0, false);
  assert.equal(offerTools, false);
  assert.deepEqual(messages, wire, "the no-tools system prompt already covers this turn");
});

test("a cross-page workspace turn gets more than four tool rounds", () => {
  // Acceptance test 10 spent four rounds purely reading — library tree, folder
  // expansions, study overview, a full-year calendar range, the issue scan and
  // four note reads — before it could act on any of it.
  assert.ok(maxToolRounds(workspace) > 4, "workspace turns need room to read AND then act");
  assert.equal(maxToolRounds(plain), 4, "ordinary chat keeps the tighter budget");
  const decision = classifyChatRequest("Organize everything for Pharmacology, make sure my calendar is accurate, and tell me what I should study next.");
  assert.ok(maxToolRounds(decision) > 4);
});

test("a save turn also gets the larger budget", () => {
  assert.ok(maxToolRounds({ ...plain, savesToWorkspace: true }) > 4);
});

test("the budget is bounded, not unlimited", () => {
  assert.ok(maxToolRounds(workspace) <= 12, "a turn must still end");
});

test("an oversized tool result stays valid JSON and stops claiming completeness", () => {
  const events = Array.from({ length: 400 }, (_, index) => ({
    course: "PHCY 2114",
    date: `2026-${String((index % 12) + 1).padStart(2, "0")}-15`,
    id: `event-${index}`,
    note: "From your syllabus: ".padEnd(300, "x"),
    title: `Lecture ${index}`,
  }));
  const serialized = serializeToolResult({ complete: true, count: events.length, events });
  assert.ok(serialized.length <= TOOL_RESULT_CHAR_BUDGET);
  const parsed = JSON.parse(serialized) as Record<string, unknown>;
  assert.equal(parsed.complete, false, "a clipped payload must not claim it is complete");
  const truncated = parsed.truncated as Record<string, unknown>;
  assert.equal(truncated.total, 400);
  assert.ok((truncated.returned as number) > 0);
  assert.equal(truncated.omitted, 400 - (truncated.returned as number));
  assert.match(String(truncated.resume_after), /^\d{4}-\d{2}-\d{2}$/, "a cursor to page from");
});

test("a result that already fits is byte-for-byte untouched", () => {
  const small = { complete: true, count: 1, events: [{ date: "2026-08-11", title: "Tuesday Class" }] };
  assert.equal(serializeToolResult(small), JSON.stringify(small));
});
